import { NextResponse } from "next/server";
import type {
  AiAssistantRequest,
  AiAssistantResponse,
  AiAssistantSummary,
  AiModuleContext,
  AiSeverity,
} from "../../../lib/ai-assistant";

export const dynamic = "force-dynamic";

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
const SEVERITY_VALUES = ["Низкая", "Средняя", "Высокая", "Критическая"] as const;

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    whatIsHappening: {
      type: "string",
      description:
        "Короткая управленческая сводка на русском языке о том, что происходит сейчас и почему это важно.",
    },
    severity: {
      type: "string",
      enum: SEVERITY_VALUES,
      description: "Уровень срочности для штаба или акимата.",
    },
    severityReason: {
      type: "string",
      description:
        "Почему выбран именно этот уровень срочности. Объясни на языке решения, а не интерфейса.",
    },
    recommendedActions: {
      type: "array",
      description:
        "Ровно 3 действия для акимата или городского штаба. Каждое действие должно быть коротким, конкретным и начинаться с глагола.",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "string",
      },
    },
    crossModuleInsight: {
      type: "string",
      description:
        "Короткая связь этого модуля с другими контурами города: транспорт, воздух, безопасность, отчёты и так далее.",
    },
    assistantMessage: {
      type: "string",
      description:
        "Короткий ответ пользователю на русском языке. Если вопрос задан, ответь по существу. Если вопроса нет, дай короткую готовую записку по модулю.",
    },
  },
  required: [
    "whatIsHappening",
    "severity",
    "severityReason",
    "recommendedActions",
    "crossModuleInsight",
    "assistantMessage",
  ],
  additionalProperties: false,
} as const;

export async function POST(request: Request) {
  const body = (await request.json()) as AiAssistantRequest;

  if (!body?.module) {
    return NextResponse.json({ error: "Module context is required." }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(buildFallbackResponse(body.module, body.question), { status: 200 });
  }

  try {
    const geminiResponse = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: buildPrompt(body.module, body.question),
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: SUMMARY_SCHEMA,
          temperature: 0.2,
        },
      }),
      cache: "no-store",
    });

    const payload = await geminiResponse.json();
    if (!geminiResponse.ok) {
      throw new Error(payload?.error?.message || "Gemini request failed.");
    }

    const rawText = extractGeminiText(payload);
    if (!rawText) {
      throw new Error("Gemini returned an empty response.");
    }

    const parsed = JSON.parse(rawText) as Partial<AiAssistantSummary & { assistantMessage: string }>;
    return NextResponse.json(normalizeGeminiResponse(parsed, body.module, body.question), {
      status: 200,
    });
  } catch {
    return NextResponse.json(buildFallbackResponse(body.module, body.question), { status: 200 });
  }
}

