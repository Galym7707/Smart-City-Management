import {
  type ActivityEvent,
  type Anomaly,
  createEmptyDashboardState,
  type DashboardState,
  type Incident,
  type IncidentTask,
  type Kpi,
  type ReportSection,
  type Severity,
  type TaskStatus,
  type TrendPoint,
} from "./dashboard-types";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";
export const hasApiBaseUrl = apiBaseUrl.length > 0;

export type DashboardSource = "api" | "demo" | "unavailable";
export type DashboardHydrationState = DashboardState & { source: DashboardSource };
export type PipelineSource = "gee";
export type PipelineState = "ready" | "degraded" | "error" | "syncing";
export type PipelineHistoryTrigger = "manual" | "scheduled";
export type EvidenceFreshness = "fresh" | "stale" | "unavailable";
export type ScreeningLevel = "low" | "medium" | "high";
export type ReportExportFormat = "html" | "pdf" | "docx";
export type PipelineStageCard = {
  label: string;
  value: string;
  detail: string;
};
export type ScreeningEvidenceSnapshot = {
  areaLabel: string;
  evidenceSource: string;
  freshness: EvidenceFreshness;
  screeningLevel: ScreeningLevel;
  syncedAt?: string;
  lastSuccessfulSyncAt?: string;
  observedWindow?: string;
  currentCh4Ppb?: number;
  baselineCh4Ppb?: number;
  deltaAbsPpb?: number;
  deltaPct?: number;
  confidenceNote: string;
  caveat?: string;
  recommendedAction: string;
};
export type PipelineStatus = {
  source: PipelineSource;
  state: PipelineState;
  providerLabel: string;
  projectId?: string;
  lastSyncAt?: string;
  latestObservationAt?: string;
  anomalyCount: number;
  statusMessage: string;
  stages: PipelineStageCard[];
  screeningSnapshot?: ScreeningEvidenceSnapshot;
};
export type PipelineScheduleStatus = {
  enabled: boolean;
  intervalMinutes?: number;
  nextRunAt?: string;
  runOnStartup: boolean;
};
export type PipelineHistoryRun = {
  id: number;
  createdAt: string;
  trigger: PipelineHistoryTrigger;
  status: PipelineStatus;
};
export type PipelineHistoryPayload = {
  runs: PipelineHistoryRun[];
  schedule: PipelineScheduleStatus;
};

type ApiDashboardPayload = {
  kpis: ApiKpi[];
  anomalies: ApiAnomaly[];
  incidents: ApiIncident[];
  activity_feed: ApiActivityEvent[];
};

type ApiKpi = {
  label: string;
  value: string;
  detail: string;
};

type ApiTrendPoint = {
  label: string;
  anomaly_index: number;
};

type ApiAnomaly = {
  id: string;
  asset_name: string;
  region: string;
  facility_type: string;
  severity: Severity;
  detected_at: string;
  methane_delta_pct: number;
  methane_delta_ppb?: number | null;
  co2e_tonnes?: number | null;
  flare_hours?: number | null;
  thermal_hits_72h?: number | null;
  night_thermal_hits_72h?: number | null;
  current_ch4_ppb?: number | null;
  baseline_ch4_ppb?: number | null;
  evidence_source?: string | null;
  baseline_window?: string | null;
  signal_score: number;
  confidence: string;
  coordinates: string;
  latitude: number;
  longitude: number;
  verification_area?: string | null;
  nearest_address?: string | null;
  nearest_landmark?: string | null;
  summary: string;
  recommended_action: string;
  site_position: {
    x: number;
    y: number;
  };
  trend: ApiTrendPoint[];
  linked_incident_id?: string | null;
};

type ApiIncidentTask = {
  id: string;
  title: string;
  owner: string;
  eta_hours: number;
  status: TaskStatus;
  notes: string;
};

type ApiIncident = {
  id: string;
  anomaly_id: string;
  title: string;
  status: Incident["status"];
  owner: string;
  priority: string;
  verification_window: string;
  report_generated_at?: string | null;
  narrative: string;
  tasks: ApiIncidentTask[];
  report_sections?: ApiReportSection[] | null;
};

type ApiReportSection = {
  title: string;
  body: string;
};

type ApiActivityEvent = {
  id: string;
  occurred_at: string;
  stage: ActivityEvent["stage"];
  source: ActivityEvent["source"];
  action: ActivityEvent["action"];
  title: string;
  detail: string;
  actor: string;
  incident_id?: string | null;
  entity_type: ActivityEvent["entityType"];
  entity_id?: string | null;
  metadata?: Record<string, string | number | boolean | null> | null;
};

type ApiGenerateReportResponse = {
  incident: ApiIncident;
  report: ApiReportSection[];
};

type ApiActivityFeedPayload = {
  events: ApiActivityEvent[];
};

type ApiPipelineStage = {
  label: string;
  value: string;
  detail: string;
};

type ApiPipelineStatus = {
  source: PipelineSource;
  state: PipelineState;
  provider_label: string;
  project_id?: string | null;
  last_sync_at?: string | null;
  latest_observation_at?: string | null;
  anomaly_count: number;
  status_message: string;
  stages: ApiPipelineStage[];
  screening_snapshot?: ApiScreeningEvidenceSnapshot | null;
};

type ApiPipelineSyncResponse = {
  status: ApiPipelineStatus;
};
type ApiPipelineScheduleStatus = {
  enabled: boolean;
  interval_minutes?: number | null;
  next_run_at?: string | null;
  run_on_startup: boolean;
};
type ApiPipelineHistoryEntry = {
  id: number;
  created_at: string;
  trigger: PipelineHistoryTrigger;
  status: ApiPipelineStatus;
};
type ApiPipelineHistoryPayload = {
  runs: ApiPipelineHistoryEntry[];
  schedule: ApiPipelineScheduleStatus;
};

type ApiScreeningEvidenceSnapshot = {
  area_label: string;
  evidence_source: string;
  freshness: EvidenceFreshness;
  screening_level: ScreeningLevel;
  synced_at?: string | null;
  last_successful_sync_at?: string | null;
  observed_window?: string | null;
  current_ch4_ppb?: number | null;
  baseline_ch4_ppb?: number | null;
  delta_abs_ppb?: number | null;
  delta_pct?: number | null;
  confidence_note: string;
  caveat?: string | null;
  recommended_action: string;
};

type CreateTaskPayload = {
  title: string;
  owner: string;
  eta_hours: number;
  notes: string;
};

export type DownloadedReport = {
  blob: Blob;
  fileName: string;
  contentType: string;
};

type DemoStore = {
  dashboard: DashboardState;
  pipelineHistory: PipelineHistoryPayload;
  pipelineStatus: PipelineStatus;
};

