"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnomalyMap } from "../components/anomaly-map";
import { SignalMap, type SignalMapPoint } from "../components/signal-map";
import {
  type DashboardHydrationState,
  createUnavailableDashboardState,
  loadDashboardState,
} from "../lib/api";
import type { Anomaly } from "../lib/dashboard-types";
import {
  type AlmatyAirMapSnapshot,
  type AlmatyAirSnapshot,
  type CrimeIncidentSnapshot,
  type CrimeMonitorSnapshot,
  type HealthAlertSnapshot,
  loadAlmatyAirMapSnapshot,
  loadAlmatyAirSnapshot,
  loadCrimeMonitorSnapshot,
  loadHealthAlertSnapshot,
  loadTrafficJamSnapshot,
  type TrafficJamSnapshot,
} from "../lib/city-signals";
import { POTHOLES, type PotholeSeverity } from "../lib/potholes-data";
import type {
  AiAssistantResponse,
  AiAssistantSummary,
  AiModuleContext,
  AiSeverity,
} from "../lib/ai-assistant";

// ─── Feature types ─────────────────────────────────────────────────────────────
type FeatureId =
  | "ch4-map"
  | "cv-accidents"
  | "air-quality"
  | "risk-workflow"
  | "forecast-center"
  | "report-studio";

type Feature = {
  id: FeatureId;
  icon: string;
  short: string;
  label: string;
  overview: string;
  help: string;
  badge?: string;
  color: string;
};

const FEATURES: Feature[] = [
  {
    id: "ch4-map",
    icon: "◉",
    short: "CH4",
    label: "CH4 карта",
    overview: "Спутниковый контур утечек и flare-событий.",
    help: "Live screening слой CH4: отклонение от базового уровня, приоритетные точки и зоны для первичной проверки.",
    badge: "LIVE",
    color: "#4f8cff",
  },
  {
    id: "cv-accidents",
    icon: "◎",
    short: "CV",
    label: "Computer Vision ДТП",
    overview: "Подключённый CV-контур трафика, пробок и детекций транспорта.",
    help: "Модуль читает реальный output из trafficjams: jam score, плотность потока и детекции транспорта по YOLOv8.",
    badge: "AI",
    color: "#ff8c52",
  },
  {
    id: "air-quality",
    icon: "◌",
    short: "AQI",
    label: "Воздух Алматы",
    overview: "Live AQI Алматы, PM2.5/PM10 и health-риск для города.",
    help: "Модуль читает реальный AIR API по Алматы, карту станций и связывает качество воздуха с транспортной нагрузкой.",
    badge: "LIVE",
    color: "#57d18e",
  },
  {
    id: "risk-workflow",
    icon: "◇",
    short: "SAFE",
    label: "Безопасность",
    overview: "Crime-контур по камерам: драки, ссоры, видео и статус реагирования.",
    help: "Модуль безопасности показывает зафиксированные драки и ссоры, карту инцидентов, живое видео и готовность патрульных экипажей.",
    badge: "LIVE",
    color: "#b289ff",
  },
  {
    id: "forecast-center",
    icon: "⬣",
    short: "ЯМЫ",
    label: "Дорожные ямы",
    overview: "Карта дорожных ям, фотофиксация и ремонтный приоритет по Алматы.",
    help: "Модуль показывает зафиксированные дорожные ямы, их тяжесть, адрес и приоритет ремонта. Рекомендации и оценку бюджета выносит AI rail.",
    color: "#ff7d5c",
  },
  {
    id: "report-studio",
    icon: "▣",
    short: "REP",
    label: "Отчёты и качество",
    overview: "Экспорт сводок и контроль данных.",
    help: "Report Studio собирает короткие сводки, расширенные отчёты и показывает, насколько качественно заполнен набор данных.",
    color: "#ffd05a",
  },
];

const FAQ_ITEMS = [
  {
    id: "platform",
    question: "Что это за платформа?",
    answer:
      "Это Smart City Management для Алматы: один экран, где город видит CH4, ДТП, воздух, безопасность, дорожные дефекты и отчётный контур.",
  },
  {
    id: "state",
    question: "Чем это полезно государству?",
    answer:
      "Акимат получает не просто аналитику, а рабочий слой принятия решений: где проблема, кто отвечает, что делать дальше и какой пакет уже готов для руководства.",
  },
  {
    id: "modules",
    question: "Почему здесь 6 отдельных модулей?",
    answer:
      "Потому что это не один узкий дашборд, а полноценный городской command center: экология, трафик, воздух, безопасность, дорожные дефекты и отчёты.",
  },
  {
    id: "assistant",
    question: "Что будет делать AI Assistant?",
    answer:
      "Он объясняет по районам, управленческих рекомендаций и генерации коротких отчётов.",
  },
  {
    id: "demo",
    question: "Данные на экране реальные?",
    answer:
      "Воздух идёт из live AIR API по Алматы, CH4 — из live Earth Engine screening при поднятом backend, trafficjams читает реальный CV snapshot. Часть workflow-карточек остаётся операционным слоем интерфейса.",
  },
] as const;

// ─── Chat types ─────────────────────────────────────────────────────────────────
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts: Date;
};

const WHO_PM25_GUIDELINE = 15;

type HealthInsight = {
  severity: AiSeverity;
  title: string;
  summary: string;
  actions: string[];
  color: string;
};

function getAqiState(aqi: number) {
  if (aqi <= 50) {
    return { label: "Хорошо", color: "#4ade80", severity: "Низкая" as AiSeverity };
  }
  if (aqi <= 100) {
    return { label: "Умеренно", color: "#ffcf70", severity: "Средняя" as AiSeverity };
  }
  if (aqi <= 150) {
    return { label: "Вредно для чувствительных групп", color: "#ff9f3d", severity: "Высокая" as AiSeverity };
  }
  return { label: "Вредно для здоровья", color: "#ff5c4d", severity: "Критическая" as AiSeverity };
}

function getTrafficState(score: number) {
  if (score >= 65) {
    return { label: "Сильная пробка", color: "#ff5c4d", severity: "Высокая" as AiSeverity };
  }
  if (score >= 40) {
    return { label: "Плотный поток", color: "#ff9f3d", severity: "Средняя" as AiSeverity };
  }
  if (score >= 20) {
    return { label: "Лёгкая нагрузка", color: "#ffd05a", severity: "Средняя" as AiSeverity };
  }
  return { label: "Свободный поток", color: "#4ade80", severity: "Низкая" as AiSeverity };
}

function humanizeTrafficClass(className: "car" | "motorcycle" | "bus" | "truck") {
  switch (className) {
    case "car":
      return "Автомобили";
    case "motorcycle":
      return "Мотоциклы";
    case "bus":
      return "Автобусы";
    default:
      return "Грузовики";
  }
}

function getTrafficClassShortLabel(className: "car" | "motorcycle" | "bus" | "truck") {
  switch (className) {
    case "car":
      return "Авто";
    case "motorcycle":
      return "Мото";
    case "bus":
      return "Автобус";
    default:
      return "Груз";
  }
}

function formatAlmatyTime(value?: string) {
  if (!value) {
    return "нет данных";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "нет данных";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Almaty",
  }).format(date);
}

