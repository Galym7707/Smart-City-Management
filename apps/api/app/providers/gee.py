from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
import json
import math
import os
from pathlib import Path
import tempfile
from typing import Literal

from app.providers.reverse_geocoder import ReverseGeocoder

Severity = Literal["high", "medium", "watch"]

KAZAKHSTAN_BOUNDS = [46.0, 40.0, 87.0, 56.0]
VALID_SCENE_SEARCH_LIMIT = 10
TREND_SCENE_COUNT = 6
CANDIDATE_LIMIT = 6
CANDIDATE_SAMPLE_LIMIT = 50
PIXEL_SCALE_METERS = 20_000
THERMAL_BUFFER_METERS = 25_000
THERMAL_LOOKBACK_DAYS = 3
MIN_CANDIDATE_DISTANCE_DEGREES = 0.45

REGION_NAME_MAP = {
    "Administrative unit not available": "Kazakhstan",
    "Akmolinskaya": "Akmola Region",
    "Aktyubinskaya": "Aktobe Region",
    "Almatinskaya": "Almaty Region",
    "Almaty City area": "Almaty City",
    "Atyrauskaya": "Atyrau Region",
    "Jambylslkaya": "Zhambyl Region",
    "Karagandinskaya": "Karaganda Region",
    "Kustanayskaya": "Kostanay Region",
    "Kyzylordinskaya": "Kyzylorda Region",
    "Mangistauskaya": "Mangystau Region",
    "Pavlodarskaya": "Pavlodar Region",
    "Severo-kazachstanskaya": "North Kazakhstan Region",
    "Vostochno-kazachstanskaya": "East Kazakhstan Region",
    "Yujno-kazachstanskaya": "Turkistan Region",
    "Zapadno-kazachstanskaya": "West Kazakhstan Region",
}


@dataclass(frozen=True)
class GeeCandidate:
    id: str
    asset_name: str
    region: str
    facility_type: str
    severity: Severity
    detected_at: str
    methane_delta_pct: float
    methane_delta_ppb: float
    signal_score: int
    confidence: str
    coordinates: str
    latitude: float
    longitude: float
    summary: str
    recommended_action: str
    current_ch4_ppb: float
    baseline_ch4_ppb: float
    thermal_hits_72h: int
    night_thermal_hits_72h: int
    evidence_source: str
    baseline_window: str
    verification_area: str | None = None
    nearest_address: str | None = None
    nearest_landmark: str | None = None


@dataclass(frozen=True)
class GeeScene:
    image: object
    timestamp: str
    observed_at: datetime


@dataclass
class GeeSyncSummary:
    project_id: str | None
    status: str
    message: str
    latest_observation_at: str | None = None
    observed_window: str | None = None
    mean_ch4_ppb: float | None = None
    baseline_ch4_ppb: float | None = None
    delta_abs_ppb: float | None = None
    delta_pct: float | None = None
    scene_count: int | None = None
    candidates: list[GeeCandidate] = field(default_factory=list)