const DEMO_STATUS_MESSAGE = "City demo playback is active with mock operational data.";
const DEMO_RELOAD_MESSAGE = "City demo snapshot reloaded for local playback.";

let demoStore = createDemoStore();

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createTrend(...points: Array<[string, number]>): TrendPoint[] {
  return points.map(([label, anomalyIndex]) => ({ label, anomalyIndex }));
}

function createDemoStore(): DemoStore {
  const anomalies: Anomaly[] = [
    {
      id: "anomaly-al-farabi-01",
      assetName: "Перегрузка на Аль-Фараби и Назарбаева",
      region: "Almaty City",
      facilityType: "Транспорт",
      severity: "high",
      detectedAt: "2026-04-03T18:05:00+05:00",
      methaneDeltaPct: 32.4,
      methaneDeltaPpb: 17.0,
      thermalHits72h: 148,
      nightThermalHits72h: 148,
      currentCh4Ppb: 79.0,
      baselineCh4Ppb: 62.0,
      evidenceSource: "Камеры трафика, GPS автобусов, обращения 109",
      baselineWindow: "Последние 24 часа против среднего за 14 дней",
      signalScore: 96,
      confidence: "Высокая уверенность / транспортная перегрузка подтверждена несколькими источниками",
      coordinates: "43.2389, 76.9456",
      latitude: 43.2389,
      longitude: 76.9456,
      verificationArea: "Бостандыкский район",
      nearestAddress: "проспект Аль-Фараби, 77/8",
      nearestLandmark: "Площадь Республики",
      summary:
        "Вечерний пик перегрузил основной коридор, растет задержка автобусов и время проезда спецслужб.",
      recommendedAction:
        "Открыть инцидент, подключить управление мобильности и временно изменить приоритеты светофоров.",
      sitePosition: { x: 62, y: 45 },
      trend: createTrend(
        ["12:00", 48],
        ["13:00", 55],
        ["14:00", 62],
        ["15:00", 70],
        ["16:00", 78],
        ["17:00", 89],
        ["18:00", 96],
      ),
      linkedIncidentId: "INC-4101",
    },
    {
      id: "anomaly-water-02",
      assetName: "Падение давления воды в микрорайоне Шанырак",
      region: "Almaty City",
      facilityType: "Коммунальные сети",
      severity: "high",
      detectedAt: "2026-04-03T17:42:00+05:00",
      methaneDeltaPct: 28.6,
      methaneDeltaPpb: 14.3,
      thermalHits72h: 91,
      nightThermalHits72h: 91,
      currentCh4Ppb: 74.1,
      baselineCh4Ppb: 59.8,
      evidenceSource: "SCADA водоканала, обращения 109, геометки аварийных бригад",
      baselineWindow: "Последние 12 часов против среднего за 7 дней",
      signalScore: 91,
      confidence: "Высокая уверенность / давление просело ниже рабочего коридора",
      coordinates: "43.2642, 76.7870",
      latitude: 43.2642,
      longitude: 76.787,
      verificationArea: "Алатауский район",
      nearestAddress: "улица Жанкожа батыра, 202",
      nearestLandmark: "Алатауский ЦОН",
      summary:
        "Система показывает вероятную скрытую утечку: жалобы на воду растут, давление в контуре резко просело.",
      recommendedAction:
        "Срочно направить аварийную бригаду, локализовать участок и предупредить жителей по графику подачи.",
      sitePosition: { x: 21, y: 56 },
      trend: createTrend(
        ["12:00", 44],
        ["13:00", 50],
        ["14:00", 58],
        ["15:00", 66],
        ["16:00", 73],
        ["17:00", 84],
        ["18:00", 91],
      ),
      linkedIncidentId: "INC-4102",
    },
    {
      id: "anomaly-air-03",
      assetName: "Смоговый пик в Турксибском промышленном поясе",
      region: "Almaty City",
      facilityType: "Экология",
      severity: "medium",
      detectedAt: "2026-04-03T16:55:00+05:00",
      methaneDeltaPct: 18.4,
      methaneDeltaPpb: 9.6,
      thermalHits72h: 67,
      nightThermalHits72h: 67,
      currentCh4Ppb: 68.7,
      baselineCh4Ppb: 59.1,
      evidenceSource: "Датчики PM2.5, метеоданные, обращения жителей",
      baselineWindow: "Последние 6 часов против среднего за 30 дней",
      signalScore: 82,
      confidence: "Средняя уверенность / рост загрязнения подтвержден датчиками и ветром",
      coordinates: "43.3431, 76.9972",
      latitude: 43.3431,
      longitude: 76.9972,
      verificationArea: "Турксибский район",
      nearestAddress: "проспект Суюнбая, 419",
      nearestLandmark: "Вокзал Алматы-1",
      summary:
        "Нагрузка по качеству воздуха растет, северо-восточный ветер удерживает загрязнение над жилой зоной.",
      recommendedAction:
        "Усилить мониторинг, предупредить районные службы и сверить ближайшие промышленные источники.",
      sitePosition: { x: 78, y: 30 },
      trend: createTrend(
        ["12:00", 34],
        ["13:00", 41],
        ["14:00", 50],
        ["15:00", 57],
        ["16:00", 65],
        ["17:00", 74],
        ["18:00", 82],
      ),
    },
    {
      id: "anomaly-power-04",
      assetName: "Риск отключения по подстанции Сайран",
      region: "Almaty City",
      facilityType: "Энергоснабжение",
      severity: "medium",
      detectedAt: "2026-04-03T15:40:00+05:00",
      methaneDeltaPct: 14.1,
      methaneDeltaPpb: 7.2,
      thermalHits72h: 53,
      nightThermalHits72h: 53,
      currentCh4Ppb: 65.0,
      baselineCh4Ppb: 57.8,
      evidenceSource: "SCADA электросетей, телеметрия нагрузки, заявки КСК",
      baselineWindow: "Последние 8 часов против среднего за 21 день",
      signalScore: 77,
      confidence: "Средняя уверенность / контур в зоне вечернего перегруза",
      coordinates: "43.2331, 76.8678",
      latitude: 43.2331,
      longitude: 76.8678,
      verificationArea: "Ауэзовский район",
      nearestAddress: "улица Толе би, 286",
      nearestLandmark: "озеро Сайран",
      summary:
        "Нагрузка на подстанцию растет быстрее нормы; в вечерний пик возможны локальные отключения.",
      recommendedAction:
        "Подготовить резервную схему питания, проверить трансформатор и предупредить диспетчерские службы.",
      sitePosition: { x: 42, y: 49 },
      trend: createTrend(
        ["12:00", 30],
        ["13:00", 37],
        ["14:00", 43],
        ["15:00", 49],
        ["16:00", 57],
        ["17:00", 68],
        ["18:00", 77],
      ),
    },
    {
      id: "anomaly-safety-05",
      assetName: "Скопление обращений по безопасности у рынка Алтын Орда",
      region: "Almaty City",
      facilityType: "Безопасность и порядок",
      severity: "watch",
      detectedAt: "2026-04-03T14:25:00+05:00",
      methaneDeltaPct: 12.5,
      methaneDeltaPpb: 6.4,
      thermalHits72h: 58,
      nightThermalHits72h: 58,
      currentCh4Ppb: 63.4,
      baselineCh4Ppb: 57.0,
      evidenceSource: "102, камеры ЦОУ, обращения жителей",
      baselineWindow: "Последние 24 часа против среднего за 10 дней",
      signalScore: 71,
      confidence: "Средняя уверенность / рост обращений подтвержден камерами",
      coordinates: "43.2072, 76.6750",
      latitude: 43.2072,
      longitude: 76.675,
      verificationArea: "Наурызбайский район",
      nearestAddress: "рынок Алтын Орда, северный въезд",
      nearestLandmark: "рынок Алтын Орда",
      summary:
        "В районе рынка вырос поток обращений о заторах, спорных парковках и локальных конфликтах.",
      recommendedAction:
        "Поставить мобильный патруль и временно усилить регулирование потоков на въездах.",
      sitePosition: { x: 10, y: 60 },
      trend: createTrend(
        ["12:00", 26],
        ["13:00", 32],
        ["14:00", 39],
        ["15:00", 46],
        ["16:00", 53],
        ["17:00", 64],
        ["18:00", 71],
      ),
    },
    {
      id: "anomaly-waste-06",
      assetName: "Срыв вывоза отходов в центре Медеу",
      region: "Almaty City",
      facilityType: "ЖКХ и санитария",
      severity: "watch",
      detectedAt: "2026-04-03T13:10:00+05:00",
      methaneDeltaPct: 9.3,
      methaneDeltaPpb: 4.8,
      thermalHits72h: 43,
      nightThermalHits72h: 43,
      currentCh4Ppb: 59.2,
      baselineCh4Ppb: 54.4,
      evidenceSource: "GPS мусоровозов, фотофиксация, обращения e-Otinish",
      baselineWindow: "Последние 48 часов против среднего за 14 дней",
      signalScore: 64,
      confidence: "Средняя уверенность / часть маршрутов не закрыта в срок",
      coordinates: "43.2568, 76.9671",
      latitude: 43.2568,
      longitude: 76.9671,
      verificationArea: "Медеуский район",
      nearestAddress: "улица Кабанбай батыра, 122",
      nearestLandmark: "Парк 28 гвардейцев-панфиловцев",
      summary:
        "Резервный экипаж не успел закрыть маршрут, контейнерные площадки в центре начинают переполняться.",
      recommendedAction:
        "Передвинуть резервный экипаж и пересобрать вечерний маршрут по центральному кластеру.",
      sitePosition: { x: 69, y: 40 },
      trend: createTrend(
        ["12:00", 22],
        ["13:00", 27],
        ["14:00", 31],
        ["15:00", 39],
        ["16:00", 44],
        ["17:00", 53],
        ["18:00", 64],
      ),
    },
  ];

  const incidents: Record<string, Incident> = {
    "INC-4101": {
      id: "INC-4101",
      anomalyId: "anomaly-al-farabi-01",
      title: "Пиковая перегрузка магистрали Аль-Фараби",
      status: "mitigation",
      owner: "Ситуационный центр акимата",
      priority: "P1",
      verificationWindow: "до 2 часов",
      reportGeneratedAt: "2026-04-03T18:18:00+05:00",
      narrative:
        "Кейс открыт после совпадения перегрузки магистрали, роста задержек общественного транспорта и ухудшения проезда экстренных служб.",
      tasks: [
        {
          id: "task-traffic-1",
          title: "Подтвердить перегрузку по камерам и GPS",
          owner: "Управление городской мобильности",
          etaHours: 1,
          status: "done",
          notes: "Три участка подтверждены: Аль-Фараби, Назарбаева и развязка у Есентая.",
        },
        {
          id: "task-traffic-2",
          title: "Включить координацию со светофорным центром",
          owner: "Диспетчер ИТС",
          etaHours: 1,
          status: "done",
          notes: "Схема приоритета общественного транспорта активирована на 90 минут.",
        },
        {
          id: "task-traffic-3",
          title: "Подготовить схему объезда для спецтехники",
          owner: "Служба 112",
          etaHours: 2,
          status: "done",
          notes: "Маршрут для скорой и пожарных отдан в смену и включен в отчет.",
        },
      ],
      reportSections: [
        {
          title: "Что произошло",
          body: "Вечерний пик перегрузил коридор Аль-Фараби. По данным камер и GPS выросла задержка автобусов и время реагирования экстренных служб.",
        },
        {
          title: "Что сделали",
          body: "Светофорный центр включил временный приоритет движения, служба 112 получила схему объезда, а ситуация вынесена в сводку смены.",
        },
        {
          title: "Что контролировать дальше",
          body: "Нужно удержать среднее время проезда ниже пикового порога до конца вечерней смены и проверить повторение завтра в тот же интервал.",
        },
      ],
    },
    "INC-4102": {
      id: "INC-4102",
      anomalyId: "anomaly-water-02",
      title: "Потеря давления в контуре Шанырак",
      status: "verification",
      owner: "Диспетчер водоканала",
      priority: "P1",
      verificationWindow: "до 1 часа",
      narrative:
        "Кейс открыт после падения давления в контуре, роста обращений жителей и фиксации отклонения по телеметрии.",
      tasks: [
        {
          id: "task-water-1",
          title: "Назначить аварийную бригаду на участок",
          owner: "Аварийная служба водоканала",
          etaHours: 1,
          status: "done",
          notes: "Бригада уже в пути, подтвержден заезд со стороны Жанкожа батыра.",
        },
        {
          id: "task-water-2",
          title: "Подтвердить границы отключения и давление по смежным узлам",
          owner: "Диспетчер водоканала",
          etaHours: 2,
          status: "open",
          notes: "Ждем уточнение по двум соседним узлам перед локализацией.",
        },
        {
          id: "task-water-3",
          title: "Подготовить сообщение жителям по времени восстановления",
          owner: "Операторы 109",
          etaHours: 1,
          status: "open",
          notes: "Текст сообщения будет опубликован после подтверждения масштаба отключения.",
        },
      ],
    },
  };

  const dashboard: DashboardState = {
    kpis: buildDemoKpis(anomalies, incidents),
    anomalies,
    incidents,
    activityFeed: [
      {
        id: "event-1",
        occurredAt: "2026-04-03T18:10:00+05:00",
        stage: "ingest",
        source: "gee",
        action: "screening_loaded",
        title: "Городской срез обновлен",
        detail: "В сводку объединены обращения 109, телеметрия, транспортные и экологические датчики.",
        actor: "Городской playback",
        entityType: "pipeline",
        entityId: "pipeline-city",
        metadata: { anomalies: anomalies.length },
      },
      {
        id: "event-2",
        occurredAt: "2026-04-03T18:12:00+05:00",
        stage: "incident",
        source: "workflow",
        action: "anomaly_promoted",
        title: "Открыт транспортный инцидент",
        detail: "Коридор Аль-Фараби переведен из очереди в рабочий кейс с владельцем и SLA.",
        actor: "Ситуационный центр акимата",
        incidentId: "INC-4101",
        entityType: "incident",
        entityId: "INC-4101",
        metadata: { priority: "P1" },
      },
      {
        id: "event-3",
        occurredAt: "2026-04-03T18:14:00+05:00",
        stage: "verification",
        source: "workflow",
        action: "task_completed",
        title: "Светофорный сценарий включен",
        detail: "ИТС активировала приоритет общественного транспорта на ключевом коридоре.",
        actor: "Диспетчер ИТС",
        incidentId: "INC-4101",
        entityType: "task",
        entityId: "task-traffic-2",
        metadata: { status: "done" },
      },
      {
        id: "event-4",
        occurredAt: "2026-04-03T18:16:00+05:00",
        stage: "incident",
        source: "workflow",
        action: "anomaly_promoted",
        title: "Открыт коммунальный инцидент",
        detail: "Кейс по Шаныраку назначен на водоканал и поставлен в окно реакции до 1 часа.",
        actor: "Диспетчер водоканала",
        incidentId: "INC-4102",
        entityType: "incident",
        entityId: "INC-4102",
        metadata: { priority: "P1" },
      },
      {
        id: "event-5",
        occurredAt: "2026-04-03T18:18:00+05:00",
        stage: "report",
        source: "workflow",
        action: "report_generated",
        title: "Сформирована сводка по трафику",
        detail: "Отчет для вечерней смены и руководства готов к просмотру и печати.",
        actor: "Ситуационный центр акимата",
        incidentId: "INC-4101",
        entityType: "report",
        entityId: "INC-4101-report",
        metadata: { format: "html" },
      },
      {
        id: "event-6",
        occurredAt: "2026-04-03T18:21:00+05:00",
        stage: "verification",
        source: "workflow",
        action: "task_created",
        title: "Бригада водоканала выехала",
        detail: "Маршрут бригады подтвержден, ожидается локализация участка до конца часа.",
        actor: "Аварийная служба водоканала",
        incidentId: "INC-4102",
        entityType: "task",
        entityId: "task-water-1",
        metadata: { status: "done" },
      },
    ],
  };

  const pipelineStatus: PipelineStatus = {
    source: "gee",
    state: "ready",
    providerLabel: "Городской demo playback",
    projectId: "almaty-city-demo",
    lastSyncAt: "2026-04-03T18:10:00+05:00",
    latestObservationAt: "2026-04-03T18:05:00+05:00",
    anomalyCount: anomalies.length,
    statusMessage: DEMO_STATUS_MESSAGE,
    stages: [
      {
        label: "Сбор",
        value: "109, датчики, SCADA",
        detail: "Спутниковые слои сведены в единый screening snapshot.",
      },
      {
        label: "Приоритет",
        value: "Очередь обновлена",
        detail: "Сигналы ранжированы по methane uplift, thermal context и близости к объекту.",
      },
      {
        label: "Исполнение",
        value: "Workflow активен",
        detail: "Инциденты, задачи и MRV-отчёт доступны в demo playback.",
      },
    ],
    screeningSnapshot: {
      areaLabel: "Алматы, городской срез",
      evidenceSource: "Обращения 109, телеметрия, транспортные и экологические датчики",
      freshness: "fresh",
      screeningLevel: "high",
      syncedAt: "2026-04-03T18:10:00+05:00",
      lastSuccessfulSyncAt: "2026-04-03T18:10:00+05:00",
      observedWindow: "Последние 24 часа против базового городского профиля",
      currentCh4Ppb: 78.4,
      baselineCh4Ppb: 61.2,
      deltaAbsPpb: 17.2,
      deltaPct: 28.1,
      confidenceNote: "Высокая готовность / несколько контуров одновременно подтверждают напряжение",
      recommendedAction:
        "Сначала разбирать транспорт и воду, затем экологию и энергетику по уровню влияния на жителей.",
    },
  };

  const pipelineHistory: PipelineHistoryPayload = {
    runs: [
      {
        id: 204,
        createdAt: "2026-04-03T18:10:00+05:00",
        trigger: "manual",
        status: deepClone(pipelineStatus),
      },
      {
        id: 203,
        createdAt: "2026-04-03T16:00:00+05:00",
        trigger: "scheduled",
        status: {
          ...deepClone(pipelineStatus),
          anomalyCount: 5,
          lastSyncAt: "2026-04-03T16:00:00+05:00",
          latestObservationAt: "2026-04-03T15:54:00+05:00",
          screeningSnapshot: {
            ...deepClone(pipelineStatus.screeningSnapshot!),
            syncedAt: "2026-04-03T16:00:00+05:00",
            lastSuccessfulSyncAt: "2026-04-03T16:00:00+05:00",
            currentCh4Ppb: 72.6,
            baselineCh4Ppb: 59.7,
            deltaAbsPpb: 12.9,
            deltaPct: 21.6,
          },
        },
      },
      {
        id: 202,
        createdAt: "2026-04-03T13:30:00+05:00",
        trigger: "scheduled",
        status: {
          ...deepClone(pipelineStatus),
          anomalyCount: 4,
          lastSyncAt: "2026-04-03T13:30:00+05:00",
          latestObservationAt: "2026-04-03T13:20:00+05:00",
          screeningSnapshot: {
            ...deepClone(pipelineStatus.screeningSnapshot!),
            syncedAt: "2026-04-03T13:30:00+05:00",
            lastSuccessfulSyncAt: "2026-04-03T13:30:00+05:00",
            currentCh4Ppb: 67.8,
            baselineCh4Ppb: 59.8,
            deltaAbsPpb: 8.0,
            deltaPct: 13.4,
          },
        },
      },
    ],
    schedule: {
      enabled: true,
      intervalMinutes: 120,
      nextRunAt: "2026-04-03T20:00:00+05:00",
      runOnStartup: true,
    },
  };

  return { dashboard, pipelineHistory, pipelineStatus };
}

