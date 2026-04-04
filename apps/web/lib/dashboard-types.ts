export type Severity = "high" | "medium" | "watch";
export type TaskStatus = "open" | "done";

export type SitePosition = {
  x: number;
  y: number;
};

export type TrendPoint = {
  label: string;
  anomalyIndex: number;
};

export type Anomaly = {
  id: string;
  assetName: string;
  region: string;
  facilityType: string;
  severity: Severity;
  detectedAt: string;
  methaneDeltaPct: number;
  methaneDeltaPpb?: number;
  co2eTonnes?: number;
  flareHours?: number;
  thermalHits72h?: number;
  nightThermalHits72h?: number;
  currentCh4Ppb?: number;
  baselineCh4Ppb?: number;
  evidenceSource?: string;
  baselineWindow?: string;
  signalScore: number;
  confidence: string;
  coordinates: string;
  latitude: number;
  longitude: number;
  verificationArea?: string;
  nearestAddress?: string;
  nearestLandmark?: string;
  summary: string;
  recommendedAction: string;
  sitePosition: SitePosition;
  trend: TrendPoint[];
  linkedIncidentId?: string;
};

export type IncidentTask = {
  id: string;
  title: string;
  owner: string;
  etaHours: number;
  status: TaskStatus;
  notes: string;
};

export type Incident = {
  id: string;
  anomalyId: string;
  title: string;
  status: "triage" | "verification" | "mitigation";
  owner: string;
  priority: string;
  verificationWindow: string;
  reportGeneratedAt?: string;
  narrative: string;
  tasks: IncidentTask[];
  reportSections?: ReportSection[];
};

export type Kpi = {
  label: string;
  value: string;
  detail: string;
};

export type ReportSection = {
  title: string;
  body: string;
};

export type ActivityEvent = {
  id: string;
  occurredAt: string;
  stage: "ingest" | "incident" | "verification" | "report";
  source: "gee" | "workflow";
  action:
    | "screening_loaded"
    | "anomaly_promoted"
    | "task_created"
    | "task_completed"
    | "report_generated"
    | "gee_sync_verified";
  title: string;
  detail: string;
  actor: string;
  incidentId?: string;
  entityType: "pipeline" | "anomaly" | "incident" | "task" | "report";
  entityId?: string;
  metadata: Record<string, string | number | boolean | null>;
};

export type DashboardState = {
  kpis: Kpi[];
  anomalies: Anomaly[];
  incidents: Record<string, Incident>;
  activityFeed: ActivityEvent[];
};

export function createEmptyDashboardState(): DashboardState {
  return {
    kpis: [],
    anomalies: [],
    incidents: {},
    activityFeed: [],
  };
}
