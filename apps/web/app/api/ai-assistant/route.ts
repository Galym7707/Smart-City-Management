import { NextResponse } from "next/server";
import type {
  AiAssistantRequest,
  AiAssistantResponse,
  AiAssistantSummary,
  AiModuleContext,
} from "../../../lib/ai-assistant";

export const dynamic = "force-dynamic";

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    whatIsHappening: {
      type: "string",
      description: "2-3 предложения на русском языке о том, что происходит в модуле сейчас.",
    },
    severity: {
      type: "string",
      enum: ["Низкая", "Средняя", "Высокая", "Критическая"],
      description: "Уровень срочности для штаба или акимата.",
    },
    severityReason: {
      type: "string",
      description: "Короткое объяснение, почему выбран именно этот уровень срочности.",
    },
    recommendedActions: {
      type: "array",
      description: "Ровно 3 простых управленческих действия для государства или штаба.",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "string",
      },
    },
    crossModuleInsight: {
      type: "string",
      description: "1-2 предложения о связи этого модуля с другими городскими контурами.",
    },
    assistantMessage: {
      type: "string",
      description: "Короткий ответ пользователю на русском. Если вопрос не задан, дай короткое сообщение о готовой сводке.",
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
    return NextResponse.json(
      { error: "Module context is required." },
      { status: 400 },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(buildFallbackResponse(body.module, body.question), {
      status: 200,
    });
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
          temperature: 0.4,
        },
      }),
      cache: "no-store",
    });

    const payload = await geminiResponse.json();
    if (!geminiResponse.ok) {
      throw new Error(
        payload?.error?.message || "Gemini request failed.",
      );
    }

    const rawText = extractGeminiText(payload);
    if (!rawText) {
      throw new Error("Gemini returned an empty response.");
    }

    const parsed = JSON.parse(rawText) as Partial<
      AiAssistantSummary & { assistantMessage: string }
    >;

    return NextResponse.json(
      normalizeGeminiResponse(parsed, body.module),
      { status: 200 },
    );
  } catch {
    return NextResponse.json(buildFallbackResponse(body.module, body.question), {
      status: 200,
    });
  }
}

function buildPrompt(module: AiModuleContext, question?: string | null) {
  const ask = question?.trim();

  return [
    "Ты городской AI-аналитик для штаба акимата Алматы.",
    "Твоя задача: не болтать, а дать управленческую сводку по модулю.",
    "Пиши только на русском языке, коротко, конкретно и без markdown.",
    "Считай, что твой читатель — руководитель, которому нужно быстро понять ситуацию и действие.",
    ask
      ? `У пользователя есть вопрос: ${ask}`
      : "Отдельного вопроса нет. Сформируй краткую сводку по текущему модулю.",
    "Используй только переданный контекст. Не выдумывай датчики, районы, цифры или причины, которых нет во входных данных.",
    `Контекст модуля: ${JSON.stringify(module)}`,
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
): AiAssistantResponse {
  const recommendedActions = Array.isArray(parsed.recommendedActions)
    ? parsed.recommendedActions.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      ).slice(0, 3)
    : [];

  return {
    assistantMessage:
      typeof parsed.assistantMessage === "string" && parsed.assistantMessage.trim().length > 0
        ? parsed.assistantMessage.trim()
        : `Сводка по модулю «${module.featureLabel}» готова.`,
    model: GEMINI_MODEL,
    source: "gemini",
    summary: {
      whatIsHappening:
        typeof parsed.whatIsHappening === "string" && parsed.whatIsHappening.trim().length > 0
          ? parsed.whatIsHappening.trim()
          : module.findings.slice(0, 2).join(" "),
      severity:
        parsed.severity === "Низкая" ||
        parsed.severity === "Средняя" ||
        parsed.severity === "Высокая" ||
        parsed.severity === "Критическая"
          ? parsed.severity
          : module.defaultSeverity,
      severityReason:
        typeof parsed.severityReason === "string" && parsed.severityReason.trim().length > 0
          ? parsed.severityReason.trim()
          : module.severityReasonHint,
      recommendedActions:
        recommendedActions.length === 3
          ? recommendedActions
          : module.recommendedFocus.slice(0, 3),
      crossModuleInsight:
        typeof parsed.crossModuleInsight === "string" && parsed.crossModuleInsight.trim().length > 0
          ? parsed.crossModuleInsight.trim()
          : module.crossModuleSignals[0] || module.overview,
    },
  };
}

function buildFallbackResponse(
  module: AiModuleContext,
  question?: string | null,
): AiAssistantResponse {
  const summary: AiAssistantSummary = {
    whatIsHappening: module.findings.slice(0, 2).join(" "),
    severity: module.defaultSeverity,
    severityReason: module.severityReasonHint,
    recommendedActions: module.recommendedFocus.slice(0, 3),
    crossModuleInsight:
      module.crossModuleSignals[0] ||
      "Этот модуль нужно рассматривать вместе с очередью рисков и отчётным контуром.",
  };

  return {
    assistantMessage: question?.trim()
      ? `По модулю «${module.featureLabel}»: ${summary.whatIsHappening} ${summary.crossModuleInsight}`
      : `Сводка по модулю «${module.featureLabel}» готова.`,
    model: "fallback",
    source: "fallback",
    summary,
  };
}
