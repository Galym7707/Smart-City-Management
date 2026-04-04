import { NextRequest, NextResponse } from "next/server";
import type {
  AlmatyAirSnapshot,
  HealthAlertSeverity,
  HealthAlertSnapshot,
  HealthAlertTelegramStatus,
  TrafficJamSnapshot,
} from "../../../lib/city-signals";

export const dynamic = "force-dynamic";

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim() || "";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID?.trim() || "";
const TELEGRAM_TARGET_LABEL = process.env.TELEGRAM_TARGET_LABEL?.trim() || null;
const ALERT_COOLDOWN_MINUTES = Number(process.env.TELEGRAM_ALERT_COOLDOWN_MINUTES ?? 120);
const ALERT_COOLDOWN_MS =
  Number.isFinite(ALERT_COOLDOWN_MINUTES) && ALERT_COOLDOWN_MINUTES > 0
    ? ALERT_COOLDOWN_MINUTES * 60 * 1000
    : 120 * 60 * 1000;

const HEALTH_ALERT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    reasoning: { type: "string" },
    recommendedActions: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string" },
    },
    telegramMessage: { type: "string" },
  },
  required: ["title", "summary", "reasoning", "recommendedActions", "telegramMessage"],
  additionalProperties: false,
} as const;

type GeminiHealthPayload = {
  title?: unknown;
  summary?: unknown;
  reasoning?: unknown;
  recommendedActions?: unknown;
  telegramMessage?: unknown;
};

type TelegramDelivery = {
  status: HealthAlertTelegramStatus;
  note: string;
  sentAt: string | null;
};

let lastSentFingerprint = "";
let lastSentAt = 0;

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  const [airSnapshot, trafficSnapshot] = await Promise.all([
    requestJson<AlmatyAirSnapshot>(`${origin}/api/almaty-air`),
    requestJson<TrafficJamSnapshot>(`${origin}/api/traffic-jams`),
  ]);

  if (!airSnapshot || !trafficSnapshot) {
    return NextResponse.json(
      { error: "Health alert inputs are unavailable." },
      { status: 502 },
    );
  }

  const evaluation = evaluateHealthRisk(airSnapshot, trafficSnapshot);
  const content = await buildHealthAlertContent(airSnapshot, trafficSnapshot, evaluation);
  const telegram = await maybeSendTelegramAlert(content.telegramMessage, evaluation);

  const snapshot: HealthAlertSnapshot = {
    active: evaluation.active,
    severity: evaluation.severity,
    title: content.title,
    summary: content.summary,
    reasoning: content.reasoning,
    recommendedActions: content.recommendedActions,
    telegramMessagePreview: content.telegramMessage,
    observedAt: new Date().toISOString(),
    metrics: {
      aqi: round1(airSnapshot.aqiAvg),
      pm25: round1(airSnapshot.pm25Avg),
      jamScore: round1(trafficSnapshot.jam.score),
      totalCount: trafficSnapshot.totalCount,
      densityPct: Math.round((trafficSnapshot.density ?? 0) * 100),
      airUpdatedAt: airSnapshot.timestamp || airSnapshot.refreshedAt,
      trafficUpdatedAt: trafficSnapshot.updatedAt,
    },
    sources: {
      air: airSnapshot.sourceUrl,
      traffic: trafficSnapshot.sourcePath,
    },
    telegram: {
      status: telegram.status,
      targetLabel: TELEGRAM_TARGET_LABEL,
      note: telegram.note,
      sentAt: telegram.sentAt,
    },
  };

  return NextResponse.json(snapshot);
}

async function requestJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function evaluateHealthRisk(airSnapshot: AlmatyAirSnapshot, trafficSnapshot: TrafficJamSnapshot) {
  const aqi = airSnapshot.aqiAvg ?? 0;
  const pm25 = airSnapshot.pm25Avg ?? 0;
  const jamScore = trafficSnapshot.jam.score ?? 0;

  const airAboveWhoDaily = pm25 >= 15;
  const airSensitiveGroups = aqi >= 101 || pm25 >= 35;
  const airUnhealthy = aqi >= 151 || pm25 >= 55;
  const trafficHigh = jamScore >= 65;
  const trafficCritical = jamScore >= 85;

  let severity: HealthAlertSeverity = "Низкая";
  if (airAboveWhoDaily || trafficHigh) {
    severity = "Средняя";
  }
  if (airAboveWhoDaily && trafficHigh) {
    severity = "Высокая";
  }
  if ((airSensitiveGroups && trafficHigh) || (airAboveWhoDaily && trafficCritical) || airUnhealthy) {
    severity = "Критическая";
  }

  return {
    active: airAboveWhoDaily && trafficHigh,
    severity,
    aqi,
    pm25,
    jamScore,
    totalCount: trafficSnapshot.totalCount,
    densityPct: Math.round((trafficSnapshot.density ?? 0) * 100),
    fingerprint: [
      airSnapshot.timestamp,
      trafficSnapshot.updatedAt,
      Math.round(pm25),
      Math.round(aqi),
      Math.round(jamScore),
      severity,
    ].join("|"),
  };
}

