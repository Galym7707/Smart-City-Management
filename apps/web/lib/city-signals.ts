export type AirSourceSnapshot = {
  pm25Avg: number | null;
  pm10Avg: number | null;
  aqiAvg: number | null;
  stationsCount: number;
};

export type AlmatyAirSnapshot = {
  city: string;
  pm25Avg: number;
  pm10Avg: number;
  aqiAvg: number;
  stationsTotal: number;
  timestamp: string;
  refreshedAt: string;
  sourceUrl: string;
  sources: {
    airgradient: AirSourceSnapshot;
    iqair: AirSourceSnapshot;
  };
};

export type AirDistrictSnapshot = {
  district: string;
  pm25Avg: number;
  pm10Avg: number;
  stationsCount: number;
};

export type AirStationSnapshot = {
  id: string;
  name: string;
  pm25: number;
  lat: number;
  lon: number;
  district: string | null;
  origin: string;
  source: string;
  datetime: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AlmatyAirMapSnapshot = {
  city: string;
  timestamp: string;
  freshWindowHours: number;
  stationsTotal: number;
  freshStationsCount: number;
  sourceUrls: {
    stations: string;
    districts: string;
  };
  districts: AirDistrictSnapshot[];
  stations: AirStationSnapshot[];
};

export type TrafficVehicleCounts = {
  car: number;
  motorcycle: number;
  bus: number;
  truck: number;
};

export type TrafficCameraLocation = {
  label: string;
  latitude: number;
  longitude: number;
  description?: string;
};

export type TrafficDetection = {
  className: keyof TrafficVehicleCounts;
  confidence: number;
  bbox: [number, number, number, number];
};

export type TrafficJamSnapshot = {
  totalCount: number;
  counts: TrafficVehicleCounts;
  density: number;
  detections: TrafficDetection[];
  jam: {
    isJam: boolean;
    status: string;
    score: number;
  };
  cameraLocation: TrafficCameraLocation | null;
  cameraLocationSource: "configured" | "missing";
  timestamp: string;
  updatedAt: string;
  sourcePath: string;
};

export type HealthAlertSeverity = "Низкая" | "Средняя" | "Высокая" | "Критическая";

export type HealthAlertTelegramStatus =
  | "not-triggered"
  | "not-configured"
  | "cooldown"
  | "sent"
  | "failed";

export type HealthAlertSnapshot = {
  active: boolean;
  severity: HealthAlertSeverity;
  title: string;
  summary: string;
  reasoning: string;
  recommendedActions: string[];
  telegramMessagePreview: string;
  observedAt: string;
  metrics: {
    aqi: number;
    pm25: number;
    jamScore: number;
    totalCount: number;
    densityPct: number;
    airUpdatedAt: string;
    trafficUpdatedAt: string;
  };
  sources: {
    air: string;
    traffic: string;
  };
  telegram: {
    status: HealthAlertTelegramStatus;
    targetLabel: string | null;
    note: string;
    sentAt: string | null;
  };
};

export type CrimeIncidentSeverity = "critical" | "high" | "medium";
export type PatrolStatus = "available" | "responding" | "busy";

export type CrimeIncidentSnapshot = {
  id: number;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  severity: CrimeIncidentSeverity;
  severityLabel: string;
  district: string;
  address: string;
  observedAt: string;
  time: string;
  description: string;
  hasVideo: boolean;
  videoPath: string | null;
  videoMimeType: string | null;
  color: string;
  participants: string;
  cameraLabel: string;
  responseStatus: string;
};

export type CrimeRecommendationSnapshot = {
  id: string;
  level: "critical" | "warning" | "info";
  title: string;
  body: string;
  priorityPct: number | null;
};

export type PatrolUnitSnapshot = {
  id: string;
  name: string;
  role: string;
  status: PatrolStatus;
  statusLabel: string;
};

export type CrimeMonitorSnapshot = {
  city: string;
  sourceLabel: string;
  updatedAt: string;
  coverageZones: number;
  weeklyDelta: number;
  nightRiskSharePct: number;
  peakWindow: string;
  availableVideoIncidents: number;
  incidents: CrimeIncidentSnapshot[];
  patrolUnits: PatrolUnitSnapshot[];
  recommendations: CrimeRecommendationSnapshot[];
};

async function requestJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function loadAlmatyAirSnapshot(): Promise<AlmatyAirSnapshot | null> {
  return requestJson<AlmatyAirSnapshot>("/api/almaty-air");
}

export async function loadAlmatyAirMapSnapshot(): Promise<AlmatyAirMapSnapshot | null> {
  return requestJson<AlmatyAirMapSnapshot>("/api/almaty-air-map");
}

export async function loadTrafficJamSnapshot(): Promise<TrafficJamSnapshot | null> {
  return requestJson<TrafficJamSnapshot>("/api/traffic-jams");
}

export async function loadHealthAlertSnapshot(): Promise<HealthAlertSnapshot | null> {
  return requestJson<HealthAlertSnapshot>("/api/health-risk-alert");
}

export async function loadCrimeMonitorSnapshot(): Promise<CrimeMonitorSnapshot | null> {
  return requestJson<CrimeMonitorSnapshot>("/api/crime-monitor");
}