function buildDemoKpis(anomalies: Anomaly[], incidents: Record<string, Incident>): Kpi[] {
  const totalSignals = anomalies.reduce(
    (sum, anomaly) => sum + (anomaly.nightThermalHits72h ?? anomaly.thermalHits72h ?? 0),
    0,
  );
  const openTasks = Object.values(incidents).reduce(
    (sum, incident) => sum + incident.tasks.filter((task) => task.status === "open").length,
    0,
  );
  const generatedReports = Object.values(incidents).filter((incident) => incident.reportGeneratedAt).length;
  const services = new Set(anomalies.map((anomaly) => anomaly.facilityType)).size;

  return [
    {
      label: "Обращения в контуре",
      value: String(totalSignals),
      detail: "Жители, телеметрия и смежные подтверждения в текущем mock-срезе",
    },
    {
      label: "Служб на экране",
      value: String(services),
      detail: "Транспорт, коммунальные, экология, энергетика, безопасность и ЖКХ",
    },
    {
      label: "Открытые задачи",
      value: String(openTasks),
      detail: "Шаги, которые ещё держат рабочие кейсы в исполнении",
    },
    {
      label: "Готовые отчёты",
      value: String(generatedReports),
      detail: `${Object.keys(incidents).length} инцидента уже заведены в workflow`,
    },
    {
      label: "Качество данных",
      value: "94%",
      detail: "Адреса, районы, владельцы и шаги исполнения заполнены для demo-сценария",
    },
  ];
}