async function buildHealthAlertContent(
  airSnapshot: AlmatyAirSnapshot,
  trafficSnapshot: TrafficJamSnapshot,
  evaluation: ReturnType<typeof evaluateHealthRisk>,
) {
  if (!GEMINI_API_KEY) {
    return buildFallbackHealthContent(airSnapshot, evaluation);
  }

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: buildGeminiPrompt(airSnapshot, trafficSnapshot, evaluation),
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: HEALTH_ALERT_SCHEMA,
          temperature: 0.3,
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(9000),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message || "Gemini request failed.");
    }

    const raw = extractGeminiText(payload);
    if (!raw) {
      throw new Error("Gemini returned empty content.");
    }

    const parsed = JSON.parse(raw) as GeminiHealthPayload;
    return normalizeGeminiHealthPayload(parsed, airSnapshot, evaluation);
  } catch {
    return buildFallbackHealthContent(airSnapshot, evaluation);
  }
}

function buildGeminiPrompt(
  airSnapshot: AlmatyAirSnapshot,
  trafficSnapshot: TrafficJamSnapshot,
  evaluation: ReturnType<typeof evaluateHealthRisk>,
) {
  return [
    "Ты AI-аналитик городского штаба Алматы.",
    "Сформируй короткую health-сводку на русском языке по качеству воздуха и дорожной перегрузке.",
    "Используй только переданные цифры.",
    "Нельзя выдумывать районы, источники, болезни или данные.",
    "Четко разделяй наблюдаемое и вывод: наблюдаемое — AQI, PM2.5 и индекс пробки; вывод — пробка вероятно усиливает локальную выхлопную нагрузку у магистралей.",
    "В рекомендациях избегай медицинских диагнозов. Это управленческие и профилактические действия для акимата и жителей.",
    "Если риск высокий или критический, упомяни, что детям, пожилым и людям с болезнями сердца/легких стоит сократить время у загруженных дорог; маски можно рекомендовать как осторожную профилактическую меру при нахождении рядом с магистралями.",
    "Telegram message должен быть коротким, без markdown, пригодным для отправки жителю.",
    `Контекст: ${JSON.stringify({
      city: airSnapshot.city,
      air: {
        aqi: round1(airSnapshot.aqiAvg),
        pm25: round1(airSnapshot.pm25Avg),
        pm10: round1(airSnapshot.pm10Avg),
        stationsTotal: airSnapshot.stationsTotal,
        timestamp: airSnapshot.timestamp,
      },
      traffic: {
        jamScore: round1(trafficSnapshot.jam.score),
        status: trafficSnapshot.jam.status,
        totalCount: trafficSnapshot.totalCount,
        densityPct: Math.round((trafficSnapshot.density ?? 0) * 100),
        updatedAt: trafficSnapshot.updatedAt,
      },
      evaluation,
    })}`,
  ].join("\n");
}

function extractGeminiText(payload: any) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function normalizeGeminiHealthPayload(
  parsed: GeminiHealthPayload,
  airSnapshot: AlmatyAirSnapshot,
  evaluation: ReturnType<typeof evaluateHealthRisk>,
) {
  const fallback = buildFallbackHealthContent(airSnapshot, evaluation);
  const recommendedActions = Array.isArray(parsed.recommendedActions)
    ? parsed.recommendedActions.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      ).slice(0, 3)
    : [];

  return {
    title:
      typeof parsed.title === "string" && parsed.title.trim().length > 0
        ? parsed.title.trim()
        : fallback.title,
    summary:
      typeof parsed.summary === "string" && parsed.summary.trim().length > 0
        ? parsed.summary.trim()
        : fallback.summary,
    reasoning:
      typeof parsed.reasoning === "string" && parsed.reasoning.trim().length > 0
        ? parsed.reasoning.trim()
        : fallback.reasoning,
    recommendedActions:
      recommendedActions.length === 3 ? recommendedActions : fallback.recommendedActions,
    telegramMessage:
      typeof parsed.telegramMessage === "string" && parsed.telegramMessage.trim().length > 0
        ? parsed.telegramMessage.trim()
        : fallback.telegramMessage,
  };
}

