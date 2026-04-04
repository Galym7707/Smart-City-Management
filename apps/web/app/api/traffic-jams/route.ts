import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import type {
  TrafficCameraLocation,
  TrafficDetection,
  TrafficJamSnapshot,
  TrafficVehicleCounts,
} from "../../../lib/city-signals";

export const dynamic = "force-dynamic";

type RawTrafficPayload = {
  total_count?: unknown;
  counts?: Partial<Record<keyof TrafficVehicleCounts, unknown>>;
  density?: unknown;
  detections?: Array<{
    class?: unknown;
    confidence?: unknown;
    bbox?: unknown;
  }>;
  jam?: {
    is_jam?: unknown;
    status?: unknown;
    score?: unknown;
  };
  timestamp?: unknown;
};

type RawTrafficCameraLocation = {
  label?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  description?: unknown;
};

async function resolveTrafficDataPath() {
  const candidates = [
    path.resolve(/* turbopackIgnore: true */ process.cwd(), "trafficjams", "traffic_data.json"),
    path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", "trafficjams", "traffic_data.json"),
    path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", "..", "trafficjams", "traffic_data.json"),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

async function resolveTrafficCameraPath() {
  const candidates = [
    path.resolve(/* turbopackIgnore: true */ process.cwd(), "trafficjams", "camera_location.json"),
    path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", "trafficjams", "camera_location.json"),
    path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", "..", "trafficjams", "camera_location.json"),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toStringOrNull(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeCounts(rawCounts?: RawTrafficPayload["counts"]): TrafficVehicleCounts {
  return {
    car: toNumber(rawCounts?.car),
    motorcycle: toNumber(rawCounts?.motorcycle),
    bus: toNumber(rawCounts?.bus),
    truck: toNumber(rawCounts?.truck),
  };
}

function normalizeDetections(rawDetections?: RawTrafficPayload["detections"]): TrafficDetection[] {
  if (!Array.isArray(rawDetections)) {
    return [];
  }

  const allowedClasses = new Set<keyof TrafficVehicleCounts>(["car", "motorcycle", "bus", "truck"]);

  return rawDetections
    .map((item) => {
      const className =
        typeof item.class === "string" && allowedClasses.has(item.class as keyof TrafficVehicleCounts)
          ? (item.class as keyof TrafficVehicleCounts)
          : null;
      const confidence = toNumber(item.confidence);
      const bbox =
        Array.isArray(item.bbox) && item.bbox.length === 4 && item.bbox.every((value) => typeof value === "number")
          ? (item.bbox as [number, number, number, number])
          : null;

      if (!className || !bbox) {
        return null;
      }

      return {
        className,
        confidence,
        bbox,
      };
    })
    .filter((item): item is TrafficDetection => item !== null);
}

async function loadCameraLocation(): Promise<TrafficCameraLocation | null> {
  const filePath = await resolveTrafficCameraPath();
  if (!filePath) {
    return null;
  }

  try {
    const rawContent = await readFile(filePath, "utf-8");
    const raw = JSON.parse(rawContent) as RawTrafficCameraLocation;
    const label = toStringOrNull(raw.label);
    const description = toStringOrNull(raw.description) ?? undefined;
    const latitude = toNumber(raw.latitude, Number.NaN);
    const longitude = toNumber(raw.longitude, Number.NaN);

    if (!label || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    return {
      label,
      latitude,
      longitude,
      description,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const filePath = await resolveTrafficDataPath();
  if (!filePath) {
    return NextResponse.json(
      { error: "traffic_data.json not found." },
      { status: 404 },
    );
  }

  try {
    const [rawContent, fileStat, cameraLocation] = await Promise.all([
      readFile(filePath, "utf-8"),
      stat(filePath),
      loadCameraLocation(),
    ]);
    const raw = JSON.parse(rawContent) as RawTrafficPayload;
    const unixSeconds = toNumber(raw.timestamp);

    const snapshot: TrafficJamSnapshot = {
      totalCount: toNumber(raw.total_count),
      counts: normalizeCounts(raw.counts),
      density: toNumber(raw.density),
      detections: normalizeDetections(raw.detections),
      jam: {
        isJam: Boolean(raw.jam?.is_jam),
        status: typeof raw.jam?.status === "string" ? raw.jam.status : "UNKNOWN",
        score: toNumber(raw.jam?.score),
      },
      cameraLocation,
      cameraLocationSource: cameraLocation ? "configured" : "missing",
      timestamp: unixSeconds > 0 ? new Date(unixSeconds * 1000).toISOString() : fileStat.mtime.toISOString(),
      updatedAt: fileStat.mtime.toISOString(),
      sourcePath: filePath,
    };

    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json(
      { error: "Traffic jam snapshot is unavailable." },
      { status: 500 },
    );
  }
}
