"use client";

import { type ReactNode, startTransition, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  completeTask as completeTaskRequest,
  createInitialPipelineHistory,
  createInitialPipelineStatus,
  createUnavailableDashboardState,
  type DashboardHydrationState,
  downloadReport,
  generateReport as generateReportRequest,
  hasApiBaseUrl,
  getReportViewUrl,
  loadDashboardState,
  loadPipelineHistory,
  loadPipelineStatus,
  type PipelineHistoryPayload,
  promoteAnomaly as promoteAnomalyRequest,
  type ReportExportFormat,
  syncPipeline,
  type PipelineStatus,
  type ScreeningEvidenceSnapshot,
} from "../lib/api";
import { AnomalyMap } from "../components/anomaly-map";
import { PipelineHistoryPanel } from "../components/pipeline-history-panel";
import {
  type Anomaly,
  type Incident,
  type IncidentTask,
  type ReportSection,
} from "../lib/dashboard-types";
import {
  copy,
  formatHours,
  formatTaskProgress,
  formatTimestamp,
  incidentStatusLabel,
  type Locale,
  type NavTarget,
  severityLabel,
  severityTone,
  type StepId,
  stepOrder,
  translateAnomalySummary,
  translateAdministrativeLabel,
  translateAssetName,
  translateConfidence,
  translateFacility,
  formatVerificationAreaLabel,
  translateIncidentNarrative,
  translateOwner,
  translatePipelineStatusMessage,
  translateRecommendedAction,
  translateRegion,
  translateScreeningCaveat,
  translateScreeningConfidenceNote,
  translateScreeningEvidenceSource,
  translateScreeningObservedWindow,
  translateScreeningRecommendation,
  translateTaskTitle,
  translateWindow,
  type ThemeMode,
} from "../lib/site-content";

type MapCardTone = "live" | "fallback";
type MapPresetId =
  | "all-almaty"
  | "bostandyk"
  | "alatau"
  | "turksib"
  | "auezov"
  | "nauryzbay"
  | "medeu";

type MapPreset = {
  id: MapPresetId;
  region: string | null;
  label: {
    en: string;
    ru: string;
  };
};

const MAP_PRESETS: MapPreset[] = [
  {
    id: "all-almaty",
    region: null,
    label: { en: "All Almaty", ru: "Весь Алматы" },
  },
  {
    id: "bostandyk",
    region: "Бостандыкский район",
    label: { en: "Bostandyk", ru: "Бостандык" },
  },
  {
    id: "alatau",
    region: "Алатауский район",
    label: { en: "Alatau", ru: "Алатау" },
  },
  {
    id: "turksib",
    region: "Турксибский район",
    label: { en: "Turksib", ru: "Турксиб" },
  },
  {
    id: "auezov",
    region: "Ауэзовский район",
    label: { en: "Auezov", ru: "Ауэзов" },
  },
  {
    id: "nauryzbay",
    region: "Наурызбайский район",
    label: { en: "Nauryzbay", ru: "Наурызбай" },
  },
  {
    id: "medeu",
    region: "Медеуский район",
    label: { en: "Medeu", ru: "Медеу" },
  },
] as const;

const mapSyncLabelCopy = {
  en: {
    verified: "Last verified",
    attempted: "Last attempt",
  },
  ru: {
    verified: "Последнее подтверждение",
    attempted: "Последняя попытка",
  },
} as const;

const mapCardCopy = {
  en: {
    contextLive: "Live city view",
    contextFallback: "Fallback snapshot",
    noteLive:
      "The map shows where the city teams should act first across transport, коммунальные and ecology cases.",
    noteDegraded:
      "The last saved city snapshot is still visible while the current refresh is limited.",
    noteUnavailable:
      "Live refresh is unavailable. The page keeps the local demo snapshot for presentation.",
  },
  ru: {
    contextLive: "Живой городской срез",
    contextFallback: "Резервный срез",
    noteLive:
      "Карта показывает, где по городу нужны первые действия: транспорт, коммунальные, экология и безопасность.",
    noteDegraded:
      "На экране остаётся последний сохранённый городской срез, пока текущее обновление ограничено.",
    noteUnavailable:
      "Онлайн-обновление временно недоступно. Для показа используется локальный demo-сценарий.",
  },
} as const;

const screeningCopy = {
  en: {
    title: "Operational city snapshot",
    subtitle: "Use the latest combined city data to understand where services should react first.",
    current: "Current load index",
    baseline: "Baseline index",
    delta: "Delta vs baseline",
    level: "Attention level",
    synced: "Last sync",
    verified: "Last verified",
    attempted: "Last attempt",
    observed: "Data window",
    source: "Sources",
    confidence: "Confidence",
    caveat: "Caveat",
    recommendation: "Action plan",
    sync: "Sync latest evidence",
    syncing: "Syncing...",
    noApi: "Data refresh needs the FastAPI backend to be available.",
    syncingGee: "Refreshing city snapshot...",
    syncFailedGee:
      "Data refresh failed. If a verified screening snapshot already exists, the page keeps the last successful version.",
    notAvailable: "Not available",
    noCaveat: "No additional caveat.",
    freshness: {
      fresh: "Fresh evidence",
      stale: "Stale evidence",
      unavailable: "Unavailable",
    },
    levelLabel: {
      low: "Low",
      medium: "Medium",
      high: "High",
    },
    help: {
      current:
        "This is the latest combined city load index for the selected window. It shows how strongly the area stands out from the normal operating profile.",
      baseline:
        "This is the normal city profile for the same district and time window. It helps show what is usual before deciding on escalation.",
      delta:
        "This shows how far the current city load is above the normal profile. A larger positive gap means the area needs faster attention.",
      level:
        "This is the simplified urgency label used by operators. It compresses several inputs into a quick low, medium, or high attention level.",
      source:
        "This lists the city channels that were combined to form the current picture on the page.",
      synced:
        "This is the last time the backend refreshed the city snapshot and saved the newest combined result.",
      observed:
        "This describes the time window that was checked and which normal baseline it was compared against.",
    },
  },
  ru: {
    title: "Оперативный срез города",
    subtitle: "Здесь собраны последние данные по нагрузке, обращениям и состоянию городских служб.",
    current: "Текущий индекс нагрузки",
    baseline: "Базовый индекс",
    delta: "Отклонение от базового уровня",
    level: "Уровень внимания",
    synced: "Последняя синхронизация",
    verified: "Последнее подтверждение",
    attempted: "Последняя попытка",
    observed: "Окно данных",
    source: "Источники",
    confidence: "Надёжность",
    caveat: "Что важно учесть",
    recommendation: "План действий",
    sync: "Обновить данные",
    syncing: "Обновляем...",
    noApi: "Для обновления нужен доступный сервер FastAPI.",
    syncingGee: "Обновляем городской срез...",
    syncFailedGee:
      "Не удалось обновить спутниковые данные. Если подтверждённый снимок уже был, на странице останется последняя успешная версия.",
    notAvailable: "Недоступно",
    noCaveat: "Дополнительных ограничений нет.",
    freshness: {
      fresh: "Данные актуальны",
      stale: "Последние доступные данные",
      unavailable: "Недоступно",
    },
    levelLabel: {
      low: "Низкий",
      medium: "Средний",
      high: "Высокий",
    },
    help: {
      current:
        "Это текущий сводный индекс нагрузки по району. Он показывает, насколько зона выбивается из обычного городского режима.",
      baseline:
        "Это нормальный городской профиль для такого же времени и района. С ним удобно сравнивать текущее состояние перед эскалацией.",
      delta:
        "Это разница между текущей нагрузкой и обычным профилем. Чем выше отклонение, тем быстрее нужен ответ служб.",
      level:
        "Это короткая оценка срочности для дежурной смены. Она собирает несколько сигналов в один понятный уровень внимания.",
      source:
        "Здесь видно, из каких городских каналов собрана текущая картина на экране.",
      synced:
        "Это время последнего обновления, когда backend пересобрал городской срез и сохранил новый результат.",
      observed:
        "Здесь видно, какое окно данных использовалось и с каким базовым периодом его сравнили.",
    },
  },
} as const;

const liveSignalCopy = {
  en: {
    methaneUplift: "Load delta",
    thermalContext: "Related requests (72h)",
    evidenceSource: "Evidence source",
    baselineWindow: "Baseline window",
    verificationArea: "Verification area",
    nearestAddress: "Nearest address",
    nearestLandmark: "Nearest landmark",
    noThermalContext: "No recent night-time detections",
    noImpact: "Not estimated in current screening",
    notAvailable: "Not available",
    notMappedNearby: "No mapped result nearby",
    detections: "night detections",
    hints: {
      methaneUplift:
        "This compares the current city load for the selected point with the normal profile for the same zone.",
      thermalContext:
        "This counts linked requests, confirmations, and service pings collected around the selected case.",
      evidenceSource:
        "This shows which city channels produced the current case on the page.",
      baselineWindow:
        "This shows the historical comparison window used to decide whether the current city load stands out.",
      verificationArea:
        "This narrows the case to the mapped district or local zone where teams should react.",
      nearestAddress:
        "This is the closest mapped address near the case center. It is a routing hint for teams, not a legal proof point.",
      nearestLandmark:
        "This is the closest mapped landmark near the case center. It helps teams navigate faster on the ground.",
    },
    statusNote: "The city demo playback is active on the page.",
    statusHelp:
      "The interface is connected to the local backend and the visible queue is generated from the city demo playback.",
  },
  ru: {
    methaneUplift: "Отклонение от нормы",
    thermalContext: "Связанные обращения (72 часа)",
    evidenceSource: "Источники",
    baselineWindow: "Окно сравнения",
    verificationArea: "Район проверки",
    nearestAddress: "Ближайший адрес",
    nearestLandmark: "Ближайший ориентир",
    noThermalContext: "Свежих обращений нет",
    noImpact: "Пока не оценено",
    notAvailable: "Недоступно",
    notMappedNearby: "Рядом нет подходящего адреса или объекта",
    detections: "обращений",
    hints: {
      methaneUplift:
        "Это сравнение текущей городской нагрузки с обычным профилем для выбранной точки.",
      thermalContext:
        "Это число связанных обращений, подтверждений и сервисных сигналов вокруг выбранного кейса.",
      evidenceSource:
        "Здесь видно, из каких городских контуров собран текущий кейс на странице.",
      baselineWindow:
        "Здесь видно, какое историческое окно сравнения использовалось для оценки текущего отклонения.",
      verificationArea:
        "Это район или локальная зона, куда нужно направлять команды и где проще контролировать SLA.",
      nearestAddress:
        "Это ближайший адрес рядом с центром кейса. Это навигационная подсказка для выездной команды.",
      nearestLandmark:
        "Это ближайший ориентир рядом с центром кейса. Его удобно использовать как точку привязки на выезде.",
    },
    statusNote: "На странице активен городской demo-сценарий.",
    statusHelp:
      "Интерфейс подключён к локальному backend, а текущая очередь построена из городского demo playback.",
  },
} as const;

const coordinateActionCopy = {
  en: {
    title: "Open location in",
    googleMaps: "Open in Google Maps",
    twoGis: "Open in 2GIS",
  },
  ru: {
    title: "Открыть местоположение в",
    googleMaps: "Открыть в Google Maps",
    twoGis: "Открыть в 2GIS",
  },
} as const;

const emptyQueueCopy = {
  en: {
    eyebrow: "Review queue",
    title: "No new critical city cases were added after the latest refresh",
    body:
      "This is a valid empty result, not a broken screen. Refresh the screening window or wait for the next scheduled run before opening a case.",
    latestRun: "Latest refresh",
    nextRun: "Next scheduled sync",
    serverState: "Backend state",
  },
  ru: {
    eyebrow: "Очередь",
    title: "Новых критичных кейсов нет",
    body: "Обновите данные или дождитесь следующего окна синхронизации.",
    latestRun: "Обновлено",
    nextRun: "Следующий запуск",
    serverState: "Статус",
  },
} as const;

