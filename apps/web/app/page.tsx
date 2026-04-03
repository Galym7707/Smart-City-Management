"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AnomalyMap } from "../components/anomaly-map";
import {
  type DashboardHydrationState,
  createUnavailableDashboardState,
  loadDashboardState,
} from "../lib/api";
import {
  type AlmatyAirSnapshot,
  loadAlmatyAirSnapshot,
  loadTrafficJamSnapshot,
  type TrafficJamSnapshot,
} from "../lib/city-signals";
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
    help: "Модуль показывает CH4-карту, точки отклонения от базового уровня и зоны, которые стоит проверять первыми.",
    badge: "LIVE",
    color: "#4f8cff",
  },
  {
    id: "cv-accidents",
    icon: "◎",
    short: "CV",
    label: "Computer Vision ДТП",
    overview: "Подключённый CV-контур трафика, пробок и детекций транспорта.",
    help: "Сейчас модуль читает реальный output из trafficjams: jam score, плотность потока и детекции транспорта по YOLOv8.",
    badge: "AI",
    color: "#ff8c52",
  },
  {
    id: "air-quality",
    icon: "◌",
    short: "AQI",
    label: "Воздух Алматы",
    overview: "Live AQI Алматы, PM2.5/PM10 и health-риск для города.",
    help: "Этот модуль читает реальный AIR API по Алматы и связывает качество воздуха с транспортной нагрузкой.",
    badge: "LIVE",
    color: "#57d18e",
  },
  {
    id: "risk-workflow",
    icon: "◇",
    short: "RCA",
    label: "Очередь рисков",
    overview: "Risk queue, workflow и root cause.",
    help: "Это operational loop: сигнал, очередь, инцидент, задачи, отчёт и краткий разбор вероятных причин.",
    color: "#b289ff",
  },
  {
    id: "forecast-center",
    icon: "△",
    short: "FCST",
    label: "Прогноз города",
    overview: "Сценарный forecast по нагрузке и рискам.",
    help: "Forecast center показывает, где и когда нагрузка на городские сервисы выйдет из нормы и где нужен резерв.",
    color: "#58c5ff",
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
      "Это Smart City Management для Алматы: один экран, где город видит CH4, ДТП, воздух, очередь рисков, прогнозы и отчётный контур.",
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
      "Потому что это не один узкий дашборд, а полноценный городской command center: экология, трафик, воздух, risk queue, прогнозы и отчёты.",
  },
  {
    id: "assistant",
    question: "Что будет делать AI Assistant?",
    answer:
      "После подключения Gemini API он станет правой точкой входа для сводок, объяснений по районам, управленческих рекомендаций и генерации коротких отчётов.",
  },
  {
    id: "demo",
    question: "Данные на экране реальные?",
    answer:
      "Сейчас экран смешанный: воздух подключён к live AIR API по Алматы, блок пробок читает реальный output trafficjams, остальные контуры пока остаются demo-workflow.",
  },
] as const;

// ─── Chat types ─────────────────────────────────────────────────────────────────
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts: Date;
};

