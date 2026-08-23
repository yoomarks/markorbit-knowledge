import type { AiKnowledgeProvider } from "./ai-distilled-knowledge-v1";

export const AI_PRODUCTION_PILOT_PROTOCOL_VERSION = "1.0" as const;

export type AiProductionPilotPlanV1 = {
  protocolVersion: typeof AI_PRODUCTION_PILOT_PROTOCOL_VERSION;
  objectType: "AI_PRODUCTION_PILOT_PLAN";
  pilotId: string;
  assignmentIds: [string, string, string];
  providers: AiKnowledgeProvider[];
  approvalRef: string;
  liveProviderCallsAuthorized: true;
  boundaries: {
    compareProviderQuality: false;
    legalTruthVerified: false;
    candidateAutoActivation: false;
  };
  createdAt: string;
};

export type AiProductionPilotCellStatus =
  "EXECUTED" | "BLOCKED_ADAPTER" | "BLOCKED_CREDENTIAL" | "FAILED";

export type AiProductionPilotCellReceiptV1 = {
  assignmentId: string;
  provider: AiKnowledgeProvider;
  status: AiProductionPilotCellStatus;
  submissionId?: string;
  artifactId?: string;
  errorCode?: string;
  retryable?: boolean;
};

export type AiProductionPilotRunV1 = {
  protocolVersion: typeof AI_PRODUCTION_PILOT_PROTOCOL_VERSION;
  objectType: "AI_PRODUCTION_PILOT_RUN";
  runId: string;
  pilotId: string;
  startedAt: string;
  completedAt: string;
  receipts: AiProductionPilotCellReceiptV1[];
  boundaries: {
    providerRankingProduced: false;
    legalTruthVerified: false;
    candidateAutoActivationApplied: false;
  };
};

const ID = /^[a-z][a-z0-9_]{2,127}$/u;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function isAiProductionPilotPlanV1(value: unknown): value is AiProductionPilotPlanV1 {
  const item = record(value);
  if (!item) return false;
  const assignments = item.assignmentIds;
  const providers = item.providers;
  const boundaries = record(item.boundaries);
  return Boolean(
    item.protocolVersion === AI_PRODUCTION_PILOT_PROTOCOL_VERSION &&
    item.objectType === "AI_PRODUCTION_PILOT_PLAN" &&
    typeof item.pilotId === "string" &&
    item.pilotId.startsWith("app_") &&
    ID.test(item.pilotId) &&
    Array.isArray(assignments) &&
    assignments.length === 3 &&
    assignments.every((id) => typeof id === "string" && id.startsWith("kas_") && ID.test(id)) &&
    new Set(assignments).size === 3 &&
    Array.isArray(providers) &&
    providers.length >= 2 &&
    new Set(providers).size === providers.length &&
    providers.every((provider) =>
      ["DEEPSEEK", "OPENAI", "KIMI", "CLAUDE", "GEMINI"].includes(String(provider)),
    ) &&
    typeof item.approvalRef === "string" &&
    item.approvalRef.trim().length > 0 &&
    item.liveProviderCallsAuthorized === true &&
    boundaries?.compareProviderQuality === false &&
    boundaries?.legalTruthVerified === false &&
    boundaries?.candidateAutoActivation === false &&
    timestamp(item.createdAt),
  );
}