class GeeProvider:
    CH4_DATASET_ID = "COPERNICUS/S5P/OFFL/L3_CH4"
    CH4_BAND_NAME = "CH4_column_volume_mixing_ratio_dry_air"
    VIIRS_DATASET_ID = "NASA/LANCE/SNPP_VIIRS/C2"
    GAUL_LEVEL1_DATASET_ID = "FAO/GAUL/2015/level1"
    HF_SECRETS_DIR = Path("/run/secrets")

    def __init__(self) -> None:
        self.project_id = self._read_secret_value("EARTH_ENGINE_PROJECT") or "gen-lang-client-0372752376"
        self.reverse_geocoder = ReverseGeocoder()
        self._service_account_key_path: str | None = None

    def sync_summary(self) -> GeeSyncSummary:
        try:
            import ee  # type: ignore
        except ImportError:
            return GeeSyncSummary(
                project_id=self.project_id,
                status="error",
                message="earthengine-api is not installed in the backend runtime.",
            )

        try:
            self._initialize_earth_engine(ee)
        except Exception as error:  # pragma: no cover - runtime/environment dependent
            return GeeSyncSummary(
                project_id=self.project_id,
                status="error",
                message=f"Earth Engine initialization failed: {error}",
            )

        kazakhstan_bounds = ee.Geometry.Rectangle(KAZAKHSTAN_BOUNDS, geodesic=False)
        kazakhstan_regions = ee.FeatureCollection(self.GAUL_LEVEL1_DATASET_ID).filter(
            ee.Filter.eq("ADM0_NAME", "Kazakhstan")
        )
        kazakhstan_geometry = kazakhstan_regions.geometry()

        try:
            collection = (
                ee.ImageCollection(self.CH4_DATASET_ID)
                .filterBounds(kazakhstan_bounds)
                .select(self.CH4_BAND_NAME)
                .sort("system:time_start", False)
            )
            scene_count = int(collection.size().getInfo())
            if scene_count == 0:
                return GeeSyncSummary(
                    project_id=self.project_id,
                    status="degraded",
                    message="Earth Engine connected, but no Kazakhstan CH4 scenes were returned for the configured collection.",
                )

            valid_scenes = self._find_recent_valid_scenes(
                ee=ee,
                collection=collection,
                geometry=kazakhstan_geometry,
            )
            if not valid_scenes:
                return GeeSyncSummary(
                    project_id=self.project_id,
                    status="degraded",
                    message=(
                        "Earth Engine connected, but no recent CH4 scene with valid Kazakhstan coverage "
                        "was found in the latest screening window."
                    ),
                    scene_count=scene_count,
                )

            selected_scene = valid_scenes[0]
            selected_date = ee.Date(selected_scene.image.get("system:time_start"))

            historical_collection = collection.filterDate(selected_date.advance(-84, "day"), selected_date)
            historical_count = int(historical_collection.size().getInfo())
            baseline_image = historical_collection.mean() if historical_count > 0 else collection.mean()

            current_value = self._reduce_mean(
                ee=ee,
                image=selected_scene.image,
                geometry=kazakhstan_geometry,
            )
            baseline_value = self._reduce_mean(
                ee=ee,
                image=baseline_image,
                geometry=kazakhstan_geometry,
            )
            candidates = self._build_candidates(
                ee=ee,
                selected_scene=selected_scene,
                baseline_image=baseline_image,
                valid_scenes=valid_scenes,
                collection=collection,
                regions=kazakhstan_regions,
                geometry=kazakhstan_geometry,
            )
        except Exception as error:  # pragma: no cover - runtime/environment dependent
            return GeeSyncSummary(
                project_id=self.project_id,
                status="error",
                message=f"Earth Engine CH4 query failed: {error}",
            )

        normalized_current = round(float(current_value), 2) if current_value is not None else None
        normalized_baseline = round(float(baseline_value), 2) if baseline_value is not None else None
        delta_abs = None
        delta_pct = None
        if normalized_current is not None and normalized_baseline is not None:
            delta_abs = round(normalized_current - normalized_baseline, 2)
            if normalized_baseline != 0:
                delta_pct = round((delta_abs / normalized_baseline) * 100, 2)

        message = (
            f"Earth Engine live screening refreshed with {len(candidates)} CH4 candidates."
            if candidates
            else "Earth Engine screening summary refreshed, but no candidate hotspots passed the current threshold."
        )

        return GeeSyncSummary(
            project_id=self.project_id,
            status="ready" if candidates else "degraded",
            message=message,
            latest_observation_at=selected_scene.timestamp,
            observed_window=(
                f"Most recent valid TROPOMI scene on {selected_scene.timestamp} compared against "
                "the previous 84-day Kazakhstan baseline."
            ),
            mean_ch4_ppb=normalized_current,
            baseline_ch4_ppb=normalized_baseline,
            delta_abs_ppb=delta_abs,
            delta_pct=delta_pct,
            scene_count=scene_count,
            candidates=candidates,
        )

    def _initialize_earth_engine(self, ee: object) -> None:
        service_account_json = self._read_secret_value("EARTH_ENGINE_SERVICE_ACCOUNT_JSON")
        service_account_file = self._read_secret_value("EARTH_ENGINE_SERVICE_ACCOUNT_FILE")

        if service_account_json:
            key_path, service_account_email = self._write_service_account_key(service_account_json)
            credentials = ee.ServiceAccountCredentials(service_account_email, key_file=key_path)
            ee.Initialize(credentials=credentials, project=self.project_id)
            return

        if service_account_file:
            key_path = Path(service_account_file)
            if not key_path.exists():
                raise FileNotFoundError(
                    f"Earth Engine service account file was not found: {key_path}"
                )

            payload = json.loads(key_path.read_text(encoding="utf-8"))
            service_account_email = payload.get("client_email")
            if not service_account_email:
                raise ValueError("Earth Engine service account JSON is missing client_email.")

            credentials = ee.ServiceAccountCredentials(
                service_account_email,
                key_file=str(key_path),
            )
            ee.Initialize(credentials=credentials, project=self.project_id)
            return

        ee.Initialize(project=self.project_id)

    def _read_secret_value(self, name: str) -> str | None:
        env_value = os.getenv(name)
        if env_value:
            return env_value

        secret_path = self.HF_SECRETS_DIR / name
        if secret_path.exists():
            return secret_path.read_text(encoding="utf-8").strip()

        return None

    def _write_service_account_key(self, raw_json: str) -> tuple[str, str]:
        payload = json.loads(raw_json)
        service_account_email = payload.get("client_email")
        if not service_account_email:
            raise ValueError("Earth Engine service account JSON is missing client_email.")

        if self._service_account_key_path is None:
            temp_file = tempfile.NamedTemporaryFile(
                mode="w",
                suffix="-earth-engine-service-account.json",
                delete=False,
                encoding="utf-8",
            )
            with temp_file:
                json.dump(payload, temp_file)
            self._service_account_key_path = temp_file.name

        return self._service_account_key_path, service_account_email

    def _build_candidates(
        self,
        *,
        ee: object,
        selected_scene: GeeScene,
        baseline_image: object,
        valid_scenes: list[GeeScene],
        collection: object,
        regions: object,
        geometry: object,
    ) -> list[GeeCandidate]:
        stack = (
            selected_scene.image.rename("current")
            .addBands(baseline_image.rename("baseline"))
            .addBands(selected_scene.image.subtract(baseline_image).rename("delta"))
            .addBands(
                selected_scene.image.subtract(baseline_image).divide(baseline_image).multiply(100).rename("delta_pct")
            )
        )
        sampled = (
            stack.sample(region=geometry, scale=PIXEL_SCALE_METERS, geometries=True)
            .filter(ee.Filter.gt("delta", 0))
            .sort("delta", False)
            .limit(CANDIDATE_SAMPLE_LIMIT)
            .getInfo()
        )
        features = sampled.get("features", [])
        raw_candidates = self._dedupe_candidates(features)
        if not raw_candidates:
            return []

        thermal_context = self._build_thermal_context(
            ee=ee,
            geometry=geometry,
            selected_scene=selected_scene,
            candidates=raw_candidates,
        )

        prepared_candidates: list[GeeCandidate] = []
        for index, candidate in enumerate(raw_candidates, start=1):
            latitude = round(candidate["latitude"], 4)
            longitude = round(candidate["longitude"], 4)
            point = ee.Geometry.Point([longitude, latitude])
            region_name = self._lookup_region_name(ee=ee, regions=regions, point=point)
            location_context = self.reverse_geocoder.reverse_lookup(
                latitude=latitude,
                longitude=longitude,
                fallback_region=region_name,
            )
            all_hits, night_hits = thermal_context.get(candidate["id"], (0, 0))
            delta_pct = round(candidate["delta_pct"], 2)
            delta_ppb = round(candidate["delta"], 2)
            current_ch4_ppb = round(candidate["current"], 2)
            baseline_ch4_ppb = round(candidate["baseline"], 2)
            signal_score = self._signal_score(
                delta_pct=delta_pct,
                delta_ppb=delta_ppb,
                night_hits=night_hits,
            )
            severity = self._severity_from_score(signal_score)
            summary = self._build_summary(
                delta_pct=delta_pct,
                delta_ppb=delta_ppb,
                night_hits=night_hits,
                region=region_name,
            )
            recommended_action = self._build_recommended_action(severity, night_hits)
            confidence = self._build_confidence_label(severity, night_hits)
            prepared_candidates.append(
                GeeCandidate(
                    id=f"GEE-{selected_scene.observed_at.strftime('%Y%m%d')}-{index:02d}",
                    asset_name=location_context.nearest_landmark or f"{region_name} CH4 hotspot {index:02d}",
                    region=region_name,
                    facility_type=(
                        "Methane hotspot with night thermal context"
                        if night_hits > 0
                        else "Methane hotspot without thermal confirmation"
                    ),
                    severity=severity,
                    detected_at=selected_scene.observed_at.strftime("%Y-%m-%d %H:%M"),
                    methane_delta_pct=delta_pct,
                    methane_delta_ppb=delta_ppb,
                    signal_score=signal_score,
                    confidence=confidence,
                    coordinates=self._format_coordinates(latitude, longitude),
                    latitude=latitude,
                    longitude=longitude,
                    summary=summary,
                    recommended_action=recommended_action,
                    current_ch4_ppb=current_ch4_ppb,
                    baseline_ch4_ppb=baseline_ch4_ppb,
                    thermal_hits_72h=all_hits,
                    night_thermal_hits_72h=night_hits,
                    evidence_source="Google Earth Engine / Sentinel-5P + VIIRS thermal context",
                    baseline_window=(
                        f"84-day Kazakhstan baseline before {selected_scene.timestamp}; "
                        f"{len(valid_scenes)} recent valid scenes checked."
                    ),
                    verification_area=location_context.verification_area,
                    nearest_address=location_context.nearest_address,
                    nearest_landmark=location_context.nearest_landmark,
                )
            )

        return prepared_candidates

    def _build_thermal_context(
        self,
        *,
        ee: object,
        geometry: object,
        selected_scene: GeeScene,
        candidates: list[dict[str, float | str]],
    ) -> dict[str, tuple[int, int]]:
        if not candidates:
            return {}

        candidate_features = ee.FeatureCollection(
            [
                ee.Feature(
                    ee.Geometry.Point([candidate["longitude"], candidate["latitude"]]),
                    {"candidate_id": candidate["id"]},
                )
                for candidate in candidates
            ]
        )
        thermal_collection = (
            ee.ImageCollection(self.VIIRS_DATASET_ID)
            .filterBounds(geometry)
            .filterDate(
                ee.Date(selected_scene.image.get("system:time_start")).advance(-THERMAL_LOOKBACK_DAYS, "day"),
                ee.Date(selected_scene.image.get("system:time_start")).advance(1, "day"),
            )
        )

        if int(thermal_collection.size().getInfo()) == 0:
            return {str(candidate["id"]): (0, 0) for candidate in candidates}

        all_hits_image = thermal_collection.map(
            lambda image: image.select("frp").gt(0).rename("all_hits")
        ).sum()
        night_hits_image = thermal_collection.map(
            lambda image: image.select("frp").gt(0).And(image.select("DayNight").eq(1)).rename("night_hits")
        ).sum()
        context_features = (
            all_hits_image.addBands(night_hits_image)
            .reduceRegions(
                collection=candidate_features.map(lambda feature: feature.buffer(THERMAL_BUFFER_METERS)),
                reducer=ee.Reducer.sum(),
                scale=375,
                tileScale=4,
            )
            .getInfo()
            .get("features", [])
        )

        thermal_context: dict[str, tuple[int, int]] = {}
        for feature in context_features:
            properties = feature.get("properties", {})
            candidate_id = str(properties.get("candidate_id", ""))
            if not candidate_id:
                continue
            all_hits = int(round(float(properties.get("all_hits", 0) or 0)))
            night_hits = int(round(float(properties.get("night_hits", 0) or 0)))
            thermal_context[candidate_id] = (all_hits, night_hits)

        return thermal_context

    def _dedupe_candidates(self, features: list[dict[str, object]]) -> list[dict[str, float | str]]:
        chosen: list[dict[str, float | str]] = []
        for feature in features:
            geometry = feature.get("geometry", {})
            coordinates = geometry.get("coordinates", [])
            if len(coordinates) != 2:
                continue
            longitude = float(coordinates[0])
            latitude = float(coordinates[1])
            if any(
                self._distance_degrees(
                    latitude,
                    longitude,
                    float(existing["latitude"]),
                    float(existing["longitude"]),
                )
                < MIN_CANDIDATE_DISTANCE_DEGREES
                for existing in chosen
            ):
                continue
            properties = feature.get("properties", {})
            chosen.append(
                {
                    "id": f"candidate-{len(chosen) + 1}",
                    "latitude": latitude,
                    "longitude": longitude,
                    "current": float(properties.get("current", 0)),
                    "baseline": float(properties.get("baseline", 0)),
                    "delta": float(properties.get("delta", 0)),
                    "delta_pct": float(properties.get("delta_pct", 0)),
                }
            )
            if len(chosen) == CANDIDATE_LIMIT:
                break

        return chosen

    def _find_recent_valid_scenes(self, *, ee: object, collection: object, geometry: object) -> list[GeeScene]:
        recent = collection.limit(VALID_SCENE_SEARCH_LIMIT).toList(VALID_SCENE_SEARCH_LIMIT)
        valid_scenes: list[GeeScene] = []
        for index in range(VALID_SCENE_SEARCH_LIMIT):
            image = ee.Image(recent.get(index))
            count_value = (
                image.reduceRegion(
                    reducer=ee.Reducer.count(),
                    geometry=geometry,
                    scale=PIXEL_SCALE_METERS,
                    bestEffort=True,
                    maxPixels=1_000_000,
                )
                .get(self.CH4_BAND_NAME)
                .getInfo()
            )
            if not count_value:
                continue
            observed_at = datetime.fromtimestamp(
                int(image.get("system:time_start").getInfo()) / 1000,
                UTC,
            )
            valid_scenes.append(
                GeeScene(
                    image=image,
                    timestamp=observed_at.strftime("%Y-%m-%d %H:%M UTC"),
                    observed_at=observed_at,
                )
            )
            if len(valid_scenes) == TREND_SCENE_COUNT:
                break

        return valid_scenes

    def _lookup_region_name(self, *, ee: object, regions: object, point: object) -> str:
        feature = regions.filterBounds(point).first()
        if feature is None:
            return "Kazakhstan"
        raw_name = feature.get("ADM1_NAME").getInfo()
        if not raw_name:
            return "Kazakhstan"
        return REGION_NAME_MAP.get(str(raw_name), str(raw_name))

    def _reduce_mean(self, *, ee: object, image: object, geometry: object) -> float | None:
        return (
            image.reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=geometry,
                scale=PIXEL_SCALE_METERS,
                bestEffort=True,
                maxPixels=10_000_000,
            )
            .get(self.CH4_BAND_NAME)
            .getInfo()
        )

    def _signal_score(self, *, delta_pct: float, delta_ppb: float, night_hits: int) -> int:
        score = (max(delta_pct, 0) * 18) + (min(max(delta_ppb, 0), 50) * 0.5) + (min(night_hits, 10) * 2)
        return max(0, min(100, round(score)))

    def _severity_from_score(self, score: int) -> Severity:
        if score >= 75:
            return "high"
        if score >= 50:
            return "medium"
        return "watch"

    def _build_confidence_label(self, severity: Severity, night_hits: int) -> str:
        if severity == "high":
            if night_hits > 0:
                return "High screening confidence / methane uplift plus night thermal context"
            return "High screening confidence / methane uplift without thermal confirmation"
        if severity == "medium":
            if night_hits > 0:
                return "Medium screening confidence / uplift confirmed by nearby thermal detections"
            return "Medium screening confidence / uplift above rolling baseline"
        if night_hits > 0:
            return "Watchlist / thermal context without strong methane contrast"
        return "Watchlist / methane contrast remains modest in the latest valid scene"

    def _build_summary(self, *, delta_pct: float, delta_ppb: float, night_hits: int, region: str) -> str:
        if night_hits > 0:
            return (
                f"Latest valid TROPOMI scene shows +{delta_ppb:.2f} ppb ({delta_pct:.2f}%) methane uplift in "
                f"{region}, with {night_hits} night-time VIIRS thermal detections inside a 25 km context window."
            )
        return (
            f"Latest valid TROPOMI scene shows +{delta_ppb:.2f} ppb ({delta_pct:.2f}%) methane uplift in "
            f"{region}. No recent night-time VIIRS thermal detections were found inside a 25 km context window."
        )

    def _build_recommended_action(self, severity: Severity, night_hits: int) -> str:
        if severity == "high":
            return (
                "Promote this candidate into an incident and send it to field verification. "
                "The signal is strong enough for operational review."
            )
        if severity == "medium" and night_hits > 0:
            return (
                "Keep this candidate near the top of the queue and verify whether thermal context repeats on the next pass."
            )
        if severity == "medium":
            return (
                "Keep this candidate in the manual review queue and confirm it with the next valid CH4 scene before escalation."
            )
        return (
            "Keep this candidate visible as a watch item. It is useful for screening, but not strong enough for immediate escalation."
        )

    def _format_coordinates(self, latitude: float, longitude: float) -> str:
        lat_suffix = "N" if latitude >= 0 else "S"
        lon_suffix = "E" if longitude >= 0 else "W"
        return f"{abs(latitude):.3f} {lat_suffix}, {abs(longitude):.3f} {lon_suffix}"

    def _distance_degrees(
        self,
        latitude_a: float,
        longitude_a: float,
        latitude_b: float,
        longitude_b: float,
    ) -> float:
        longitude_scale = math.cos(math.radians((latitude_a + latitude_b) / 2))
        delta_longitude = (longitude_a - longitude_b) * longitude_scale
        delta_latitude = latitude_a - latitude_b
        return math.sqrt((delta_latitude ** 2) + (delta_longitude ** 2))
