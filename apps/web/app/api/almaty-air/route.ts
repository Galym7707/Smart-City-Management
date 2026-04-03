import { NextResponse } from "next/server";
import type { AlmatyAirSnapshot, AirSourceSnapshot } from "../../../lib/city-signals";

export const dynamic = "force-dynamic";

const AIR_AVERAGE_URL = "https://api.air.org.kz/api/city/average";

type UpstreamAirPayload = {
  city?: unknown;
  pm25_avg?: unknown;
  pm10_avg?: unknown;
  aqi_avg?: unknown;
  stations_total?: unknown;
  timestamp?: unknown;
  sources?: {
    airgradient?: {
      pm25_avg?: unknown;
      pm10_avg?: unknown;
      aqi_avg?: unknown;
      stations_count?: unknown;
    };
    iqair?: {
      pm25_avg?: unknown;
      pm10_avg?: unknown;
      aqi_avg?: unknown;
      stations_count?: unknown;
    };
  };
};

type UpstreamAirSources = NonNullable<UpstreamAirPayload["sources"]>;

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeSource(source: UpstreamAirSources | undefined, key: "airgradient" | "iqair"): AirSourceSnapshot {
  const snapshot = source?.[key];

  return {
    pm25Avg: toOptionalNumber(snapshot?.pm25_avg),
    pm10Avg: toOptionalNumber(snapshot?.pm10_avg),
    aqiAvg: toOptionalNumber(snapshot?.aqi_avg),
    stationsCount: toNumber(snapshot?.stations_count),
  };
}

export async function GET() {
  try {
    const response = await fetch(AIR_AVERAGE_URL, {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to load AIR average data." },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as UpstreamAirPayload;
    const snapshot: AlmatyAirSnapshot = {
      city: typeof payload.city === "string" ? payload.city : "Almaty",
      pm25Avg: toNumber(payload.pm25_avg),
      pm10Avg: toNumber(payload.pm10_avg),
      aqiAvg: toNumber(payload.aqi_avg),
      stationsTotal: toNumber(payload.stations_total),
      timestamp:
        typeof payload.timestamp === "string" && payload.timestamp.length > 0
          ? payload.timestamp
          : new Date().toISOString(),
      refreshedAt: new Date().toISOString(),
      sourceUrl: AIR_AVERAGE_URL,
      sources: {
        airgradient: normalizeSource(payload.sources, "airgradient"),
        iqair: normalizeSource(payload.sources, "iqair"),
      },
    };

    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json(
      { error: "AIR data is currently unavailable." },
      { status: 502 },
    );
  }
}