function formatSignedPercent(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "нет данных";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatSignedPpb(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "нет данных";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} ppb`;
}

function getPm25State(pm25: number) {
  if (pm25 >= 55) {
    return { label: "Очень высокий", color: "#ff5c4d" };
  }
  if (pm25 >= 35) {
    return { label: "Высокий", color: "#ff9f3d" };
  }
  if (pm25 >= WHO_PM25_GUIDELINE) {
    return { label: "Выше ориентира", color: "#ffd05a" };
  }
  return { label: "Ниже ориентира", color: "#4ade80" };
}

type TrafficMonitoringPoint = SignalMapPoint & {
  mode: "live" | "pilot";
};

function clampTrafficScore(value: number) {
  return Math.max(34, Math.min(99, Math.round(value)));
}

function buildTrafficMonitoringPoints(
  trafficSnapshot: TrafficJamSnapshot | null,
  updatedAt: string,
): TrafficMonitoringPoint[] {
  const jamScore = clampTrafficScore(trafficSnapshot?.jam.score ?? 76);
  const totalCount = trafficSnapshot?.totalCount ?? 8;
  const densityPct = Math.round((trafficSnapshot?.density ?? 0.18) * 100);
  const liveColor = getTrafficState(jamScore).color;

  return [
    {
      id: "traffic-west-corridor",
      label: "Западный коридор",
      latitude: 43.236,
      longitude: 76.792,
      value: `${clampTrafficScore(jamScore - 11)}% индекс пробки`,
      category: "Приоритетное направление",
      description: "Контроль перегруженного западного въезда.",
      color: "#ffb45a",
      mode: "pilot",
      meta: [
        { label: "Статус", value: "Плотный поток" },
        { label: "Тип", value: "Мониторинговый слот" },
      ],
    },
    {
      id: "traffic-south-arc",
      label: "Южная дуга",
      latitude: 43.201,
      longitude: 76.886,
      value: `${clampTrafficScore(jamScore - 7)}% индекс пробки`,
      category: "Приоритетное направление",
      description: "Слой перегрузки по южной магистральной дуге.",
      color: "#ff8f5c",
      mode: "pilot",
      meta: [
        { label: "Статус", value: "Высокая нагрузка" },
        { label: "Тип", value: "Мониторинговый слот" },
      ],
    },
    {
      id: "traffic-central-core",
      label: "Центральный поток",
      latitude: 43.247,
      longitude: 76.928,
      value: `${clampTrafficScore(jamScore - 5)}% индекс пробки`,
      category: "Приоритетное направление",
      description: "Приоритетный центр чтения перегруженной уличной сети.",
      color: "#ff7261",
      mode: "pilot",
      meta: [
        { label: "Статус", value: "Высокая нагрузка" },
        { label: "Тип", value: "Мониторинговый слот" },
      ],
    },
    {
      id: "traffic-north-entry",
      label: "Северный въезд",
      latitude: 43.339,
      longitude: 76.941,
      value: `${clampTrafficScore(jamScore - 8)}% индекс пробки`,
      category: "Приоритетное направление",
      description: "Наблюдение за входящим потоком по северной дуге.",
      color: "#ffd05a",
      mode: "pilot",
      meta: [
        { label: "Статус", value: "Очередь приоритета" },
        { label: "Тип", value: "Мониторинговый слот" },
      ],
    },
    {
      id: "traffic-southeast-ring",
      label: "Юго-восточный контур",
      latitude: 43.262,
      longitude: 76.996,
      value: `${clampTrafficScore(jamScore - 3)}% индекс пробки`,
      category: "Приоритетное направление",
      description: "Переходный узел для следующей камеры мониторинга.",
      color: "#9c8bff",
      mode: "pilot",
      meta: [
        { label: "Статус", value: "Высокая нагрузка" },
        { label: "Тип", value: "Мониторинговый слот" },
      ],
    },
    {
      id: "traffic-east-live",
      label: "Восточный видеоконтур",
      latitude: 43.309,
      longitude: 77.084,
      value: `${jamScore}% индекс пробки`,
      category: "Активный видеоконтур",
      description: "Рабочий узел: открывает экран live-мониторинга trafficjams с видео и детекциями.",
      color: liveColor,
      mode: "live",
      meta: [
        { label: "Машин в кадре", value: String(totalCount) },
        { label: "Плотность", value: `${densityPct}%` },
        { label: "Обновлено", value: updatedAt },
      ],
    },
  ];
}

function formatKzt(value: number) {
  return `₸ ${value.toLocaleString("ru-RU")}`;
}

function getPotholeSeverityColor(severity: PotholeSeverity) {
  switch (severity) {
    case "critical":
      return "#ef4444";
    case "high":
      return "#f97316";
    case "medium":
      return "#f59e0b";
    default:
      return "#10b981";
  }
}

function getPotholeSeverityHelp(severity: PotholeSeverity) {
  switch (severity) {
    case "critical":
      return "Глубокое повреждение покрытия. Нужен немедленный выезд ремонтной бригады.";
    case "high":
      return "Высокий риск для транспорта. Желателен ускоренный ремонт в ближайшие 48 часов.";
    case "medium":
      return "Повреждение уже влияет на движение, но допустимо плановое включение в ближайший график.";
    default:
      return "Низкая степень тяжести. Достаточно повторной проверки и планового ремонта.";
  }
}

function getPotholeStats() {
  const total = POTHOLES.length;
  const critical = POTHOLES.filter((item) => item.severity === "critical").length;
  const high = POTHOLES.filter((item) => item.severity === "high").length;
  const districts = new Set(POTHOLES.map((item) => item.district)).size;
  const totalCostKzt = POTHOLES.reduce((sum, item) => sum + item.costKzt, 0);
  const topPriority = [...POTHOLES].sort((a, b) => b.priority - a.priority).slice(0, 3);
  const districtBreakdown = Object.entries(
    POTHOLES.reduce<Record<string, number>>((acc, item) => {
      acc[item.district] = (acc[item.district] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([district, count]) => ({ district, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total,
    critical,
    high,
    districts,
    totalCostKzt,
    topPriority,
    districtBreakdown,
  };
}

function buildPotholeMapPoints(): SignalMapPoint[] {
  return POTHOLES.map((pothole) => ({
    id: `pothole-${pothole.id}`,
    label: pothole.name,
    latitude: pothole.lat,
    longitude: pothole.lng,
    value: pothole.severityLabel,
    category: pothole.district,
    description: `${pothole.address} · ${pothole.depthLabel}`,
    color: pothole.color,
    meta: [
      { label: "Адрес", value: pothole.address },
      { label: "Глубина", value: pothole.depthLabel },
      { label: "Дата", value: pothole.date },
      { label: "Приоритет", value: `${pothole.priority}%` },
    ],
  }));
}

function getCrimeSeverityColor(severity: CrimeIncidentSnapshot["severity"]) {
  switch (severity) {
    case "critical":
      return "#ef4444";
    case "high":
      return "#f97316";
    default:
      return "#f59e0b";
  }
}

function getCrimeSeverityHelp(severity: CrimeIncidentSnapshot["severity"]) {
  switch (severity) {
    case "critical":
      return "Критический инцидент: есть высокий риск повторной эскалации или уже доступно видео для оперативного разбора.";
    case "high":
      return "Высокий приоритет: инцидент требует быстрого выезда патруля и проверки видеодоказательств.";
    default:
      return "Средний приоритет: ситуацию нужно зафиксировать и поставить в контроль повторного наблюдения.";
  }
}

function getPatrolStatusTone(status: "available" | "responding" | "busy") {
  switch (status) {
    case "available":
      return {
        color: "#4ade80",
        background: "rgba(74, 222, 128, 0.16)",
        border: "rgba(74, 222, 128, 0.22)",
      };
    case "responding":
      return {
        color: "#f59e0b",
        background: "rgba(245, 158, 11, 0.16)",
        border: "rgba(245, 158, 11, 0.22)",
      };
    default:
      return {
        color: "#94a3b8",
        background: "rgba(148, 163, 184, 0.16)",
        border: "rgba(148, 163, 184, 0.2)",
      };
  }
}

function buildCrimeMapPoints(crimeSnapshot: CrimeMonitorSnapshot | null): SignalMapPoint[] {
  return (crimeSnapshot?.incidents ?? []).map((incident) => ({
    id: `crime-${incident.id}`,
    label: incident.name,
    latitude: incident.latitude,
    longitude: incident.longitude,
    value: incident.severityLabel,
    category: incident.district,
    description: `${incident.address} · ${incident.time}`,
    color: incident.color,
    meta: [
      { label: "Тип", value: incident.type },
      { label: "Статус", value: incident.responseStatus },
      { label: "Участники", value: incident.participants },
      { label: "Камера", value: incident.cameraLabel },
    ],
  }));
}

function buildHealthInsight(
  airSnapshot: AlmatyAirSnapshot | null,
  trafficSnapshot: TrafficJamSnapshot | null,
): HealthInsight {
  const aqi = airSnapshot?.aqiAvg ?? 0;
  const pm25 = airSnapshot?.pm25Avg ?? 0;
  const jamScore = trafficSnapshot?.jam.score ?? 0;

  if ((aqi >= 150 || pm25 >= 55) && jamScore >= 65) {
    return {
      severity: "Критическая",
      title: "Критический риск для чувствительных групп",
      summary:
        "Высокое загрязнение воздуха совпадает с сильной пробкой. Для детей, пожилых и людей с астмой это повышает риск ухудшения самочувствия рядом с магистралями.",
      actions: [
        "Предупредить школы, детсады и поликлиники: сократить время детей и пожилых на улице.",
        "Рекомендовать респираторы FFP2/N95 при необходимости выхода возле перегруженных дорог.",
        "Сразу разгрузить проблемные участки и усилить мониторинг рядом с жилыми кварталами.",
      ],
      color: "#ff5c4d",
    };
  }

  if ((aqi >= 100 || pm25 >= 35) && jamScore >= 40) {
    return {
      severity: "Высокая",
      title: "Риск для детей и пожилых повышен",
      summary:
        "Воздух уже вышел в нездоровый диапазон для чувствительных групп, а плотный трафик усиливает выхлопы у дороги.",
      actions: [
        "Вынести предупреждение: детям, пожилым и людям с астмой сократить время на улице.",
        "При необходимости выхода рекомендовать маски FFP2/N95 рядом с магистралями.",
        "Снизить нагрузку на перегруженных участках и проверить режимы светофоров.",
      ],
      color: "#ff9f3d",
    };
  }

  if (aqi >= 100 || pm25 >= 35) {
    return {
      severity: "Высокая",
      title: "Воздух требует управленческой реакции",
      summary:
        "Основной риск сейчас даёт воздух: PM2.5 и AQI уже выше комфортного диапазона, поэтому уязвимые группы стоит беречь в первую очередь.",
      actions: [
        "Предупредить жителей о росте загрязнения и ограничить долгие активности на улице для чувствительных групп.",
        "Рекомендовать маски FFP2/N95 возле дорог и в часы пика.",
        "Усилить полевой мониторинг около школ, больниц и жилых магистралей.",
      ],
      color: "#ff9f3d",
    };
  }

  if (aqi > 50 || jamScore >= 20) {
    return {
      severity: "Средняя",
      title: "Ситуация под наблюдением",
      summary:
        "Пока это не аварийный режим, но воздух и трафик уже требуют наблюдения, чтобы не допустить ухудшения в часы пик.",
      actions: [
        "Проверять пиковые интервалы и держать готовыми предупредительные сообщения для жителей.",
        "Следить за маршрутами около школ и медучреждений.",
        "Сверять воздух и jam score в одном контуре перед эскалацией.",
      ],
      color: "#ffd05a",
    };
  }

  return {
    severity: "Низкая",
    title: "Острых health-рисков сейчас не видно",
    summary:
      "Текущий уровень воздуха и дорожной нагрузки не указывает на острый риск, но мониторинг нужно продолжать.",
    actions: [
      "Продолжать фоновый мониторинг воздуха и трафика.",
      "Проверять утренние и вечерние пики отдельно.",
      "Обновлять сводку без дополнительных ограничений для жителей.",
    ],
    color: "#4ade80",
  };
}

function buildAiModuleContext(
  featureId: FeatureId,
  dashboardState: DashboardHydrationState,
  airSnapshot: AlmatyAirSnapshot | null,
  trafficSnapshot: TrafficJamSnapshot | null,
  crimeSnapshot: CrimeMonitorSnapshot | null,
): AiModuleContext {
  const feature = FEATURES.find((item) => item.id === featureId) ?? FEATURES[0];
  const leadAnomaly = dashboardState.anomalies[0];
  const ch4Delta = formatSignedPercent(leadAnomaly?.methaneDeltaPct);
  const monitoringZones = new Set(dashboardState.anomalies.map((item) => item.region)).size;
  const anomalyCount = dashboardState.anomalies.length;
  const openIncidents = Object.keys(dashboardState.incidents).length;
  const airState = getAqiState(airSnapshot?.aqiAvg ?? 0);
  const trafficState = getTrafficState(trafficSnapshot?.jam.score ?? 0);
  const healthInsight = buildHealthInsight(airSnapshot, trafficSnapshot);

  switch (featureId) {
    case "ch4-map":
      return {
        featureId,
        featureLabel: feature.label,
        overview: feature.overview,
        defaultSeverity: "Высокая",
        severityReasonHint:
          "Отклонение CH4 уже выше локального фона и требует приоритетной проверки.",
        metrics: [
          {
            label: "Аномалий в срезе",
            value: String(anomalyCount),
            detail: "Точки отклонения, попавшие в рабочий screening слой.",
          },
          {
            label: "Отклонение к базе",
            value: ch4Delta,
            detail: "Насколько текущий CH4 выше базового уровня по зоне.",
          },
          {
            label: "Зон мониторинга",
            value: String(monitoringZones || dashboardState.anomalies.length || 0),
            detail: "Сколько регионов сейчас попало в live screening очередь.",
          },
          {
            label: "Последнее обновление",
            value: formatAlmatyTime(leadAnomaly?.detectedAt),
            detail: "Время последней live-сцены, попавшей в очередь.",
          },
        ],
        findings: [
          `${leadAnomaly?.verificationArea ?? leadAnomaly?.region ?? "Kazakhstan screening window"} показывает отклонение CH4 на ${ch4Delta} к базовому профилю.`,
          `${anomalyCount} точек уже попали в screening-очередь и требуют проверки.`,
          "Контур работает как screening and prioritization layer: он показывает, где проверять в первую очередь.",
        ],
        recommendedFocus: [
          "Подтвердить приоритетную зону и сверить спутниковый сигнал с полевыми данными.",
          "Поднять кейс в incident workflow, если отклонение сохраняется.",
          "Подготовить короткий отчёт по зоне, owner и статусу проверки.",
        ],
        crossModuleSignals: [
          "Если рост CH4 совпадает с инфраструктурным инцидентом или жалобами, кейс нужно переводить в risk queue и отчётный контур.",
          "Сводка полезна не сама по себе, а как вход в приоритизацию выездных действий.",
        ],
      };
    case "cv-accidents":
      const trafficScore = Math.round(trafficSnapshot?.jam.score ?? 0);
      const trafficDensity = Math.round((trafficSnapshot?.density ?? 0) * 100);
      const trafficUpdatedAt = formatAlmatyTime(trafficSnapshot?.updatedAt);
      const totalVehicles = trafficSnapshot?.totalCount ?? 0;
      return {
        featureId,
        featureLabel: feature.label,
        overview: feature.overview,
        defaultSeverity: trafficState.severity,
        severityReasonHint:
          trafficScore >= 65
            ? "CV-контур уже фиксирует сильную пробку и требует быстрой координации трафика."
            : "Транспортный контур нужно держать под наблюдением, чтобы не допустить эскалации в часы пик.",
        metrics: [
          {
            label: "Машин в кадре",
            value: String(totalVehicles),
            detail: "Сколько транспортных объектов детектор видит в последнем snapshot.",
          },
          {
            label: "Jam score",
            value: `${trafficScore}%`,
            detail: "Итоговый балл перегрузки из trafficjams.",
          },
          {
            label: "Плотность",
            value: `${trafficDensity}%`,
            detail: "Какая доля кадра занята транспортом.",
          },
          {
            label: "Обновлено",
            value: trafficUpdatedAt,
            detail: "Время последнего snapshot из CV-модуля.",
          },
        ],
        findings: [
          `Подключённый CV-контур показывает: ${trafficState.label.toLowerCase()} и jam score ${trafficScore}%.`,
          totalVehicles > 0
            ? `В последнем snapshot детектор увидел ${totalVehicles} транспортных объектов и плотность ${trafficDensity}% кадра.`
            : "Детектор подключён, но свежий snapshot по транспорту пока не пришёл.",
          "Этот модуль уже можно использовать как реальный сигнал по транспортной перегрузке и координации служб.",
        ],
        recommendedFocus: [
          "Подтвердить перегруженный участок и сверить его со схемой движения и фазами светофоров.",
          "При jam score выше порога быстро передать сигнал в транспортный штаб и 112.",
          "Сопоставить пробку с экологическим модулем, если воздух по магистрали тоже ухудшается.",
        ],
        crossModuleSignals: [
          "Плотный поток увеличивает выхлопы у дороги, поэтому пробки и качество воздуха должны читаться вместе.",
          "Транспортный сигнал можно переводить в risk queue как межмодульный кейс, если он повторяется или влияет на здоровье жителей.",
        ],
      };
    case "air-quality":
      const aqiValue = Math.round(airSnapshot?.aqiAvg ?? 0);
      const pm25Value = airSnapshot?.pm25Avg ?? 0;
      const pm10Value = airSnapshot?.pm10Avg ?? 0;
      const stationsTotal = airSnapshot?.stationsTotal ?? 0;
      const pm25Multiple = pm25Value > 0 ? (pm25Value / WHO_PM25_GUIDELINE).toFixed(1) : "0.0";
      return {
        featureId,
        featureLabel: feature.label,
        overview: feature.overview,
        defaultSeverity: healthInsight.severity,
        severityReasonHint: healthInsight.summary,
        metrics: [
          {
            label: "AQI Алматы",
            value: String(aqiValue),
            detail: "Текущий городской AQI из AIR API по Алматы.",
          },
          {
            label: "PM2.5",
            value: pm25Value > 0 ? `${pm25Value.toFixed(1)} µg/m³` : "нет данных",
            detail: "Средняя концентрация мелких частиц по городу.",
          },
          {
            label: "PM10",
            value: pm10Value > 0 ? `${pm10Value.toFixed(1)} µg/m³` : "нет данных",
            detail: "Средняя концентрация PM10 по городу.",
          },
          {
            label: "Станций",
            value: String(stationsTotal),
            detail: "Сколько станций вошло в текущую городскую сводку.",
          },
        ],
        findings: [
          `AIR API по Алматы сейчас показывает AQI ${aqiValue}: ${airState.label.toLowerCase()}.`,
          pm25Value > 0
            ? `PM2.5 сейчас ${pm25Value.toFixed(1)} µg/m³, это примерно ${pm25Multiple}× от ориентира ВОЗ 15 µg/m³.`
            : "Свежего значения PM2.5 сейчас нет, но модуль продолжает опрашивать live-источник.",
          healthInsight.summary,
        ],
        recommendedFocus: healthInsight.actions,
        crossModuleSignals: [
          trafficSnapshot
            ? `Транспортный модуль сейчас даёт ${trafficState.label.toLowerCase()} и jam score ${Math.round(trafficSnapshot.jam.score)}%, что усиливает уличный выхлоп на магистралях.`
            : "Экологическая сводка становится полезнее, когда читается вместе с транспортной нагрузкой по магистралям.",
          "Воздух не должен жить отдельно: его нужно связывать с пробками, risk queue и городскими предупреждениями.",
        ],
      };
    case "risk-workflow":
      const crimeIncidents = crimeSnapshot?.incidents ?? [];
      const criticalCrimeCount = crimeIncidents.filter((incident) => incident.severity === "critical").length;
      const highCrimeCount = crimeIncidents.filter((incident) => incident.severity === "high").length;
      const videoCrimeCount = crimeIncidents.filter((incident) => incident.hasVideo).length;
      const leadCrimeIncident = crimeIncidents[0];
      return {
        featureId,
        featureLabel: feature.label,
        overview: feature.overview,
        defaultSeverity: criticalCrimeCount > 0 ? "Критическая" : "Высокая",
        severityReasonHint:
          criticalCrimeCount > 0
            ? "Есть инцидент с доступным видео и высоким риском эскалации, поэтому контур безопасности требует немедленного разбора."
            : "Несколько инцидентов уже требуют выезда и проверки видеоканалов, поэтому модуль остаётся в высоком приоритете.",
        metrics: [
          {
            label: "Инцидентов",
            value: String(crimeIncidents.length || 0),
            detail: "Сколько кейсов драк и ссор сейчас находится в рабочем контуре безопасности.",
          },
          {
            label: "Критических",
            value: String(criticalCrimeCount),
            detail: "Инциденты, где нужен самый быстрый разбор и подтверждение материалов.",
          },
          {
            label: "С видео",
            value: String(videoCrimeCount),
            detail: "Сколько кейсов уже имеют доступный видеофрагмент для просмотра.",
          },
          {
            label: "Пиковое окно",
            value: crimeSnapshot?.peakWindow ?? "нет данных",
            detail: "Интервал суток, где риск драк и ссор сейчас самый высокий.",
          },
        ],
        findings: [
          leadCrimeIncident
            ? `${leadCrimeIncident.name} в ${leadCrimeIncident.district} остаётся главным кейсом по приоритету для штаба безопасности.`
            : "Контур безопасности ждёт первый загруженный инцидент из backend API.",
          `${highCrimeCount + criticalCrimeCount} кейсов уже требуют ускоренного реагирования и проверки городских камер.`,
          "Модуль безопасности соединяет карту, видео и готовность патрулей в единый городской operational workflow.",
        ],
        recommendedFocus: [
          "Подтвердить критический кейс с видео и зафиксировать ответственный экипаж.",
          "Усилить патрулирование в районах, где сигналы повторяются в вечернее окно.",
          "Передать AI rail сводку по районам и краткий отчёт для оперативного штаба.",
        ],
        crossModuleSignals: [
          "Контур безопасности нужно читать вместе с транспортом: перегруженные узлы и ночные пики повышают риск конфликтов у ТЦ, метро и остановок.",
          "AI Assistant может сразу перевести карту инцидентов и видео в короткие управленческие рекомендации по районам.",
        ],
      };
    case "forecast-center":
      const potholeStats = getPotholeStats();
      const topDistricts = potholeStats.districtBreakdown.slice(0, 2).map((item) => item.district).join(" и ");
      const topPothole = potholeStats.topPriority[0];
      return {
        featureId,
        featureLabel: feature.label,
        overview: feature.overview,
        defaultSeverity: potholeStats.critical > 0 ? "Высокая" : "Средняя",
        severityReasonHint:
          potholeStats.critical > 0
            ? `Есть ${potholeStats.critical} критические ямы, поэтому ремонтный контур уже требует приоритетного разбора.`
            : "Критических ям нет, поэтому модуль пока в режиме приоритизации и планового ремонта.",
        metrics: [
          {
            label: "Зафиксировано ям",
            value: String(potholeStats.total),
            detail: "Сколько дорожных дефектов сейчас в рабочей карте Алматы.",
          },
          {
            label: "Критических",
            value: String(potholeStats.critical),
            detail: "Точки, где нужен самый быстрый выезд бригады.",
          },
          {
            label: "Оценка ремонта",
            value: formatKzt(potholeStats.totalCostKzt),
            detail: "Суммарный ориентир бюджета по текущему набору кейсов.",
          },
          {
            label: "Районов",
            value: String(potholeStats.districts),
            detail: "Сколько районов Алматы уже попало в ремонтный срез.",
          },
        ],
        findings: [
          `В карте уже ${potholeStats.total} дорожных ям, из них ${potholeStats.critical} критические.`,
          `Главные районы нагрузки сейчас: ${topDistricts || "Алматы в целом"}.`,
          topPothole
            ? `Самый приоритетный кейс: ${topPothole.address}, ${topPothole.severityLabel.toLowerCase()} тяжесть, бюджет ${topPothole.costLabel}.`
            : "Приоритетный кейс появится после загрузки данных.",
        ],
        recommendedFocus: [
          "Отправить бригаду на самый критический адрес и закрыть опасные ямы возле плотного трафика.",
          "Собрать недельный план ремонта по районам с наибольшим числом кейсов.",
          "Использовать AI rail для объяснения приоритета, бюджета и очередности выездов.",
        ],
        crossModuleSignals: [
          "Контур ям усиливает транспортный модуль: дефекты покрытия могут замедлять поток и ухудшать пробки.",
          "После фиксации ямы кейс можно связывать с risk queue и отчётным слоем для ремонта и контроля бюджета.",
        ],
      };
    case "report-studio":
    default:
      return {
        featureId,
        featureLabel: feature.label,
        overview: feature.overview,
        defaultSeverity: "Средняя",
        severityReasonHint:
          "Отчётный контур не аварийный сам по себе, но без него руководитель не получает зафиксированного решения.",
        metrics: [
          {
            label: "Готовых пакетов",
            value: "3",
            detail: "Собранные наборы для показа, отправки и архива.",
          },
          {
            label: "Проверок качества",
            value: "4",
            detail: "Контроль целостности данных перед экспортом.",
          },
          {
            label: "Экспортов",
            value: "PDF / DOCX",
            detail: "Форматы выходного документа.",
          },
          {
            label: "Готовность",
            value: "92%",
            detail: "Насколько пакет пригоден к выпуску без ручной доработки.",
          },
        ],
        findings: [
          "Report Studio закрывает цикл: сигнал и инцидент превращаются в формальный выходной документ.",
          "Контур качества показывает, насколько пакет данных пригоден для руководства и архива.",
          "Без этого слоя продукт выглядит как мониторинг, а не как управленческий инструмент.",
        ],
        recommendedFocus: [
          "Дотянуть ключевые кейсы до экспортируемого пакета без ручных пробелов.",
          "Сверять качество данных перед выпуском для руководства.",
          "Использовать отчёт как финальную фиксацию действий, owner и результата.",
        ],
        crossModuleSignals: [
          "Отчётный модуль нужен всем остальным контурам: без него транспорт, воздух и risk queue не дают завершённого результата.",
          "Именно он переводит аналитику в документированное решение для акимата.",
        ],
      };
  }
}

function getSeverityTone(severity: AiSeverity) {
  switch (severity) {
    case "Критическая":
      return "critical";
    case "Высокая":
      return "high";
    case "Средняя":
      return "medium";
    default:
      return "low";
  }
}

function getSeverityLabel(severity: AiSeverity) {
  switch (severity) {
    case "Критическая":
      return "Критическая срочность";
    case "Высокая":
      return "Высокая срочность";
    case "Средняя":
      return "Средняя срочность";
    default:
      return "Низкая срочность";
  }
}

function getSeverityHelp(severity: AiSeverity) {
  switch (severity) {
    case "Критическая":
      return "Критическая = нужен немедленный разбор и координация служб прямо сейчас.";
    case "Высокая":
      return "Высокая = нужен приоритетный разбор сегодня или в ближайшие часы; откладывать не стоит.";
    case "Средняя":
      return "Средняя = ситуацию уже стоит проверить и подготовить меры, но это ещё не аварийный режим.";
    default:
      return "Низкая = достаточно наблюдения и плановой проверки без срочной эскалации.";
  }
}

function getTelegramAlertTone(
  status: HealthAlertSnapshot["telegram"]["status"],
  active: boolean,
) {
  switch (status) {
    case "sent":
      return "low";
    case "cooldown":
      return "medium";
    case "failed":
      return "critical";
    case "not-configured":
      return active ? "high" : "medium";
    default:
      return active ? "high" : "low";
  }
}

function getTelegramAlertLabel(
  status: HealthAlertSnapshot["telegram"]["status"],
  active: boolean,
) {
  switch (status) {
    case "sent":
      return "Telegram отправлен";
    case "cooldown":
      return "Telegram защищён";
    case "failed":
      return "Telegram ошибка";
    case "not-configured":
      return "Telegram не подключен";
    default:
      return active ? "Alert активен" : "Наблюдение";
  }
}

// ─── Main Page ──────────────────────────────────────────────────────────────────
export default function Page() {
  const [activeFeature, setActiveFeature] = useState<FeatureId>("ch4-map");
  const [chatOpen, setChatOpen] = useState(true);
  const [selectedFaq, setSelectedFaq] = useState<string>(FAQ_ITEMS[0].id);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<AiAssistantSummary | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [airSnapshot, setAirSnapshot] = useState<AlmatyAirSnapshot | null>(null);
  const [airMapSnapshot, setAirMapSnapshot] = useState<AlmatyAirMapSnapshot | null>(null);
  const [trafficSnapshot, setTrafficSnapshot] = useState<TrafficJamSnapshot | null>(null);
  const [crimeSnapshot, setCrimeSnapshot] = useState<CrimeMonitorSnapshot | null>(null);
  const [healthAlert, setHealthAlert] = useState<HealthAlertSnapshot | null>(null);
  const [healthAlertLoading, setHealthAlertLoading] = useState(false);

  const [dashboardState, setDashboardState] = useState<DashboardHydrationState>(
    createUnavailableDashboardState(),
  );
  const [dashLoaded, setDashLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const refreshDashboard = async () => {
      try {
        const state = await loadDashboardState();
        if (!cancelled) {
          setDashboardState(state);
          setDashLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setDashLoaded(true);
        }
      }
    };

    void refreshDashboard();
    const intervalId = window.setInterval(() => {
      void refreshDashboard();
    }, 2 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refreshAir = async () => {
      const [snapshot, mapSnapshot] = await Promise.all([
        loadAlmatyAirSnapshot(),
        loadAlmatyAirMapSnapshot(),
      ]);
      if (!cancelled) {
        if (snapshot) {
          setAirSnapshot(snapshot);
        }
        if (mapSnapshot) {
          setAirMapSnapshot(mapSnapshot);
        }
      }
    };

    void refreshAir();
    const intervalId = window.setInterval(() => {
      void refreshAir();
    }, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refreshTraffic = async () => {
      const snapshot = await loadTrafficJamSnapshot();
      if (!cancelled && snapshot) {
        setTrafficSnapshot(snapshot);
      }
    };

    void refreshTraffic();
    const intervalId = window.setInterval(() => {
      void refreshTraffic();
    }, 30 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refreshCrime = async () => {
      const snapshot = await loadCrimeMonitorSnapshot();
      if (!cancelled && snapshot) {
        setCrimeSnapshot(snapshot);
      }
    };

    void refreshCrime();
    const intervalId = window.setInterval(() => {
      void refreshCrime();
    }, 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refreshHealthAlert = async () => {
      setHealthAlertLoading(true);
      try {
        const snapshot = await loadHealthAlertSnapshot();
        if (!cancelled && snapshot) {
          setHealthAlert(snapshot);
        }
      } finally {
        if (!cancelled) {
          setHealthAlertLoading(false);
        }
      }
    };

    void refreshHealthAlert();
    const intervalId = window.setInterval(() => {
      void refreshHealthAlert();
    }, 90 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [airSnapshot?.timestamp, trafficSnapshot?.updatedAt]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const anomalies = dashboardState.anomalies;
  const activeF = FEATURES.find((f) => f.id === activeFeature)!;
  const activeModuleContext = buildAiModuleContext(
    activeFeature,
    dashboardState,
    airSnapshot,
    trafficSnapshot,
    crimeSnapshot,
  );
  const liveContextVersion =
    activeFeature === "air-quality"
      ? airSnapshot?.timestamp ?? "air-none"
      : activeFeature === "cv-accidents"
        ? trafficSnapshot?.updatedAt ?? "traffic-none"
        : activeFeature === "risk-workflow"
          ? crimeSnapshot?.updatedAt ?? "crime-none"
        : "static";
  const visibleSummary =
    aiSummary ?? {
      whatIsHappening: activeModuleContext.findings.slice(0, 2).join(" "),
      severity: activeModuleContext.defaultSeverity,
      severityReason: activeModuleContext.severityReasonHint,
      recommendedActions: activeModuleContext.recommendedFocus.slice(0, 3),
      crossModuleInsight: activeModuleContext.crossModuleSignals[0],
    };
  const visibleHealthAlert = healthAlert ?? {
    active: false,
    severity: "Средняя" as const,
    title: "Health-monitoring",
    summary:
      "Cross-signal по воздуху и пробкам ещё загружается. После ответа route здесь появится живая health-сводка по Алматы.",
    reasoning:
      "Сводка строится по реальным данным AIR API и trafficjams. Если оба сигнала высокие, модуль поднимет alert-режим.",
    recommendedActions: [
      "Дождаться загрузки свежих данных.",
      "Сверить состояние воздуха и дорожной перегрузки.",
      "Проверить статус Telegram-доставки после активации alert-режима.",
    ],
    telegramMessagePreview: "Telegram preview будет доступен после первой health-сводки.",
    observedAt: new Date().toISOString(),
    metrics: {
      aqi: 0,
      pm25: 0,
      jamScore: 0,
      totalCount: 0,
      densityPct: 0,
      airUpdatedAt: "",
      trafficUpdatedAt: "",
    },
    sources: {
      air: "",
      traffic: "",
    },
    telegram: {
      status: "not-triggered" as const,
      targetLabel: null,
      note: "Ожидаем первый расчёт route.",
      sentAt: null,
    },
  };

  const requestAiAssistant = async ({
    module,
    question,
    mode,
  }: {
    module: AiModuleContext;
    question?: string;
    mode: "summary" | "chat";
  }) => {
    if (mode === "summary") {
      setSummaryLoading(true);
      setAiSummary(null);
    } else {
      setChatLoading(true);
    }
    setAiError(null);

    try {
      const response = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          module,
          question: question?.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error("AI route returned a non-success status.");
      }

      const payload = (await response.json()) as AiAssistantResponse;
      setAiSummary(payload.summary);

      if (mode === "chat") {
        const botMsg: ChatMessage = {
          id: `b-${Date.now()}`,
          role: "assistant",
          text: payload.assistantMessage,
          ts: new Date(),
        };
        setChatMessages((prev) => [...prev, botMsg]);
      }
    } catch {
      setAiError("AI сейчас недоступен. Показана базовая сводка.");
    } finally {
      if (mode === "summary") {
        setSummaryLoading(false);
      } else {
        setChatLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!dashLoaded) {
      return;
    }

    void requestAiAssistant({
      module: buildAiModuleContext(activeFeature, dashboardState, airSnapshot, trafficSnapshot, crimeSnapshot),
      mode: "summary",
    });
  }, [activeFeature, dashLoaded, dashboardState, liveContextVersion]);

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput("");

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      ts: new Date(),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    await requestAiAssistant({
      module: activeModuleContext,
      question: text,
      mode: "chat",
    });
  };

  const selectedFaqItem = FAQ_ITEMS.find((item) => item.id === selectedFaq) ?? FAQ_ITEMS[0];
  const shellStyle = {
    "--feature-color": activeF.color,
  } as CSSProperties;

  return (
    <div className="scm-shell" style={shellStyle}>
      {/* ── LEFT SIDEBAR ─────────────────────────────────────── */}
      <aside className="scm-sidebar">
        <div className="scm-sidebar-brand">
          <div className="scm-brand-dot" />
          <div>
            <strong>Smart City</strong>
            <span>Алматы</span>
          </div>
        </div>

        <nav className="scm-nav">
          {FEATURES.map((f) => (
            <button
              key={f.id}
              className={`scm-nav-item ${activeFeature === f.id ? "scm-nav-item-active" : ""}`}
              onClick={() => setActiveFeature(f.id)}
              style={{ "--feature-color": f.color } as CSSProperties}
              type="button"
            >
              <span className="scm-nav-icon">{f.icon}</span>
              <span className="scm-nav-copy">
                <span className="scm-nav-short">{f.short}</span>
                <span className="scm-nav-label">{f.label}</span>
              </span>
              {f.badge ? <span className="scm-nav-badge">{f.badge}</span> : null}
              {activeFeature === f.id ? <span className="scm-nav-indicator" /> : null}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── MAIN CONTENT ─────────────────────────────────────── */}
      <main className="scm-main">
        {/* Hero */}
        <section className="scm-hero">
          <div className="scm-hero-content">
            <div className="scm-hero-badge">
              <span className="scm-live-dot" />
              Smart City Management
              <HelpHint text="Орбита справа — это навигатор из 6 модулей платформы вокруг ядра Алматы. Каждый цветной узел означает отдельный контур, а активный модуль подсвечен сильнее." />
            </div>
            <h1 className="scm-hero-title">
              Smart City Management
              <span className="scm-hero-accent">Видеть раньше. Решать быстрее.</span>
            </h1>
            <p className="scm-hero-sub">
              Единый command center для Алматы: CH4 карта, Computer Vision ДТП,
              воздух, безопасность, дорожные ямы и отчёты на одном экране.
            </p>
            <div className="scm-hero-pill-row">
              {FEATURES.map((feature) => (
                <button
                  key={feature.id}
                  className={`scm-hero-pill ${activeFeature === feature.id ? "scm-hero-pill-active" : ""}`}
                  onClick={() => setActiveFeature(feature.id)}
                  aria-pressed={activeFeature === feature.id}
                  aria-label={`Открыть модуль ${feature.label}`}
                  type="button"
                >
                  {feature.short}
                </button>
              ))}
            </div>
            <div className="scm-hero-stats">
              <div className="scm-stat">
                <strong>6</strong>
                <span>модулей</span>
              </div>
              <div className="scm-stat">
                <strong>{anomalies.length || 6}</strong>
                <span>кейсов в срезе</span>
              </div>
              <div className="scm-stat">
                <strong>{dashLoaded ? "READY" : "LOAD"}</strong>
                <span>demo workflow</span>
              </div>
            </div>
          </div>
          <div className="scm-hero-visual">
            <HeroGlobe activeFeature={activeFeature} />
          </div>
        </section>

        {/* Feature Panel */}
        <section className="scm-feature-panel" key={activeFeature}>
          <div className="scm-feature-header">
            <span className="scm-feature-icon-lg">{activeF.icon}</span>
            <div>
              <div className="scm-title-row">
                <h2 className="scm-feature-title">{activeF.label}</h2>
                <HelpHint text={activeF.help} />
              </div>
              <p className="scm-feature-overview">{activeF.overview}</p>
              {activeF.badge ? (
                <span className="scm-feature-badge" style={{ background: activeF.color + "22", color: activeF.color }}>
                  {activeF.badge}
                </span>
              ) : null}
            </div>
          </div>

          {activeFeature === "ch4-map" && <Ch4Panel anomalies={anomalies} />}
          {activeFeature === "cv-accidents" && <CvAccidentsPanel trafficSnapshot={trafficSnapshot} />}
          {activeFeature === "air-quality" && (
            <AirQualityPanel
              airSnapshot={airSnapshot}
              airMapSnapshot={airMapSnapshot}
              trafficSnapshot={trafficSnapshot}
            />
          )}
          {activeFeature === "risk-workflow" && <RiskWorkflowPanel crimeSnapshot={crimeSnapshot} />}
          {activeFeature === "forecast-center" && <ForecastCenterPanel />}
          {activeFeature === "report-studio" && <ReportStudioPanel />}
        </section>

        <section className="scm-faq-shell">
          <div className="scm-faq-header">
            <div className="scm-title-row">
              <h2>Часто задаваемые вопросы</h2>
              <HelpHint text="Эта секция отвечает коротко и по делу: что за платформа, чем полезна городу и как читать экран без лишнего текста." />
            </div>
          </div>

          <div className="scm-faq-layout">
            <div className="scm-faq-questions">
              {FAQ_ITEMS.map((item) => (
                <button
                  key={item.id}
                  className={`scm-faq-question ${selectedFaq === item.id ? "scm-faq-question-active" : ""}`}
                  onClick={() => setSelectedFaq(item.id)}
                  type="button"
                >
                  {item.question}
                </button>
              ))}
            </div>

            <article className="scm-faq-answer">
              <span className="scm-faq-answer-badge">Ответ</span>
              <strong>{selectedFaqItem.question}</strong>
              <p>{selectedFaqItem.answer}</p>
            </article>
          </div>
        </section>
      </main>

      {/* ── RIGHT CHATBOT ─────────────────────────────────────── */}
      <aside className={`scm-chatbot ${chatOpen ? "scm-chatbot-open" : ""}`}>
        <div className="scm-chatbot-header">
          <div>
            <strong>
              AI Ассистент
              <HelpHint text="Это правый AI rail: он собирает управленческую сводку по активному модулю, оценивает срочность и предлагает действия." />
            </strong>
          </div>
          <button className="scm-chatbot-close" onClick={() => setChatOpen(false)} type="button">
            ✕
          </button>
        </div>

        <section className="scm-ai-summary">
          <div className="scm-ai-summary-head">
            <div className="scm-ai-summary-heading">
              <span className="scm-ai-summary-kicker">AI Сводка</span>
              <HelpHint text="AI делает три вещи: кратко объясняет ситуацию, показывает срочность и предлагает конкретные действия." />
            </div>
            <div className="scm-ai-summary-severity">
              <span className={`scm-ai-summary-badge scm-ai-summary-${getSeverityTone(visibleSummary.severity)}`}>
                {getSeverityLabel(visibleSummary.severity)}
              </span>
              <HelpHint text={getSeverityHelp(visibleSummary.severity)} />
            </div>
          </div>

          <div className="scm-ai-summary-block">
            <div className="scm-ai-summary-label">
              <span>Что происходит</span>
              <HelpHint text="Короткая аналитическая интерпретация входных данных по текущему модулю." />
            </div>
            <p>{summaryLoading ? "AI анализирует активный модуль..." : visibleSummary.whatIsHappening}</p>
          </div>

          <div className="scm-ai-summary-grid">
            <div className="scm-ai-summary-card">
              <div className="scm-ai-summary-label">
                <span>Срочность</span>
                <HelpHint text="Насколько срочно акимату или штабу нужно реагировать на текущую ситуацию." />
              </div>
              <strong>{getSeverityLabel(visibleSummary.severity)}</strong>
              <p>{visibleSummary.severityReason}</p>
            </div>

            <div className="scm-ai-summary-card">
              <div className="scm-ai-summary-label">
                <span>Связь с модулями</span>
                <HelpHint text="Как текущий модуль связан с другими контурами города и почему это важно для решения." />
              </div>
              <p>{visibleSummary.crossModuleInsight}</p>
            </div>
          </div>

          <div className="scm-ai-summary-block">
            <div className="scm-ai-summary-label">
              <span>Рекомендуемые действия</span>
              <HelpHint text="Три конкретных шага, которые стоит сделать штабу или государству прямо сейчас." />
            </div>
            <div className="scm-ai-actions">
              {visibleSummary.recommendedActions.map((item, index) => (
                <div className="scm-ai-action" key={`${item}-${index}`}>
                  <span>{index + 1}</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </div>

          {aiError ? <p className="scm-ai-summary-note">{aiError}</p> : null}
        </section>

        <section className="scm-health-alert-rail">
          <div className="scm-health-alert-head">
            <div className="scm-ai-summary-heading">
              <span className="scm-ai-summary-kicker">Health Alert</span>
              <HelpHint text="Этот блок связывает реальные данные воздуха Алматы и пробок. Когда PM2.5 и дорожная перегрузка растут одновременно, модуль поднимает health-alert и готовит уведомление." />
            </div>
            <div className="scm-ai-summary-severity">
              <span
                className={`scm-ai-summary-badge scm-ai-summary-${getSeverityTone(visibleHealthAlert.severity)}`}
              >
                {getSeverityLabel(visibleHealthAlert.severity)}
              </span>
              <HelpHint text="Срочность health-alert зависит от сочетания PM2.5, AQI и индекса пробки, а не от одного показателя отдельно." />
            </div>
          </div>

          <div className="scm-health-alert-title-row">
            <strong>{visibleHealthAlert.title}</strong>
            <span
              className={`scm-ai-summary-badge scm-ai-summary-${getTelegramAlertTone(
                visibleHealthAlert.telegram.status,
                visibleHealthAlert.active,
              )}`}
            >
              {getTelegramAlertLabel(visibleHealthAlert.telegram.status, visibleHealthAlert.active)}
            </span>
          </div>

          <p className="scm-health-alert-summary">
            {healthAlertLoading && !healthAlert
              ? "Health-alert анализирует воздух и пробки..."
              : visibleHealthAlert.summary}
          </p>

          <div className="scm-health-alert-metrics">
            <div className="scm-health-alert-metric">
              <span>AQI</span>
              <strong>{visibleHealthAlert.metrics.aqi || "—"}</strong>
            </div>
            <div className="scm-health-alert-metric">
              <span>PM2.5</span>
              <strong>{visibleHealthAlert.metrics.pm25 ? `${visibleHealthAlert.metrics.pm25} µg/m³` : "—"}</strong>
            </div>
            <div className="scm-health-alert-metric">
              <span>Пробка</span>
              <strong>{visibleHealthAlert.metrics.jamScore ? `${visibleHealthAlert.metrics.jamScore}%` : "—"}</strong>
            </div>
            <div className="scm-health-alert-metric">
              <span>Транспорт</span>
              <strong>{visibleHealthAlert.metrics.totalCount || "—"}</strong>
            </div>
          </div>

          <div className="scm-health-alert-card">
            <div className="scm-ai-summary-label">
              <span>Почему alert активен</span>
              <HelpHint text="Здесь объясняется логика срабатывания alert-режима и что именно система увидела в реальных данных." />
            </div>
            <p>{visibleHealthAlert.reasoning}</p>
          </div>

          <div className="scm-health-alert-card">
            <div className="scm-ai-summary-label">
              <span>Telegram</span>
              <HelpHint text="Статус доставки жителю. Для личного Telegram нужен bot token. Если chat_id не задан вручную, система попробует связать @username с private chat через getUpdates после команды /start у бота." />
            </div>
            <p>{visibleHealthAlert.telegram.note}</p>
            <div className="scm-health-alert-telegram-meta">
              <span>
                Цель: {visibleHealthAlert.telegram.targetLabel ?? "не задана"}
              </span>
              <span>
                Последняя отправка: {formatAlmatyTime(visibleHealthAlert.telegram.sentAt ?? undefined)}
              </span>
            </div>
          </div>

          <div className="scm-ai-actions">
            {visibleHealthAlert.recommendedActions.map((item, index) => (
              <div className="scm-ai-action" key={`${item}-${index}-health`}>
                <span>{index + 1}</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="scm-chatbot-messages">
          {chatMessages.map((msg) => (
            <div key={msg.id} className={`scm-chat-msg scm-chat-msg-${msg.role}`}>
              <p>{msg.text}</p>
            </div>
          ))}
          {chatLoading ? (
            <div className="scm-chat-msg scm-chat-msg-assistant">
              <div className="scm-typing">
                <span /><span /><span />
              </div>
            </div>
          ) : null}
          <div ref={chatEndRef} />
        </div>

        <div className="scm-chatbot-input-row">
          <input
            className="scm-chatbot-input"
            placeholder="Задайте вопрос по текущему модулю..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void sendChat(); }}
            type="text"
          />
          <button
            className="scm-chatbot-send"
            disabled={chatLoading || !chatInput.trim()}
            onClick={() => void sendChat()}
            type="button"
          >
            ➤
          </button>
        </div>
      </aside>

      {/* Chat FAB (mobile / collapsed) */}
      {!chatOpen && (
        <button
          className="scm-ai-fab"
          onClick={() => setChatOpen(true)}
          type="button"
          aria-label="Открыть AI ассистент"
        >
          AI
        </button>
      )}
    </div>
  );
}

// ─── Hero Globe decoration ───────────────────────────────────────────────────────
function HeroGlobe({ activeFeature }: { activeFeature: FeatureId }) {
  const orbitNodes = [
    { top: "12%", left: "50%", feature: FEATURES[0] },
    { top: "30%", left: "78%", feature: FEATURES[1] },
    { top: "68%", left: "78%", feature: FEATURES[2] },
    { top: "86%", left: "50%", feature: FEATURES[3] },
    { top: "68%", left: "22%", feature: FEATURES[4] },
    { top: "30%", left: "22%", feature: FEATURES[5] },
  ] as const;

  return (
    <div className="scm-globe-wrap">
      <div className="scm-globe">
        <div className="scm-globe-ring scm-globe-ring-1" />
        <div className="scm-globe-ring scm-globe-ring-2" />
        <div className="scm-globe-ring scm-globe-ring-3" />
        <div className="scm-globe-core">
          <strong>ALMATY</strong>
          <span>Ядро города</span>
          <HelpHint
            className="scm-globe-core-help"
            text="Это центральное ядро платформы Алматы. Вокруг него расположены 6 отдельных городских модулей управления."
          />
        </div>
        {orbitNodes.map((dot, i) => (
          <div
            key={dot.feature.id}
            className={`scm-globe-node ${dot.feature.id === activeFeature ? "scm-globe-node-active" : ""}`}
            style={{ top: dot.top, left: dot.left, "--node-color": dot.feature.color, animationDelay: `${i * 0.18}s` } as CSSProperties}
          >
            <div className="scm-globe-dot">
              <span>{dot.feature.short}</span>
            </div>
            <HelpHint
              className="scm-globe-node-help"
              text={dot.feature.help}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CH4 Panel ───────────────────────────────────────────────────────────────────
function Ch4Panel({ anomalies }: { anomalies: Anomaly[] }) {
  const [selected, setSelected] = useState(anomalies[0]?.id ?? "");
  useEffect(() => {
    if (anomalies.length === 0) {
      if (selected) {
        setSelected("");
      }
      return;
    }

    if (!anomalies.some((item) => item.id === selected)) {
      setSelected(anomalies[0].id);
    }
  }, [anomalies, selected]);

  const leadAnomaly = anomalies.find((item) => item.id === selected) ?? anomalies[0];
  const deltaValue = formatSignedPercent(leadAnomaly?.methaneDeltaPct);
  const uniqueRegions = new Set(anomalies.map((item) => item.region)).size;
  const latestObservation = formatAlmatyTime(leadAnomaly?.detectedAt);
  const leadArea = leadAnomaly?.verificationArea ?? leadAnomaly?.region ?? "Зона не определена";

  const kpis = [
    {
      label: "Зон мониторинга",
      value: String(uniqueRegions || anomalies.length || 0),
      color: "#47a6ff",
      help: "Сколько регионов сейчас попало в live screening очередь после спутникового обновления.",
    },
    {
      label: "Аномалий",
      value: String(anomalies.length),
      color: "#ff5c4d",
      help: "Сколько live-кандидатов CH4 сейчас выбиваются из rolling baseline и попали в очередь на разбор.",
    },
    {
      label: "К базовому фону CH4",
      value: deltaValue,
      color: "#ff9f3d",
      help: "Это не абстрактный процент. Метрика показывает, на сколько выбранная точка CH4 выше обычного фона для той же зоны и периода.",
    },
    {
      label: "Последняя сцена",
      value: latestObservation,
      color: "#4ade80",
      help: "Время последнего live-наблюдения, на котором построен текущий screening-кандидат.",
    },
  ];

  return (
    <div className="scm-panel-body">
      <div className="scm-kpi-row">
        {kpis.map((k) => (
          <div className="scm-kpi-card" key={k.label} style={{ "--kpi-color": k.color } as CSSProperties}>
            <div className="scm-kpi-head">
              <span>{k.label}</span>
              <HelpHint text={k.help} />
            </div>
            <strong>{k.value}</strong>
          </div>
        ))}
      </div>

      <div className="scm-section-stack">
        <SectionHeading
          title="Карта CH4"
          help="Главная рабочая зона для спутникового мониторинга CH4. Здесь выбирают аномалию и понимают, где отклонение выше фонового уровня."
        />
        <div className="scm-map-wrap">
          {anomalies.length > 0 ? (
            <AnomalyMap
              anomalies={anomalies}
              locale="ru"
              onSelectAnomaly={setSelected}
              selectedAnomalyId={selected}
              tone="live"
              primaryActionLabel="Подробнее"
              primaryActionDisabled={false}
              onPrimaryAction={() => {}}
            />
          ) : (
            <div className="signal-map-inline-empty">
              <strong>Live CH4-кандидаты пока не загружены</strong>
              <p>Подними backend и выполни Earth Engine sync, чтобы карта заполнилась реальными screening-точками.</p>
            </div>
          )}
        </div>
      </div>

      <div className="scm-section-stack">
        <SectionHeading
          title="Контекст"
          help="Короткий operational context: откуда пришёл сигнал, где проблема и какое действие предлагается прямо сейчас."
        />
        <div className="scm-info-grid">
          <InfoCard
            title="Спутниковые данные"
            desc={leadAnomaly?.evidenceSource ?? "Google Earth Engine · Sentinel-5P · VIIRS thermal context"}
            icon="🛰️"
            color="#47a6ff"
            help="Источник live-screening для CH4 и теплового контекста flare-событий."
          />
          <InfoCard
            title={leadArea}
            desc={
              leadAnomaly
                ? `${formatSignedPpb(leadAnomaly.methaneDeltaPpb)} и ${formatSignedPercent(leadAnomaly.methaneDeltaPct)} к базовому окну.`
                : "Выбери screening-кандидат на карте, чтобы увидеть контекст."
            }
            icon="⚠️"
            color="#ff5c4d"
            help="Контекст выбранной зоны: насколько сильно текущая точка выше локального baseline."
          />
          <InfoCard
            title="Рекомендация"
            desc={
              leadAnomaly?.recommendedAction ??
              "После успешного sync здесь появится следующее действие по выбранному live-кандидату."
            }
            icon="✅"
            color="#4ade80"
            help="Следующее действие для MRV / field verification по выбранному live-кандидату."
          />
        </div>
      </div>
    </div>
  );
}

// ─── CV Accidents Panel ──────────────────────────────────────────────────────────
function CvAccidentsPanel({ trafficSnapshot }: { trafficSnapshot: TrafficJamSnapshot | null }) {
  const router = useRouter();
  const trafficState = getTrafficState(trafficSnapshot?.jam.score ?? 0);
  const updatedAt = formatAlmatyTime(trafficSnapshot?.updatedAt);
  const totalCount = trafficSnapshot?.totalCount ?? 0;
  const densityPct = Math.round((trafficSnapshot?.density ?? 0) * 100);
  const jamScore = Math.round(trafficSnapshot?.jam.score ?? 0);
  const counts = trafficSnapshot?.counts ?? { car: 0, motorcycle: 0, bus: 0, truck: 0 };
  const detections = trafficSnapshot?.detections.slice(0, 6) ?? [];
  const frameWidth = Math.max(1440, ...detections.map((item) => item.bbox[2]));
  const frameHeight = Math.max(1080, ...detections.map((item) => item.bbox[3]));
  const trafficMapPoints = buildTrafficMonitoringPoints(trafficSnapshot, updatedAt);
  const liveTrafficPointId = trafficMapPoints.find((point) => point.mode === "live")?.id ?? "";
  const [selectedTrafficPointId, setSelectedTrafficPointId] = useState(
    trafficMapPoints.find((point) => point.mode === "pilot")?.id ?? trafficMapPoints[0]?.id ?? "",
  );

  useEffect(() => {
    if (!trafficMapPoints.some((point) => point.id === selectedTrafficPointId)) {
      setSelectedTrafficPointId(trafficMapPoints.find((point) => point.mode === "pilot")?.id ?? trafficMapPoints[0]?.id ?? "");
    }
  }, [selectedTrafficPointId, trafficMapPoints]);

  const stats = [
    {
      label: "Машин в кадре",
      value: String(totalCount),
      color: "#ff9f3d",
      help: "Сколько транспортных объектов сейчас определил подключённый trafficjams detector.",
    },
    {
      label: "Jam score",
      value: `${jamScore}%`,
      color: trafficState.color,
      help: "Суммарная оценка дорожной перегрузки из trafficjams.",
    },
    {
      label: "Плотность",
      value: `${densityPct}%`,
      color: "#47a6ff",
      help: "Какая доля текущего кадра занята транспортом.",
    },
    {
      label: "Обновлено",
      value: updatedAt,
      color: "#a78bfa",
      help: "Время последнего сохранённого snapshot из CV-контура.",
    },
  ];

  const trafficRows = [
    { label: "Автомобили", value: counts.car, detail: "Легковой поток" },
    { label: "Мотоциклы", value: counts.motorcycle, detail: "Двухколёсный транспорт" },
    { label: "Автобусы", value: counts.bus, detail: "Общественный транспорт" },
    { label: "Грузовики", value: counts.truck, detail: "Грузовой поток" },
  ];

  const handleTrafficPointSelect = (pointId: string) => {
    if (pointId === liveTrafficPointId) {
      router.push("/traffic-live?camera=east-live");
      return;
    }

    setSelectedTrafficPointId(pointId);
  };

  return (
    <div className="scm-panel-body">
      <div className="scm-kpi-row">
        {stats.map((s) => (
          <div className="scm-kpi-card" key={s.label} style={{ "--kpi-color": s.color } as CSSProperties}>
            <div className="scm-kpi-head">
              <span>{s.label}</span>
              <HelpHint text={s.help} />
            </div>
            <strong>{s.value}</strong>
          </div>
        ))}
      </div>

      <div className="scm-section-stack">
        <SectionHeading
          title="Карта CV-наблюдения"
          help="Карта показывает транспортные узлы с приоритетом по перегрузке. Крайний восточный рабочий узел открывает live-видеоконтур trafficjams."
        />
        <SignalMap
          points={trafficMapPoints}
          selectedPointId={selectedTrafficPointId}
          onSelectPoint={handleTrafficPointSelect}
          selectionLabel="Транспортный узел"
          footerHint="Крайний правый узел открывает live-мониторинг trafficjams. Остальные точки показывают приоритетные направления для расширения городского CV-контроля."
          emptyState={{
            title: "Транспортные узлы не загружены",
            description:
              "Как только trafficjams snapshot будет прочитан, карта перегруженных узлов появится здесь автоматически.",
          }}
        />
      </div>

      <div className="scm-section-stack">
        <SectionHeading
          title="Текущий кадр детектора"
          help="Эта сцена строится по реальному snapshot из trafficjams: boxes, confidence и плотность потока."
        />
        <div className="scm-cv-visual">
          <div className="scm-cv-screen">
            <div className="scm-cv-overlay">
              {detections.map((detection, index) => {
                const [x1, y1, x2, y2] = detection.bbox;
                return (
                  <div
                    key={`${detection.className}-${index}`}
                    className="scm-cv-box"
                    style={{
                      left: `${(x1 / frameWidth) * 100}%`,
                      top: `${(y1 / frameHeight) * 100}%`,
                      width: `${Math.max(((x2 - x1) / frameWidth) * 100, 8)}%`,
                      height: `${Math.max(((y2 - y1) / frameHeight) * 100, 8)}%`,
                    }}
                  >
                    <span>{`${getTrafficClassShortLabel(detection.className)} ${Math.round(detection.confidence * 100)}%`}</span>
                  </div>
                );
              })}
            </div>
            <p className="scm-cv-label">
              {trafficSnapshot
                ? `Источник: trafficjams · ${trafficState.label} · обновлено ${updatedAt}`
                : "Источник trafficjams пока не отдал актуальный snapshot."}
            </p>
          </div>
        </div>
      </div>

      <div className="scm-section-stack">
        <SectionHeading
          title="Состав потока"
          help="Разбивка по классам транспорта из текущего snapshot. Это реальный output CV-модуля, а не mock-лента."
        />
        <div className="scm-incident-list">
          {trafficRows.map((row) => (
            <div key={row.label} className="scm-incident-row">
              <div className="scm-incident-dot" />
              <div className="scm-incident-info">
                <strong>{row.label}</strong>
                <span>{row.detail}</span>
              </div>
              <span className="scm-incident-time">{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="scm-info-grid">
        <InfoCard
          title="Статус потока"
          desc={`${trafficState.label}. Jam score сейчас ${jamScore}%, поэтому модуль уже можно использовать как входной транспортный сигнал.`}
          icon="◎"
          color={trafficState.color}
          help="Текущее состояние потока по CV-модулю."
        />
        <InfoCard
          title="Связь с воздухом"
          desc="Если рядом одновременно высокий AQI, плотный поток усиливает выхлопы у магистрали и health-риск для чувствительных групп."
          icon="↗"
          color="#57d18e"
          help="Почему транспортный модуль важно читать вместе с качеством воздуха."
        />
        <InfoCard
          title="Источник"
          desc={
            "Индекс пробки и детекции читаются из trafficjams/traffic_data.json, а рабочий восточный узел ведёт в live-видеоконтур trafficjams."
          }
          icon="▣"
          color="#47a6ff"
          help="Подключённый технический источник для этого модуля."
        />
      </div>
    </div>
  );
}

// ─── Air Quality Panel ───────────────────────────────────────────────────────────
function AirQualityPanel({
  airSnapshot,
  airMapSnapshot,
  trafficSnapshot,
}: {
  airSnapshot: AlmatyAirSnapshot | null;
  airMapSnapshot: AlmatyAirMapSnapshot | null;
  trafficSnapshot: TrafficJamSnapshot | null;
}) {
  const [selectedStationId, setSelectedStationId] = useState("");

  useEffect(() => {
    if (!airMapSnapshot?.stations.length) {
      if (selectedStationId) {
        setSelectedStationId("");
      }
      return;
    }

    if (!airMapSnapshot.stations.some((station) => station.id === selectedStationId)) {
      setSelectedStationId(airMapSnapshot.stations[0].id);
    }
  }, [airMapSnapshot, selectedStationId]);

  const aqiValue = Math.round(airSnapshot?.aqiAvg ?? 0);
  const pm25Value = airSnapshot?.pm25Avg ?? 0;
  const pm10Value = airSnapshot?.pm10Avg ?? 0;
  const stationsTotal = airSnapshot?.stationsTotal ?? 0;
  const airState = getAqiState(aqiValue);
  const trafficState = getTrafficState(trafficSnapshot?.jam.score ?? 0);
  const healthInsight = buildHealthInsight(airSnapshot, trafficSnapshot);
  const updatedAt = formatAlmatyTime(airSnapshot?.timestamp || airSnapshot?.refreshedAt);
  const pm25Multiple = pm25Value > 0 ? (pm25Value / WHO_PM25_GUIDELINE).toFixed(1) : "0.0";
  const freshStationsCount = airMapSnapshot?.freshStationsCount ?? 0;
  const airMapPoints: SignalMapPoint[] = (airMapSnapshot?.stations ?? []).map((station) => {
    const pm25State = getPm25State(station.pm25);
    return {
      id: station.id,
      label: station.name,
      latitude: station.lat,
      longitude: station.lon,
      value: `${station.pm25.toFixed(1)} µg/m³`,
      category: station.district ?? station.origin,
      description: `${pm25State.label} · ${station.origin}`,
      color: pm25State.color,
      meta: [
        { label: "PM2.5", value: `${station.pm25.toFixed(1)} µg/m³` },
        { label: "Район", value: station.district ?? "не указан" },
        { label: "Источник", value: station.origin },
        { label: "Время", value: formatAlmatyTime(station.datetime) },
      ],
    };
  });

  const stats = [
    {
      label: "AQI Алматы",
      value: String(aqiValue),
      color: airState.color,
      help: "Текущий городской AQI из подключённого AIR API.",
    },
    {
      label: "PM2.5",
      value: pm25Value > 0 ? `${pm25Value.toFixed(1)} µg/m³` : "нет данных",
      color: "#ff9f3d",
      help: "Средняя концентрация мелких частиц по Алматы.",
    },
    {
      label: "PM10",
      value: pm10Value > 0 ? `${pm10Value.toFixed(1)} µg/m³` : "нет данных",
      color: "#47a6ff",
      help: "Средняя концентрация PM10 по Алматы.",
    },
    {
      label: "Станций",
      value: String(stationsTotal),
      color: "#a78bfa",
      help: "Сколько станций вошло в текущую сводку AIR API.",
    },
  ];

  const recommendations = [
    ...healthInsight.actions,
    pm25Value > WHO_PM25_GUIDELINE
      ? `PM2.5 сейчас выше ориентира ВОЗ примерно в ${pm25Multiple}×, поэтому уличный мониторинг надо усилить.`
      : "Порог по PM2.5 пока не выглядит критическим, но ситуацию стоит продолжать наблюдать.",
  ].slice(0, 4);

  return (
    <div className="scm-panel-body">
      <div className="scm-kpi-row">
        {stats.map((stat) => (
          <div className="scm-kpi-card" key={stat.label} style={{ "--kpi-color": stat.color } as CSSProperties}>
            <div className="scm-kpi-head">
              <span>{stat.label}</span>
              <HelpHint text={stat.help} />
            </div>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </div>

      <div className="scm-section-stack">
        <SectionHeading
          title="Карта станций воздуха"
          help="На карту выведены реальные станции AIR API со свежими измерениями PM2.5. Старые записи отфильтрованы, чтобы не смешивать архив и текущую обстановку."
        />
        <SignalMap
          points={airMapPoints}
          selectedPointId={selectedStationId}
          onSelectPoint={setSelectedStationId}
          selectionLabel="Станция воздуха"
          footerHint={
            airMapSnapshot
              ? `На карте показаны ${freshStationsCount} свежих станций из ${airMapSnapshot.stationsTotal} записей API за окно ${airMapSnapshot.freshWindowHours} ч.`
              : "Карта появится после получения station-level данных из AIR API."
          }
          emptyState={{
            title: "Станции воздуха не загружены",
            description:
              "AIR API сейчас не отдал station-level слой, поэтому карта временно пуста. Как только ответ вернётся, точки появятся автоматически.",
          }}
        />
      </div>

      <div className="scm-section-stack">
        <SectionHeading
          title="Городская сводка AQI"
          help="Здесь больше нет fake-районов: секция показывает реальный city average из AIR API по Алматы."
        />
        <div className="scm-aq-header-grid">
          <div className="scm-aq-gauge">
            <div className="scm-aq-dial">
              <strong>{aqiValue}</strong>
              <span>AQI Алматы</span>
            </div>
            <div className="scm-aq-status" style={{ color: airState.color }}>{airState.label}</div>
          </div>
          <div className="scm-district-grid">
            <div className="scm-district-card">
              <div className="scm-district-bar-wrap">
                <div
                  className="scm-district-bar"
                  style={{ width: `${Math.min(100, (airSnapshot?.sources.airgradient.pm25Avg ?? 0) * 2)}%`, background: "#4ade80" }}
                />
              </div>
              <div className="scm-district-info">
                <span>AirGradient · PM2.5</span>
                <strong style={{ color: "#4ade80" }}>
                  {airSnapshot?.sources.airgradient.pm25Avg?.toFixed(1) ?? "—"}
                </strong>
              </div>
            </div>
            <div className="scm-district-card">
              <div className="scm-district-bar-wrap">
                <div
                  className="scm-district-bar"
                  style={{ width: `${Math.min(100, airSnapshot?.sources.iqair.aqiAvg ?? airSnapshot?.aqiAvg ?? 0)}%`, background: "#47a6ff" }}
                />
              </div>
              <div className="scm-district-info">
                <span>IQAir · AQI</span>
                <strong style={{ color: "#47a6ff" }}>
                  {airSnapshot?.sources.iqair.aqiAvg?.toFixed(0) ?? aqiValue}
                </strong>
              </div>
            </div>
            <div className="scm-district-card">
              <div className="scm-district-bar-wrap">
                <div
                  className="scm-district-bar"
                  style={{ width: `${Math.min(100, Number(pm25Multiple) * 25)}%`, background: "#ff9f3d" }}
                />
              </div>
              <div className="scm-district-info">
                <span>PM2.5 к ориентиру ВОЗ</span>
                <strong style={{ color: "#ff9f3d" }}>{pm25Multiple}×</strong>
              </div>
            </div>
            <div className="scm-district-card">
              <div className="scm-district-bar-wrap">
                <div className="scm-district-bar" style={{ width: "100%", background: "#a78bfa" }} />
              </div>
              <div className="scm-district-info">
                <span>Обновление AIR API</span>
                <strong style={{ color: "#a78bfa" }}>{updatedAt}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="scm-section-stack">
        <SectionHeading
          title="Риск для здоровья"
          help="Этот блок связывает воздух и пробки: если AQI высокий и jam score высокий, риск для детей и пожилых растёт."
        />
        <div className="scm-info-grid">
          <InfoCard
            title={healthInsight.title}
            desc={healthInsight.summary}
            icon="♥"
            color={healthInsight.color}
            help="Короткая health-интерпретация для города на основе воздуха и дорожной нагрузки."
          />
          <InfoCard
            title="Трафик у магистралей"
            desc={
              trafficSnapshot
                ? `${trafficState.label}. Jam score ${Math.round(trafficSnapshot.jam.score)}% усиливает риск у дорог с плотным потоком.`
                : "Транспортный snapshot пока не получен, поэтому health-связка строится только по воздуху."
            }
            icon="◎"
            color={trafficState.color}
            help="Связка экологического и транспортного контуров."
          />
          <InfoCard
            title="Источник воздуха"
            desc={
              airSnapshot
                ? `AIR API · ${stationsTotal} станций в сводке и ${freshStationsCount} свежих точек на карте · ${airSnapshot.city}`
                : "AIR API сейчас недоступен, поэтому live-метрики временно не показаны."
            }
            icon="◌"
            color="#57d18e"
            help="Внешний live-источник воздуха для этой секции."
          />
        </div>
      </div>

      <div className="scm-reco-section">
        <div className="scm-title-row">
          <h3 className="scm-reco-title">Рекомендации для города</h3>
          <HelpHint text="Короткие управленческие действия по текущим live-метрикам воздуха и пробок." />
        </div>
        <div className="scm-reco-list">
          {recommendations.map((recommendation, index) => (
            <div className="scm-reco-item" key={recommendation}>
              <span className="scm-reco-num">{index + 1}</span>
              <p>{recommendation}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Safety / Crime Panel ───────────────────────────────────────────────────────
function RiskWorkflowPanel({ crimeSnapshot }: { crimeSnapshot: CrimeMonitorSnapshot | null }) {
  const incidents = crimeSnapshot?.incidents ?? [];
  const [selectedIncidentId, setSelectedIncidentId] = useState<number>(incidents[0]?.id ?? 0);

  useEffect(() => {
    if (!incidents.length) {
      if (selectedIncidentId) {
        setSelectedIncidentId(0);
      }
      return;
    }

    if (!incidents.some((incident) => incident.id === selectedIncidentId)) {
      setSelectedIncidentId(incidents[0].id);
    }
  }, [incidents, selectedIncidentId]);

  const selectedIncident =
    incidents.find((incident) => incident.id === selectedIncidentId) ?? incidents[0] ?? null;
  const crimeMapPoints = buildCrimeMapPoints(crimeSnapshot);
  const criticalCount = incidents.filter((incident) => incident.severity === "critical").length;
  const videoCount = incidents.filter((incident) => incident.hasVideo).length;
  const districtBreakdown = Object.entries(
    incidents.reduce<Record<string, number>>((acc, incident) => {
      acc[incident.district] = (acc[incident.district] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([district, count]) => ({ district, count }))
    .sort((left, right) => right.count - left.count);
  const kpis = [
    {
      label: "Зон наблюдения",
      value: String(crimeSnapshot?.coverageZones ?? 0),
      color: "#47a6ff",
      help: "Сколько активных камерных контуров безопасности сейчас заведено в модуль.",
    },
    {
      label: "Инцидентов",
      value: String(incidents.length),
      color: "#ff5c4d",
      help: "Сколько случаев драк и ссор сейчас находится в рабочем срезе.",
    },
    {
      label: "С видеозаписью",
      value: String(videoCount),
      color: "#4ade80",
      help: "Сколько инцидентов уже имеют доступный видеофрагмент для просмотра и фиксации.",
    },
    {
      label: "Пиковое окно",
      value: crimeSnapshot?.peakWindow ?? "нет данных",
      color: "#b289ff",
      help: "Интервал суток, когда вероятность конфликтов сейчас выше всего.",
    },
  ];

  return (
    <div className="scm-panel-body">
      <div className="scm-kpi-row">
        {kpis.map((k) => (
          <div className="scm-kpi-card" key={k.label} style={{ "--kpi-color": k.color } as CSSProperties}>
            <div className="scm-kpi-head">
              <span>{k.label}</span>
              <HelpHint text={k.help} />
            </div>
            <strong>{k.value}</strong>
          </div>
        ))}
      </div>

      <div className="scm-section-stack">
        <SectionHeading
          title="Карта инцидентов"
          help="На карту выведены инциденты драк и ссор по Алматы. Красная точка с видео позволяет сразу открыть подтверждённый фрагмент."
        />
        <SignalMap
          points={crimeMapPoints}
          selectedPointId={selectedIncident ? `crime-${selectedIncident.id}` : undefined}
          onSelectPoint={(pointId) => {
            const id = Number(pointId.replace("crime-", ""));
            if (Number.isFinite(id)) {
              setSelectedIncidentId(id);
            }
          }}
          selectionLabel="Инцидент безопасности"
          footerHint="Кликни по точке или по реестру справа. Инцидент с видео сразу открывает подтверждённый фрагмент камеры."
          emptyState={{
            title: "Контур безопасности не загружен",
            description:
              "Когда backend crime-модуля вернёт incidents feed, карта и видеослой появятся здесь автоматически.",
          }}
        />
      </div>

      <div className="scm-pothole-grid">
        <div className="scm-pothole-photo-card scm-crime-media-card">
          <div className="scm-title-row">
            <h3 className="scm-reco-title">Видео и детали</h3>
            <HelpHint text="Левый блок показывает видеофрагмент по выбранному инциденту. Если записи нет, блок честно сообщает об этом." />
          </div>

          {selectedIncident ? (
            <>
              {selectedIncident.hasVideo && selectedIncident.videoPath ? (
                <video
                  className="scm-crime-video"
                  controls
                  preload="metadata"
                  src={selectedIncident.videoPath}
                />
              ) : (
                <div className="scm-crime-video-placeholder">
                  <strong>Видео пока не загружено</strong>
                  <p>
                    Для этого кейса запись ещё не получена. Инцидент остаётся в реестре и доступен для
                    разбора по карте, времени и району.
                  </p>
                </div>
              )}

              <div className="scm-pothole-photo-copy">
                <div className="scm-title-row">
                  <strong>{selectedIncident.name}</strong>
                  <span
                    className="scm-flood-risk-badge"
                    style={{
                      color: getCrimeSeverityColor(selectedIncident.severity),
                      borderColor: `${getCrimeSeverityColor(selectedIncident.severity)}44`,
                      background: `${getCrimeSeverityColor(selectedIncident.severity)}14`,
                    }}
                  >
                    {selectedIncident.severityLabel}
                  </span>
                </div>
                <p>{selectedIncident.description}</p>
                <div className="scm-pothole-meta-grid">
                  <div className="scm-pothole-meta-card">
                    <span>Район</span>
                    <strong>{selectedIncident.district}</strong>
                  </div>
                  <div className="scm-pothole-meta-card">
                    <span>Адрес</span>
                    <strong>{selectedIncident.address}</strong>
                  </div>
                  <div className="scm-pothole-meta-card">
                    <span>Участники</span>
                    <strong>{selectedIncident.participants}</strong>
                  </div>
                  <div className="scm-pothole-meta-card">
                    <span>Камера</span>
                    <strong>{selectedIncident.cameraLabel}</strong>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="scm-pothole-side-stack">
          <div className="scm-pothole-side-card">
            <div className="scm-title-row">
              <h3 className="scm-reco-title">Реестр инцидентов</h3>
              <HelpHint text="В реестре собраны все доступные кейсы. Выбор записи синхронизирует карту и видеоблок." />
            </div>
            <div className="scm-pothole-list">
              {incidents.map((incident) => (
                <button
                  key={incident.id}
                  className={`scm-pothole-list-item ${selectedIncidentId === incident.id ? "scm-pothole-list-item-active" : ""}`}
                  onClick={() => setSelectedIncidentId(incident.id)}
                  type="button"
                >
                  <div
                    className="scm-crime-list-dot"
                    style={{ background: getCrimeSeverityColor(incident.severity) }}
                  />
                  <div className="scm-pothole-list-copy">
                    <strong>{incident.name}</strong>
                    <span>{incident.address}</span>
                  </div>
                  <div className="scm-crime-list-meta">
                    {incident.hasVideo ? <span className="scm-inline-badge">Видео</span> : null}
                    <span
                      className="scm-flood-risk-badge"
                      style={{
                        color: incident.color,
                        borderColor: `${incident.color}44`,
                        background: `${incident.color}14`,
                      }}
                    >
                      {incident.severityLabel}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="scm-pothole-side-card">
            <div className="scm-title-row">
              <h3 className="scm-reco-title">Патрульные экипажи</h3>
              <HelpHint text="Статусы патрулей пришиты к safety-контурy, чтобы штаб видел, кого можно отправить на новый кейс." />
            </div>
            <div className="scm-patrol-list">
              {(crimeSnapshot?.patrolUnits ?? []).map((unit) => {
                const tone = getPatrolStatusTone(unit.status);
                return (
                  <div className="scm-patrol-item" key={unit.id}>
                    <div className="scm-patrol-copy">
                      <strong>{unit.name}</strong>
                      <span>{unit.role}</span>
                    </div>
                    <span
                      className="scm-patrol-status"
                      style={{
                        color: tone.color,
                        background: tone.background,
                        borderColor: tone.border,
                      }}
                    >
                      {unit.statusLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="scm-info-grid">
        <InfoCard
          title="Пиковое окно"
          desc={
            crimeSnapshot
              ? `${crimeSnapshot.nightRiskSharePct}% инцидентов приходятся на ${crimeSnapshot.peakWindow}.`
              : "После загрузки snapshot здесь появится окно наибольшего риска."
          }
          icon="◇"
          color="#b289ff"
          help="Это окно помогает штабу понять, когда усиливать патрулирование и проверку камер."
        />
        <InfoCard
          title="Критические кейсы"
          desc={
            criticalCount > 0
              ? `${criticalCount} критический кейс уже требует немедленного разбора и подтверждения видеоматериала.`
              : "Критических кейсов сейчас нет, но контур продолжает мониторинг камер."
          }
          icon="!"
          color="#ff5c4d"
          help="Количество самых жёстких кейсов в текущем crime-срезе."
        />
        <InfoCard
          title="По районам"
          desc={
            districtBreakdown.length > 0
              ? districtBreakdown.map((item) => `${item.district}: ${item.count}`).join(" · ")
              : "Разбивка по районам появится после загрузки crime-среза."
          }
          icon="▣"
          color="#47a6ff"
          help="Распределение кейсов по районам Алматы в текущем safety-контуре."
        />
      </div>

      <div className="scm-reco-section">
        <div className="scm-title-row">
          <h3 className="scm-reco-title">Что объяснит AI Assistant</h3>
          <HelpHint text="AI rail справа не дублирует карту. Он переводит инциденты в короткую управленческую сводку по районам и действиям." />
        </div>
        <div className="scm-reco-list">
          {(crimeSnapshot?.recommendations ?? []).map((recommendation, index) => (
            <div className="scm-reco-item" key={recommendation.id}>
              <span className="scm-reco-num">{index + 1}</span>
              <p>
                <strong>{recommendation.title}.</strong> {recommendation.body}
                {typeof recommendation.priorityPct === "number"
                  ? ` Приоритет ${recommendation.priorityPct}%.`
                  : ""}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Forecast Center Panel ───────────────────────────────────────────────────────
function ForecastCenterPanel() {
  const potholeStats = getPotholeStats();
  const potholeMapPoints = buildPotholeMapPoints();
  const [selectedPotholeId, setSelectedPotholeId] = useState<number>(POTHOLES[0]?.id ?? 0);

  useEffect(() => {
    if (!POTHOLES.some((item) => item.id === selectedPotholeId)) {
      setSelectedPotholeId(POTHOLES[0]?.id ?? 0);
    }
  }, [selectedPotholeId]);

  const selectedPothole =
    POTHOLES.find((item) => item.id === selectedPotholeId) ??
    POTHOLES[0] ??
    null;
  const latestDate = [...POTHOLES]
    .map((item) => item.date)
    .sort((a, b) => b.localeCompare(a))[0] ?? "нет данных";
  const severityBreakdown = [
    {
      label: "Критическая",
      count: POTHOLES.filter((item) => item.severity === "critical").length,
      color: getPotholeSeverityColor("critical"),
    },
    {
      label: "Высокая",
      count: POTHOLES.filter((item) => item.severity === "high").length,
      color: getPotholeSeverityColor("high"),
    },
    {
      label: "Средняя",
      count: POTHOLES.filter((item) => item.severity === "medium").length,
      color: getPotholeSeverityColor("medium"),
    },
    {
      label: "Низкая",
      count: POTHOLES.filter((item) => item.severity === "low").length,
      color: getPotholeSeverityColor("low"),
    },
  ];
  const topCases = [...POTHOLES].sort((a, b) => b.priority - a.priority);
  const kpis = [
    {
      label: "Зон мониторинга",
      value: String(potholeStats.total),
      color: "#47a6ff",
      help: "Сколько дорожных кейсов сейчас выведено в рабочий срез по Алматы.",
    },
    {
      label: "Обнаружено ям",
      value: String(potholeStats.total),
      color: "#ff5c4d",
      help: "Сколько дорожных дефектов уже зафиксировано в текущем наборе.",
    },
    {
      label: "Критических",
      value: String(potholeStats.critical),
      color: "#ff9f3d",
      help: "Ямы с самой высокой тяжестью и приоритетом выезда.",
    },
    {
      label: "Последняя фиксация",
      value: latestDate,
      color: "#4ade80",
      help: "Дата последнего кейса в подключённом potholes-срезе.",
    },
  ];

  return (
    <div className="scm-panel-body">
      <div className="scm-kpi-row">
        {kpis.map((k) => (
          <div className="scm-kpi-card" key={k.label} style={{ "--kpi-color": k.color } as CSSProperties}>
            <div className="scm-kpi-head">
              <span>{k.label}</span>
              <HelpHint text={k.help} />
            </div>
            <strong>{k.value}</strong>
          </div>
        ))}
      </div>

      <div className="scm-section-stack">
        <SectionHeading
          title="Карта дорожных ям"
          help="Карта показывает точки фотофиксации дорожных дефектов по Алматы. Детали по приоритету, бюджету и очередности ремонта объясняет AI rail справа."
        />
        <SignalMap
          points={potholeMapPoints}
          selectedPointId={selectedPothole ? `pothole-${selectedPothole.id}` : undefined}
          onSelectPoint={(pointId) => {
            const id = Number(pointId.replace("pothole-", ""));
            if (Number.isFinite(id)) {
              setSelectedPotholeId(id);
            }
          }}
          selectionLabel="Дефект покрытия"
          footerHint="Кликни по точке на карте или по кейсу ниже. Приоритет ремонта и ориентир бюджета выдаёт AI Assistant."
          emptyState={{
            title: "Карта ям пока не загружена",
            description: "После подключения potholes-feed точки дорожных дефектов появятся здесь автоматически.",
          }}
        />
      </div>

      <div className="scm-pothole-grid">
        <div className="scm-pothole-photo-card">
          <div className="scm-title-row">
            <h3 className="scm-reco-title">Фотофиксация</h3>
            <HelpHint text="Фото выбранного дорожного дефекта из подключённого potholes-набора." />
          </div>

          {selectedPothole ? (
            <>
              <img
                alt={selectedPothole.name}
                className="scm-pothole-photo"
                src={selectedPothole.image}
              />
              <div className="scm-pothole-photo-copy">
                <div className="scm-title-row">
                  <strong>{selectedPothole.name}</strong>
                  <span
                    className="scm-flood-risk-badge"
                    style={{
                      color: selectedPothole.color,
                      borderColor: `${selectedPothole.color}44`,
                      background: `${selectedPothole.color}14`,
                    }}
                  >
                    {selectedPothole.severityLabel}
                  </span>
                </div>
                <p>{selectedPothole.description}</p>
                <div className="scm-pothole-meta-grid">
                  <div className="scm-pothole-meta-card">
                    <span>Район</span>
                    <strong>{selectedPothole.district}</strong>
                  </div>
                  <div className="scm-pothole-meta-card">
                    <span>Глубина</span>
                    <strong>{selectedPothole.depthLabel}</strong>
                  </div>
                  <div className="scm-pothole-meta-card">
                    <span>Адрес</span>
                    <strong>{selectedPothole.address}</strong>
                  </div>
                  <div className="scm-pothole-meta-card">
                    <span>Фиксация</span>
                    <strong>{selectedPothole.date}</strong>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="scm-pothole-side-stack">
          <div className="scm-pothole-side-card">
            <div className="scm-title-row">
              <h3 className="scm-reco-title">Кейсы по приоритету</h3>
              <HelpHint text="Список дорожных дефектов отсортирован по приоритету ремонта." />
            </div>
            <div className="scm-pothole-list">
              {topCases.map((item) => (
                <button
                  key={item.id}
                  className={`scm-pothole-list-item ${selectedPotholeId === item.id ? "scm-pothole-list-item-active" : ""}`}
                  onClick={() => setSelectedPotholeId(item.id)}
                  type="button"
                >
                  <img alt={item.name} className="scm-pothole-thumb" src={item.image} />
                  <div className="scm-pothole-list-copy">
                    <strong>{item.name}</strong>
                    <span>{item.address}</span>
                  </div>
                  <span
                    className="scm-flood-risk-badge"
                    style={{
                      color: item.color,
                      borderColor: `${item.color}44`,
                      background: `${item.color}14`,
                    }}
                  >
                    {item.severityLabel}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="scm-pothole-side-card">
            <div className="scm-title-row">
              <h3 className="scm-reco-title">Разбивка по районам</h3>
              <HelpHint text="Сколько дорожных дефектов сейчас приходится на каждый район в текущем срезе." />
            </div>
            <div className="scm-district-grid">
              {potholeStats.districtBreakdown.map((item) => (
                <div className="scm-district-card" key={item.district}>
                  <div className="scm-district-bar-wrap">
                    <div
                      className="scm-district-bar"
                      style={{
                        width: `${(item.count / potholeStats.total) * 100}%`,
                        background: "#ff7d5c",
                      }}
                    />
                  </div>
                  <div className="scm-district-info">
                    <span>{item.district}</span>
                    <strong style={{ color: "#ffb7a2" }}>{item.count}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="scm-info-grid">
        <InfoCard
          title="По степени тяжести"
          desc={severityBreakdown.map((item) => `${item.label}: ${item.count}`).join(" · ")}
          icon="⬣"
          color="#ff7d5c"
          help="Сводка по тяжести дорожных дефектов в текущем наборе."
        />
        <InfoCard
          title="AI разбор"
          desc="Рекомендации по выезду бригад и ориентир бюджета вынесены в AI rail справа, чтобы не засорять рабочее поле панели."
          icon="✦"
          color="#47a6ff"
          help="Здесь намеренно нет отдельной колонки с рекомендациями: этот слой отдаётся AI Assistant."
        />
        <InfoCard
          title="Источник potholes"
          desc="Снимки и кейсы собраны из нового potholes-дэшборда, который пришёл с origin/master и врезан в общий smart city фронт."
          icon="▣"
          color="#ffd05a"
          help="Источник этого модуля — новый дорожный контур из репозитория."
        />
      </div>
    </div>
  );
}

// ─── Report Studio Panel ─────────────────────────────────────────────────────────
function ReportStudioPanel() {
  const zones = [
    { name: "Поля инцидента", risk: "96%", level: 96, color: "#ffd05a" },
    { name: "Геокодинг", risk: "94%", level: 94, color: "#47a6ff" },
    { name: "Согласованность SLA", risk: "89%", level: 89, color: "#ff9f3d" },
    { name: "Покрытие данных", risk: "92%", level: 92, color: "#4ade80" },
  ];
  const kpis = [
    { label: "Готовых пакетов", value: "3", color: "#ffd05a", help: "Сколько пакетов уже собрано в формат, пригодный для отправки или показа." },
    { label: "Проверок качества", value: "4", color: "#47a6ff", help: "Сколько quality-check стадий проходит пакет перед экспортом." },
    { label: "Экспортов", value: "PDF / DOCX", color: "#ff9f3d", help: "Какие форматы выходного отчёта сейчас подготовлены в demo." },
    { label: "Готовность", value: "92%", color: "#4ade80", help: "Насколько пакет данных заполнен и пригоден к выпуску." },
  ];

  return (
    <div className="scm-panel-body">
      <div className="scm-kpi-row">
        {kpis.map((k) => (
          <div className="scm-kpi-card" key={k.label} style={{ "--kpi-color": k.color } as CSSProperties}>
            <div className="scm-kpi-head">
              <span>{k.label}</span>
              <HelpHint text={k.help} />
            </div>
            <strong>{k.value}</strong>
          </div>
        ))}
      </div>

      <div className="scm-section-stack">
        <SectionHeading
          title="Контроль пакета"
          help="Здесь видно, насколько отчётный пакет заполнен, согласован и готов к экспорту без ручной доработки."
        />
        <div className="scm-flood-zones">
          {zones.map((z) => (
            <div className="scm-flood-zone" key={z.name}>
              <div className="scm-flood-zone-header">
                <span>▣ {z.name}</span>
                <span className="scm-flood-risk-badge" style={{ color: z.color, borderColor: z.color + "44", background: z.color + "11" }}>
                  {z.risk}
                </span>
              </div>
              <div className="scm-flood-bar-wrap">
                <div className="scm-flood-bar" style={{ width: `${z.level}%`, background: z.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <InfoCard
        title="Report studio"
        desc="Отдельный модуль генерации выходов для штаба, акимата и архива: отчёт, качество набора и экспорт в готовом виде."
        icon="▣"
        color="#ffd05a"
        help="Финальный слой demo-loop: инцидент должен заканчиваться не только карточкой, но и готовым выходным документом."
      />
    </div>
  );
}

// ─── Shared components ───────────────────────────────────────────────────────────
function HelpHint({ text, className }: { text: string; className?: string }) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [popover, setPopover] = useState({
    left: 12,
    top: 12,
    width: 280,
    placement: "top" as "top" | "bottom",
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || !buttonRef.current || typeof window === "undefined") {
      return;
    }

    const updatePosition = () => {
      if (!buttonRef.current) {
        return;
      }

      const rect = buttonRef.current.getBoundingClientRect();
      const width = Math.min(320, Math.max(220, window.innerWidth - 24));
      const left = Math.min(
        Math.max(rect.left + rect.width / 2 - width / 2, 12),
        window.innerWidth - width - 12,
      );
      const placeBelow = rect.top < 156;

      setPopover({
        left,
        top: placeBelow ? rect.bottom + 12 : rect.top - 12,
        width,
        placement: placeBelow ? "bottom" : "top",
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
        className={["scm-help", className].filter(Boolean).join(" ")}
        onBlur={() => setIsOpen(false)}
        onClick={() => setIsOpen((current) => !current)}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
            buttonRef.current?.blur();
          }
        }}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        ref={buttonRef}
        type="button"
      >
        ?
      </button>
      {mounted && isOpen
        ? createPortal(
            <span
              className={`scm-help-popover scm-help-popover-${popover.placement}`}
              role="tooltip"
              style={{
                left: `${popover.left}px`,
                top: `${popover.top}px`,
                width: `${popover.width}px`,
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

function SectionHeading({ title, help }: { title: string; help: string }) {
  return (
    <div className="scm-section-heading">
      <h3>{title}</h3>
      <HelpHint text={help} />
    </div>
  );
}

function InfoCard({
  title,
  desc,
  icon,
  color,
  help,
}: {
  title: string;
  desc: string;
  icon: string;
  color: string;
  help?: string;
}) {
  return (
    <div className="scm-info-card" style={{ "--card-color": color } as CSSProperties}>
      <span className="scm-info-icon">{icon}</span>
      <div className="scm-info-card-body">
        <div className="scm-info-title-row">
          <strong>{title}</strong>
          {help ? <HelpHint text={help} /> : null}
        </div>
        <p>{desc}</p>
      </div>
    </div>
  );
}

function DemoMapPlaceholder() {
  return (
    <div className="scm-map-placeholder">
      <div className="scm-map-grid-lines" />
      {[
        { top: "30%", left: "45%", color: "#ff5c4d" },
        { top: "55%", left: "30%", color: "#ff9f3d" },
        { top: "48%", left: "65%", color: "#47a6ff" },
      ].map((dot, i) => (
        <div key={i} className="scm-map-dot" style={{ top: dot.top, left: dot.left, background: dot.color }} />
      ))}
      <div className="scm-map-placeholder-label">Алматы · Спутниковый снимок CH₄</div>
    </div>
  );
}
