import { NextResponse } from "next/server";
import type { CrimeMonitorSnapshot } from "../../../lib/city-signals";

export const dynamic = "force-dynamic";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";

type RawCrimeIncident = {
  id: number;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  severity: "critical" | "high" | "medium";
  severity_label: string;
  district: string;
  address: string;
  observed_at: string;
  time: string;
  description: string;
  has_video: boolean;
  video_path: string | null;
  video_mime_type: string | null;
  color: string;
  participants: string;
  camera_label: string;
  response_status: string;
};

type RawCrimeRecommendation = {
  id: string;
  level: "critical" | "warning" | "info";
  title: string;
  body: string;
  priority_pct: number | null;
};

type RawPatrolUnit = {
  id: string;
  name: string;
  role: string;
  status: "available" | "responding" | "busy";
  status_label: string;
};

type RawCrimeMonitorSnapshot = {
  city: string;
  source_label: string;
  updated_at: string;
  coverage_zones: number;
  weekly_delta: number;
  night_risk_share_pct: number;
  peak_window: string;
  available_video_incidents: number;
  incidents: RawCrimeIncident[];
  patrol_units: RawPatrolUnit[];
  recommendations: RawCrimeRecommendation[];
};

function normalizeSnapshot(raw: RawCrimeMonitorSnapshot): CrimeMonitorSnapshot {
  return {
    city: raw.city,
    sourceLabel: raw.source_label,
    updatedAt: raw.updated_at,
    coverageZones: raw.coverage_zones,
    weeklyDelta: raw.weekly_delta,
    nightRiskSharePct: raw.night_risk_share_pct,
    peakWindow: raw.peak_window,
    availableVideoIncidents: raw.available_video_incidents,
    incidents: raw.incidents.map((incident) => ({
      id: incident.id,
      name: incident.name,
      type: incident.type,
      latitude: incident.latitude,
      longitude: incident.longitude,
      severity: incident.severity,
      severityLabel: incident.severity_label,
      district: incident.district,
      address: incident.address,
      observedAt: incident.observed_at,
      time: incident.time,
      description: incident.description,
      hasVideo: incident.has_video,
      videoPath: incident.has_video ? `/api/crime-monitor/video/${incident.id}` : null,
      videoMimeType: incident.video_mime_type,
      color: incident.color,
      participants: incident.participants,
      cameraLabel: incident.camera_label,
      responseStatus: incident.response_status,
    })),
    patrolUnits: raw.patrol_units.map((unit) => ({
      id: unit.id,
      name: unit.name,
      role: unit.role,
      status: unit.status,
      statusLabel: unit.status_label,
    })),
    recommendations: raw.recommendations.map((recommendation) => ({
      id: recommendation.id,
      level: recommendation.level,
      title: recommendation.title,
      body: recommendation.body,
      priorityPct: recommendation.priority_pct,
    })),
  };
}

export async function GET() {
  if (!apiBaseUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_API_BASE_URL is not configured." },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/crime/incidents`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Crime monitor backend is unavailable." },
        { status: response.status },
      );
    }

    const raw = (await response.json()) as RawCrimeMonitorSnapshot;
    return NextResponse.json(normalizeSnapshot(raw));
  } catch {
    return NextResponse.json(
      { error: "Crime monitor backend is unavailable." },
      { status: 502 },
    );
  }
}
