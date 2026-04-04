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
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID?.trim() || "";
const TELEGRAM_TARGET_LABEL = process.env.TELEGRAM_TARGET_LABEL?.trim() || null;
const TELEGRAM_TARGET_USERNAME = normalizeTelegramUsername(TELEGRAM_TARGET_LABEL);
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

type HealthEvaluation = {
  active: boolean;
  severity: HealthAlertSeverity;
  aqi: number;
  pm25: number;
  jamScore: number;
  totalCount: number;
  densityPct: number;
  fingerprint: string;
};

type HealthAlertContent = {
  title: string;
  summary: string;
  reasoning: string;
  recommendedActions: string[];
  telegramMessage: string;
};

type TelegramDelivery = {
  status: HealthAlertTelegramStatus;
  note: string;
  sentAt: string | null;
};

type TelegramUpdatesResponse = {
  ok?: boolean;
  result?: TelegramUpdate[];
  description?: string;
};

type TelegramUpdate = {
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

type TelegramMessage = {
  chat?: {
    id?: number | string;
    type?: string;
    username?: string;
  };
  from?: {
    username?: string;
  };
};

let resolvedTelegramChatId = TELEGRAM_CHAT_ID;
let lastSentFingerprint = "";
let lastSentAt = 0;

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  const [airSnapshot, trafficSnapshot] = await Promise.all([
    requestJson<AlmatyAirSnapshot>(`${origin}/api/almaty-air`),
    requestJson<TrafficJamSnapshot>(`${origin}/api/traffic-jams`),
  ]);

  if (!airSnapshot || !trafficSnapshot) {
    return NextResponse.json({ error: "Health alert inputs are unavailable." }, { status: 502 });
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

function evaluateHealthRisk(airSnapshot: AlmatyAirSnapshot, trafficSnapshot: TrafficJamSnapshot): HealthEvaluation {
  const aqi = airSnapshot.aqiAvg ?? 0;
  const pm25 = airSnapshot.pm25Avg ?? 0;
  const jamScore = trafficSnapshot.jam.score ?? 0;

  const airAboveWhoDaily = pm25 >= 15;
  const airSensitiveGroups = aqi >= 101 || pm25 >= 35;
  const airUnhealthy = aqi >= 151 || pm25 >= 55;
  const trafficHigh = jamScore >= 65;
  const trafficCritical = jamScore >= 85;

  let severity: HealthAlertSeverity = "Средняя";
  if (!airAboveWhoDaily && !trafficHigh) {
    severity = "Низкая";
  } else if (airAboveWhoDaily && trafficHigh) {
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
  evaluation: HealthEvaluation,
): Promise<HealthAlertContent> {
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
          temperature: 0.2,
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

    return normalizeGeminiHealthPayload(
      JSON.parse(raw) as GeminiHealthPayload,
      airSnapshot,
      evaluation,
    );
  } catch {
    return buildFallbackHealthContent(airSnapshot, evaluation);
  }
}

function buildGeminiPrompt(
  airSnapshot: AlmatyAirSnapshot,
  trafficSnapshot: TrafficJamSnapshot,
  evaluation: HealthEvaluation,
) {
  return [
    "Ты AI-аналитик городского штаба Алматы.",
    "Сформируй короткую health-сводку на русском языке по качеству воздуха и дорожной перегрузке.",
    "Используй только переданные цифры и факты.",
    "Нельзя выдумывать районы, источники, заболевания, службы или данные.",
    "Разделяй наблюдаемое и вывод: наблюдаемое — AQI, PM2.5, PM10 и индекс пробки; вывод — что это означает для города.",
    "Рекомендуемые действия должны быть простыми и пригодными для акимата сегодня.",
    "Можно советовать сократить время у магистралей и использовать маски как осторожную профилактическую меру при плохом воздухе и сильных пробках.",
    "Не ставь диагнозы и не выдавай медицинские гарантии.",
    "Telegram message должен быть коротким, без markdown и пригодным для отправки жителю.",
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
  evaluation: HealthEvaluation,
): HealthAlertContent {
  const fallback = buildFallbackHealthContent(airSnapshot, evaluation);
  const recommendedActions = Array.isArray(parsed.recommendedActions)
    ? parsed.recommendedActions.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      ).slice(0, 3)
    : [];

  return {
    title: normalizeText(parsed.title, fallback.title),
    summary: normalizeText(parsed.summary, fallback.summary),
    reasoning: normalizeText(parsed.reasoning, fallback.reasoning),
    recommendedActions: recommendedActions.length === 3 ? recommendedActions : fallback.recommendedActions,
    telegramMessage: normalizeText(parsed.telegramMessage, fallback.telegramMessage),
  };
}

function buildFallbackHealthContent(
  airSnapshot: AlmatyAirSnapshot,
  evaluation: HealthEvaluation,
): HealthAlertContent {
  const pm25Text = `${round1(evaluation.pm25)} µg/m³`;
  const aqiText = String(round1(evaluation.aqi));
  const jamText = `${round1(evaluation.jamScore)}%`;

  const summary = evaluation.active
    ? `В Алматы одновременно фиксируются повышенный PM2.5 (${pm25Text}) и сильная дорожная перегрузка (${jamText}). Это повышает выхлопную нагрузку рядом с загруженными магистралями и усиливает риск для чувствительных групп населения.`
    : `Сейчас health-alert по Алматы остаётся в режиме наблюдения: AQI ${aqiText}, PM2.5 ${pm25Text}, индекс пробки ${jamText}. Для автоматической эскалации нужны одновременно грязный воздух и сильная дорожная перегрузка.`;

  const reasoning = evaluation.active
    ? `PM2.5 выше ориентира ВОЗ 15 µg/m³ для 24-часового окна, а индекс пробки указывает на сильную дорожную перегрузку. Для детей, пожилых и людей с болезнями сердца или лёгких это означает повышенный риск рядом с загруженными дорогами.`
    : `Система не поднимает alert, потому что одно из двух условий недостаточно выражено. Логика смотрит именно на сочетание воздуха и пробок, а не на один сигнал в отрыве от другого.`;

  const recommendedActions = evaluation.active
    ? [
        "Предупредить жителей о повышенной выхлопной нагрузке возле загруженных магистралей и сократить время у дорог.",
        "Рекомендовать детям, пожилым и людям с болезнями сердца или лёгких ограничить длительное пребывание у магистралей; при необходимости использовать маски.",
        "Разгрузить самый перегруженный транспортный участок через управление светофорами, перераспределение потока или ограничение транзита.",
      ]
    : [
        "Продолжать мониторинг AQI, PM2.5 и индекса пробки без срочной эскалации.",
        "Держать готовым шаблон уведомления для чувствительных групп на случай ухудшения воздуха и роста пробок.",
        "Следить за самым перегруженным транспортным узлом и обновить сводку после следующего snapshot.",
      ];

  const telegramMessage = evaluation.active
    ? `Алматы: фиксируются повышенный PM2.5 (${pm25Text}) и сильная пробка (${jamText}). Возле загруженных дорог растёт выхлопная нагрузка. Детям, пожилым и людям с болезнями сердца или лёгких лучше сократить время у магистралей; при необходимости используйте маски.`
    : `Алматы: health-alert пока не активирован. AQI ${aqiText}, PM2.5 ${pm25Text}, индекс пробки ${jamText}. Система продолжает наблюдение.`;

  return {
    title: evaluation.active
      ? "Пробки и грязный воздух усиливают health-risk"
      : `Health-monitoring: ${airSnapshot.city}`,
    summary,
    reasoning,
    recommendedActions,
    telegramMessage,
  };
}

async function maybeSendTelegramAlert(
  message: string,
  evaluation: HealthEvaluation,
): Promise<TelegramDelivery> {
  if (!evaluation.active) {
    return {
      status: "not-triggered",
      note: "Telegram не отправлялся: одновременно высокий PM2.5 и сильная пробка сейчас не дали alert-режим.",
      sentAt: null,
    };
  }

  if (!TELEGRAM_BOT_TOKEN) {
    return {
      status: "not-configured",
      note: "Telegram не подключен: в .env.local отсутствует TELEGRAM_BOT_TOKEN.",
      sentAt: null,
    };
  }

  const resolvedChatId = await resolveTelegramChatId();
  if (!resolvedChatId) {
    return {
      status: "not-configured",
      note:
        "Telegram не подключен до конца: нужен numeric chat_id или bot token с доступным getUpdates. Если цель — личный Telegram, открой бота и нажми /start, тогда username можно будет связать с chat_id автоматически.",
      sentAt: null,
    };
  }

  const now = Date.now();
  if (lastSentFingerprint === evaluation.fingerprint && now - lastSentAt < ALERT_COOLDOWN_MS) {
    return {
      status: "cooldown",
      note: "Telegram уже отправлялся по этому состоянию; повтор подавлен cooldown-защитой.",
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
        chat_id: resolvedChatId,
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
      note: TELEGRAM_CHAT_ID
        ? "Telegram-уведомление отправлено по активному health-alert состоянию."
        : `Telegram-уведомление отправлено после автоматического определения chat_id для ${TELEGRAM_TARGET_LABEL ?? "целевого пользователя"}.`,
      sentAt: new Date(now).toISOString(),
    };
  } catch {
    return {
      status: "failed",
      note: "Telegram вернул ошибку доставки. Проверь bot token, права бота и то, что пользователь ранее начал диалог с ботом.",
      sentAt: null,
    };
  }
}

async function resolveTelegramChatId() {
  if (TELEGRAM_CHAT_ID) {
    return TELEGRAM_CHAT_ID;
  }

  if (resolvedTelegramChatId) {
    return resolvedTelegramChatId;
  }

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_TARGET_USERNAME) {
    return null;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const payload = (await response.json()) as TelegramUpdatesResponse;

    if (!response.ok || payload.ok !== true || !Array.isArray(payload.result)) {
      return null;
    }

    for (const update of [...payload.result].reverse()) {
      for (const message of [update.message, update.edited_message]) {
        if (!message || message.chat?.type !== "private") {
          continue;
        }

        const username = normalizeTelegramUsername(message.from?.username ?? message.chat?.username);
        const chatId = normalizeTelegramChatId(message.chat?.id);

        if (username === TELEGRAM_TARGET_USERNAME && chatId) {
          resolvedTelegramChatId = chatId;
          return resolvedTelegramChatId;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

function normalizeText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeTelegramUsername(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0
    ? value.replace(/^@/, "").trim().toLowerCase()
    : "";
}

function normalizeTelegramChatId(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return null;
}

function round1(value: number) {
  return Math.round((value ?? 0) * 10) / 10;
}