function buildPrompt(module: AiModuleContext, question?: string | null) {
  const ask = question?.trim();
  const metricsBlock = module.metrics
    .map((metric) => `- ${metric.label}: ${metric.value}. ${metric.detail}`)
    .join("\n");
  const findingsBlock = module.findings.map((item) => `- ${item}`).join("\n");
  const focusBlock = module.recommendedFocus.map((item) => `- ${item}`).join("\n");
  const crossSignalsBlock = module.crossModuleSignals.map((item) => `- ${item}`).join("\n");

  return [
    "Ты городской AI-аналитик для штаба акимата Алматы.",
    "Твоя задача: на основе данных дать короткую управленческую записку, а не общий чат-ответ.",
    "Пиши только на русском языке и только по фактам из переданного контекста.",
    "Не упоминай модель, API, интерфейс, дашборд, карточки, JSON или prompt.",
    "Не выдумывай цифры, районы, причины, службы или источники, которых нет в контексте.",
    "Если данных не хватает, прямо скажи об ограничении в том поле, где это важно.",
    "Смотри на ситуацию глазами акимата: что происходит, насколько срочно, что нужно сделать сегодня.",
    "recommendedActions должны быть ровно из 3 строк, каждая строка начинается с глагола и по возможности указывает ответственного или горизонт действия.",
    "Избегай пустых формулировок вроде 'усилить мониторинг', если не можешь привязать их к фактам или зоне ответственности.",
    "Если в контексте одновременно есть грязный воздух и сильные пробки, допускается рекомендация для детей, пожилых и людей с респираторными рисками.",
    "",
    `Модуль: ${module.featureLabel}`,
    `Обзор: ${module.overview}`,
    `Базовая срочность: ${module.defaultSeverity}`,
    `Подсказка по срочности: ${module.severityReasonHint}`,
    "",
    "Метрики:",
    metricsBlock || "- нет данных",
    "",
    "Подтверждённые факты:",
    findingsBlock || "- нет данных",
    "",
    "Текущий управленческий фокус:",
    focusBlock || "- нет данных",
    "",
    "Связь с другими модулями:",
    crossSignalsBlock || "- нет данных",
    "",
    ask
      ? `Вопрос пользователя: ${ask}`
      : "Отдельного вопроса нет. Сформируй краткую сводку для руководителя акимата.",
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

function normalizeGeminiResponse(
  parsed: Partial<AiAssistantSummary & { assistantMessage: string }>,
  module: AiModuleContext,
  question?: string | null,
): AiAssistantResponse {
  const recommendedActions = normalizeActions(parsed.recommendedActions, module);
  const severity = normalizeSeverity(parsed.severity, module.defaultSeverity);

  const summary: AiAssistantSummary = {
    whatIsHappening: normalizeText(
      parsed.whatIsHappening,
      module.findings.slice(0, 2).join(" "),
    ),
    severity,
    severityReason: normalizeText(parsed.severityReason, module.severityReasonHint),
    recommendedActions,
    crossModuleInsight: normalizeText(
      parsed.crossModuleInsight,
      module.crossModuleSignals[0] || module.overview,
    ),
  };

  return {
    assistantMessage: normalizeText(
      parsed.assistantMessage,
      buildFallbackAssistantMessage(summary, module, question),
    ),
    model: GEMINI_MODEL,
    source: "gemini",
    summary,
  };
}

function buildFallbackResponse(module: AiModuleContext, question?: string | null): AiAssistantResponse {
  const summary: AiAssistantSummary = {
    whatIsHappening: module.findings.slice(0, 2).join(" "),
    severity: module.defaultSeverity,
    severityReason: module.severityReasonHint,
    recommendedActions: normalizeActions([], module),
    crossModuleInsight: module.crossModuleSignals[0] || module.overview,
  };

  return {
    assistantMessage: buildFallbackAssistantMessage(summary, module, question),
    model: "fallback",
    source: "fallback",
    summary,
  };
}

function normalizeText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeSeverity(value: unknown, fallback: AiSeverity): AiSeverity {
  return typeof value === "string" && SEVERITY_VALUES.includes(value as AiSeverity)
    ? (value as AiSeverity)
    : fallback;
}

function normalizeActions(value: unknown, module: AiModuleContext) {
  const parsed = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 3)
    : [];

  if (parsed.length === 3) {
    return parsed;
  }

  const fallback = module.recommendedFocus
    .filter((item) => item.trim().length > 0)
    .slice(0, 3);

  while (fallback.length < 3) {
    fallback.push("Уточнить данные по модулю и обновить решение для штаба.");
  }

  return fallback;
}

function buildFallbackAssistantMessage(
  summary: AiAssistantSummary,
  module: AiModuleContext,
  question?: string | null,
) {
  if (question?.trim()) {
    return `${summary.whatIsHappening} Приоритет: ${summary.severity.toLowerCase()}. Первое действие: ${summary.recommendedActions[0]}`;
  }

  return `Сводка по модулю «${module.featureLabel}»: ${summary.whatIsHappening} Первое действие: ${summary.recommendedActions[0]}`;
}
