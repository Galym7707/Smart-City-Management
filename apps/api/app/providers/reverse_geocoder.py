from __future__ import annotations

from dataclasses import dataclass
import json
import os
from time import monotonic, sleep
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROAD_KEYS = ("road", "pedestrian", "footway", "street", "residential", "path")
LOCALITY_KEYS = (
    "industrial",
    "suburb",
    "neighbourhood",
    "hamlet",
    "village",
    "town",
    "city",
    "municipality",
    "county",
    "state_district",
    "state",
)
LANDMARK_KEYS = (
    "attraction",
    "amenity",
    "building",
    "industrial",
    "man_made",
    "office",
    "tourism",
    "leisure",
    "shop",
    "historic",
    "natural",
    "hamlet",
    "village",
    "town",
    "suburb",
    "neighbourhood",
)
VERIFICATION_AREA_KEYS = (
    "city_district",
    "district",
    "county",
    "municipality",
    "state_district",
    "suburb",
    "borough",
)
MIN_REQUEST_INTERVAL_SECONDS = 1.05


@dataclass(frozen=True)
class ReverseGeocodeResult:
    verification_area: str | None = None
    nearest_address: str | None = None
    nearest_landmark: str | None = None


class ReverseGeocoder:
    def __init__(self) -> None:
        self.base_url = os.getenv(
            "REVERSE_GEOCODER_BASE_URL",
            "https://nominatim.openstreetmap.org/reverse",
        )
        self.accept_language = os.getenv("REVERSE_GEOCODER_LANGUAGE", "en")
        self.contact_email = os.getenv("REVERSE_GEOCODER_EMAIL")
        self.user_agent = os.getenv(
            "REVERSE_GEOCODER_USER_AGENT",
            "SarynaMRV/0.1 (+https://github.com/Galym7707/Duo-Galym-Dauren-Project)",
        )
        self.timeout_seconds = float(os.getenv("REVERSE_GEOCODER_TIMEOUT_SECONDS", "8"))
        self._cache: dict[tuple[float, float], ReverseGeocodeResult] = {}
        self._last_request_at = 0.0

    def reverse_lookup(
        self,
        *,
        latitude: float,
        longitude: float,
        fallback_region: str | None = None,
    ) -> ReverseGeocodeResult:
        cache_key = (round(latitude, 4), round(longitude, 4))
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        params = {
            "lat": f"{latitude:.6f}",
            "lon": f"{longitude:.6f}",
            "format": "jsonv2",
            "addressdetails": "1",
            "namedetails": "1",
            "extratags": "1",
            "zoom": "18",
        }
        if self.contact_email:
            params["email"] = self.contact_email

        try:
            payload = self._request_json(params)
            result = self._parse_response(payload, fallback_region=fallback_region)
        except Exception:
            result = ReverseGeocodeResult(verification_area=fallback_region)

        self._cache[cache_key] = result
        return result

    def _request_json(self, params: dict[str, str]) -> dict[str, object]:
        self._respect_rate_limit()
        request = Request(
            f"{self.base_url}?{urlencode(params)}",
            headers={
                "User-Agent": self.user_agent,
                "Accept-Language": self.accept_language,
            },
        )
        with urlopen(request, timeout=self.timeout_seconds) as response:
            body = response.read().decode("utf-8")
        self._last_request_at = monotonic()
        return json.loads(body)

    def _respect_rate_limit(self) -> None:
        elapsed = monotonic() - self._last_request_at
        if elapsed < MIN_REQUEST_INTERVAL_SECONDS:
            sleep(MIN_REQUEST_INTERVAL_SECONDS - elapsed)

    def _parse_response(
        self,
        payload: dict[str, object],
        *,
        fallback_region: str | None,
    ) -> ReverseGeocodeResult:
        address = payload.get("address") if isinstance(payload.get("address"), dict) else {}
        namedetails = payload.get("namedetails") if isinstance(payload.get("namedetails"), dict) else {}
        extratags = payload.get("extratags") if isinstance(payload.get("extratags"), dict) else {}
        display_name = payload.get("display_name") if isinstance(payload.get("display_name"), str) else None

        verification_area = self._build_verification_area(address, fallback_region)
        nearest_address = self._build_address(address)
        nearest_landmark = self._build_landmark(
            payload=payload,
            address=address,
            namedetails=namedetails,
            extratags=extratags,
            fallback_region=fallback_region,
            display_name=display_name,
        )

        return ReverseGeocodeResult(
            verification_area=verification_area,
            nearest_address=nearest_address,
            nearest_landmark=nearest_landmark,
        )

    def _build_verification_area(
        self,
        address: dict[str, object],
        fallback_region: str | None,
    ) -> str | None:
        district = self._first_string(address, VERIFICATION_AREA_KEYS)
        region = self._first_string(address, ("state", "region")) or fallback_region
        if district and region and district != region:
            return f"{district}, {region}"
        return district or region or fallback_region

    def _build_address(self, address: dict[str, object]) -> str | None:
        road = self._first_string(address, ROAD_KEYS)
        house_number = self._first_string(address, ("house_number",))
        if not road and not house_number:
            return None

        street_line = " ".join(part for part in (house_number, road) if part)
        locality = self._first_string(address, LOCALITY_KEYS)
        region = self._first_string(address, ("state",))
        return self._join_unique((street_line, locality, region))

    def _build_landmark(
        self,
        *,
        payload: dict[str, object],
        address: dict[str, object],
        namedetails: dict[str, object],
        extratags: dict[str, object],
        fallback_region: str | None,
        display_name: str | None,
    ) -> str | None:
        candidates = (
            payload.get("name"),
            namedetails.get("name"),
            namedetails.get("official_name"),
            extratags.get("brand"),
            extratags.get("operator"),
            self._first_string(address, LANDMARK_KEYS),
        )
        for candidate in candidates:
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()

        if display_name:
            first_segment = display_name.split(",")[0].strip()
            if first_segment and first_segment != fallback_region:
                return first_segment

        return fallback_region

    def _first_string(self, payload: dict[str, object], keys: tuple[str, ...]) -> str | None:
        for key in keys:
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    def _join_unique(self, parts: tuple[str | None, ...]) -> str | None:
        compact: list[str] = []
        for part in parts:
            if not part:
                continue
            if part not in compact:
                compact.append(part)
        if not compact:
            return None
        return ", ".join(compact)
