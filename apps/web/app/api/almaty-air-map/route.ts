import { NextResponse } from "next/server";
import type {
  AirDistrictSnapshot,
  AirStationSnapshot,
  AlmatyAirMapSnapshot,
} from "../../../lib/city-signals";

export const dynamic = "force-dynamic";

const AIR_STATIONS_URL = "https://api.air.org.kz/api/pm25/hourly/latest?city=Almaty";
const AIR_DISTRICTS_URL = "https://api.air.org.kz/api/city/districts?city=Almaty";
const FRESH_WINDOW_HOURS = 24;
const ALMATY_DISTRICT_ALIASES = [
  "алатау",
  "турксиб",
  "жетысу",
  "алмалы",
  "наурызбай",
  "ауэзов",
  "бостандык",
  "медеу",
] as const;

type UpstreamStationEntry = {
  id?: unknown;
  name?: unknown;
  pm25?: unknown;
  lat?: unknown;
  lon?: unknown;
  district?: unknown;
  origin?: unknown;
  source?: unknown;
  datetime?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

type UpstreamStationsPayload = {
  value?: UpstreamStationEntry[];
} | UpstreamStationEntry[];

type UpstreamDistrictsPayload = {
  city?: unknown;
  timestamp?: unknown;
  districts?: Array<{
    district?: unknown;
    pm25_avg?: unknown;
    pm10_avg?: unknown;
    stations_count?: unknown;
  }>;
};

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function getDistrictAlias(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = normalizeText(value);
  return ALMATY_DISTRICT_ALIASES.find((alias) => normalized.includes(alias)) ?? null;
}

function normalizeStation(
  raw: UpstreamStationEntry,
): AirStationSnapshot | null {
  const id = toStringOrNull(raw.id);
  const name = toStringOrNull(raw.name);
  const datetime = toStringOrNull(raw.datetime);
  const lat = toNumber(raw.lat, Number.NaN);
  const lon = toNumber(raw.lon, Number.NaN);

  if (!id || !name || !datetime || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return {
    id,
    name,
    pm25: toNumber(raw.pm25),
    lat,
    lon,
    district: toStringOrNull(raw.district),
    origin: toStringOrNull(raw.origin) ?? "Unknown source",
    source: toStringOrNull(raw.source) ?? "unknown",
    datetime,
    createdAt: toStringOrNull(raw.created_at),
    updatedAt: toStringOrNull(raw.updated_at),
  };
}

function normalizeDistrict(
  raw: NonNullable<UpstreamDistrictsPayload["districts"]>[number],
): AirDistrictSnapshot | null {
  const district = toStringOrNull(raw.district);
  if (!district) {
    return null;
  }

  return {
    district,
    pm25Avg: toNumber(raw.pm25_avg),
    pm10Avg: toNumber(raw.pm10_avg),
    stationsCount: toNumber(raw.stations_count),
  };
}

function getLatestTimestamp(stations: AirStationSnapshot[]) {
  let latest = 0;

  for (const station of stations) {
    const timestamp = new Date(station.datetime).getTime();
    if (Number.isFinite(timestamp) && timestamp > latest) {
      latest = timestamp;
    }
  }

  return latest;
}

export async function GET() {
  try {
    const [stationsResponse, districtsResponse] = await Promise.all([
      fetch(AIR_STATIONS_URL, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      }),
      fetch(AIR_DISTRICTS_URL, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      }),
    ]);

    if (!stationsResponse.ok || !districtsResponse.ok) {
      return NextResponse.json(
        { error: "Failed to load AIR map data." },
        { status: 502 },
      );
    }

    const stationsPayload = (await stationsResponse.json()) as UpstreamStationsPayload;
    const districtsPayload = (await districtsResponse.json()) as UpstreamDistrictsPayload;

    const districts = (districtsPayload.districts ?? [])
      .map(normalizeDistrict)
      .filter((district): district is AirDistrictSnapshot => district !== null)
      .sort((left, right) => right.pm25Avg - left.pm25Avg);
    const allowedDistrictAliases = new Set(
      districts
        .map((district) => getDistrictAlias(district.district))
        .filter((alias): alias is (typeof ALMATY_DISTRICT_ALIASES)[number] => alias !== null),
    );
    const rawStations = Array.isArray(stationsPayload) ? stationsPayload : (stationsPayload.value ?? []);
    const stations = rawStations
      .map(normalizeStation)
      .filter((station): station is AirStationSnapshot => station !== null)
      .filter((station) => {
        const alias = getDistrictAlias(station.district);
        return alias ? allowedDistrictAliases.has(alias) : false;
      });
    const latestTimestamp = getLatestTimestamp(stations);
    const freshCutoff = latestTimestamp > 0 ? latestTimestamp - FRESH_WINDOW_HOURS * 60 * 60 * 1000 : 0;
    const freshStations = stations
      .filter((station) => {
        if (freshCutoff === 0) {
          return true;
        }

        const timestamp = new Date(station.datetime).getTime();
        return Number.isFinite(timestamp) && timestamp >= freshCutoff;
      })
      .sort((left, right) => right.pm25 - left.pm25);

    const snapshot: AlmatyAirMapSnapshot = {
      city: toStringOrNull(districtsPayload.city) ?? "Almaty",
      timestamp:
        toStringOrNull(districtsPayload.timestamp) ??
        (latestTimestamp > 0 ? new Date(latestTimestamp).toISOString() : new Date().toISOString()),
      freshWindowHours: FRESH_WINDOW_HOURS,
      stationsTotal: stations.length,
      freshStationsCount: freshStations.length,
      sourceUrls: {
        stations: AIR_STATIONS_URL,
        districts: AIR_DISTRICTS_URL,
      },
      districts,
      stations: freshStations,
    };

    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json(
      { error: "AIR map data is currently unavailable." },
      { status: 502 },
    );
  }
}
