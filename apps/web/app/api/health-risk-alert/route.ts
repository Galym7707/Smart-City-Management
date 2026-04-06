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

type TelegramAudience = {
  chatIds: string[];
  freshMessages: TelegramPrivateMessage[];
};

type TelegramUpdatesResponse = {
  ok?: boolean;
  result?: TelegramUpdate[];
  description?: string;
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

type TelegramMessage = {
  text?: string;
  chat?: {
    id?: number | string;
    type?: string;
    username?: string;
  };
  from?: {
    username?: string;
  };
};

type TelegramPrivateMessage = {
  updateId: number;
  chatId: string;
  username: string | null;
  text: string;
};

let knownTelegramChatIds = new Set<string>(TELEGRAM_CHAT_ID ? [TELEGRAM_CHAT_ID] : []);
let telegramAudiencePrimed = false;
let lastProcessedTelegramUpdateId = 0;
let lastSentFingerprint = "";
let lastSentAt = 0;
let lastSentByChat = new Map<string, { fingerprint: string; sentAt: number }>();

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
  const telegramAudience = await syncTelegramAudience();
  const repliedChatIds = await maybeReplyToTelegramMessages(telegramAudience.freshMessages, content.telegramMessage);
  const alertAudience = telegramAudience.chatIds.filter((chatId) => !repliedChatIds.has(chatId));
  const telegram = await maybeSendTelegramAlert(
    content.telegramMessage,
    evaluation,
    alertAudience,
    repliedChatIds.size,
  );

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
      targetLabel: telegramAudience.chatIds.length > 0 ? "все private-чаты бота" : null,
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
    "summary должен быть коротким, без повторного перечисления всех цифр, и отвечать на вопрос: что это значит для города прямо сейчас.",
    "reasoning должен объяснять только логику срабатывания alert: какие условия выполнены или не выполнены. Не повторяй summary.",
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
    ? "Грязный воздух совпал с сильной дорожной перегрузкой, поэтому рядом с магистралями вырос риск для чувствительных групп."
    : "Система держит воздух и трафик под наблюдением, но alert-режим пока не включён.";

  const reasoning = evaluation.active
    ? `Alert сработал, потому что PM2.5 ${pm25Text} выше порога 15 µg/m³, а индекс пробки ${jamText} выше порога 65%.`
    : `Alert включается только когда одновременно PM2.5 выше 15 µg/m³ и индекс пробки выше 65%. Сейчас как минимум одно из этих условий не выполнено.`;

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
  chatIds: string[],
  repliedChatCount: number,
): Promise<TelegramDelivery> {
  if (!evaluation.active) {
    return {
      status: "not-triggered",
      note: "Alert-рассылка не запускалась: одновременно высокий PM2.5 и сильная пробка сейчас не дали alert-режим.",
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

  if (chatIds.length === 0 && repliedChatCount > 0) {
    return {
      status: "sent",
      note: "Новые входящие сообщения уже получили ответ; отдельная alert-рассылка в этом цикле не дублировалась.",
      sentAt: new Date().toISOString(),
    };
  }

  if (chatIds.length === 0) {
    return {
      status: "not-configured",
      note:
        "У бота пока нет подписанных private-пользователей. Любой пользователь должен открыть бота и отправить /start или любое сообщение.",
      sentAt: null,
    };
  }

  const now = Date.now();
  let sentCount = 0;
  let cooldownCount = 0;
  let failedCount = 0;
  let latestSentAt: string | null = null;

  for (const chatId of chatIds) {
    const previous = lastSentByChat.get(chatId);
    if (
      previous &&
      previous.fingerprint === evaluation.fingerprint &&
      now - previous.sentAt < ALERT_COOLDOWN_MS
    ) {
      cooldownCount += 1;
      latestSentAt = latestSentAt ?? new Date(previous.sentAt).toISOString();
      continue;
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });

      const payload = await response.json();
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.description || "Telegram delivery failed.");
      }

      sentCount += 1;
      lastSentByChat.set(chatId, {
        fingerprint: evaluation.fingerprint,
        sentAt: now,
      });
      latestSentAt = new Date(now).toISOString();
    } catch {
      failedCount += 1;
    }
  }

  if (sentCount > 0) {
    lastSentFingerprint = evaluation.fingerprint;
    lastSentAt = now;
    return {
      status: "sent",
      note:
        cooldownCount > 0
          ? `Уведомление отправлено в ${sentCount} private-чатов; ещё для ${cooldownCount} повтор подавлен cooldown-защитой.`
          : `Уведомление отправлено в ${sentCount} private-чатов.`,
      sentAt: latestSentAt,
    };
  }

  if (cooldownCount > 0 && failedCount === 0) {
    return {
      status: "cooldown",
      note: `Повтор уведомления подавлен cooldown-защитой для ${cooldownCount} private-чатов.`,
      sentAt: latestSentAt,
    };
  }

  return {
    status: "failed",
    note:
      failedCount > 0
        ? `Не удалось доставить уведомление в ${failedCount} private-чатов. Проверь права бота и доступность Telegram API.`
        : "Не удалось определить получателей для отправки уведомления.",
    sentAt: latestSentAt,
  };
}