const AI_MODULE_CHIPS: Array<{ label: string; featureId: FeatureId }> = [
  { label: "CH4", featureId: "ch4-map" },
  { label: "ДТП", featureId: "cv-accidents" },
  { label: "Воздух", featureId: "air-quality" },
  { label: "Риски", featureId: "risk-workflow" },
  { label: "Прогноз", featureId: "forecast-center" },
  { label: "Отчёт", featureId: "report-studio" },
];

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
): AiModuleContext {
  const feature = FEATURES.find((item) => item.id === featureId) ?? FEATURES[0];
  const leadAnomaly = dashboardState.anomalies[0];
  const ch4Delta =
    leadAnomaly?.methaneDeltaPct !== undefined
      ? `+${Math.round(leadAnomaly.methaneDeltaPct)}%`
      : "+12%";
  const openIncidents = Object.keys(dashboardState.incidents).length || 2;
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
            value: String(dashboardState.anomalies.length || 4),
            detail: "Точки отклонения, попавшие в рабочий screening слой.",
          },
          {
            label: "Отклонение к базе",
            value: ch4Delta,
            detail: "Насколько текущий CH4 выше базового уровня по зоне.",
          },
          {
            label: "Зон мониторинга",
            value: "7",
            detail: "Районы и контуры, которые сейчас находятся в спутниковом обзоре.",
          },
          {
            label: "Последнее обновление",
            value: "2 мин назад",
            detail: "Свежесть mock-среза для демо.",
          },
        ],
        findings: [
          `${leadAnomaly?.verificationArea ?? "Алматы"} показывает отклонение CH4 на ${ch4Delta} к базовому профилю.`,
          `${dashboardState.anomalies.length || 4} точек уже попали в screening-очередь и требуют проверки.`,
          "Контур работает как intelligence layer: он показывает, где искать проблему в первую очередь.",
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
      return {
        featureId,
        featureLabel: feature.label,
        overview: feature.overview,
        defaultSeverity: "Высокая",
        severityReasonHint:
          "В очереди уже несколько красных кейсов, и просрочка по SLA быстро снижает управляемость.",
        metrics: [
          {
            label: "В очереди",
            value: "6",
            detail: "Кейсы, которые ждут решения в risk queue.",
          },
          {
            label: "Красных кейсов",
            value: "3",
            detail: "Самые приоритетные сигналы в текущем контуре.",
          },
          {
            label: "Средний SLA",
            value: "1.8ч",
            detail: "Окно обработки по текущему сценарию.",
          },
          {
            label: "Открытых инцидентов",
            value: String(openIncidents),
            detail: "Инциденты, уже поднятые из сигналов в workflow.",
          },
        ],
        findings: [
          "Risk queue собирает сигналы в единый operational workflow и не даёт им потеряться между службами.",
          "Часть кейсов уже в красной зоне и требует owner, SLA и понятного следующего шага.",
          "Именно здесь платформа перестаёт быть просто дашбордом и становится рабочим инструментом.",
        ],
        recommendedFocus: [
          "Зафиксировать owner и срок реакции по каждому красному кейсу.",
          "Дотянуть критичные кейсы до задач и отчёта, а не оставлять на уровне сигнала.",
          "Использовать очередь как единый вход для межмодульных проблем города.",
        ],
        crossModuleSignals: [
          "Risk queue связывает CH4, ДТП, воздух, прогноз и отчёт в один управленческий контур.",
          "Без этой очереди модули живут отдельно и не дают цельной реакции штабу.",
        ],
      };
    case "forecast-center":
      return {
        featureId,
        featureLabel: feature.label,
        overview: feature.overview,
        defaultSeverity: "Средняя",
        severityReasonHint:
          "Риск ещё прогнозный, но окна перегруза уже видны и позволяют действовать заранее.",
        metrics: [
          {
            label: "Окон риска",
            value: "4",
            detail: "Временные интервалы, где нагрузка выходит из нормы.",
          },
          {
            label: "Сценариев",
            value: "12",
            detail: "Варианты развития ситуации в demo-модели.",
          },
          {
            label: "Резерв нужен",
            value: "2 зоны",
            detail: "Районы, где стоит заранее подготовить ресурс.",
          },
          {
            label: "Точность",
            value: "89%",
            detail: "Качество forecast-модуля на mock-наборе.",
          },
        ],
        findings: [
          "Forecast center показывает, где город выйдет из нормы ещё до фактического перегруза.",
          "Следующее напряжённое окно видно заранее, поэтому штаб может работать превентивно.",
          "Этот контур нужен для подготовки резерва, а не для постфактум-отчёта.",
        ],
        recommendedFocus: [
          "Заранее перераспределить ресурс в зоны ожидаемой перегрузки.",
          "Подготовить резервные схемы по транспорту и энергетике.",
          "Сверять прогноз с risk queue, чтобы обновлять приоритеты до эскалации.",
        ],
        crossModuleSignals: [
          "Прогноз нужен, чтобы транспорт, воздух и инфраструктура не уходили в красную зону одновременно.",
          "Он усиливает другие модули именно тем, что даёт время на реакцию.",
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
  const [trafficSnapshot, setTrafficSnapshot] = useState<TrafficJamSnapshot | null>(null);

  const [dashboardState, setDashboardState] = useState<DashboardHydrationState>(
    createUnavailableDashboardState(),
  );
  const [dashLoaded, setDashLoaded] = useState(false);

  useEffect(() => {
    loadDashboardState()
      .then((state) => {
        setDashboardState(state);
        setDashLoaded(true);
      })
      .catch(() => {
        setDashLoaded(true);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refreshAir = async () => {
      const snapshot = await loadAlmatyAirSnapshot();
      if (!cancelled && snapshot) {
        setAirSnapshot(snapshot);
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
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const anomalies = dashboardState.anomalies;
  const activeF = FEATURES.find((f) => f.id === activeFeature)!;
  const activeModuleContext = buildAiModuleContext(
    activeFeature,
    dashboardState,
    airSnapshot,
    trafficSnapshot,
  );
  const liveContextVersion =
    activeFeature === "air-quality"
      ? airSnapshot?.timestamp ?? "air-none"
      : activeFeature === "cv-accidents"
        ? trafficSnapshot?.updatedAt ?? "traffic-none"
        : "static";
  const visibleSummary =
    aiSummary ?? {
      whatIsHappening: activeModuleContext.findings.slice(0, 2).join(" "),
      severity: activeModuleContext.defaultSeverity,
      severityReason: activeModuleContext.severityReasonHint,
      recommendedActions: activeModuleContext.recommendedFocus.slice(0, 3),
      crossModuleInsight: activeModuleContext.crossModuleSignals[0],
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
      module: buildAiModuleContext(activeFeature, dashboardState, airSnapshot, trafficSnapshot),
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
              воздух, risk queue, прогнозы и отчёты на одном экране.
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
            <AirQualityPanel airSnapshot={airSnapshot} trafficSnapshot={trafficSnapshot} />
          )}
          {activeFeature === "risk-workflow" && <RiskWorkflowPanel />}
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

        <div className="scm-chatbot-chips">
          {AI_MODULE_CHIPS.map((chip) => (
            <button
              key={chip.featureId}
              className={`scm-chat-chip ${activeFeature === chip.featureId ? "scm-chat-chip-active" : ""}`}
              onClick={() => {
                if (chip.featureId === activeFeature) {
                  void requestAiAssistant({
                    module: buildAiModuleContext(chip.featureId, dashboardState, airSnapshot, trafficSnapshot),
                    mode: "summary",
                  });
                  return;
                }

                setActiveFeature(chip.featureId);
              }}
              type="button"
            >
              {chip.label}
            </button>
          ))}
        </div>

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
              text={`${dot.feature.short} — ${dot.feature.label}. ${dot.feature.help}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CH4 Panel ───────────────────────────────────────────────────────────────────
function Ch4Panel({ anomalies }: { anomalies: any[] }) {
  const [selected, setSelected] = useState(anomalies[0]?.id ?? "");
  const leadAnomaly = anomalies.find((item) => item.id === selected) ?? anomalies[0];
  const deltaValue =
    leadAnomaly?.methaneDeltaPct !== undefined
      ? `+${Math.round(leadAnomaly.methaneDeltaPct)}%`
      : "+12%";

  const kpis = [
    {
      label: "Зон мониторинга",
      value: "7",
      color: "#47a6ff",
      help: "Сколько контуров или районов сейчас попадает в рабочий спутниковый срез.",
    },
    {
      label: "Аномалий",
      value: anomalies.length > 0 ? String(anomalies.length) : "3",
      color: "#ff5c4d",
      help: "Сколько точек на карте выбиваются из обычного уровня и попали в очередь на разбор.",
    },
    {
      label: "К базовому фону CH4",
      value: deltaValue,
      color: "#ff9f3d",
      help: "Это не абстрактный процент. Метрика показывает, на сколько текущий уровень CH4 выше обычного фона для той же зоны и периода.",
    },
    {
      label: "Последнее обновление",
      value: "2 мин назад",
      color: "#4ade80",
      help: "Когда платформа в последний раз пересобрала mock-срез для этой карты.",
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
            <DemoMapPlaceholder />
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
            desc="Sentinel-5P · TROPOMI — детектируем CH₄ с точностью до 7×7 км"
            icon="🛰️"
            color="#47a6ff"
            help="Источник mock-среза для демонстрации спутникового обнаружения метана."
          />
          <InfoCard
            title="Алатауский район"
            desc="Повышенная концентрация метана +18% от базового уровня"
            icon="⚠️"
            color="#ff5c4d"
            help="Карточка района с приоритетом проверки: здесь текущее значение заметно выше локального фона."
          />
          <InfoCard
            title="Рекомендация"
            desc="Направить инспекцию Газпром Казахстан для проверки сетей"
            icon="✅"
            color="#4ade80"
            help="Следующее действие для штаба: кого отправить и зачем."
          />
        </div>
      </div>
    </div>
  );
}

// ─── CV Accidents Panel ──────────────────────────────────────────────────────────
function CvAccidentsPanel({ trafficSnapshot }: { trafficSnapshot: TrafficJamSnapshot | null }) {
  const trafficState = getTrafficState(trafficSnapshot?.jam.score ?? 0);
  const updatedAt = formatAlmatyTime(trafficSnapshot?.updatedAt);
  const totalCount = trafficSnapshot?.totalCount ?? 0;
  const densityPct = Math.round((trafficSnapshot?.density ?? 0) * 100);
  const jamScore = Math.round(trafficSnapshot?.jam.score ?? 0);
  const counts = trafficSnapshot?.counts ?? { car: 0, motorcycle: 0, bus: 0, truck: 0 };
  const detections = trafficSnapshot?.detections.slice(0, 6) ?? [];
  const frameWidth = Math.max(1440, ...detections.map((item) => item.bbox[2]));
  const frameHeight = Math.max(1080, ...detections.map((item) => item.bbox[3]));

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
          desc="Данные читаются из trafficjams/traffic_data.json, который формирует YOLOv8 detector."
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
  trafficSnapshot,
}: {
  airSnapshot: AlmatyAirSnapshot | null;
  trafficSnapshot: TrafficJamSnapshot | null;
}) {
  const aqiValue = Math.round(airSnapshot?.aqiAvg ?? 0);
  const pm25Value = airSnapshot?.pm25Avg ?? 0;
  const pm10Value = airSnapshot?.pm10Avg ?? 0;
  const stationsTotal = airSnapshot?.stationsTotal ?? 0;
  const airState = getAqiState(aqiValue);
  const trafficState = getTrafficState(trafficSnapshot?.jam.score ?? 0);
  const healthInsight = buildHealthInsight(airSnapshot, trafficSnapshot);
  const updatedAt = formatAlmatyTime(airSnapshot?.timestamp || airSnapshot?.refreshedAt);
  const pm25Multiple = pm25Value > 0 ? (pm25Value / WHO_PM25_GUIDELINE).toFixed(1) : "0.0";

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
                ? `AIR API · ${stationsTotal} станций · ${airSnapshot.city}`
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

// ─── Risk Workflow Panel ─────────────────────────────────────────────────────────
function RiskWorkflowPanel() {
  const zones = [
    { name: "Бостандык", load: 96, trend: "Исполнение" },
    { name: "Алатау", load: 91, trend: "Проверка" },
    { name: "Турксиб", load: 82, trend: "Разбор" },
    { name: "Медеу", load: 64, trend: "Наблюдение" },
  ];
  const kpis = [
    { label: "В очереди", value: "6", color: "#b289ff", help: "Сколько кейсов сейчас ждут решения в risk queue." },
    { label: "Красных кейсов", value: "3", color: "#ff5c4d", help: "Количество самых приоритетных кейсов, которые требуют немедленной реакции." },
    { label: "Средний SLA", value: "1.8ч", color: "#ff9f3d", help: "Среднее время, за которое кейс должен быть обработан по текущему сценарию." },
    { label: "Отчётов готово", value: "2", color: "#47a6ff", help: "Сколько кейсов уже доведено до итогового отчёта." },
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
          title="Очередь по районам"
          help="Распределение приоритетов по районам: где исполнение уже перегрето, а где кейс ещё в наблюдении."
        />
        <div className="scm-energy-grid">
          {zones.map((z) => (
            <div className="scm-energy-card" key={z.name}>
              <div className="scm-energy-header">
                <span>{z.name}</span>
                <span className="scm-trend scm-trend-up">
                  {z.trend}
                </span>
              </div>
              <div className="scm-energy-bar-wrap">
                <div
                  className="scm-energy-bar"
                  style={{
                    width: `${z.load}%`,
                    background: z.load > 85 ? "#ff5c4d" : z.load > 70 ? "#ff9f3d" : "#b289ff",
                  }}
                />
              </div>
              <strong>{z.load}%</strong>
            </div>
          ))}
        </div>
      </div>

      <InfoCard
        title="Incident workflow"
        desc="Логика модуля: сигнал → risk queue → incident → задачи → отчёт. Это отдельный самостоятельный контур для demo и презентации."
        icon="◇"
        color="#b289ff"
        help="Смысл модуля не в красивом графике, а в завершённом operational workflow от сигнала до отчёта."
      />
    </div>
  );
}

// ─── Forecast Center Panel ───────────────────────────────────────────────────────
function ForecastCenterPanel() {
  const trucks = [
    { id: "18:00–20:00", status: "Пик трафика", district: "Центр", fill: 86 },
    { id: "20:00–22:00", status: "Порог по энергетике", district: "Юг", fill: 91 },
    { id: "06:00–09:00", status: "Инверсия AQI", district: "Алатау", fill: 73 },
    { id: "09:00–11:00", status: "Нормализация", district: "Север", fill: 42 },
  ];
  const kpis = [
    { label: "Окон риска", value: "4", color: "#58c5ff", help: "Сколько временных окон система выделила как рискованные на ближайшем горизонте." },
    { label: "Сценариев", value: "12", color: "#47a6ff", help: "Сколько вариантов развития ситуации просчитано в demo-срезе." },
    { label: "Резерв нужен", value: "2 зоны", color: "#ff9f3d", help: "Где городу стоит заранее подготовить дополнительный ресурс." },
    { label: "Точность", value: "89%", color: "#4ade80", help: "Оценка качества forecast-модуля на историческом mock-наборе." },
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
          title="Окна прогноза"
          help="Прогнозные окна показывают, когда и где город может выйти из нормы и куда нужно заранее направить ресурс."
        />
        <div className="scm-truck-list">
          {trucks.map((t) => (
            <div className="scm-truck-row" key={t.id}>
              <div className="scm-truck-id">△ {t.id}</div>
              <div className="scm-truck-info">
                <span>{t.district}</span>
                <strong>{t.status}</strong>
              </div>
              <div className="scm-truck-fill">
                <div className="scm-fill-bar-wrap">
                  <div
                    className="scm-fill-bar"
                    style={{
                      width: `${t.fill}%`,
                      background: t.fill > 90 ? "#ff5c4d" : t.fill > 60 ? "#ff9f3d" : "#34d399",
                    }}
                  />
                </div>
                <span>{t.fill}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <InfoCard
        title="Forecast center"
        desc="Модуль построен как отдельный сценарный слой: где город выйдет из нормы через час и куда заранее направить ресурс."
        icon="△"
        color="#58c5ff"
        help="Прогноз нужен не ради графика, а чтобы власти действовали до перегруза, а не после."
      />
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
