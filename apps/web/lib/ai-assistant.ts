export type AiSeverity = "Низкая" | "Средняя" | "Высокая" | "Критическая";

export type AiModuleMetric = {
  label: string;
  value: string;
  detail: string;
};

export type AiModuleContext = {
  featureId: string;
  featureLabel: string;
  overview: string;
  defaultSeverity: AiSeverity;
  severityReasonHint: string;
  metrics: AiModuleMetric[];
  findings: string[];
  recommendedFocus: string[];
  crossModuleSignals: string[];
};

export type AiAssistantSummary = {
  whatIsHappening: string;
  severity: AiSeverity;
  severityReason: string;
  recommendedActions: string[];
  crossModuleInsight: string;
};

export type AiAssistantRequest = {
  module: AiModuleContext;
  question?: string | null;
};

export type AiAssistantResponse = {
  assistantMessage: string;
  model: string;
  source: "gemini" | "fallback";
  summary: AiAssistantSummary;
};