async function syncTelegramAudience(): Promise<TelegramAudience> {
  if (!TELEGRAM_BOT_TOKEN) {
    return {
      chatIds: TELEGRAM_CHAT_ID ? [TELEGRAM_CHAT_ID] : [],
      freshMessages: [],
    };
  }

  try {
    const url = new URL(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`);
    if (telegramAudiencePrimed && lastProcessedTelegramUpdateId > 0) {
      url.searchParams.set("offset", String(lastProcessedTelegramUpdateId + 1));
    }

    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const payload = (await response.json()) as TelegramUpdatesResponse;

    if (!response.ok || payload.ok !== true || !Array.isArray(payload.result)) {
      return {
        chatIds: Array.from(knownTelegramChatIds),
        freshMessages: [],
      };
    }

    const freshMessages: TelegramPrivateMessage[] = [];
    let maxUpdateId = lastProcessedTelegramUpdateId;

    for (const update of payload.result) {
      if (typeof update.update_id === "number") {
        maxUpdateId = Math.max(maxUpdateId, update.update_id);
      }

      for (const message of [update.message, update.edited_message]) {
        if (!message || message.chat?.type !== "private") {
          continue;
        }

        const chatId = normalizeTelegramChatId(message.chat?.id);
        if (!chatId) {
          continue;
        }

        knownTelegramChatIds.add(chatId);

        if (telegramAudiencePrimed && typeof update.update_id === "number" && typeof message.text === "string") {
          freshMessages.push({
            updateId: update.update_id,
            chatId,
            username: normalizeTelegramUsername(message.from?.username ?? message.chat?.username) || null,
            text: message.text.trim(),
          });
        }
      }
    }

    telegramAudiencePrimed = true;
    lastProcessedTelegramUpdateId = maxUpdateId;

    return {
      chatIds: Array.from(knownTelegramChatIds),
      freshMessages,
    };
  } catch {
    return {
      chatIds: Array.from(knownTelegramChatIds),
      freshMessages: [],
    };
  }
}

async function maybeReplyToTelegramMessages(messages: TelegramPrivateMessage[], message: string) {
  const repliedChatIds = new Set<string>();

  if (!TELEGRAM_BOT_TOKEN || messages.length === 0) {
    return repliedChatIds;
  }

  for (const entry of messages) {
    if (!entry.text) {
      continue;
    }

    try {
      const replyText = buildTelegramReplyText(entry.text, message);
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: entry.chatId,
          text: replyText,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      repliedChatIds.add(entry.chatId);
    } catch {
      // MVP shortcut: silent reply failure should not break the health-alert route.
    }
  }

  return repliedChatIds;
}

function buildTelegramReplyText(input: string, statusMessage: string) {
  const normalized = input.trim().toLowerCase();

  if (normalized.startsWith("/start")) {
    return [
      "Привет! Я бот Smart City Management Almaty.",
      "Я показываю короткую сводку по воздуху и пробкам в Алматы и присылаю alert, когда загрязнение воздуха и дорожная перегрузка совпадают.",
      "Напиши /status, чтобы получить текущую сводку прямо сейчас.",
    ].join("\n\n");
  }

  if (normalized.startsWith("/status") || normalized.startsWith("/air") || normalized === "test") {
    return statusMessage;
  }

  return [
    "Я бот Smart City Management Almaty.",
    "Напиши /status, чтобы получить текущую сводку по воздуху и пробкам в Алматы.",
    statusMessage,
  ].join("\n\n");
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
