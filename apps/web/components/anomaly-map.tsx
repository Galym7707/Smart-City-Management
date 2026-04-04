"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type Anomaly } from "../lib/dashboard-types";
import {
  copy,
  formatVerificationAreaLabel,
  type Locale,
  translateAdministrativeLabel,
  translateAssetName,
  translateFacility,
  translateRegion,
} from "../lib/site-content";

type MapTone = "live" | "fallback";

type AnomalyMapProps = {
  anomalies: Anomaly[];
  selectedAnomalyId: string;
  locale: Locale;
  tone: MapTone;
  liveReactionAnomalyId?: string;
  onSelectAnomaly: (anomalyId: string) => void;
  onPrimaryAction: () => void;
  primaryActionLabel: string;
  primaryActionDisabled?: boolean;
};

type MapLibreModule = typeof import("maplibre-gl");
type MapInstance = import("maplibre-gl").Map;
type MarkerInstance = import("maplibre-gl").Marker;
type StyleSpecification = import("maplibre-gl").StyleSpecification;

const CITY_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
    },
  ],
};

const mapCopy = {
  en: {
    fallback: "Map unavailable. Showing the simplified backup view.",
    detailTitle: "Selected case",
    coordinates: "Coordinates",
    facility: "Service area",
    verificationArea: "District",
    nearestAddress: "Nearest address",
    nearestLandmark: "Landmark",
    notAvailable: "No nearby mapped address or landmark",
    actionHint:
      "This point is used for quick case selection. Promote it into workflow to open the operational incident.",
    enterFullscreen: "Open map in full screen",
    exitFullscreen: "Exit full screen",
  },
  ru: {
    fallback: "Карта временно недоступна. Показан упрощённый резервный вид.",
    detailTitle: "Выбранный кейс",
    coordinates: "Координаты",
    facility: "Контур",
    verificationArea: "Район",
    nearestAddress: "Ближайший адрес",
    nearestLandmark: "Ориентир",
    notAvailable: "Рядом нет подходящего адреса или ориентира",
    actionHint:
      "Это точка на карте для быстрого выбора кейса. Чтобы открыть рабочий инцидент, переведите кейс в workflow вручную.",
    enterFullscreen: "Открыть карту на весь экран",
    exitFullscreen: "Выйти из полноэкранного режима",
  },
} as const;

const INITIAL_CENTER: [number, number] = [76.9285, 43.2383];
const INITIAL_ZOOM = 10.8;