const pipelineStateCopy = {
  en: {
    ready: "Ready",
    syncing: "Syncing",
    degraded: "Degraded",
    error: "Error",
  },
  ru: {
    ready: "Готово",
    syncing: "Идёт обновление",
    degraded: "С ограничениями",
    error: "Ошибка",
  },
} as const;

const juryUiCopy = {
  en: {
    navSignal: "Zone",
    queueEyebrow: "Suspected zones",
    queueTitle: "Choose a zone for review",
    queueTop: "Top review zone",
    scoreLabel: "Zone priority",
    signalStepTitle: "Selected suspected zone",
  },
  ru: {
    navSignal: "Риски",
    queueEyebrow: "Очередь",
    queueTitle: "Кейсы по городу",
    queueTop: "Главный приоритет",
    scoreLabel: "Индекс приоритета",
    signalStepTitle: "Оперативная сводка",
  },
} as const;

export default function Page() {
  const initialDashboard = createUnavailableDashboardState();
  const faqRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const [theme, setTheme] = useState<ThemeMode>("day");
  const locale: Locale = "ru";
  const [activeStep, setActiveStep] = useState<StepId>("signal");
  const [dashboardSource, setDashboardSource] =
    useState<DashboardHydrationState["source"]>(initialDashboard.source);
  const [kpiCards, setKpiCards] = useState(initialDashboard.kpis);
  const [anomalies, setAnomalies] = useState(initialDashboard.anomalies);
  const [incidents, setIncidents] = useState(initialDashboard.incidents);
  const [activityFeed, setActivityFeed] = useState(initialDashboard.activityFeed);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>(
    createInitialPipelineStatus(initialDashboard.anomalies.length),
  );
  const [pipelineHistory, setPipelineHistory] = useState<PipelineHistoryPayload>(
    createInitialPipelineHistory(),
  );
  const [selectedAnomalyId, setSelectedAnomalyId] = useState(initialDashboard.anomalies[0]?.id ?? "");
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<null | string>(null);
  const [mapReactionToken, setMapReactionToken] = useState(0);
  const [mapReactionActive, setMapReactionActive] = useState(false);
  const [mapReactionDotId, setMapReactionDotId] = useState("");
  const [activeMapPresetId, setActiveMapPresetId] = useState<MapPresetId>("all-almaty");

  const t = copy[locale];
  const screeningText = screeningCopy[locale];
  const mapCardText = mapCardCopy[locale];
  const liveSignalText = liveSignalCopy[locale];
  const coordinateActionText = coordinateActionCopy[locale];
  const emptyQueueText = emptyQueueCopy[locale];
  const juryText = juryUiCopy[locale];

  function applyDashboardHydration(
    state: DashboardHydrationState,
    nextPipelineStatus?: PipelineStatus,
    nextPipelineHistory?: PipelineHistoryPayload,
  ) {
    startTransition(() => {
      setDashboardSource(state.source);
      setKpiCards(state.kpis);
      setAnomalies(state.anomalies);
      setIncidents(state.incidents);
      setActivityFeed(state.activityFeed);
      if (nextPipelineStatus) {
        setPipelineStatus(nextPipelineStatus);
      }
      if (nextPipelineHistory) {
        setPipelineHistory(nextPipelineHistory);
      }
      setSelectedAnomalyId((current) => {
        const exists = state.anomalies.some((item) => item.id === current);
        return exists ? current : state.anomalies[0]?.id ?? "";
      });
      setLoadingDashboard(false);
    });
  }

  async function loadWorkspaceSnapshot(forceSyncWhenEmpty = false) {
    let [state, nextPipelineStatus, nextPipelineHistory] = await Promise.all([
      loadDashboardState(),
      loadPipelineStatus(anomalies.length),
      loadPipelineHistory(12),
    ]);

    if (
      hasApiBaseUrl &&
      forceSyncWhenEmpty &&
      state.source === "api" &&
      state.anomalies.length === 0 &&
      nextPipelineStatus.state !== "syncing"
    ) {
      try {
        nextPipelineStatus = await syncPipeline("gee");
        [state, nextPipelineHistory] = await Promise.all([
          loadDashboardState(),
          loadPipelineHistory(12),
        ]);
      } catch {
        [nextPipelineStatus, nextPipelineHistory] = await Promise.all([
          loadPipelineStatus(state.anomalies.length),
          loadPipelineHistory(12),
        ]);
      }
    }

    return { state, nextPipelineStatus, nextPipelineHistory };
  }

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("smartcity-dashboard-theme");
    if (storedTheme === "day" || storedTheme === "night") setTheme(storedTheme);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("smartcity-dashboard-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (!mapReactionActive) return;

    const timer = window.setTimeout(() => {
      setMapReactionActive(false);
      setMapReactionDotId("");
    }, 2400);

    return () => window.clearTimeout(timer);
  }, [mapReactionActive, mapReactionToken]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateDashboard() {
      const dashboardPromise = loadDashboardState();
      const pipelineStatusPromise = loadPipelineStatus(anomalies.length);
      const pipelineHistoryPromise = loadPipelineHistory(12);

      let state = await dashboardPromise;
      if (cancelled) return;
      applyDashboardHydration(state);

      let nextPipelineStatus = await pipelineStatusPromise;
      let nextPipelineHistory = await pipelineHistoryPromise;
      if (cancelled) return;
      applyDashboardHydration(state, nextPipelineStatus, nextPipelineHistory);

      if (
        hasApiBaseUrl &&
        state.source === "api" &&
        state.anomalies.length === 0 &&
        nextPipelineStatus.state !== "syncing"
      ) {
        try {
          nextPipelineStatus = await syncPipeline("gee");
          [state, nextPipelineHistory] = await Promise.all([
            loadDashboardState(),
            loadPipelineHistory(12),
          ]);
          if (cancelled) return;
          applyDashboardHydration(state, nextPipelineStatus, nextPipelineHistory);
        } catch {
          if (cancelled) return;
          applyDashboardHydration(state, nextPipelineStatus, nextPipelineHistory);
        }
      }
    }

    void hydrateDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasApiBaseUrl) {
      return;
    }

    const timer = window.setInterval(() => {
      if (document.hidden || busyAction) {
        return;
      }

      void loadWorkspaceSnapshot(false).then(({ state, nextPipelineStatus, nextPipelineHistory }) => {
        applyDashboardHydration(state, nextPipelineStatus, nextPipelineHistory);
      });
    }, 120000);

    return () => window.clearInterval(timer);
  }, [busyAction, anomalies.length]);

  const availableMapPresets = MAP_PRESETS.filter(
    (preset) => !preset.region || anomalies.some((anomaly) => anomaly.verificationArea === preset.region),
  );
  const activeMapPreset =
    availableMapPresets.find((preset) => preset.id === activeMapPresetId) ?? availableMapPresets[0] ?? MAP_PRESETS[0];
  const visibleAnomalies =
    activeMapPreset.region === null
      ? anomalies
      : anomalies.filter((anomaly) => anomaly.verificationArea === activeMapPreset.region);
  const scopedAnomalies = visibleAnomalies.length > 0 ? visibleAnomalies : anomalies;
  const strongestAnomaly =
    scopedAnomalies.length > 0
      ? scopedAnomalies.reduce((best, current) =>
          current.signalScore > best.signalScore ? current : best,
        )
      : null;

  const selectedAnomaly =
    scopedAnomalies.find((item) => item.id === selectedAnomalyId) ?? strongestAnomaly ?? null;

  const activeIncident =
    selectedAnomaly?.linkedIncidentId && incidents[selectedAnomaly.linkedIncidentId]
      ? incidents[selectedAnomaly.linkedIncidentId]
      : undefined;
  const liveSignalSelected = Boolean(
    selectedAnomaly?.evidenceSource && selectedAnomaly?.methaneDeltaPpb !== undefined,
  );
  const translatedVerificationArea =
    liveSignalSelected && selectedAnomaly?.verificationArea
      ? formatVerificationAreaLabel(selectedAnomaly.verificationArea, selectedAnomaly.region, locale)
      : liveSignalText.notMappedNearby;
  const translatedNearestAddress =
    liveSignalSelected && selectedAnomaly?.nearestAddress
      ? translateAdministrativeLabel(selectedAnomaly.nearestAddress, locale)
      : liveSignalText.notMappedNearby;
  const translatedNearestLandmark =
    liveSignalSelected && selectedAnomaly?.nearestLandmark
      ? translateAdministrativeLabel(selectedAnomaly.nearestLandmark, locale)
      : liveSignalText.notMappedNearby;
  const translatedAssetName = selectedAnomaly ? translateAssetName(selectedAnomaly.assetName, locale) : "";
  const translatedRegion = selectedAnomaly ? translateRegion(selectedAnomaly.region, locale) : "";
  const normalizedAssetName = normalizeInfoValue(translatedAssetName);
  const normalizedRegion = normalizeInfoValue(translatedRegion);
  const normalizedVerificationArea = normalizeInfoValue(translatedVerificationArea);
  const normalizedNearestLandmark = normalizeInfoValue(translatedNearestLandmark);
  const showVerificationArea =
    liveSignalSelected &&
    normalizedVerificationArea.length > 0 &&
    normalizedVerificationArea !== normalizeInfoValue(liveSignalText.notMappedNearby) &&
    normalizedVerificationArea !== normalizedAssetName &&
    normalizedVerificationArea !== normalizedRegion;
  const showNearestLandmark =
    liveSignalSelected &&
    normalizedNearestLandmark.length > 0 &&
    normalizedNearestLandmark !== normalizeInfoValue(liveSignalText.notMappedNearby) &&
    normalizedNearestLandmark !== normalizedAssetName &&
    normalizedNearestLandmark !== normalizedVerificationArea &&
    normalizedNearestLandmark !== normalizedRegion;
  const selectedAnomalyCoordinateLinks = selectedAnomaly ? buildCoordinateLinks(selectedAnomaly) : null;

  const completedTasks = activeIncident
    ? activeIncident.tasks.filter((task) => task.status === "done").length
    : 0;

  const progressPercent = activeIncident
    ? Math.round((completedTasks / Math.max(activeIncident.tasks.length, 1)) * 100)
    : 0;

  const localizedReportSections =
    selectedAnomaly && activeIncident
      ? buildReportSectionsForUi(selectedAnomaly, activeIncident, completedTasks, locale)
      : [];
  const faqItems: Array<{ id: string; question: string; answer: string[] }> = [
    {
      id: "map",
      question: "Что показывает карта?",
      answer: [
        "Карта показывает районы, где сейчас нагрузка выше нормы и уже влияет на жителей или службы.",
        "Точки на карте — это не просто визуализация, а вход в рабочий кейс: от района можно сразу перейти к инциденту, задачам и отчёту.",
      ],
    },
    {
      id: "score",
      question: "Как считается индекс приоритета?",
      answer: [
        "Индекс приоритета собирается из отклонения от нормы, количества связанных обращений и влияния на сроки реакции служб.",
        "Чем выше значение, тем раньше кейс должен попасть в работу смены.",
      ],
    },
    {
      id: "incident",
      question: "Зачем нужен контур инцидента?",
      answer: [
        "Инцидент делает кейс управляемым: у него появляется владелец, SLA, задачи и журнал действий.",
        "Это то, что отличает полезный городской инструмент от просто красивой карты.",
      ],
    },
    {
      id: "report",
      question: "Что попадает в отчёт?",
      answer: [
        "Отчёт собирает суть проблемы, район, владельца, прогресс задач и следующий шаг.",
        "Его можно показывать руководству смены, штабу и профильным управлениям без дополнительной ручной сборки.",
      ],
    },
    {
      id: "demo",
      question: "Это реальные данные?",
      answer: [
        "Нет. Сейчас на странице показан demo-сценарий с mock-данными, чтобы было видно конечный вид и рабочую логику сайта.",
        "При подключении API эти же блоки будут наполняться живыми данными из городских контуров.",
      ],
    },
  ];
  const screeningSnapshot = pipelineStatus.screeningSnapshot;
  const mapCardTone: MapCardTone =
    pipelineStatus.state === "ready" && screeningSnapshot?.freshness === "fresh"
      ? "live"
      : "fallback";
  const mapContextLabel =
    mapCardTone === "live"
      ? mapCardText.contextLive
      : mapCardText.contextFallback;
  const mapNote =
    mapCardTone === "live"
      ? mapCardText.noteLive
      : pipelineStatus.state === "error"
        ? mapCardText.noteUnavailable
        : mapCardText.noteDegraded;
  const mapSyncLabel =
    mapCardTone === "fallback"
      ? screeningSnapshot?.lastSuccessfulSyncAt
        ? mapSyncLabelCopy[locale].verified
        : mapSyncLabelCopy[locale].attempted
      : screeningText.synced;
  const mapSyncValue =
    mapCardTone === "fallback"
      ? screeningSnapshot?.lastSuccessfulSyncAt ??
        screeningSnapshot?.syncedAt ??
        screeningText.notAvailable
      : screeningSnapshot?.syncedAt ?? screeningText.notAvailable;
  const isDemoMode = dashboardSource === "demo";
  const isInteractiveMode = dashboardSource === "api" || dashboardSource === "demo";
  const liveQueueCount =
    loadingDashboard || dashboardSource === "unavailable" ? pipelineStatus.anomalyCount : anomalies.length;
  const openIncidentCount = Object.keys(incidents).length;
  const totalCitizenRequests = anomalies.reduce(
    (sum, anomaly) => sum + (anomaly.nightThermalHits72h ?? anomaly.thermalHits72h ?? 0),
    0,
  );
  const assignedCaseCount = anomalies.filter((anomaly) => anomaly.linkedIncidentId).length;
  const slaRiskCount = anomalies.filter((anomaly) => anomaly.severity !== "watch").length;
  const latestLiveSyncValue = mapSyncValue === screeningText.notAvailable ? screeningText.notAvailable : formatTimestamp(mapSyncValue, locale);
  const nextScheduledSyncValue = pipelineHistory.schedule.nextRunAt
    ? formatTimestamp(pipelineHistory.schedule.nextRunAt, locale)
    : screeningText.notAvailable;
  const pipelineStateLabel = pipelineStateCopy[locale][pipelineStatus.state];
  const statusHelpText =
    loadingDashboard
      ? locale === "ru"
        ? "Идёт загрузка данных."
        : "Loading data."
      : isDemoMode
        ? "Показан локальный demo-сценарий с mock-данными и рабочим playback."
      : dashboardSource === "api" && pipelineStatus.source === "gee" && pipelineStatus.state === "ready"
      ? "Данные актуальны."
      : locale === "ru"
        ? "Показана последняя версия."
        : "Showing the latest available version.";
  const statusChipLabel =
    loadingDashboard
      ? "Загрузка"
      : isDemoMode
        ? "Демо"
      : dashboardSource === "api" && pipelineStatus.state === "ready"
        ? "Онлайн"
      : dashboardSource === "api"
          ? pipelineStateLabel
          : "Оффлайн";
  const summaryCards = [
    {
      id: "queue",
      hint: "Сколько рисков сейчас в короткой очереди на разбор.",
      label: "В очереди",
      tone: "attention",
      value: String(liveQueueCount),
    },
    {
      id: "assigned",
      hint: "Сколько кейсов уже закреплены за конкретной службой или рабочим инцидентом.",
      label: "Назначено",
      tone: "default",
      value: `${assignedCaseCount} / ${anomalies.length}`,
    },
    {
      id: "requests",
      hint: "Суммарный поток связанных обращений и подтверждений по текущему mock-срезу.",
      label: "Обращения",
      tone: "critical",
      value: String(totalCitizenRequests),
    },
    {
      id: "sla",
      hint: "Сколько районов сейчас требуют реакции без переноса на следующую смену.",
      label: "SLA под риском",
      tone: "default",
      value: String(slaRiskCount),
    },
  ] as const;
  const spotlightTitle = selectedAnomaly ? translateAssetName(selectedAnomaly.assetName, locale) : "Обзор города";
  const spotlightRegion = selectedAnomaly?.verificationArea ?? "Алматы";
  const spotlightTime = selectedAnomaly ? formatTimestamp(selectedAnomaly.detectedAt, locale) : latestLiveSyncValue;
  const workflowStages = [
    {
      id: "signal",
      label: "Очередь",
      state: "done" as const,
    },
    {
      id: "incident",
      label: "Инцидент",
      state: activeIncident ? (activeStep === "incident" ? "active" : "done") : "idle",
    },
    {
      id: "verification",
      label: "Задачи",
      state: activeIncident
        ? activeStep === "verification"
          ? "active"
          : completedTasks > 0
            ? "done"
            : "idle"
        : "idle",
    },
    {
      id: "report",
      label: "Отчёт",
      state: activeIncident?.reportGeneratedAt
        ? activeStep === "report"
          ? "active"
          : "done"
        : "idle",
    },
  ];
  const toplineKpis = kpiCards.length > 0
    ? kpiCards
    : buildSmartCityKpis(anomalies, incidents, pipelineStatus);
  const forecastPoints = selectedAnomaly ? buildForecastSeries(selectedAnomaly.trend) : [];
  const forecastDirection =
    forecastPoints.length > 1
      ? forecastPoints[forecastPoints.length - 1].value - forecastPoints[Math.max(forecastPoints.length - 4, 0)].value
      : 0;
  const rootCauseItems = selectedAnomaly ? buildRootCauseItems(selectedAnomaly, screeningSnapshot) : [];
  const qualityChecks = selectedAnomaly
    ? buildQualityChecks(selectedAnomaly, screeningSnapshot, activeIncident, pipelineStatus)
    : [];
  const mapLayerChips = [
    { label: "Трафик", active: anomalies.some((anomaly) => anomaly.facilityType === "Транспорт") },
    { label: "Коммунальные", active: anomalies.some((anomaly) => anomaly.facilityType === "Коммунальные сети") },
    { label: "Экология", active: anomalies.some((anomaly) => anomaly.facilityType === "Экология") },
    { label: "Инциденты", active: openIncidentCount > 0 },
  ];
  const mapLegendItems = [
    { tone: "high", label: "Критично" },
    { tone: "medium", label: "Нужно действие" },
    { tone: "watch", label: "Под наблюдением" },
  ] as const;
  const serviceOverview = buildServiceOverview(anomalies, incidents);
  const districtRows = buildDistrictRows(anomalies, incidents);
  const channelRows = buildChannelRows(anomalies);
  const executionRows = buildExecutionRows(anomalies, incidents);
  const recentActivity = activityFeed.slice(0, 6);
  const incidentActivity = activeIncident
    ? activityFeed.filter((event) => event.incidentId === activeIncident.id).slice(0, 5)
    : [];
  const responseTeams = buildResponseTeams(selectedAnomaly, activeIncident);
  const reportRecipients = buildReportRecipients(selectedAnomaly);
  const nextWatchItems = buildNextWatchItems(anomalies);
  const reportHighlights = buildReportHighlights(selectedAnomaly, activeIncident, completedTasks);

  useEffect(() => {
    if (scopedAnomalies.length === 0) return;
    if (scopedAnomalies.some((anomaly) => anomaly.id === selectedAnomalyId)) return;
    setSelectedAnomalyId(strongestAnomaly?.id ?? scopedAnomalies[0]?.id ?? "");
  }, [scopedAnomalies, selectedAnomalyId, strongestAnomaly]);

  const runPipelineSync = async () => {
    if (!hasApiBaseUrl && !isDemoMode) {
      setRequestError(screeningText.noApi);
      return;
    }

    const previousPipelineStatus = pipelineStatus;
    setBusyAction("sync-gee");
    setRequestError(null);
    setPipelineStatus((current) => ({
      ...current,
      state: "syncing",
      statusMessage: screeningText.syncingGee,
    }));

    try {
      const nextStatus = await syncPipeline("gee");
      const [refreshedState, refreshedHistory] = await Promise.all([
        loadDashboardState(),
        loadPipelineHistory(12),
      ]);
      if (refreshedState.source === "api" || refreshedState.source === "demo") {
        applyDashboardHydration(refreshedState, nextStatus, refreshedHistory);
      } else {
        startTransition(() => {
          setDashboardSource(refreshedState.source);
          setPipelineStatus(nextStatus);
          setPipelineHistory(refreshedHistory);
        });
      }
      if (nextStatus.state !== "ready") {
        setMapReactionActive(false);
        setMapReactionDotId("");
        setRequestError(translatePipelineStatusMessage(nextStatus.statusMessage, locale));
      } else if (nextStatus.screeningSnapshot?.freshness === "fresh") {
        setMapReactionDotId(selectedAnomaly?.id ?? strongestAnomaly?.id ?? "");
        setMapReactionToken((current) => current + 1);
        setMapReactionActive(true);
      } else {
        setMapReactionActive(false);
        setMapReactionDotId("");
      }
    } catch {
      setMapReactionActive(false);
      setMapReactionDotId("");
      setRequestError(screeningText.syncFailedGee);
      setPipelineStatus(previousPipelineStatus);
    } finally {
      setBusyAction(null);
    }
  };

  const promoteToIncident = async () => {
    if (!selectedAnomaly) return;
    if (selectedAnomaly.linkedIncidentId) {
      setActiveStep("incident");
      return;
    }

    setBusyAction("promote");
    setRequestError(null);

    if (!isInteractiveMode) {
      setBusyAction(null);
      setRequestError(
        locale === "ru"
          ? "Сначала нужен доступный backend и обновление данных. Без этого инцидент создать нельзя."
          : "A working backend and data refresh are required before an incident can be created.",
      );
      return;
    }

    try {
      await promoteAnomalyRequest(selectedAnomaly.id);
      const refreshedState = await loadDashboardState();
      applyDashboardHydration(refreshedState);
      setActiveStep("incident");
    } catch {
      setRequestError(
        locale === "ru"
          ? "Не удалось создать инцидент через backend. Проверьте состояние сервера и повторите попытку."
          : "Incident creation failed in the backend. Check the server state and try again.",
      );
    } finally {
      setBusyAction(null);
    }
  };

  const markTaskDone = async (taskId: string) => {
    if (!activeIncident) return;
    const currentTask = activeIncident.tasks.find((task) => task.id === taskId);
    if (!currentTask || currentTask.status === "done") return;

    setBusyAction(taskId);
    setRequestError(null);

    if (!isInteractiveMode) {
      setBusyAction(null);
      setRequestError(
        locale === "ru"
          ? "Обновление задач требует доступного backend."
          : "Task updates require the backend to be available.",
      );
      return;
    }

    try {
      await completeTaskRequest(activeIncident.id, taskId);
      const refreshedState = await loadDashboardState();
      applyDashboardHydration(refreshedState);
    } catch {
      setRequestError(
        locale === "ru"
          ? "Не удалось обновить задачу через backend. Проверьте сервер и повторите попытку."
          : "Task update failed in the backend. Check the server and try again.",
      );
    } finally {
      setBusyAction(null);
    }
  };

  const generateReport = async () => {
    if (!activeIncident || !selectedAnomaly) return;

    setBusyAction(`report-${activeIncident.id}`);
    setRequestError(null);

    if (!isInteractiveMode) {
      setBusyAction(null);
      setRequestError(
        locale === "ru"
          ? "Формирование отчёта требует доступного backend."
          : "Report generation requires the backend to be available.",
      );
      return;
    }

    try {
      await generateReportRequest(activeIncident.id);
      const refreshedState = await loadDashboardState();
      applyDashboardHydration(refreshedState);
      setActiveStep("report");
    } catch {
      setRequestError(
        locale === "ru"
          ? "Не удалось сформировать отчёт через backend. Проверьте сервер и повторите попытку."
          : "Report generation failed in the backend. Check the server and try again.",
      );
    } finally {
      setBusyAction(null);
    }
  };

  const exportReportArtifact = async (format: ReportExportFormat) => {
    if (!activeIncident || !selectedAnomaly) return;

    const actionId = `export-${activeIncident.id}-${format}`;
    setBusyAction(actionId);
    setRequestError(null);

    try {
      if (dashboardSource !== "api" || !hasApiBaseUrl) {
        throw new Error("API mode is required for export");
      }

      const downloaded = await downloadReport(activeIncident.id, format, locale);
      const blob = downloaded.blob;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = downloaded.fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setRequestError(t.errors.export);
    } finally {
      setBusyAction(null);
    }
  };

  const openPrintView = () => {
    if (!activeIncident || !selectedAnomaly) return;

    if (dashboardSource === "demo") {
      const previewWindow = window.open("", "_blank", "noopener,noreferrer");
      if (!previewWindow) return;

      const sections = localizedReportSections.length > 0
        ? localizedReportSections
        : buildReportSectionsForUi(selectedAnomaly, activeIncident, completedTasks, locale);
      const body = sections
        .map(
          (section) =>
            `<section style="margin-bottom:24px;"><h2 style="margin:0 0 8px;font:700 18px Arial,sans-serif;">${section.title}</h2><p style="margin:0;color:#334155;font:400 14px/1.6 Arial,sans-serif;">${section.body}</p></section>`,
        )
        .join("");

      previewWindow.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8" /><title>${activeIncident.title}</title></head><body style="margin:40px auto;max-width:760px;padding:0 24px;font-family:Arial,sans-serif;color:#0f172a;"><h1 style="margin-bottom:8px;">${activeIncident.title}</h1><p style="margin-top:0;color:#475569;">${translatedAssetName} · ${translatedRegion}</p>${body}</body></html>`);
      previewWindow.document.close();
      previewWindow.focus();
      return;
    }

    if (dashboardSource === "api") {
      const reportViewUrl = getReportViewUrl(activeIncident.id, true, locale);
      if (reportViewUrl) {
        window.open(reportViewUrl, "_blank", "noopener,noreferrer");
      }
    }
  };

  const changeSelectedAnomaly = (anomalyId: string) => {
    setSelectedAnomalyId(anomalyId);
    setActiveStep("signal");
    setRequestError(null);
    workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const changeMapPreset = (presetId: MapPresetId) => {
    setActiveMapPresetId(presetId);
    setRequestError(null);
  };

  const handleNavSelect = (target: NavTarget) => {
    if (target === "faq") {
      faqRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (target !== "signal" && !activeIncident) return;

    setActiveStep(target);
    workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  function applyIncidentUpdate(incident: Incident, anomalyId: string) {
    startTransition(() => {
      setIncidents((current) => ({ ...current, [incident.id]: incident }));
      setAnomalies((current) =>
        current.map((item) =>
          item.id === anomalyId ? { ...item, linkedIncidentId: incident.id } : item,
        ),
      );
    });
  }

  const heroSection = (
    <section className="dashboard-summary">
      <article className="dashboard-spotlight">
        <div className="dashboard-spotlight-top">
          <span className="eyebrow">Сейчас</span>
          {selectedAnomaly ? (
            <span className={`severity-badge ${severityTone[selectedAnomaly.severity]}`}>
              {severityLabel[locale][selectedAnomaly.severity]}
            </span>
          ) : (
            <span className="dashboard-mini-pill">{statusChipLabel}</span>
          )}
        </div>
        <h1>{spotlightTitle}</h1>
        <div className="dashboard-spotlight-meta">
          <span>{spotlightRegion}</span>
          <span>{translateFacility(selectedAnomaly?.facilityType ?? "Городской контур", locale)}</span>
          <span>{spotlightTime}</span>
        </div>
      </article>

      <div className="dashboard-summary-grid">
        {summaryCards.map((card) => (
          <article className={`dashboard-summary-card dashboard-summary-card-${card.tone}`} key={card.id}>
            <FieldLabel hint={card.hint} label={card.label} />
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>
    </section>
  );

  if (!selectedAnomaly) {
    if (loadingDashboard) {
      return (
        <main className="site-shell">
          {heroSection}
          {requestError ? <section className="error-banner">{requestError}</section> : null}
          <section className="empty-shell empty-live-shell">
            <div className="empty-live-copy">
              <p className="eyebrow">{locale === "ru" ? "Загрузка" : "Loading"}</p>
              <strong>
                {locale === "ru"
                  ? "Подключение к данным"
                  : "Connecting to data"}
              </strong>
            </div>
          </section>
        </main>
      );
    }

    return (
      <main className="site-shell">
        {heroSection}
        {requestError ? <section className="error-banner">{requestError}</section> : null}
        <section className="empty-shell empty-live-shell">
          <div className="empty-live-copy">
            <p className="eyebrow">{emptyQueueText.eyebrow}</p>
            <strong>{emptyQueueText.title}</strong>
            <p>{emptyQueueText.body}</p>
            <button
              className="primary-button"
              disabled={busyAction === "sync-gee" || (!hasApiBaseUrl && !isDemoMode)}
              onClick={() => void runPipelineSync()}
              type="button"
            >
              {busyAction === "sync-gee" ? screeningText.syncing : screeningText.sync}
            </button>
          </div>

          <div className="empty-live-grid">
            <article className="empty-live-cell">
              <span>{emptyQueueText.latestRun}</span>
              <strong>{latestLiveSyncValue}</strong>
            </article>
            <article className="empty-live-cell">
              <span>{emptyQueueText.nextRun}</span>
              <strong>{nextScheduledSyncValue}</strong>
            </article>
            <article className="empty-live-cell">
              <span>{emptyQueueText.serverState}</span>
              <strong>{pipelineStateLabel}</strong>
            </article>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="site-shell">
      {heroSection}

      {requestError ? <section className="error-banner">{requestError}</section> : null}

        <section className="workspace-shell" ref={workspaceRef}>
        <aside className="signal-rail">
          <div className="rail-head">
            <p className="eyebrow">{juryText.queueEyebrow}</p>
            <h2>{juryText.queueTitle}</h2>
          </div>

          <div className="signal-list">
            {scopedAnomalies.map((anomaly) => {
              const incident = anomaly.linkedIncidentId ? incidents[anomaly.linkedIncidentId] : undefined;
              const severityHint =
                anomaly.severity === "high"
                  ? t.help.severityUrgent
                  : anomaly.severity === "medium"
                    ? t.help.severityCheck
                    : t.help.severityWatch;
              return (
                <div
                  aria-pressed={anomaly.id === selectedAnomaly.id}
                  className={`signal-card ${anomaly.id === selectedAnomaly.id ? "signal-card-active" : ""}`}
                  key={anomaly.id}
                  onClick={() => changeSelectedAnomaly(anomaly.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      changeSelectedAnomaly(anomaly.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="signal-card-top">
                    <div className="severity-badge-wrap">
                      <span className={`severity-badge ${severityTone[anomaly.severity]}`}>
                        {severityLabel[locale][anomaly.severity]}
                      </span>
                      <HelpHint text={severityHint} />
                    </div>
                    <span>{formatTimestamp(anomaly.detectedAt, locale)}</span>
                  </div>
                  <strong>{translateAssetName(anomaly.assetName, locale)}</strong>
                  <p>{`${anomaly.verificationArea ?? translateRegion(anomaly.region, locale)} • ${translateFacility(anomaly.facilityType, locale)}`}</p>
                  <div className="signal-card-bottom">
                    <span>
                      {juryText.scoreLabel} {anomaly.signalScore}
                    </span>
                    <span>
                      {incident ? incidentStatusLabel[locale][incident.status] : t.summary.screening}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rail-footer">
            <span>{juryText.queueTop}</span>
            <strong>
              {translateAssetName(strongestAnomaly?.assetName ?? selectedAnomaly.assetName, locale)}
            </strong>
            <small>{strongestAnomaly?.signalScore ?? selectedAnomaly.signalScore} / 100</small>
          </div>
        </aside>

        <section className="workspace-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">{t.steps[activeStep].eyebrow}</p>
              <h2>{activeStep === "signal" ? juryText.signalStepTitle : t.steps[activeStep].title}</h2>
            </div>
          </div>

          <section className="workflow-rail" aria-label="Workflow">
            {workflowStages.map((stage) => (
              <article
                className={`workflow-stage workflow-stage-${stage.state}`}
                key={stage.id}
              >
                <span>{stage.label}</span>
              </article>
            ))}
          </section>

          {activeStep === "signal" ? (
            <div className="panel-body">
              {toplineKpis.length > 0 ? (
                <section className="ops-kpi-strip">
                  {toplineKpis.map((card) => (
                    <article className="ops-kpi-card" key={`${card.label}-${card.value}`}>
                      <span>{card.label}</span>
                      <strong>{card.value}</strong>
                      <p>{card.detail}</p>
                    </article>
                  ))}
                </section>
              ) : null}

              <section className="metric-grid">
                <MetricCard
                  hint={t.help.score}
                  label={juryText.scoreLabel}
                  value={`${selectedAnomaly.signalScore} / 100`}
                />
                <MetricCard
                  hint={liveSignalSelected ? liveSignalText.hints.thermalContext : t.help.impact}
                  label={liveSignalSelected ? liveSignalText.thermalContext : t.stats.impact}
                  value={
                    liveSignalSelected
                      ? formatThermalContext(selectedAnomaly, locale, liveSignalText)
                      : formatPotentialImpact(selectedAnomaly, locale, liveSignalText.noImpact)
                  }
                />
                <MetricCard
                  hint={t.help.detected}
                  label={t.summary.detected}
                  value={formatTimestamp(selectedAnomaly.detectedAt, locale)}
                />
                <MetricCard
                  hint={t.help.confidence}
                  label={t.summary.confidence}
                  value={translateConfidence(selectedAnomaly.confidence, locale)}
                />
              </section>

              <section className="insight-grid">
                <article className="insight-card">
                  <div className="insight-head">
                    <FieldLabel
                      hint="Визуальный прогноз следующего окна. Блок вдохновлён forecasting-подходом из Prophet и Merlion."
                      label="Прогноз окна"
                    />
                    <span className={`insight-badge ${forecastDirection >= 0 ? "insight-badge-hot" : ""}`}>
                      {forecastDirection >= 0 ? "Рост риска" : "Стабилизация"}
                    </span>
                  </div>
                  <MiniTrendChart points={forecastPoints} />
                  <p className="insight-copy">
                    {forecastDirection >= 0
                      ? "Ожидается напряжённое следующее окно. Приоритет лучше не снижать."
                      : "Контур стабилизируется, но кейс пока остаётся в приоритете."}
                  </p>
                </article>

                <article className="insight-card">
                  <div className="insight-head">
                    <FieldLabel
                      hint="Короткий shortlist факторов, как в root-cause обзорах. Паттерн взят из PyRCA."
                      label="Вероятные причины"
                    />
                  </div>
                  <div className="cause-list">
                    {rootCauseItems.map((item) => (
                      <div className="cause-row" key={item.label}>
                        <div className="cause-row-top">
                          <span>{item.label}</span>
                          <strong>{item.share}%</strong>
                        </div>
                        <div className="cause-bar">
                          <div className="cause-bar-fill" style={{ width: `${item.share}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="insight-card">
                  <div className="insight-head">
                    <FieldLabel
                      hint="Блок контроля качества текущего набора, вдохновлён Evidently."
                      label="Качество набора"
                    />
                  </div>
                  <div className="quality-list">
                    {qualityChecks.map((item) => (
                      <div className="quality-row" key={item.label}>
                        <div className="quality-row-top">
                          <span>{item.label}</span>
                          <strong>{item.value}%</strong>
                        </div>
                        <div className="quality-bar">
                          <div className="quality-bar-fill" style={{ width: `${item.value}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              </section>

              {screeningSnapshot ? (
                <section className="evidence-detail-card">
                  <div className="section-head">
                    <FieldLabel label={screeningText.title} />
                    <div className="evidence-badge-row">
                      <span
                        className={`evidence-badge evidence-badge-${screeningSnapshot.freshness}`}
                      >
                        {screeningText.freshness[screeningSnapshot.freshness]}
                      </span>
                      <span className="evidence-badge evidence-badge-level">
                        {screeningText.levelLabel[screeningSnapshot.screeningLevel]}
                      </span>
                    </div>
                  </div>

                  <p className="evidence-summary-note">{screeningText.subtitle}</p>

                  <section className="metric-grid evidence-inner-grid">
                    <MetricCard
                      label={screeningText.current}
                      hint={screeningText.help.current}
                      value={formatPpb(screeningSnapshot.currentCh4Ppb, screeningText.notAvailable, locale)}
                    />
                    <MetricCard
                      label={screeningText.baseline}
                      hint={screeningText.help.baseline}
                      value={formatPpb(screeningSnapshot.baselineCh4Ppb, screeningText.notAvailable, locale)}
                    />
                    <MetricCard
                      label={screeningText.delta}
                      hint={screeningText.help.delta}
                      value={formatDelta(screeningSnapshot, screeningText.notAvailable, locale)}
                    />
                    <MetricCard
                      label={screeningText.level}
                      hint={screeningText.help.level}
                      value={screeningText.levelLabel[screeningSnapshot.screeningLevel]}
                    />
                  </section>

                  <section className="signal-focus evidence-detail-grid">
                    <InfoRow
                      label={screeningText.source}
                      hint={screeningText.help.source}
                      value={translateScreeningEvidenceSource(screeningSnapshot.evidenceSource, locale)}
                    />
                    <InfoRow
                      label={screeningText.synced}
                      hint={screeningText.help.synced}
                      value={screeningSnapshot.syncedAt ?? screeningText.notAvailable}
                    />
                    <InfoRow
                      label={screeningText.observed}
                      hint={screeningText.help.observed}
                      value={
                        screeningSnapshot.observedWindow
                          ? translateScreeningObservedWindow(screeningSnapshot.observedWindow, locale)
                          : screeningText.notAvailable
                      }
                    />
                    <InfoRow
                      className="info-row-wide"
                      label={screeningText.recommendation}
                      value={translateScreeningRecommendation(screeningSnapshot.recommendedAction, locale)}
                    />
                  </section>

                  <PipelineHistoryPanel history={pipelineHistory} locale={locale} />
                </section>
              ) : null}

              <section className="signal-focus">
                <InfoRow label="Город" value={translatedRegion} />
                <InfoRow
                  actions={
                    selectedAnomalyCoordinateLinks ? (
                      <CoordinateActionLinks labels={coordinateActionText} links={selectedAnomalyCoordinateLinks} />
                    ) : undefined
                  }
                  hint={t.help.coordinates}
                  label={t.summary.coordinates}
                  value={selectedAnomaly.coordinates}
                />
                {showVerificationArea ? (
                  <InfoRow
                    hint={t.help.verificationArea}
                    label={t.summary.verificationArea}
                    value={translatedVerificationArea}
                  />
                ) : null}
                {liveSignalSelected ? (
                  <InfoRow
                    hint={t.help.nearestAddress}
                    label={t.summary.nearestAddress}
                    value={translatedNearestAddress}
                  />
                ) : null}
                {showNearestLandmark ? (
                  <InfoRow
                    hint={t.help.nearestLandmark}
                    label={t.summary.nearestLandmark}
                    value={translatedNearestLandmark}
                  />
                ) : null}
                <InfoRow label={t.panels.assets} value={translatedAssetName} />
                <InfoRow label="Контур" value={translateFacility(selectedAnomaly.facilityType, locale)} />
                <InfoRow
                  className="info-row-wide"
                  label="Следующий шаг"
                  value={translateRecommendedAction(selectedAnomaly.recommendedAction, locale)}
                />
              </section>

              <section className="map-card">
                <div className="section-head">
                  <div>
                    <FieldLabel hint={t.help.map} label={t.panels.map} />
                    <strong>{activeMapPreset.label[locale]}</strong>
                  </div>
                  <span className={`map-context-badge map-context-badge-${mapCardTone}`}>
                    {mapContextLabel}
                  </span>
                </div>
                <div className="map-preset-strip" role="tablist" aria-label="Map region presets">
                  {availableMapPresets.map((preset) => (
                    <button
                      key={preset.id}
                      className={`map-preset-button ${preset.id === activeMapPreset.id ? "map-preset-button-active" : ""}`}
                      onClick={() => changeMapPreset(preset.id)}
                      type="button"
                    >
                      {preset.label[locale]}
                    </button>
                  ))}
                </div>
                <div className="map-console">
                  <div className="map-layer-strip">
                    {mapLayerChips.map((chip) => (
                      <span
                        className={`map-layer-chip ${chip.active ? "map-layer-chip-active" : ""}`}
                        key={chip.label}
                      >
                        {chip.label}
                      </span>
                    ))}
                  </div>
                  <div className="map-legend-strip">
                    {mapLegendItems.map((item) => (
                      <span className="map-legend-item" key={item.label}>
                        <i className={`map-legend-dot map-legend-dot-${item.tone}`} />
                        {item.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className={`map-evidence-strip map-evidence-strip-${mapCardTone}`}>
                  <article>
                    <span>{screeningText.current}</span>
                    <strong>{formatPpb(screeningSnapshot?.currentCh4Ppb, screeningText.notAvailable, locale)}</strong>
                  </article>
                  <article>
                    <span>{screeningText.baseline}</span>
                    <strong>{formatPpb(screeningSnapshot?.baselineCh4Ppb, screeningText.notAvailable, locale)}</strong>
                  </article>
                  <article>
                    <span>{screeningText.delta}</span>
                    <strong>
                      {screeningSnapshot
                        ? formatDelta(screeningSnapshot, screeningText.notAvailable, locale)
                        : screeningText.notAvailable}
                    </strong>
                  </article>
                  <article>
                    <span>{mapSyncLabel}</span>
                    <strong>{mapSyncValue}</strong>
                  </article>
                </div>
                <p className="map-note">{mapNote}</p>
                <AnomalyMap
                  anomalies={scopedAnomalies}
                  liveReactionAnomalyId={mapReactionActive ? mapReactionDotId : undefined}
                  locale={locale}
                  onPrimaryAction={() => void promoteToIncident()}
                  onSelectAnomaly={changeSelectedAnomaly}
                  primaryActionDisabled={busyAction === "promote"}
                  primaryActionLabel={
                    selectedAnomaly.linkedIncidentId
                      ? t.actions.openIncident
                      : busyAction === "promote"
                        ? t.actions.promoting
                        : t.actions.promote
                  }
                  selectedAnomalyId={selectedAnomaly.id}
                  tone={mapCardTone}
                />
              </section>

              <section className="city-grid city-grid-services">
                <article className="city-surface">
                  <div className="section-head">
                    <FieldLabel
                      hint="Короткий обзор по контурам города: сколько кейсов, какой средний приоритет и есть ли уже рабочий инцидент."
                      label="Службы"
                    />
                  </div>
                  <div className="service-grid">
                    {serviceOverview.map((service) => (
                      <article className="service-card" key={service.label}>
                        <span>{service.label}</span>
                        <strong>{service.value}</strong>
                        <p>{service.detail}</p>
                      </article>
                    ))}
                  </div>
                </article>

                <article className="city-surface city-surface-wide">
                  <div className="section-head">
                    <FieldLabel
                      hint="Список районов и кейсов, чтобы руководитель сразу видел, где проседает SLA и где уже есть активная реакция."
                      label="Районы и SLA"
                    />
                  </div>
                  <div className="district-list">
                    {districtRows.map((row) => (
                      <article className="district-row" key={row.id}>
                        <div className="district-info">
                          <strong>{row.title}</strong>
                          <p>{row.subtitle}</p>
                          <span>{row.meta}</span>
                        </div>
                        <div className="district-side">
                          <span>{row.owner}</span>
                          <b>{row.value}</b>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
              </section>

              <section className="city-grid city-grid-activity">
                <article className="city-surface">
                  <div className="section-head">
                    <FieldLabel
                      hint="Из каких контуров собрана сводка: обращения, телеметрия, камеры и подтверждения от выездных служб."
                      label="Каналы данных"
                    />
                  </div>
                  <div className="channel-list">
                    {channelRows.map((channel) => (
                      <article className="channel-row" key={channel.label}>
                        <div className="channel-row-copy">
                          <div className="channel-row-top">
                            <strong>{channel.label}</strong>
                            <span>{channel.share}%</span>
                          </div>
                          <p>{channel.detail}</p>
                          <div className="channel-bar">
                            <div className="channel-bar-fill" style={{ width: `${channel.share}%` }} />
                          </div>
                        </div>
                        <div className="channel-row-side">
                          <b>{channel.value}</b>
                          <span>сигналов</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>

                <article className="city-surface">
                  <div className="section-head">
                    <FieldLabel
                      hint="Какие службы уже втянуты в работу и в каком режиме сейчас держат свои кейсы."
                      label="Исполнение по службам"
                    />
                  </div>
                  <div className="response-team-list">
                    {executionRows.map((row) => (
                      <article className="response-team-row" key={row.id}>
                        <strong>{row.label}</strong>
                        <p>{row.detail}</p>
                        <span>{row.value}</span>
                      </article>
                    ))}
                  </div>
                </article>
              </section>

              <section className="city-grid city-grid-activity">
                <article className="city-surface">
                  <div className="section-head">
                    <FieldLabel
                      hint="Лента показывает, что реально происходило в системе: обновления, назначение кейсов, закрытие шагов и выпуск отчётов."
                      label="Лента действий"
                    />
                  </div>
                  <div className="activity-feed">
                    {recentActivity.map((event) => (
                      <article className="activity-row" key={event.id}>
                        <span>{formatTimestamp(event.occurredAt, locale)}</span>
                        <strong>{event.title}</strong>
                        <p>{event.detail}</p>
                      </article>
                    ))}
                  </div>
                </article>

                <article className="city-surface">
                  <div className="section-head">
                    <FieldLabel
                      hint="Что еще не закрыто после главных инцидентов: блок нужен, чтобы экран не выглядел законченным раньше времени."
                      label="Дальше в очереди"
                    />
                  </div>
                  <div className="watch-list">
                    {nextWatchItems.map((item) => (
                      <article className="watch-row" key={item.id}>
                        <strong>{item.title}</strong>
                        <p>{item.detail}</p>
                        <span>{item.value}</span>
                      </article>
                    ))}
                  </div>
                </article>
              </section>

                <div className="panel-actions panel-actions-wrap">
                  <div className="action-with-hint">
                    <HelpHint text={t.help.syncEvidence} />
                    <button
                      className="secondary-button"
                      disabled={busyAction === "sync-gee" || (!hasApiBaseUrl && !isDemoMode)}
                      onClick={() => void runPipelineSync()}
                      type="button"
                    >
                      {busyAction === "sync-gee" ? screeningText.syncing : screeningText.sync}
                    </button>
                  </div>
                <div className="action-with-hint">
                  <HelpHint
                    text={
                      selectedAnomaly.linkedIncidentId
                        ? t.help.openIncidentAction
                        : t.help.createIncidentAction
                    }
                  />
                  <button
                    className="primary-button"
                    disabled={busyAction === "promote"}
                    onClick={() => void promoteToIncident()}
                    type="button"
                  >
                    {selectedAnomaly.linkedIncidentId
                      ? t.actions.openIncident
                      : busyAction === "promote"
                        ? t.actions.promoting
                        : t.actions.promote}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {activeStep === "incident" ? (
            activeIncident ? (
              <div className="panel-body">
                <section className="metric-grid">
                  <MetricCard label={t.summary.owner} value={translateOwner(activeIncident.owner, locale)} />
                  <MetricCard label={t.summary.priority} value={activeIncident.priority} />
                  <MetricCard
                    label={t.summary.window}
                    value={translateWindow(activeIncident.verificationWindow, locale)}
                  />
                  <MetricCard
                    label={t.summary.progress}
                    value={formatTaskProgress(completedTasks, activeIncident.tasks.length, locale)}
                  />
                </section>

                <section className="incident-hero">
                  <div className="incident-copy">
                    <FieldLabel label={t.panels.incidentNarrative} />
                    <strong>{translateAnomalySummary(selectedAnomaly.summary, locale)}</strong>
                    <p>{translateIncidentNarrative(activeIncident.narrative, locale)}</p>
                  </div>
                </section>

                <section className="signal-focus">
                  <InfoRow label={t.panels.assets} value={translatedAssetName} />
                  <InfoRow label={t.summary.region} value={translatedRegion} />
                  <InfoRow
                    actions={
                      selectedAnomalyCoordinateLinks ? (
                        <CoordinateActionLinks labels={coordinateActionText} links={selectedAnomalyCoordinateLinks} />
                      ) : undefined
                    }
                    hint={t.help.coordinates}
                    label={t.summary.coordinates}
                    value={selectedAnomaly.coordinates}
                  />
                  {showVerificationArea ? (
                    <InfoRow
                      hint={t.help.verificationArea}
                      label={t.summary.verificationArea}
                      value={translatedVerificationArea}
                    />
                  ) : null}
                  {liveSignalSelected ? (
                    <InfoRow
                      hint={t.help.nearestAddress}
                      label={t.summary.nearestAddress}
                      value={translatedNearestAddress}
                    />
                  ) : null}
                  {showNearestLandmark ? (
                    <InfoRow
                      hint={t.help.nearestLandmark}
                      label={t.summary.nearestLandmark}
                      value={translatedNearestLandmark}
                    />
                  ) : null}
                  <InfoRow
                    label={t.summary.recommendation}
                    value={translateRecommendedAction(selectedAnomaly.recommendedAction, locale)}
                  />
                </section>

                <section className="city-grid city-grid-activity">
                  <article className="city-surface">
                    <div className="section-head">
                      <FieldLabel hint="Кто уже включен в инцидент и какую роль играет в исполнении." label="Контур реагирования" />
                    </div>
                    <div className="response-team-list">
                      {responseTeams.map((team) => (
                        <article className="response-team-row" key={team.label}>
                          <strong>{team.label}</strong>
                          <p>{team.detail}</p>
                          <span>{team.value}</span>
                        </article>
                      ))}
                    </div>
                  </article>

                  <article className="city-surface">
                    <div className="section-head">
                      <FieldLabel hint="Короткая лента только по текущему кейсу: что уже успели сделать и что вошло в рабочий журнал." label="События по кейсу" />
                    </div>
                    <div className="activity-feed">
                      {incidentActivity.map((event) => (
                        <article className="activity-row" key={event.id}>
                          <span>{formatTimestamp(event.occurredAt, locale)}</span>
                          <strong>{event.title}</strong>
                          <p>{event.detail}</p>
                        </article>
                      ))}
                    </div>
                  </article>
                </section>

                <div className="panel-actions panel-actions-wrap">
                  <button className="primary-button" onClick={() => setActiveStep("verification")} type="button">
                    {t.actions.openVerification}
                  </button>
                  <button className="secondary-button" onClick={() => setActiveStep("signal")} type="button">
                    {t.actions.backToSignal}
                  </button>
                </div>
              </div>
            ) : (
              <EmptyStage title={t.panels.noIncident} subtitle={t.panels.noIncidentHint} />
            )
          ) : null}

          {activeStep === "verification" ? (
            activeIncident ? (
              <div className="panel-body">
                <section className="progress-card">
                  <div className="progress-head">
                    <div>
                      <FieldLabel label={t.summary.tasks} />
                      <strong>{formatTaskProgress(completedTasks, activeIncident.tasks.length, locale)}</strong>
                    </div>
                    <b>{incidentStatusLabel[locale][activeIncident.status]}</b>
                  </div>
                  <div className="progress-track">
                    <div className="progress-bar" style={{ width: `${progressPercent}%` }} />
                  </div>
                </section>

                <section className="task-list">
                  {activeIncident.tasks.map((task) => (
                    <TaskRow
                      busy={busyAction === task.id}
                      key={task.id}
                      locale={locale}
                      onComplete={() => void markTaskDone(task.id)}
                      task={task}
                    />
                  ))}
                </section>

                <section className="signal-focus">
                  <InfoRow label={t.summary.owner} value={translateOwner(activeIncident.owner, locale)} />
                  <InfoRow
                    label={t.summary.window}
                    value={translateWindow(activeIncident.verificationWindow, locale)}
                  />
                  <InfoRow
                    label={t.summary.confidence}
                    value={translateConfidence(selectedAnomaly.confidence, locale)}
                  />
                  <InfoRow
                    label={t.summary.recommendation}
                    value={translateRecommendedAction(selectedAnomaly.recommendedAction, locale)}
                  />
                </section>

                <section className="city-grid city-grid-activity">
                  <article className="city-surface">
                    <div className="section-head">
                      <FieldLabel hint="Какие службы сейчас реально участвуют в закрытии задач по кейсу." label="Исполнители" />
                    </div>
                    <div className="response-team-list">
                      {responseTeams.map((team) => (
                        <article className="response-team-row" key={team.label}>
                          <strong>{team.label}</strong>
                          <p>{team.detail}</p>
                          <span>{team.value}</span>
                        </article>
                      ))}
                    </div>
                  </article>

                  <article className="city-surface">
                    <div className="section-head">
                      <FieldLabel hint="Эта лента нужна, чтобы задача выглядела не статично, а как реально движущийся рабочий процесс." label="Последние действия" />
                    </div>
                    <div className="activity-feed">
                      {incidentActivity.map((event) => (
                        <article className="activity-row" key={event.id}>
                          <span>{formatTimestamp(event.occurredAt, locale)}</span>
                          <strong>{event.title}</strong>
                          <p>{event.detail}</p>
                        </article>
                      ))}
                    </div>
                  </article>
                </section>

                <div className="panel-actions panel-actions-wrap">
                  <button
                    className="primary-button"
                    disabled={busyAction === `report-${activeIncident.id}`}
                    onClick={() => void generateReport()}
                    type="button"
                  >
                    {busyAction === `report-${activeIncident.id}` ? t.actions.generating : t.actions.generateReport}
                  </button>
                  <button className="secondary-button" onClick={() => setActiveStep("incident")} type="button">
                    {t.actions.openIncident}
                  </button>
                </div>
              </div>
            ) : (
              <EmptyStage title={t.panels.noIncident} subtitle={t.panels.noIncidentHint} />
            )
          ) : null}

          {activeStep === "report" ? (
            activeIncident ? (
              <div className="panel-body">
                <section className="metric-grid">
                  <MetricCard
                    label={t.summary.generated}
                    value={
                      activeIncident.reportGeneratedAt
                        ? formatTimestamp(activeIncident.reportGeneratedAt, locale)
                        : t.summary.noReport
                    }
                  />
                  <MetricCard
                    label={t.summary.reportSections}
                    value={String(localizedReportSections.length || 0)}
                  />
                  <MetricCard label={t.summary.owner} value={translateOwner(activeIncident.owner, locale)} />
                  <MetricCard
                    label={t.summary.progress}
                    value={formatTaskProgress(completedTasks, activeIncident.tasks.length, locale)}
                  />
                </section>

                {activeIncident.reportGeneratedAt ? (
                  <section className="report-stack">
                    {localizedReportSections.map((section) => (
                      <article key={section.title} className="report-card">
                        <span>{section.title}</span>
                        <p>{section.body}</p>
                      </article>
                    ))}
                  </section>
                ) : (
                  <EmptyStage title={t.summary.noReport} subtitle={t.panels.noReportHint} />
                )}

                {reportHighlights.length > 0 ? (
                  <section className="city-surface">
                    <div className="section-head">
                      <FieldLabel hint="Компактная управленческая выжимка из отчётного пакета." label="Короткая сводка" />
                    </div>
                    <div className="service-grid">
                      {reportHighlights.map((item) => (
                        <article className="service-card" key={item.label}>
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                          <p>{item.detail}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className="city-grid city-grid-activity">
                  <article className="city-surface">
                    <div className="section-head">
                      <FieldLabel hint="Кому в реальном процессе отправляется итоговая сводка по кейсу." label="Получатели отчёта" />
                    </div>
                    <div className="response-team-list">
                      {reportRecipients.map((recipient) => (
                        <article className="response-team-row" key={recipient.label}>
                          <strong>{recipient.label}</strong>
                          <p>{recipient.detail}</p>
                          <span>{recipient.value}</span>
                        </article>
                      ))}
                    </div>
                  </article>

                  <article className="city-surface">
                    <div className="section-head">
                      <FieldLabel hint="Что система советует держать под наблюдением после отправки отчёта." label="После отчёта" />
                    </div>
                    <div className="watch-list">
                      {nextWatchItems.map((item) => (
                        <article className="watch-row" key={item.id}>
                          <strong>{item.title}</strong>
                          <p>{item.detail}</p>
                          <span>{item.value}</span>
                        </article>
                      ))}
                    </div>
                  </article>
                </section>

                <div className="panel-actions panel-actions-wrap">
                  <button
                    className="primary-button"
                    disabled={busyAction === `report-${activeIncident.id}`}
                    onClick={() => void generateReport()}
                    type="button"
                  >
                    {busyAction === `report-${activeIncident.id}` ? t.actions.generating : t.actions.generateReport}
                  </button>
                  {dashboardSource === "api" ? (
                    <>
                      <button
                        className="secondary-button"
                        disabled={busyAction === `export-${activeIncident.id}-pdf`}
                        onClick={() => void exportReportArtifact("pdf")}
                        type="button"
                      >
                        {busyAction === `export-${activeIncident.id}-pdf` ? t.actions.exporting : t.actions.downloadPdf}
                      </button>
                      <button
                        className="secondary-button"
                        disabled={busyAction === `export-${activeIncident.id}-docx`}
                        onClick={() => void exportReportArtifact("docx")}
                        type="button"
                      >
                        {busyAction === `export-${activeIncident.id}-docx` ? t.actions.exporting : t.actions.downloadWord}
                      </button>
                    </>
                  ) : (
                    <button
                      className="secondary-button"
                      disabled
                      type="button"
                    >
                      {t.actions.downloadPdf}
                    </button>
                  )}
                  <button className="secondary-button" onClick={openPrintView} type="button">
                    {t.actions.printView}
                  </button>
                  <button className="secondary-button" onClick={() => setActiveStep("signal")} type="button">
                    {t.actions.reviewAnother}
                  </button>
                </div>
              </div>
            ) : (
              <EmptyStage title={t.panels.noIncident} subtitle={t.panels.noIncidentHint} />
            )
          ) : null}
        </section>
      </section>

      <section className="faq-shell" ref={faqRef}>
        <div className="faq-head">
          <h2>Частые вопросы</h2>
        </div>

        <div className="faq-list">
          {faqItems.map((item) => (
            <details key={item.id} className="faq-item">
              <summary>
                <span>{item.question}</span>
                <ChevronIcon />
              </summary>
              <div className="faq-answer">
                {item.answer.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <p className="footer-note">Demo-платформа управления городом Алматы. Все цифры на экране сейчас являются mock-данными для презентации конечного интерфейса.</p>
      </footer>
    </main>
  );
}

function buildForecastSeries(points: Array<{ label: string; anomalyIndex: number }>) {
  if (points.length === 0) return [];

  const lastValue = points[points.length - 1]?.anomalyIndex ?? 0;
  const baseline = points.map((point) => ({ label: point.label, value: point.anomalyIndex, kind: "actual" as const }));
  const forecast = [
    { label: "21:00", value: Math.min(100, Math.round(lastValue + 2)), kind: "forecast" as const },
    { label: "00:00", value: Math.min(100, Math.round(lastValue + 5)), kind: "forecast" as const },
    { label: "03:00", value: Math.min(100, Math.round(lastValue + 7)), kind: "forecast" as const },
  ];

  return [...baseline, ...forecast];
}

function buildSmartCityKpis(
  anomalies: Anomaly[],
  incidents: Record<string, Incident>,
  pipelineStatus: PipelineStatus,
) {
  const criticalCount = anomalies.filter((anomaly) => anomaly.severity === "high").length;
  const openTasks = Object.values(incidents).reduce(
    (count, incident) => count + incident.tasks.filter((task) => task.status === "open").length,
    0,
  );
  const generatedReports = Object.values(incidents).filter((incident) => incident.reportGeneratedAt).length;

  return [
    {
      label: "Критичные районы",
      value: `${criticalCount}`,
      detail: "Требуют решения в текущую смену",
    },
    {
      label: "Открытые задачи",
      value: `${openTasks}`,
      detail: "Незакрытые действия по рабочим кейсам",
    },
    {
      label: "Сформировано отчётов",
      value: `${generatedReports}`,
      detail: "Готовые сводки для штаба и руководства",
    },
    {
      label: "Статус данных",
      value: pipelineStatus.state === "ready" ? "Актуально" : "Проверить",
      detail: pipelineStatus.lastSyncAt ? formatTimestamp(pipelineStatus.lastSyncAt, "ru") : "Нет синхронизации",
    },
  ];
}

function buildServiceOverview(anomalies: Anomaly[], incidents: Record<string, Incident>) {
  const grouped = new Map<string, { count: number; maxScore: number; incidentCount: number }>();

  for (const anomaly of anomalies) {
    const current = grouped.get(anomaly.facilityType) ?? { count: 0, maxScore: 0, incidentCount: 0 };
    grouped.set(anomaly.facilityType, {
      count: current.count + 1,
      maxScore: Math.max(current.maxScore, anomaly.signalScore),
      incidentCount: current.incidentCount + (anomaly.linkedIncidentId && incidents[anomaly.linkedIncidentId] ? 1 : 0),
    });
  }

  return [...grouped.entries()].map(([label, value]) => ({
    label,
    value: `${value.count} кейс`,
    detail: `Макс. индекс ${value.maxScore}/100, в работе ${value.incidentCount}`,
  }));
}

function buildDistrictRows(anomalies: Anomaly[], incidents: Record<string, Incident>) {
  return [...anomalies]
    .sort((left, right) => right.signalScore - left.signalScore)
    .map((anomaly) => {
    const incident = anomaly.linkedIncidentId ? incidents[anomaly.linkedIncidentId] : undefined;
    const requestCount = anomaly.nightThermalHits72h ?? anomaly.thermalHits72h ?? 0;
    return {
      id: anomaly.id,
      title: anomaly.verificationArea ?? "Район не указан",
      subtitle: `${anomaly.assetName} • ${anomaly.facilityType}`,
      meta: `${requestCount} обращений • индекс ${anomaly.signalScore}/100`,
      owner: incident ? incident.owner : "Назначение в течение 15 мин",
      value: incident ? `${incident.priority} • ${incident.verificationWindow}` : "Без SLA",
    };
  });
}

function buildChannelRows(anomalies: Anomaly[]) {
  const totalSignals = anomalies.reduce(
    (sum, anomaly) => sum + (anomaly.nightThermalHits72h ?? anomaly.thermalHits72h ?? 0),
    0,
  );
  const channelPlan = [
    {
      label: "109",
      detail: "Жители, диспетчеры и мобильные обращения",
      share: 42,
    },
    {
      label: "Телеметрия",
      detail: "SCADA, датчики, экологические и сетевые посты",
      share: 28,
    },
    {
      label: "Камеры",
      detail: "Трафик, перекрёстки и уличное видеонаблюдение",
      share: 18,
    },
    {
      label: "Полевые службы",
      detail: "Подтверждения от бригад, патрулей и дежурных смен",
      share: 12,
    },
  ];

  return channelPlan.map((channel) => ({
    ...channel,
    value: String(Math.max(1, Math.round(totalSignals * (channel.share / 100)))),
  }));
}

function buildExecutionRows(anomalies: Anomaly[], incidents: Record<string, Incident>) {
  return [...anomalies]
    .sort((left, right) => right.signalScore - left.signalScore)
    .slice(0, 4)
    .map((anomaly) => {
      const incident = anomaly.linkedIncidentId ? incidents[anomaly.linkedIncidentId] : undefined;
      const requestCount = anomaly.nightThermalHits72h ?? anomaly.thermalHits72h ?? 0;
      const state =
        incident?.status === "mitigation"
          ? "Исполнение"
          : incident?.status === "verification"
            ? "Проверка"
            : incident
              ? "Разбор"
              : "Очередь";

      return {
        id: anomaly.id,
        label: anomaly.facilityType,
        detail: `${anomaly.verificationArea ?? anomaly.region} • ${anomaly.assetName}`,
        value: incident ? `${incident.priority} • ${state}` : `${requestCount} подтверждений`,
      };
    });
}

function buildResponseTeams(anomaly: Anomaly | null, incident: Incident | undefined) {
  if (!anomaly) return [];

  return [
    {
      label: incident?.owner ?? "Ситуационный центр акимата",
      detail: "Основной владелец кейса и точка координации.",
      value: incident?.priority ?? "P2",
    },
    {
      label: anomaly.facilityType,
      detail: "Профильный городской контур, который должен выполнить основные действия.",
      value: anomaly.verificationArea ?? "Алматы",
    },
    {
      label: "Операторы 109",
      detail: "Фиксируют обращения жителей и помогают обновлять статус на внешнем контуре.",
      value: `${anomaly.nightThermalHits72h ?? anomaly.thermalHits72h ?? 0} обращений`,
    },
  ];
}

function buildReportRecipients(anomaly: Anomaly | null) {
  const district = anomaly?.verificationArea ?? "район";

  return [
    {
      label: "Штаб смены",
      detail: "Получает краткую сводку для оперативного разбора и решения по приоритетам.",
      value: "Обязательно",
    },
    {
      label: `Профильное управление (${district})`,
      detail: "Использует отчет как основание для исполнения и последующего контроля.",
      value: "По кейсу",
    },
    {
      label: "Секретариат акимата",
      detail: "Видит готовый формат без дополнительной ручной сборки информации.",
      value: "По запросу",
    },
  ];
}

function buildNextWatchItems(anomalies: Anomaly[]) {
  return anomalies.slice(2).map((anomaly) => ({
    id: anomaly.id,
    title: anomaly.assetName,
    detail: `${anomaly.verificationArea ?? anomaly.region} • ${anomaly.facilityType}`,
    value: `${anomaly.signalScore}/100`,
  }));
}

function buildReportHighlights(
  anomaly: Anomaly | null,
  incident: Incident | undefined,
  completedTasks: number,
) {
  if (!anomaly || !incident) {
    return [];
  }

  const requestCount = anomaly.nightThermalHits72h ?? anomaly.thermalHits72h ?? 0;

  return [
    {
      label: "Район",
      value: anomaly.verificationArea ?? "Алматы",
      detail: anomaly.facilityType,
    },
    {
      label: "Подтверждения",
      value: String(requestCount),
      detail: "Обращения и сигналы, вошедшие в пакет",
    },
    {
      label: "Исполнение",
      value: `${completedTasks}/${incident.tasks.length}`,
      detail: "Закрытых шагов по кейсу",
    },
    {
      label: "SLA",
      value: incident.verificationWindow,
      detail: `Приоритет ${incident.priority}`,
    },
  ];
}

function buildRootCauseItems(anomaly: Anomaly, snapshot: ScreeningEvidenceSnapshot | undefined) {
  const thermalShare = Math.min(92, 28 + (anomaly.nightThermalHits72h ?? 0) * 9);
  const methaneShare = Math.min(96, Math.round(anomaly.methaneDeltaPct * 6 + 22));
  const persistenceShare = Math.min(90, Math.max(34, Math.round((snapshot?.deltaPct ?? anomaly.methaneDeltaPct) * 5)));

  return [
    { label: "Отклонение от нормы", share: methaneShare },
    { label: "Поток обращений", share: thermalShare },
    { label: "Повторяемость по району", share: persistenceShare },
  ].sort((left, right) => right.share - left.share);
}

function buildQualityChecks(
  anomaly: Anomaly,
  snapshot: ScreeningEvidenceSnapshot | undefined,
  incident: Incident | undefined,
  pipelineStatus: PipelineStatus,
) {
  const geocoding = anomaly.nearestAddress && anomaly.verificationArea ? 96 : 72;
  const evidence = snapshot?.freshness === "fresh" ? 97 : snapshot?.freshness === "stale" ? 82 : 54;
  const workflow = incident ? 92 : 61;
  const coverage = pipelineStatus.anomalyCount > 0 ? 94 : 58;

  return [
    { label: "Геокодинг", value: geocoding },
    { label: "Свежесть данных", value: evidence },
    { label: "Поля инцидента", value: workflow },
    { label: "Покрытие города", value: coverage },
  ];
}

function MiniTrendChart({
  points,
}: {
  points: Array<{ kind: "actual" | "forecast"; label: string; value: number }>;
}) {
  if (points.length === 0) {
    return <div className="mini-chart-empty">Нет данных</div>;
  }

  const width = 420;
  const height = 180;
  const paddingX = 14;
  const paddingY = 16;
  const max = Math.max(...points.map((point) => point.value), 100);
  const min = Math.min(...points.map((point) => point.value), 0);
  const range = Math.max(max - min, 1);
  const stepX = (width - paddingX * 2) / Math.max(points.length - 1, 1);

  const projected = points.map((point, index) => {
    const x = paddingX + stepX * index;
    const y = height - paddingY - ((point.value - min) / range) * (height - paddingY * 2);
    return { ...point, x, y };
  });

  const actualPoints = projected.filter((point) => point.kind === "actual");
  const forecastPoints = projected.filter((point) => point.kind === "forecast");
  const actualPath = actualPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const forecastPath =
    forecastPoints.length > 0
      ? [`M ${actualPoints[actualPoints.length - 1]?.x ?? forecastPoints[0].x} ${actualPoints[actualPoints.length - 1]?.y ?? forecastPoints[0].y}`, ...forecastPoints.map((point) => `L ${point.x} ${point.y}`)].join(" ")
      : "";

  return (
    <div className="mini-chart-shell">
      <svg className="mini-chart" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" role="img">
        <defs>
          <linearGradient id="miniChartFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(11, 115, 255, 0.32)" />
            <stop offset="100%" stopColor="rgba(11, 115, 255, 0.02)" />
          </linearGradient>
        </defs>
        <path
          d={`${actualPath} L ${actualPoints[actualPoints.length - 1]?.x ?? width - paddingX} ${height - paddingY} L ${actualPoints[0]?.x ?? paddingX} ${height - paddingY} Z`}
          fill="url(#miniChartFill)"
        />
        <path d={actualPath} fill="none" stroke="currentColor" strokeWidth="3" />
        {forecastPath ? (
          <path
            d={forecastPath}
            fill="none"
            stroke="currentColor"
            strokeDasharray="7 7"
            strokeOpacity="0.58"
            strokeWidth="3"
          />
        ) : null}
        {projected.map((point) => (
          <circle
            key={`${point.label}-${point.kind}`}
            cx={point.x}
            cy={point.y}
            fill={point.kind === "forecast" ? "var(--accent-strong)" : "var(--accent)"}
            r={point.kind === "forecast" ? 4 : 4.5}
          />
        ))}
      </svg>
      <div className="mini-chart-labels">
        {points.map((point) => (
          <span key={`${point.label}-${point.kind}`}>{point.label}</span>
        ))}
      </div>
    </div>
  );
}

function buildReportSectionsForUi(
  anomaly: Anomaly,
  incident: Incident,
  completedTasks: number,
  locale: Locale,
): ReportSection[] {
  const deltaIndex = anomaly.methaneDeltaPpb ?? 0;
  const requestCount = anomaly.nightThermalHits72h ?? anomaly.thermalHits72h ?? 0;

  if (locale === "ru") {
    return [
      {
        title: "Что произошло",
        body: `${translateAssetName(anomaly.assetName, locale)} в районе ${anomaly.verificationArea ?? translateRegion(anomaly.region, locale)} вышел за базовый профиль на ${deltaIndex.toFixed(1)} пункта (${anomaly.methaneDeltaPct.toFixed(1)}%). С кейсом уже связано ${requestCount} обращений или подтверждений от смежных контуров.`,
      },
      {
        title: "Кто отвечает",
        body: `${translateOwner(incident.owner, locale)} ведёт этот кейс с приоритетом ${incident.priority} и сроком реакции ${translateWindow(incident.verificationWindow, locale).toLowerCase()}.`,
      },
      {
        title: "Как идет исполнение",
        body: `Выполнено ${completedTasks} из ${incident.tasks.length} задач. Следующий шаг: ${translateRecommendedAction(anomaly.recommendedAction, locale).toLowerCase()}.`,
      },
    ];
  }

  return [
    {
      title: "What happened",
      body: `${translateAssetName(anomaly.assetName, locale)} in ${anomaly.verificationArea ?? translateRegion(anomaly.region, locale)} is above baseline by ${deltaIndex.toFixed(1)} points (${anomaly.methaneDeltaPct.toFixed(1)}%) with ${requestCount} linked requests or confirmations.`,
    },
    {
      title: "Who owns the case",
      body: `${translateOwner(incident.owner, locale)} owns this case under ${incident.priority} priority with a ${translateWindow(incident.verificationWindow, locale).toLowerCase()} response window.`,
    },
    {
      title: "How execution is progressing",
      body: `${completedTasks} of ${incident.tasks.length} tasks are complete. Next step: ${anomaly.recommendedAction}.`,
    },
  ];
}

function formatPotentialImpact(anomaly: Anomaly, locale: Locale, emptyLabel: string) {
  if (anomaly.co2eTonnes === undefined) {
    return emptyLabel;
  }

  return `${formatMetricNumber(anomaly.co2eTonnes, locale)} tCO2e`;
}

function formatMethaneUplift(anomaly: Anomaly, locale: Locale, emptyLabel: string) {
  if (anomaly.methaneDeltaPpb === undefined) {
    return emptyLabel;
  }

  return `${formatMetricNumber(anomaly.methaneDeltaPpb, locale)} п. / ${formatMetricNumber(anomaly.methaneDeltaPct, locale)}%`;
}

function formatThermalContext(
  anomaly: Anomaly,
  locale: Locale,
  labels: (typeof liveSignalCopy)[Locale],
) {
  const hits = anomaly.nightThermalHits72h ?? anomaly.thermalHits72h;
  if (hits === undefined) {
    return labels.notAvailable;
  }
  if (hits === 0) {
    return labels.noThermalContext;
  }
  return `${hits} ${labels.detections}`;
}

function formatPpb(value: number | undefined, emptyLabel: string, locale: Locale) {
  if (value === undefined) {
    return emptyLabel;
  }

  return `${formatMetricNumber(value, locale)} балла`;
}

function formatDelta(snapshot: ScreeningEvidenceSnapshot, emptyLabel: string, locale: Locale) {
  if (snapshot.deltaAbsPpb === undefined && snapshot.deltaPct === undefined) {
    return emptyLabel;
  }

  const unit = "п.";
  const absPart =
    snapshot.deltaAbsPpb === undefined ? "" : `${formatMetricNumber(snapshot.deltaAbsPpb, locale)} ${unit}`;
  const pctPart = snapshot.deltaPct === undefined ? "" : `${formatMetricNumber(snapshot.deltaPct, locale)}%`;

  if (absPart && pctPart) {
    return `${absPart} / ${pctPart}`;
  }

  return absPart || pctPart;
}

type CoordinateLinks = {
  googleMaps: string;
  twoGis: string;
};

function formatBusinessValueTitle(queueCount: number, locale: Locale) {
  if (locale === "ru") {
    if (queueCount <= 0) return "Очередь рисков пока пуста";
    if (queueCount === 1) return "1 риск готов к разбору";
    return `${queueCount} рисков готовы к разбору`;
  }

  if (queueCount <= 0) return "The review queue is empty for now";
  if (queueCount === 1) return "1 suspected zone is ready for field review";
  return `${queueCount} suspected zones are ready for field review`;
}

function buildCoordinateLinks(anomaly: Anomaly): CoordinateLinks | null {
  const latitude = Number(anomaly.latitude);
  const longitude = Number(anomaly.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const lat = latitude.toFixed(6);
  const lng = longitude.toFixed(6);

  return {
    googleMaps: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    twoGis: `https://2gis.kz/search/${lat},${lng}?m=${lng},${lat}/16`,
  };
}

function formatMetricNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function normalizeInfoValue(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="metric-card">
      <FieldLabel hint={hint} label={label} />
      <strong>{value}</strong>
    </article>
  );
}

function InfoRow({
  label,
  value,
  hint,
  className,
  actions,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <article className={className ? `info-row ${className}` : "info-row"}>
      <FieldLabel hint={hint} label={label} />
      <strong>{value}</strong>
      {actions ? <div className="info-row-actions">{actions}</div> : null}
    </article>
  );
}

function CoordinateActionLinks({
  links,
  labels,
}: {
  links: CoordinateLinks;
  labels: {
    title: string;
    googleMaps: string;
    twoGis: string;
  };
}) {
  return (
    <div className="map-app-links">
      <span className="map-app-links-title">{labels.title}</span>
      <div className="map-app-links-row">
        <MapAppLink href={links.googleMaps} label={labels.googleMaps}>
          <img
            alt=""
            className="map-app-image"
            decoding="async"
            height="28"
            loading="lazy"
            src="/icons/google-maps-official.png"
            width="28"
          />
        </MapAppLink>
        <MapAppLink href={links.twoGis} label={labels.twoGis}>
          <img
            alt=""
            className="map-app-image"
            decoding="async"
            height="28"
            loading="lazy"
            src="/icons/2gis-official.png"
            width="28"
          />
        </MapAppLink>
      </div>
    </div>
  );
}

function MapAppLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <a
      aria-label={label}
      className="info-row-link map-app-link"
      href={href}
      rel="noreferrer"
      target="_blank"
      title={label}
    >
      <span aria-hidden="true" className="map-app-icon">
        {children}
      </span>
      <span className="sr-only">{label}</span>
    </a>
  );
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="label-line">
      <span>{label}</span>
      {hint ? <HelpHint text={hint} /> : null}
    </span>
  );
}

function HelpHint({ text }: { text: string }) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [popoverLayout, setPopoverLayout] = useState({
    left: 12,
    top: 0,
    width: 280,
    placement: "bottom" as "top" | "bottom",
  });

  const isOpen = isHovered || isFocused || isPinned;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || !buttonRef.current || typeof window === "undefined") return;

    const updatePosition = () => {
      if (!buttonRef.current) return;

      const rect = buttonRef.current.getBoundingClientRect();
      const width = Math.min(280, Math.max(window.innerWidth - 24, 180));
      const left = Math.min(
        Math.max(rect.left + rect.width / 2 - width / 2, 12),
        window.innerWidth - width - 12,
      );
      const placeAbove = rect.bottom + 170 > window.innerHeight && rect.top > 150;

      setPopoverLayout({
        left,
        top: placeAbove ? rect.top : rect.bottom,
        width,
        placement: placeAbove ? "top" : "bottom",
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  return (
    <>
      <button
        aria-expanded={isOpen}
        aria-label={text}
        className="help-hint"
        onBlur={() => {
          setIsFocused(false);
          setIsPinned(false);
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsPinned((current) => !current);
        }}
        onFocus={() => setIsFocused(true)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            setIsPinned(false);
            setIsFocused(false);
            buttonRef.current?.blur();
          }
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        ref={buttonRef}
        type="button"
      >
        <QuestionIcon />
      </button>
      {isMounted && isOpen
        ? createPortal(
            <span
              className={`help-popover help-popover-${popoverLayout.placement}`}
              role="tooltip"
              style={{
                left: `${popoverLayout.left}px`,
                top: `${popoverLayout.top}px`,
                width: `${popoverLayout.width}px`,
              }}
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}

function TaskRow({
  task,
  locale,
  busy,
  onComplete,
}: {
  task: IncidentTask;
  locale: Locale;
  busy: boolean;
  onComplete: () => void;
}) {
  const t = copy[locale];

  return (
    <article className={`task-row ${task.status === "done" ? "task-row-done" : ""}`}>
      <div>
        <span>{translateOwner(task.owner, locale)}</span>
        <strong>{translateTaskTitle(task.title, locale)}</strong>
        <p className="task-row-note">{task.notes}</p>
      </div>
      <div className="task-row-side">
        <small>{formatHours(task.etaHours, locale)}</small>
        <button
          className="secondary-button"
          disabled={task.status === "done" || busy}
          onClick={onComplete}
          type="button"
        >
          {task.status === "done"
            ? t.actions.completed
            : busy
              ? t.actions.saving
              : t.actions.markDone}
        </button>
      </div>
    </article>
  );
}

function EmptyStage({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="empty-stage">
      <strong>{title}</strong>
      <p>{subtitle}</p>
    </div>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 6.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 0 0 0-11Zm0-4a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 12 2.5Zm0 16a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75Zm9.5-6.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5a.75.75 0 0 1 .75.75Zm-16 0a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5a.75.75 0 0 1 .75.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M14.82 2.74a.75.75 0 0 1 .81.96A8.5 8.5 0 1 0 20.3 14.36a.75.75 0 0 1 .96.81A10 10 0 1 1 14.82 2.74Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M6.7 9.7a.75.75 0 0 1 1.06 0L12 13.94l4.24-4.24a.75.75 0 1 1 1.06 1.06l-4.77 4.77a.75.75 0 0 1-1.06 0L6.7 10.76a.75.75 0 0 1 0-1.06Z"
        fill="currentColor"
      />
    </svg>
  );
}

function QuestionIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 3.25a8.75 8.75 0 1 0 0 17.5a8.75 8.75 0 0 0 0-17.5Zm0 14.2a1.05 1.05 0 1 1 0 2.1a1.05 1.05 0 0 1 0-2.1Zm1.52-4.9-.5.34c-.72.49-.97.84-.97 1.61v.33h-1.6v-.43c0-1.25.43-1.93 1.46-2.64l.58-.39c.57-.39.83-.77.83-1.3c0-.87-.67-1.43-1.66-1.43c-1.05 0-1.72.6-1.8 1.63H8.22c.1-1.96 1.6-3.08 3.46-3.08c2 0 3.35 1.15 3.35 2.87c0 1.02-.47 1.82-1.51 2.54Z"
        fill="currentColor"
      />
    </svg>
  );
}