function buildFallbackHealthContent(
  airSnapshot: AlmatyAirSnapshot,
  evaluation: ReturnType<typeof evaluateHealthRisk>,
) {
  const pm25Text = `${round1(evaluation.pm25)} µg/m³`;
  const aqiText = `${round1(evaluation.aqi)}`;
  const jamText = `${round1(evaluation.jamScore)}%`;

  const summary = evaluation.active
    ? `В Алматы одновременно фиксируются повышенный PM2.5 (${pm25Text}) и сильная дорожная перегрузка (${jamText}). Это повышает вероятность дополнительной выхлопной нагрузки у загруженных магистралей и увеличивает риск для чувствительных групп.`
    : `Сейчас cross-signal по здоровью в Алматы под наблюдением: AQI ${aqiText}, PM2.5 ${pm25Text}, индекс пробки ${jamText}. Для автоматической эскалации нужны одновременно более грязный воздух и сильная перегрузка дорог.`;

  const reasoning = evaluation.active
    ? `PM2.5 выше ориентира ВОЗ 15 µg/m³ для 24-часового окна, а индекс пробки указывает на сильную дорожную перегрузку. Для детей, пожилых и людей с болезнями сердца/легких это означает повышенный риск рядом с загруженными дорогами.`
    : `Система пока не переводит состояние в health-alert: один из двух триггеров недостаточно выражен. Логика смотрит на сочетание PM2.5 и дорожной перегрузки, а не на один сигнал в отрыве от другого.`;

  const recommendedActions = evaluation.active
    ? [
        "Оповестить жителей о повышенной выхлопной нагрузке возле загруженных магистралей и сократить время у дорог.",
        "Для детей, пожилых и людей с болезнями сердца или легких рекомендовать маски и ограничение длительного пребывания у магистралей.",
        "Дать приоритет разгрузке проблемного участка: перенастроить светофоры, перераспределить поток или ограничить транзит.",
      ]
    : [
        "Продолжать мониторинг AQI, PM2.5 и индекса пробки без срочной эскалации.",
        "Держать готовым шаблон уведомления для чувствительных групп на случай ухудшения воздуха и роста пробок.",
        "Следить за транспортным узлом с максимальной перегрузкой и обновлять сводку после следующего snapshot.",
      ];

  const telegramMessage = evaluation.active
    ? `Алматы: зафиксированы повышенный PM2.5 (${pm25Text}) и сильная пробка (${jamText}). Возле загруженных дорог растет выхлопная нагрузка. Детям, пожилым и людям с болезнями сердца/легких лучше сократить время у магистралей; при необходимости используйте маски.`
    : `Алматы: health-alert пока не активирован. AQI ${aqiText}, PM2.5 ${pm25Text}, индекс пробки ${jamText}. Система продолжает наблюдение.`;

  return {
    title: evaluation.active ? "Пробка и грязный воздух усиливают health-risk" : `Health-monitoring: ${airSnapshot.city}`,
    summary,
    reasoning,
    recommendedActions,
    telegramMessage,
  };
}

async function maybeSendTelegramAlert(
  message: string,
  evaluation: ReturnType<typeof evaluateHealthRisk>,
): Promise<TelegramDelivery> {
  if (!evaluation.active) {
    return {
      status: "not-triggered",
      note: "Telegram-уведомление не отправлялось: cross-signal по воздуху и пробкам пока не достиг alert-режима.",
      sentAt: null,
    };
  }

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return {
      status: "not-configured",
      note: "Telegram не подключен: для личного чата нужен bot token и numeric chat_id. Одного @username для личной доставки недостаточно.",
      sentAt: null,
    };
  }

  const now = Date.now();
  if (lastSentFingerprint === evaluation.fingerprint && now - lastSentAt < ALERT_COOLDOWN_MS) {
    return {
      status: "cooldown",
      note: "Telegram-уведомление уже отправлялось по этому состоянию; повтор подавлен cooldown-защитой.",
      sentAt: new Date(lastSentAt).toISOString(),
    };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    const payload = await response.json();
    if (!response.ok || payload?.ok !== true) {
      throw new Error(payload?.description || "Telegram delivery failed.");
    }

    lastSentFingerprint = evaluation.fingerprint;
    lastSentAt = now;

    return {
      status: "sent",
      note: "Telegram-уведомление отправлено по активному health-alert состоянию.",
      sentAt: new Date(now).toISOString(),
    };
  } catch {
    return {
      status: "failed",
      note: "Telegram вернул ошибку доставки. Проверь token, chat_id и то, что пользователь ранее начал диалог с ботом.",
      sentAt: null,
    };
  }
}

function round1(value: number) {
  return Math.round((value ?? 0) * 10) / 10;
}