export function AnomalyMap({
  anomalies,
  selectedAnomalyId,
  locale,
  tone,
  liveReactionAnomalyId,
  onSelectAnomaly,
  onPrimaryAction,
  primaryActionLabel,
  primaryActionDisabled = false,
}: AnomalyMapProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const markersRef = useRef<MarkerInstance[]>([]);
  const [mapModule, setMapModule] = useState<MapLibreModule | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const t = copy[locale];
  const mapText = mapCopy[locale];
  const fullscreenLabel = isFullscreen ? mapText.exitFullscreen : mapText.enterFullscreen;
  const selectedAnomaly = useMemo(
    () => anomalies.find((anomaly) => anomaly.id === selectedAnomalyId) ?? anomalies[0] ?? null,
    [anomalies, selectedAnomalyId],
  );

  useEffect(() => {
    let cancelled = false;

    async function initializeMap() {
      if (!containerRef.current || mapRef.current || useFallback) return;

      try {
        const imported = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;

        setMapModule(imported);

        const map = new imported.Map({
          container: containerRef.current,
          style: CITY_STYLE,
          center: INITIAL_CENTER,
          zoom: INITIAL_ZOOM,
          attributionControl: false,
        });

        map.addControl(new imported.NavigationControl({ showCompass: false }), "top-right");
        map.on("load", () => {
          if (cancelled) return;
          setMapReady(true);
          fitMapToAnomalies(map, anomalies);
        });
        map.on("error", () => {
          if (cancelled) return;
          setMapReady(false);
          setUseFallback(true);
        });

        mapRef.current = map;
      } catch {
        if (!cancelled) {
          setUseFallback(true);
        }
      }
    }

    void initializeMap();

    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [useFallback]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    fitMapToAnomalies(mapRef.current, anomalies);
  }, [anomalies, mapReady]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === shellRef.current);
      if (mapRef.current) {
        requestAnimationFrame(() => mapRef.current?.resize());
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapModule) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    for (const anomaly of anomalies) {
      const element = document.createElement("button");
      element.type = "button";
      element.ariaLabel = translateAssetName(anomaly.assetName, locale);
      element.className = [
        "map-marker",
        anomaly.id === selectedAnomalyId ? "map-marker-active" : "",
        liveReactionAnomalyId && anomaly.id === liveReactionAnomalyId ? "map-marker-live" : "",
      ]
        .filter(Boolean)
        .join(" ");
      element.addEventListener("click", () => onSelectAnomaly(anomaly.id));

      const marker = new mapModule.Marker({
        element,
        anchor: "center",
      })
        .setLngLat([anomaly.longitude, anomaly.latitude])
        .addTo(mapRef.current);

      markersRef.current.push(marker);
    }
  }, [anomalies, liveReactionAnomalyId, locale, mapModule, mapReady, onSelectAnomaly, selectedAnomalyId]);

  async function toggleFullscreen() {
    if (!shellRef.current) return;

    try {
      if (document.fullscreenElement === shellRef.current) {
        await document.exitFullscreen();
      } else {
        await shellRef.current.requestFullscreen();
      }
    } catch {
      // Ignore rejected fullscreen requests and keep the current map view.
    }
  }

  return (
    <div className={`map-shell map-shell-${tone} ${isFullscreen ? "map-shell-fullscreen" : ""}`} ref={shellRef}>
      <button
        aria-label={fullscreenLabel}
        className="map-fullscreen-button"
        onClick={() => void toggleFullscreen()}
        title={fullscreenLabel}
        type="button"
      >
        {isFullscreen ? <CollapseIcon /> : <ExpandIcon />}
      </button>

      {useFallback ? (
        <div className="map-fallback-shell">
          <div className="map-fallback-banner">{mapText.fallback}</div>
          <div className="map-board">
            {anomalies.map((anomaly) => (
              <button
                key={anomaly.id}
                aria-label={translateAssetName(anomaly.assetName, locale)}
                className={`map-dot ${anomaly.id === selectedAnomalyId ? "map-dot-active" : ""} ${liveReactionAnomalyId && anomaly.id === liveReactionAnomalyId ? "map-dot-live" : ""}`}
                onClick={() => onSelectAnomaly(anomaly.id)}
                style={{ left: `${anomaly.sitePosition.x}%`, top: `${anomaly.sitePosition.y}%` }}
                type="button"
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="map-canvas" ref={containerRef} />
      )}

      {selectedAnomaly ? (
        <aside className="map-selection-card">
          <span className="map-selection-eyebrow">{mapText.detailTitle}</span>
          <strong>{translateAssetName(selectedAnomaly.assetName, locale)}</strong>
          <p>{translateRegion(selectedAnomaly.region, locale)}</p>
          <dl className="map-selection-meta">
            <div>
              <dt>{t.summary.facility}</dt>
              <dd>{translateFacility(selectedAnomaly.facilityType, locale)}</dd>
            </div>
            <div>
              <dt>{mapText.coordinates}</dt>
              <dd>{selectedAnomaly.coordinates}</dd>
            </div>
            <div>
              <dt>{mapText.verificationArea}</dt>
              <dd>
                {selectedAnomaly.verificationArea
                  ? formatVerificationAreaLabel(selectedAnomaly.verificationArea, selectedAnomaly.region, locale)
                  : mapText.notAvailable}
              </dd>
            </div>
            <div>
              <dt>{mapText.nearestAddress}</dt>
              <dd>
                {selectedAnomaly.nearestAddress
                  ? translateAdministrativeLabel(selectedAnomaly.nearestAddress, locale)
                  : mapText.notAvailable}
              </dd>
            </div>
            <div>
              <dt>{mapText.nearestLandmark}</dt>
              <dd>
                {selectedAnomaly.nearestLandmark
                  ? translateAdministrativeLabel(selectedAnomaly.nearestLandmark, locale)
                  : mapText.notAvailable}
              </dd>
            </div>
          </dl>
          <p className="map-selection-hint">{mapText.actionHint}</p>
          <button
            className="secondary-button map-selection-action"
            disabled={primaryActionDisabled}
            onClick={onPrimaryAction}
            type="button"
          >
            {primaryActionLabel}
          </button>
        </aside>
      ) : null}
    </div>
  );
}

function ExpandIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6 2.75H2.75V6M12 2.75h3.25V6M6 15.25H2.75V12M12 15.25h3.25V12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M7.25 2.75H6v1.25M10.75 2.75H12v1.25M7.25 15.25H6V14M10.75 15.25H12V14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6 6H2.75V2.75M12 6h3.25V2.75M6 12H2.75v3.25M12 12h3.25v3.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M6 6 8 8M12 6 10 8M6 12l2-2M12 12l-2-2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function fitMapToAnomalies(map: MapInstance, anomalies: Anomaly[]) {
  if (anomalies.length === 0) return;

  if (anomalies.length === 1) {
    map.easeTo({
      center: [anomalies[0].longitude, anomalies[0].latitude],
      zoom: 12.4,
      duration: 0,
    });
    return;
  }

  const bounds = anomalies.reduce(
    (acc, anomaly) => {
      acc.minLon = Math.min(acc.minLon, anomaly.longitude);
      acc.maxLon = Math.max(acc.maxLon, anomaly.longitude);
      acc.minLat = Math.min(acc.minLat, anomaly.latitude);
      acc.maxLat = Math.max(acc.maxLat, anomaly.latitude);
      return acc;
    },
    {
      minLon: Number.POSITIVE_INFINITY,
      maxLon: Number.NEGATIVE_INFINITY,
      minLat: Number.POSITIVE_INFINITY,
      maxLat: Number.NEGATIVE_INFINITY,
    },
  );

  map.fitBounds(
    [
      [bounds.minLon, bounds.minLat],
      [bounds.maxLon, bounds.maxLat],
    ],
    {
      padding: 64,
      duration: 0,
      maxZoom: 12.8,
    },
  );
}