function getDemoDashboardState(): DashboardHydrationState {
  return {
    ...deepClone(demoStore.dashboard),
    source: "demo",
  };
}

function getDemoPipelineStatus(): PipelineStatus {
  return deepClone(demoStore.pipelineStatus);
}

function getDemoPipelineHistory(): PipelineHistoryPayload {
  return deepClone(demoStore.pipelineHistory);
}

function appendDemoActivity(event: ActivityEvent) {
  demoStore.dashboard.activityFeed = [event, ...demoStore.dashboard.activityFeed];
}

function refreshDemoKpis() {
  demoStore.dashboard.kpis = buildDemoKpis(
    demoStore.dashboard.anomalies,
    demoStore.dashboard.incidents,
  );
}

function resolveDemoOwner(facilityType: string) {
  switch (facilityType) {
    case "Транспорт":
      return "Управление городской мобильности";
    case "Коммунальные сети":
      return "Диспетчер водоканала";
    case "Энергоснабжение":
      return "Городские электросети";
    case "Экология":
      return "Экологический мониторинг";
    case "ЖКХ и санитария":
      return "Подрядчик по санитарной очистке";
    default:
      return "Ситуационный центр акимата";
  }
}

function resolveDemoVerificationWindow(anomaly: Anomaly) {
  if (anomaly.severity === "high") return "до 2 часов";
  if (anomaly.facilityType === "Экология") return "до конца смены";
  return "до 4 часов";
}

