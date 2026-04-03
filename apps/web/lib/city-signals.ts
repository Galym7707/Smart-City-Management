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

export type TrafficVehicleCounts = {
  car: number;
  motorcycle: number;
  bus: number;
  truck: number;
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
  timestamp: string;
  updatedAt: string;
  sourcePath: string;
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

export async function loadTrafficJamSnapshot(): Promise<TrafficJamSnapshot | null> {
  return requestJson<TrafficJamSnapshot>("/api/traffic-jams");
}
