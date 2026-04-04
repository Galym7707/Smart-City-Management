"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type MapLibreModule = typeof import("maplibre-gl");
type MapInstance = import("maplibre-gl").Map;
type MarkerInstance = import("maplibre-gl").Marker;
type StyleSpecification = import("maplibre-gl").StyleSpecification;

export type SignalMapPoint = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  value: string;
  category?: string;
  description?: string;
  color: string;
  meta?: Array<{
    label: string;
    value: string;
  }>;
};

type SignalMapProps = {
  points: SignalMapPoint[];
  selectedPointId?: string;
  onSelectPoint?: (pointId: string) => void;
  selectionLabel: string;
  footerHint?: string;
  emptyState?: {
    title: string;
    description: string;
  };
  defaultCenter?: [number, number];
  defaultZoom?: number;
};

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

const DEFAULT_CENTER: [number, number] = [76.9285, 43.2383];
const DEFAULT_ZOOM = 10.8;

export function SignalMap({
  points,
  selectedPointId,
  onSelectPoint,
  selectionLabel,
  footerHint,
  emptyState,
  defaultCenter = DEFAULT_CENTER,
  defaultZoom = DEFAULT_ZOOM,
}: SignalMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const markersRef = useRef<MarkerInstance[]>([]);
  const [mapModule, setMapModule] = useState<MapLibreModule | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [useFallback, setUseFallback] = useState(false);

  const selectedPoint = useMemo(
    () => points.find((point) => point.id === selectedPointId) ?? points[0] ?? null,
    [points, selectedPointId],
  );

  useEffect(() => {
    let cancelled = false;

    async function initializeMap() {
      if (!containerRef.current || mapRef.current || useFallback) {
        return;
      }

      try {
        const imported = await import("maplibre-gl");
        if (cancelled || !containerRef.current) {
          return;
        }

        setMapModule(imported);

        const map = new imported.Map({
          container: containerRef.current,
          style: CITY_STYLE,
          center: defaultCenter,
          zoom: defaultZoom,
          attributionControl: false,
        });

        map.addControl(new imported.NavigationControl({ showCompass: false }), "top-right");
        map.on("load", () => {
          if (cancelled) {
            return;
          }
          setMapReady(true);
          fitMapToPoints(map, points, defaultCenter, defaultZoom);
        });
        map.on("error", () => {
          if (!cancelled) {
            setMapReady(false);
            setUseFallback(true);
          }
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
  }, [defaultCenter, defaultZoom, useFallback]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) {
      return;
    }

    fitMapToPoints(mapRef.current, points, defaultCenter, defaultZoom);
  }, [defaultCenter, defaultZoom, mapReady, points]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapModule) {
      return;
    }

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    for (const point of points) {
      const element = document.createElement("button");
      element.type = "button";
      element.ariaLabel = point.label;
      element.className = [
        "signal-map-marker",
        point.id === selectedPoint?.id ? "signal-map-marker-active" : "",
      ]
        .filter(Boolean)
        .join(" ");
      element.style.setProperty("--signal-marker-color", point.color);
      element.addEventListener("click", () => onSelectPoint?.(point.id));

      const marker = new mapModule.Marker({
        element,
        anchor: "center",
      })
        .setLngLat([point.longitude, point.latitude])
        .addTo(mapRef.current);

      markersRef.current.push(marker);
    }
  }, [mapModule, mapReady, onSelectPoint, points, selectedPoint?.id]);

  return (
    <div className="map-shell map-shell-live">
      {useFallback ? <div className="signal-map-fallback">{emptyState?.description ?? "Карта временно недоступна."}</div> : null}
      <div className="map-canvas" ref={containerRef} />

      {emptyState && points.length === 0 ? (
        <div className="signal-map-empty">
          <div className="signal-map-empty-card">
            <strong>{emptyState.title}</strong>
            <p>{emptyState.description}</p>
          </div>
        </div>
      ) : null}

      {selectedPoint ? (
        <aside className="map-selection-card">
          <span className="map-selection-eyebrow">{selectionLabel}</span>
          <strong>{selectedPoint.label}</strong>
          {selectedPoint.description ? <p>{selectedPoint.description}</p> : null}
          <dl className="map-selection-meta">
            <div>
              <dt>Показатель</dt>
              <dd>{selectedPoint.value}</dd>
            </div>
            <div>
              <dt>Координаты</dt>
              <dd>{`${selectedPoint.latitude.toFixed(4)}, ${selectedPoint.longitude.toFixed(4)}`}</dd>
            </div>
            {selectedPoint.category ? (
              <div>
                <dt>Контекст</dt>
                <dd>{selectedPoint.category}</dd>
              </div>
            ) : null}
            {selectedPoint.meta?.map((item) => (
              <div key={`${selectedPoint.id}-${item.label}`}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
          {footerHint ? <p className="map-selection-hint">{footerHint}</p> : null}
        </aside>
      ) : null}
    </div>
  );
}

function fitMapToPoints(
  map: MapInstance,
  points: SignalMapPoint[],
  defaultCenter: [number, number],
  defaultZoom: number,
) {
  if (points.length === 0) {
    map.easeTo({
      center: defaultCenter,
      zoom: defaultZoom,
      duration: 0,
    });
    return;
  }

  if (points.length === 1) {
    map.easeTo({
      center: [points[0].longitude, points[0].latitude],
      zoom: 11.8,
      duration: 0,
    });
    return;
  }

  const bounds = points.reduce(
    (acc, point) => {
      acc.minLon = Math.min(acc.minLon, point.longitude);
      acc.maxLon = Math.max(acc.maxLon, point.longitude);
      acc.minLat = Math.min(acc.minLat, point.latitude);
      acc.maxLat = Math.max(acc.maxLat, point.latitude);
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
      maxZoom: 11.8,
    },
  );
}