function createDemoTasks(anomaly: Anomaly): IncidentTask[] {
  switch (anomaly.facilityType) {
    case "Транспорт":
      return [
        {
          id: `${anomaly.id}-task-1`,
          title: "Подтвердить перегрузку по камерам и GPS",
          owner: "Управление городской мобильности",
          etaHours: 1,
          status: "done",
          notes: "Маршрут и точки перегруза подтверждены ситуационным центром.",
        },
        {
          id: `${anomaly.id}-task-2`,
          title: "Перенастроить светофорный сценарий",
          owner: "Диспетчер ИТС",
          etaHours: 1,
          status: "open",
          notes: "Нужно включить приоритет на следующем цикле управления.",
        },
        {
          id: `${anomaly.id}-task-3`,
          title: "Подготовить схему объезда для спецтехники",
          owner: "Служба 112",
          etaHours: 2,
          status: "open",
          notes: "Схема будет приложена к отчету и сводке смены.",
        },
      ];
    case "Коммунальные сети":
      return [
        {
          id: `${anomaly.id}-task-1`,
          title: "Назначить аварийную бригаду на участок",
          owner: "Аварийная служба водоканала",
          etaHours: 1,
          status: "done",
          notes: "Бригада уже закреплена за кейсом.",
        },
        {
          id: `${anomaly.id}-task-2`,
          title: "Подтвердить границы отключения по смежным узлам",
          owner: "Диспетчер водоканала",
          etaHours: 2,
          status: "open",
          notes: "После подтверждения можно публиковать сообщение жителям.",
        },
        {
          id: `${anomaly.id}-task-3`,
          title: "Подготовить уведомление жителям",
          owner: "Операторы 109",
          etaHours: 1,
          status: "open",
          notes: "Текст зависит от времени восстановления.",
        },
      ];
    case "Экология":
      return [
        {
          id: `${anomaly.id}-task-1`,
          title: "Проверить ближайшие посты качества воздуха",
          owner: "Экологический мониторинг",
          etaHours: 2,
          status: "done",
          notes: "Рост PM2.5 подтвержден на двух соседних постах.",
        },
        {
          id: `${anomaly.id}-task-2`,
          title: "Сверить ветер и перенос загрязнения",
          owner: "Городской аналитик данных",
          etaHours: 1,
          status: "open",
          notes: "Нужно уточнить направление переноса на вечернее окно.",
        },
        {
          id: `${anomaly.id}-task-3`,
          title: "Подготовить предупреждение для района",
          owner: "Ситуационный центр акимата",
          etaHours: 1,
          status: "open",
          notes: "Публикуется после подтверждения устойчивости пика.",
        },
      ];
    default:
      return [
        {
          id: `${anomaly.id}-task-1`,
          title: "Подтвердить отклонение по первичным источникам",
          owner: resolveDemoOwner(anomaly.facilityType),
          etaHours: 1,
          status: "done",
          notes: "Первичная валидация кейса уже завершена.",
        },
        {
          id: `${anomaly.id}-task-2`,
          title: "Назначить исполнителя и маршрут",
          owner: "Ситуационный центр акимата",
          etaHours: 2,
          status: "open",
          notes: "Нужно выбрать ближайшую доступную службу.",
        },
        {
          id: `${anomaly.id}-task-3`,
          title: "Подготовить итоговую сводку по кейсу",
          owner: "Секретариат штаба",
          etaHours: 2,
          status: "open",
          notes: "Сводка готовится после закрытия основных действий.",
        },
      ];
  }
}

function createDemoIncident(anomaly: Anomaly): Incident {
  return {
    id: `INC-${Math.abs(hashCode(anomaly.id)).toString().slice(0, 4)}`,
    anomalyId: anomaly.id,
    title: anomaly.assetName,
    status: "triage",
    owner: resolveDemoOwner(anomaly.facilityType),
    priority: anomaly.severity === "high" ? "P1" : anomaly.severity === "medium" ? "P2" : "P3",
    verificationWindow: resolveDemoVerificationWindow(anomaly),
    narrative:
      "Кейс создан прямо из очереди рисков и поставлен на исполнение с владельцем, задачами и сроком реакции.",
    tasks: createDemoTasks(anomaly),
  };
}

function promoteDemoAnomaly(anomalyId: string): Incident {
  const anomaly = demoStore.dashboard.anomalies.find((item) => item.id === anomalyId);
  if (!anomaly) {
    throw new Error(`Unknown demo anomaly: ${anomalyId}`);
  }

  if (anomaly.linkedIncidentId && demoStore.dashboard.incidents[anomaly.linkedIncidentId]) {
    return deepClone(demoStore.dashboard.incidents[anomaly.linkedIncidentId]);
  }

  const incident = createDemoIncident(anomaly);
  anomaly.linkedIncidentId = incident.id;
  demoStore.dashboard.incidents[incident.id] = incident;
  refreshDemoKpis();
  appendDemoActivity({
    id: `event-promote-${incident.id}`,
    occurredAt: new Date().toISOString(),
    stage: "incident",
    source: "workflow",
    action: "anomaly_promoted",
    title: "Риск переведён в инцидент",
    detail: `${anomaly.assetName} добавлен в рабочий цикл.`,
    actor: resolveDemoOwner(anomaly.facilityType),
    incidentId: incident.id,
    entityType: "incident",
    entityId: incident.id,
    metadata: { priority: incident.priority },
  });
  return deepClone(incident);
}

function completeDemoTask(incidentId: string, taskId: string): Incident {
  const incident = demoStore.dashboard.incidents[incidentId];
  if (!incident) {
    throw new Error(`Unknown demo incident: ${incidentId}`);
  }

  incident.tasks = incident.tasks.map((task) =>
    task.id === taskId ? { ...task, status: "done" } : task,
  );

  const remaining = incident.tasks.filter((task) => task.status !== "done").length;
  incident.status = remaining === 0 ? "mitigation" : "verification";
  appendDemoActivity({
    id: `event-task-${taskId}`,
    occurredAt: new Date().toISOString(),
    stage: "verification",
    source: "workflow",
    action: "task_completed",
    title: "Задача закрыта",
    detail: `В кейсе ${incident.title} завершён один шаг проверки.`,
    actor: incident.owner,
    incidentId,
    entityType: "task",
    entityId: taskId,
    metadata: { remaining },
  });

  return deepClone(incident);
}

function generateDemoReport(incidentId: string): Incident {
  const incident = demoStore.dashboard.incidents[incidentId];
  if (!incident) {
    throw new Error(`Unknown demo incident: ${incidentId}`);
  }

  const anomaly = demoStore.dashboard.anomalies.find((item) => item.id === incident.anomalyId);
  if (!anomaly) {
    throw new Error(`Unknown demo anomaly for incident: ${incidentId}`);
  }

  incident.reportGeneratedAt = new Date().toISOString();
  incident.status = "mitigation";
  incident.reportSections = [
    {
      title: "Что произошло",
      body: `${anomaly.assetName}: индекс нагрузки ${anomaly.signalScore}/100, район ${anomaly.verificationArea ?? "не указан"}, кейс подтвержден несколькими источниками.`,
    },
    {
      title: "Что сделали",
      body: `Закрыто ${incident.tasks.filter((task) => task.status === "done").length} из ${incident.tasks.length} задач. Основной владелец: ${incident.owner}.`,
    },
    {
      title: "Что дальше",
      body: anomaly.recommendedAction,
    },
  ];

  refreshDemoKpis();
  appendDemoActivity({
    id: `event-report-${incidentId}`,
    occurredAt: new Date().toISOString(),
    stage: "report",
    source: "workflow",
    action: "report_generated",
    title: "MRV-отчёт сформирован",
    detail: `Для ${incident.title} создан обновлённый отчёт.`,
    actor: incident.owner,
    incidentId,
    entityType: "report",
    entityId: `${incidentId}-report`,
    metadata: { generated: true },
  });

  return deepClone(incident);
}

function syncDemoPipeline(): PipelineStatus {
  const now = new Date().toISOString();
  const leadAnomaly = demoStore.dashboard.anomalies[0];

  if (leadAnomaly) {
    leadAnomaly.detectedAt = now;
    leadAnomaly.signalScore = Math.min(99, leadAnomaly.signalScore + 1);
    leadAnomaly.methaneDeltaPct = Math.round((leadAnomaly.methaneDeltaPct + 1.1) * 10) / 10;
    leadAnomaly.methaneDeltaPpb = Math.round(((leadAnomaly.methaneDeltaPpb ?? 0) + 0.8) * 10) / 10;
    leadAnomaly.currentCh4Ppb = Math.round(((leadAnomaly.currentCh4Ppb ?? 0) + 0.9) * 10) / 10;
    leadAnomaly.trend = [...leadAnomaly.trend.slice(1), { label: "21:00", anomalyIndex: leadAnomaly.signalScore }];
  }

  demoStore.pipelineStatus = {
    ...demoStore.pipelineStatus,
    state: "ready",
    anomalyCount: demoStore.dashboard.anomalies.length,
    lastSyncAt: now,
    latestObservationAt: now,
    statusMessage: DEMO_RELOAD_MESSAGE,
    screeningSnapshot: demoStore.pipelineStatus.screeningSnapshot
      ? {
          ...demoStore.pipelineStatus.screeningSnapshot,
          freshness: "fresh",
          syncedAt: now,
          lastSuccessfulSyncAt: now,
          currentCh4Ppb: leadAnomaly?.currentCh4Ppb,
          deltaAbsPpb: leadAnomaly?.methaneDeltaPpb,
          deltaPct: leadAnomaly?.methaneDeltaPct,
        }
      : undefined,
  };

  demoStore.pipelineHistory = {
    ...demoStore.pipelineHistory,
    runs: [
      {
        id: demoStore.pipelineHistory.runs[0]?.id ? demoStore.pipelineHistory.runs[0].id + 1 : 1,
        createdAt: now,
        trigger: "manual",
        status: deepClone(demoStore.pipelineStatus),
      },
      ...demoStore.pipelineHistory.runs.slice(0, 9),
    ],
    schedule: {
      ...demoStore.pipelineHistory.schedule,
      nextRunAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    },
  };

  refreshDemoKpis();
  appendDemoActivity({
    id: `event-sync-${Date.now()}`,
    occurredAt: now,
    stage: "ingest",
    source: "gee",
    action: "gee_sync_verified",
    title: "Demo sync выполнен",
    detail: "Очередь и screening snapshot обновлены в локальном playback.",
    actor: "Городской playback",
    entityType: "pipeline",
    entityId: "pipeline-city",
    metadata: { anomalies: demoStore.dashboard.anomalies.length },
  });

  return deepClone(demoStore.pipelineStatus);
}

function hashCode(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

export function createUnavailableDashboardState(): DashboardHydrationState {
  return {
    ...createEmptyDashboardState(),
    source: "unavailable",
  };
}

export function createInitialPipelineStatus(anomalyCount: number): PipelineStatus {
  if (!hasApiBaseUrl) {
    return getDemoPipelineStatus();
  }

  return {
    source: "gee",
    state: "degraded",
    providerLabel: "Google Earth Engine",
    anomalyCount,
    statusMessage: "Run a data refresh to load the first Earth Engine screening snapshot.",
    stages: [
      {
        label: "Ingest layer",
        value: "Waiting for first sync",
        detail: "The backend is ready, but no Earth Engine screening snapshot is loaded yet.",
      },
      {
        label: "Normalization layer",
        value: "Queue not built yet",
        detail: "Candidate ranking starts only after the first successful methane screening refresh.",
      },
      {
        label: "Verification layer",
        value: "Workflow ready",
        detail: "Incident, task, and MRV reporting are available as soon as a screening candidate is promoted.",
      },
    ],
  };
}

export function createInitialPipelineHistory(): PipelineHistoryPayload {
  if (!hasApiBaseUrl) {
    return getDemoPipelineHistory();
  }

  return {
    runs: [],
    schedule: {
      enabled: false,
      runOnStartup: false,
    },
  };
}

export async function loadDashboardState(): Promise<DashboardHydrationState> {
  if (!hasApiBaseUrl) {
    return getDemoDashboardState();
  }

  try {
    const payload = await requestJson<ApiDashboardPayload>("/api/v1/dashboard");
    return {
      ...normalizeDashboard(payload),
      source: "api",
    };
  } catch {
    return createUnavailableDashboardState();
  }
}

export async function loadActivityFeed(
  fallbackEvents: ActivityEvent[] = [],
): Promise<ActivityEvent[]> {
  try {
    const payload = await requestJson<ApiActivityFeedPayload>("/api/v1/activity");
    return payload.events.map(normalizeActivityEvent);
  } catch {
    return fallbackEvents;
  }
}

export async function loadIncidentActivity(
  incidentId: string,
  fallbackEvents: ActivityEvent[],
): Promise<ActivityEvent[]> {
  const filteredFallback = fallbackEvents.filter(
    (event) => event.incidentId === incidentId || event.stage === "ingest",
  );

  try {
    const payload = await requestJson<ApiActivityFeedPayload>(
      `/api/v1/incidents/${incidentId}/audit`,
    );
    return payload.events.map(normalizeActivityEvent);
  } catch {
    return filteredFallback;
  }
}

export async function promoteAnomaly(anomalyId: string): Promise<Incident> {
  if (!hasApiBaseUrl) {
    return promoteDemoAnomaly(anomalyId);
  }

  const payload = await requestJson<ApiIncident>(`/api/v1/anomalies/${anomalyId}/promote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      owner: "MRV response lead",
    }),
  });
  return normalizeIncident(payload);
}

export async function completeTask(incidentId: string, taskId: string): Promise<Incident> {
  if (!hasApiBaseUrl) {
    return completeDemoTask(incidentId, taskId);
  }

  const payload = await requestJson<ApiIncident>(
    `/api/v1/incidents/${incidentId}/tasks/${taskId}/complete`,
    {
      method: "POST",
    },
  );
  return normalizeIncident(payload);
}

export async function createTask(
  incidentId: string,
  payload: CreateTaskPayload,
): Promise<Incident> {
  if (!hasApiBaseUrl) {
    throw new Error("Demo mode does not support manual task creation yet.");
  }

  const response = await requestJson<ApiIncident>(`/api/v1/incidents/${incidentId}/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return normalizeIncident(response);
}

export async function generateReport(incidentId: string): Promise<Incident> {
  if (!hasApiBaseUrl) {
    return generateDemoReport(incidentId);
  }

  const payload = await requestJson<ApiGenerateReportResponse>(
    `/api/v1/incidents/${incidentId}/report`,
    {
      method: "POST",
    },
  );

  return {
    ...normalizeIncident(payload.incident),
    reportSections: payload.report.map(normalizeReportSection),
  };
}

export async function downloadReport(
  incidentId: string,
  format: ReportExportFormat = "html",
  locale: "en" | "ru" = "en",
): Promise<DownloadedReport> {
  const params = new URLSearchParams({ format, locale });
  const response = await fetch(
    `${apiBaseUrl}/api/v1/incidents/${incidentId}/report/export?${params.toString()}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  const disposition = response.headers.get("content-disposition");
  const match = disposition?.match(/filename="([^"]+)"/);

  return {
    blob: await response.blob(),
    fileName: match?.[1] ?? `${incidentId.toLowerCase()}-mrv-report.${format}`,
    contentType: response.headers.get("content-type") ?? "text/html;charset=utf-8",
  };
}

export function getReportViewUrl(
  incidentId: string,
  autoPrint = false,
  locale: "en" | "ru" = "en",
): string | null {
  if (!hasApiBaseUrl) {
    return null;
  }

  const params = new URLSearchParams({ locale });
  if (autoPrint) {
    params.set("auto_print", "true");
  }
  return `${apiBaseUrl}/api/v1/incidents/${incidentId}/report/view?${params.toString()}`;
}

export async function loadPipelineStatus(anomalyCount: number): Promise<PipelineStatus> {
  try {
    const payload = await requestJson<ApiPipelineStatus>("/api/v1/pipeline/status");
    return normalizePipelineStatus(payload);
  } catch {
    return hasApiBaseUrl ? createInitialPipelineStatus(anomalyCount) : getDemoPipelineStatus();
  }
}

export async function syncPipeline(source: PipelineSource = "gee"): Promise<PipelineStatus> {
  if (!hasApiBaseUrl) {
    return syncDemoPipeline();
  }

  const payload = await requestJson<ApiPipelineSyncResponse>("/api/v1/pipeline/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ source }),
  });
  return normalizePipelineStatus(payload.status);
}

export async function loadPipelineHistory(limit = 10): Promise<PipelineHistoryPayload> {
  try {
    const payload = await requestJson<ApiPipelineHistoryPayload>(`/api/v1/pipeline/history?limit=${limit}`);
    return normalizePipelineHistory(payload);
  } catch {
    return hasApiBaseUrl ? createInitialPipelineHistory() : getDemoPipelineHistory();
  }
}

function normalizeDashboard(payload: ApiDashboardPayload): DashboardState {
  const anomalies = payload.anomalies.map(normalizeAnomaly);
  const incidents = Object.fromEntries(
    payload.incidents.map((incident) => {
      const normalizedIncident = normalizeIncident(incident);
      return [normalizedIncident.id, normalizedIncident];
    }),
  );

  return {
    kpis: payload.kpis.map(normalizeKpi),
    anomalies,
    incidents,
    activityFeed: payload.activity_feed.map(normalizeActivityEvent),
  };
}

function normalizeKpi(kpi: ApiKpi): Kpi {
  return {
    label: kpi.label,
    value: kpi.value,
    detail: kpi.detail,
  };
}

function normalizeTrendPoint(point: ApiTrendPoint): TrendPoint {
  return {
    label: point.label,
    anomalyIndex: point.anomaly_index,
  };
}

function normalizeAnomaly(anomaly: ApiAnomaly): Anomaly {
  return {
    id: anomaly.id,
    assetName: anomaly.asset_name,
    region: anomaly.region,
    facilityType: anomaly.facility_type,
    severity: anomaly.severity,
    detectedAt: anomaly.detected_at,
    methaneDeltaPct: anomaly.methane_delta_pct,
    methaneDeltaPpb: anomaly.methane_delta_ppb ?? undefined,
    co2eTonnes: anomaly.co2e_tonnes ?? undefined,
    flareHours: anomaly.flare_hours ?? undefined,
    thermalHits72h: anomaly.thermal_hits_72h ?? undefined,
    nightThermalHits72h: anomaly.night_thermal_hits_72h ?? undefined,
    currentCh4Ppb: anomaly.current_ch4_ppb ?? undefined,
    baselineCh4Ppb: anomaly.baseline_ch4_ppb ?? undefined,
    evidenceSource: anomaly.evidence_source ?? undefined,
    baselineWindow: anomaly.baseline_window ?? undefined,
    signalScore: anomaly.signal_score,
    confidence: anomaly.confidence,
    coordinates: anomaly.coordinates,
    latitude: anomaly.latitude,
    longitude: anomaly.longitude,
    verificationArea: anomaly.verification_area ?? undefined,
    nearestAddress: anomaly.nearest_address ?? undefined,
    nearestLandmark: anomaly.nearest_landmark ?? undefined,
    summary: anomaly.summary,
    recommendedAction: anomaly.recommended_action,
    sitePosition: {
      x: anomaly.site_position.x,
      y: anomaly.site_position.y,
    },
    trend: anomaly.trend.map(normalizeTrendPoint),
    linkedIncidentId: anomaly.linked_incident_id ?? undefined,
  };
}

function normalizeTask(task: ApiIncidentTask): IncidentTask {
  return {
    id: task.id,
    title: task.title,
    owner: task.owner,
    etaHours: task.eta_hours,
    status: task.status,
    notes: task.notes,
  };
}

function normalizeIncident(incident: ApiIncident): Incident {
  return {
    id: incident.id,
    anomalyId: incident.anomaly_id,
    title: incident.title,
    status: incident.status,
    owner: incident.owner,
    priority: incident.priority,
    verificationWindow: incident.verification_window,
    reportGeneratedAt: incident.report_generated_at ?? undefined,
    narrative: incident.narrative,
    tasks: incident.tasks.map(normalizeTask),
    reportSections: incident.report_sections?.map(normalizeReportSection),
  };
}

function normalizeReportSection(section: ApiReportSection): ReportSection {
  return {
    title: section.title,
    body: section.body,
  };
}

function normalizeActivityEvent(event: ApiActivityEvent): ActivityEvent {
  return {
    id: event.id,
    occurredAt: event.occurred_at,
    stage: event.stage,
    source: event.source,
    action: event.action,
    title: event.title,
    detail: event.detail,
    actor: event.actor,
    incidentId: event.incident_id ?? undefined,
    entityType: event.entity_type,
    entityId: event.entity_id ?? undefined,
    metadata: event.metadata ?? {},
  };
}

function normalizePipelineStatus(status: ApiPipelineStatus): PipelineStatus {
  return {
    source: status.source,
    state: status.state,
    providerLabel: status.provider_label,
    projectId: status.project_id ?? undefined,
    lastSyncAt: status.last_sync_at ?? undefined,
    latestObservationAt: status.latest_observation_at ?? undefined,
    anomalyCount: status.anomaly_count,
    statusMessage: status.status_message,
    stages: status.stages.map((stage) => ({
      label: stage.label,
      value: stage.value,
      detail: stage.detail,
    })),
    screeningSnapshot: status.screening_snapshot
      ? normalizeScreeningEvidenceSnapshot(status.screening_snapshot)
      : undefined,
  };
}

function normalizePipelineHistory(payload: ApiPipelineHistoryPayload): PipelineHistoryPayload {
  return {
    runs: payload.runs.map((entry) => ({
      id: entry.id,
      createdAt: entry.created_at,
      trigger: entry.trigger,
      status: normalizePipelineStatus(entry.status),
    })),
    schedule: {
      enabled: payload.schedule.enabled,
      intervalMinutes: payload.schedule.interval_minutes ?? undefined,
      nextRunAt: payload.schedule.next_run_at ?? undefined,
      runOnStartup: payload.schedule.run_on_startup,
    },
  };
}

function normalizeScreeningEvidenceSnapshot(
  snapshot: ApiScreeningEvidenceSnapshot,
): ScreeningEvidenceSnapshot {
  return {
    areaLabel: snapshot.area_label,
    evidenceSource: snapshot.evidence_source,
    freshness: snapshot.freshness,
    screeningLevel: snapshot.screening_level,
    syncedAt: snapshot.synced_at ?? undefined,
    lastSuccessfulSyncAt: snapshot.last_successful_sync_at ?? undefined,
    observedWindow: snapshot.observed_window ?? undefined,
    currentCh4Ppb: snapshot.current_ch4_ppb ?? undefined,
    baselineCh4Ppb: snapshot.baseline_ch4_ppb ?? undefined,
    deltaAbsPpb: snapshot.delta_abs_ppb ?? undefined,
    deltaPct: snapshot.delta_pct ?? undefined,
    confidenceNote: snapshot.confidence_note,
    caveat: snapshot.caveat ?? undefined,
    recommendedAction: snapshot.recommended_action,
  };
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}
