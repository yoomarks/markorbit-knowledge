import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import {
  AiKnowledgeAcquisitionError,
  type AiKnowledgeAcquisition,
  type AiKnowledgeProviderAdapter,
} from "@markorbit/worker-runtime/ai-distilled-knowledge-acquirer";
import type { AiProductionPilotPlanV1 } from "@markorbit/worker-runtime/ai-production-pilot";
import type { LivePilotLineage, LivePilotReceiptView } from "./adk-live-pilot-acceptance";

type AiKnowledgeAssignmentV1 = AiKnowledgeAcquisition["assignment"];
type LivePilotProvider = "DEEPSEEK" | "OPENAI";

export type AdkLivePilotDurableCellV1 = LivePilotLineage & {
  status: "DURABLE";
  rawProviderReceiptId: string;
  markdownReceiptId: string;
  bytesPrepared: number;
  recordedAt: string;
};

export type AdkLivePilotInFlightCellV1 = {
  assignmentId: string;
  provider: LivePilotProvider;
  startedAt: string;
};

export type AdkLivePilotCheckpointV1 = {
  protocolVersion: "1.0";
  objectType: "AI_PRODUCTION_PILOT_LIVE_CHECKPOINT";
  pilotId: string;
  approvalRef: string;
  runId: string;
  startedAt: string;
  assignmentIds: [string, string, string];
  providers: ["DEEPSEEK", "OPENAI"];
  cells: AdkLivePilotDurableCellV1[];
  inFlight?: AdkLivePilotInFlightCellV1;
  updatedAt: string;
};

export type AdkLivePilotCellPersistence = {
  lineage: LivePilotLineage;
  rawProviderReceiptId: string;
  markdownReceiptId: string;
  bytesPrepared: number;
};

export type AdkLivePilotResumableResult = {
  runId: string;
  receipts: LivePilotReceiptView[];
  lineage: LivePilotLineage[];
  artifactReceiptIds: string[];
  bytesPrepared: number;
  durableCellCount: number;
  completed: boolean;
};

type ResumableExecutionInput = {
  checkpointPath: string;
  plan: AiProductionPilotPlanV1;
  assignments: ReadonlyMap<string, AiKnowledgeAssignmentV1>;
  adapters: ReadonlyMap<LivePilotProvider, AiKnowledgeProviderAdapter>;
  persistAcquisition: (acquisition: AiKnowledgeAcquisition) => Promise<AdkLivePilotCellPersistence>;
  verifyDurableCell: (cell: AdkLivePilotDurableCellV1) => void;
  now?: () => Date;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isProvider(value: unknown): value is LivePilotProvider {
  return value === "DEEPSEEK" || value === "OPENAI";
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cellKey(assignmentId: string, provider: LivePilotProvider): string {
  return `${assignmentId}:${provider}`;
}

function stableRunId(plan: AiProductionPilotPlanV1, startedAt: string): string {
  const hash = createHash("sha256")
    .update(
      `${plan.pilotId}:${plan.approvalRef}:${startedAt}:${plan.assignmentIds.join(":")}:${plan.providers.join(":")}`,
    )
    .digest("hex");
  return `apr_${hash.slice(0, 32)}`;
}

function parseDurableCell(value: unknown): AdkLivePilotDurableCellV1 {
  const item = record(value);
  if (
    !item ||
    item.status !== "DURABLE" ||
    !isNonEmpty(item.assignmentId) ||
    !isProvider(item.provider) ||
    !isNonEmpty(item.submissionId) ||
    !isNonEmpty(item.distilledArtifactId) ||
    !isNonEmpty(item.rawProviderArtifactId) ||
    !isNonEmpty(item.markdownRawArtifactId) ||
    !isNonEmpty(item.rawProviderReceiptId) ||
    !isNonEmpty(item.markdownReceiptId) ||
    typeof item.bytesPrepared !== "number" ||
    !Number.isSafeInteger(item.bytesPrepared) ||
    item.bytesPrepared < 0 ||
    !isTimestamp(item.recordedAt)
  ) {
    throw new Error("Invalid durable ADK live pilot checkpoint cell");
  }
  return {
    status: "DURABLE",
    assignmentId: item.assignmentId,
    provider: item.provider,
    submissionId: item.submissionId,
    distilledArtifactId: item.distilledArtifactId,
    rawProviderArtifactId: item.rawProviderArtifactId,
    markdownRawArtifactId: item.markdownRawArtifactId,
    rawProviderReceiptId: item.rawProviderReceiptId,
    markdownReceiptId: item.markdownReceiptId,
    bytesPrepared: item.bytesPrepared,
    recordedAt: item.recordedAt,
  };
}

function parseInFlight(value: unknown): AdkLivePilotInFlightCellV1 | undefined {
  if (value === undefined) return undefined;
  const item = record(value);
  if (
    !item ||
    !isNonEmpty(item.assignmentId) ||
    !isProvider(item.provider) ||
    !isTimestamp(item.startedAt)
  ) {
    throw new Error("Invalid in-flight ADK live pilot checkpoint cell");
  }
  return {
    assignmentId: item.assignmentId,
    provider: item.provider,
    startedAt: item.startedAt,
  };
}

export function parseAdkLivePilotCheckpoint(value: unknown): AdkLivePilotCheckpointV1 {
  const item = record(value);
  if (
    !item ||
    item.protocolVersion !== "1.0" ||
    item.objectType !== "AI_PRODUCTION_PILOT_LIVE_CHECKPOINT" ||
    !isNonEmpty(item.pilotId) ||
    !isNonEmpty(item.approvalRef) ||
    !isNonEmpty(item.runId) ||
    !isTimestamp(item.startedAt) ||
    !Array.isArray(item.assignmentIds) ||
    item.assignmentIds.length !== 3 ||
    item.assignmentIds.some((entry) => !isNonEmpty(entry)) ||
    !Array.isArray(item.providers) ||
    item.providers.length !== 2 ||
    item.providers[0] !== "DEEPSEEK" ||
    item.providers[1] !== "OPENAI" ||
    !Array.isArray(item.cells) ||
    !isTimestamp(item.updatedAt)
  ) {
    throw new Error("Invalid ADK live pilot checkpoint");
  }

  const cells = item.cells.map(parseDurableCell);
  const keys = cells.map((cell) => cellKey(cell.assignmentId, cell.provider));
  if (new Set(keys).size !== keys.length) {
    throw new Error("ADK live pilot checkpoint contains duplicate durable cells");
  }
  const inFlight = parseInFlight(item.inFlight);

  return {
    protocolVersion: "1.0",
    objectType: "AI_PRODUCTION_PILOT_LIVE_CHECKPOINT",
    pilotId: item.pilotId,
    approvalRef: item.approvalRef,
    runId: item.runId,
    startedAt: item.startedAt,
    assignmentIds: [
      item.assignmentIds[0] as string,
      item.assignmentIds[1] as string,
      item.assignmentIds[2] as string,
    ],
    providers: ["DEEPSEEK", "OPENAI"],
    cells,
    ...(inFlight ? { inFlight } : {}),
    updatedAt: item.updatedAt,
  };
}

function assertCheckpointMatchesPlan(
  checkpoint: AdkLivePilotCheckpointV1,
  plan: AiProductionPilotPlanV1,
): void {
  if (
    checkpoint.pilotId !== plan.pilotId ||
    checkpoint.approvalRef !== plan.approvalRef ||
    JSON.stringify(checkpoint.assignmentIds) !== JSON.stringify(plan.assignmentIds) ||
    JSON.stringify(checkpoint.providers) !== JSON.stringify(plan.providers)
  ) {
    throw new Error("ADK live pilot checkpoint does not match the frozen plan");
  }
}

function assertLiveProviderOrder(plan: AiProductionPilotPlanV1): void {
  if (
    plan.providers.length !== 2 ||
    plan.providers[0] !== "DEEPSEEK" ||
    plan.providers[1] !== "OPENAI"
  ) {
    throw new Error("ADK live pilot provider set must be exactly DEEPSEEK,OPENAI");
  }
}

function saveCheckpoint(path: string, checkpoint: AdkLivePilotCheckpointV1): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temporary, path);
}

function loadOrCreateCheckpoint(
  path: string,
  plan: AiProductionPilotPlanV1,
  now: () => Date,
): AdkLivePilotCheckpointV1 {
  if (existsSync(path)) {
    const checkpoint = parseAdkLivePilotCheckpoint(
      JSON.parse(readFileSync(path, "utf8")) as unknown,
    );
    assertCheckpointMatchesPlan(checkpoint, plan);
    return checkpoint;
  }
  const startedAt = now().toISOString();
  const checkpoint: AdkLivePilotCheckpointV1 = {
    protocolVersion: "1.0",
    objectType: "AI_PRODUCTION_PILOT_LIVE_CHECKPOINT",
    pilotId: plan.pilotId,
    approvalRef: plan.approvalRef,
    runId: stableRunId(plan, startedAt),
    startedAt,
    assignmentIds: plan.assignmentIds,
    providers: ["DEEPSEEK", "OPENAI"],
    cells: [],
    updatedAt: startedAt,
  };
  saveCheckpoint(path, checkpoint);
  return checkpoint;
}

function withoutInFlight(
  checkpoint: AdkLivePilotCheckpointV1,
): Omit<AdkLivePilotCheckpointV1, "inFlight"> {
  const { inFlight, ...rest } = checkpoint;
  void inFlight;
  return rest;
}

function receiptFromDurableCell(cell: AdkLivePilotDurableCellV1): LivePilotReceiptView {
  return {
    assignmentId: cell.assignmentId,
    provider: cell.provider,
    status: "EXECUTED",
    submissionId: cell.submissionId,
    artifactId: cell.distilledArtifactId,
  };
}

function lineageFromDurableCell(cell: AdkLivePilotDurableCellV1): LivePilotLineage {
  return {
    assignmentId: cell.assignmentId,
    provider: cell.provider,
    submissionId: cell.submissionId,
    distilledArtifactId: cell.distilledArtifactId,
    rawProviderArtifactId: cell.rawProviderArtifactId,
    markdownRawArtifactId: cell.markdownRawArtifactId,
  };
}

function resultFromCheckpoint(
  checkpoint: AdkLivePilotCheckpointV1,
  failure?: LivePilotReceiptView,
): AdkLivePilotResumableResult {
  const receipts = checkpoint.cells.map(receiptFromDurableCell);
  if (failure) receipts.push(failure);
  return {
    runId: checkpoint.runId,
    receipts,
    lineage: checkpoint.cells.map(lineageFromDurableCell),
    artifactReceiptIds: checkpoint.cells.flatMap((cell) => [
      cell.rawProviderReceiptId,
      cell.markdownReceiptId,
    ]),
    bytesPrepared: checkpoint.cells.reduce((total, cell) => total + cell.bytesPrepared, 0),
    durableCellCount: checkpoint.cells.length,
    completed: checkpoint.cells.length === 6 && failure === undefined,
  };
}

function providerDeliveryUncertain(error: AiKnowledgeAcquisitionError): boolean {
  return error.code === "AI_PROVIDER_NETWORK_ERROR" || error.code === "AI_PROVIDER_TIMEOUT";
}

export async function executeResumableAdkLivePilot(
  input: ResumableExecutionInput,
): Promise<AdkLivePilotResumableResult> {
  assertLiveProviderOrder(input.plan);
  const now = input.now ?? (() => new Date());
  let checkpoint = loadOrCreateCheckpoint(input.checkpointPath, input.plan, now);

  if (checkpoint.inFlight) {
    throw new Error(
      `ADK_LIVE_PROVIDER_DELIVERY_REQUIRES_RECONCILIATION: ${cellKey(
        checkpoint.inFlight.assignmentId,
        checkpoint.inFlight.provider,
      )}`,
    );
  }

  const durableByKey = new Map(
    checkpoint.cells.map((cell) => [cellKey(cell.assignmentId, cell.provider), cell] as const),
  );
  for (const cell of checkpoint.cells) input.verifyDurableCell(cell);

  const providers: readonly LivePilotProvider[] = ["DEEPSEEK", "OPENAI"];
  for (const assignmentId of input.plan.assignmentIds) {
    const assignment = input.assignments.get(assignmentId);
    if (!assignment) {
      throw new Error(`Frozen live pilot assignment ${assignmentId} was not supplied`);
    }
    for (const provider of providers) {
      const key = cellKey(assignmentId, provider);
      if (durableByKey.has(key)) continue;

      const adapter = input.adapters.get(provider);
      if (!adapter || adapter.provider !== provider) {
        return resultFromCheckpoint(checkpoint, {
          assignmentId,
          provider,
          status: "BLOCKED_ADAPTER",
          errorCode: adapter ? "AI_PROVIDER_ADAPTER_MISMATCH" : "AI_PROVIDER_ADAPTER_MISSING",
          retryable: false,
        });
      }

      checkpoint = {
        ...checkpoint,
        inFlight: { assignmentId, provider, startedAt: now().toISOString() },
        updatedAt: now().toISOString(),
      };
      saveCheckpoint(input.checkpointPath, checkpoint);

      let acquisition: AiKnowledgeAcquisition;
      try {
        acquisition = await adapter.acquire({ assignment });
      } catch (error) {
        if (error instanceof AiKnowledgeAcquisitionError && !providerDeliveryUncertain(error)) {
          checkpoint = {
            ...withoutInFlight(checkpoint),
            updatedAt: now().toISOString(),
          };
          saveCheckpoint(input.checkpointPath, checkpoint);
          return resultFromCheckpoint(checkpoint, {
            assignmentId,
            provider,
            status:
              error.code === "AI_PROVIDER_CREDENTIAL_MISSING" ? "BLOCKED_CREDENTIAL" : "FAILED",
            errorCode: error.code,
            retryable: error.retryable,
          });
        }
        throw new Error(`ADK_LIVE_PROVIDER_DELIVERY_REQUIRES_RECONCILIATION: ${key}`, {
          cause: error,
        });
      }

      if (
        acquisition.assignment.assignmentId !== assignmentId ||
        acquisition.submission.provider !== provider ||
        acquisition.artifact.provider !== provider
      ) {
        throw new Error(`ADK_LIVE_ACQUISITION_LINEAGE_MISMATCH: ${key}`);
      }

      let persisted: AdkLivePilotCellPersistence;
      try {
        persisted = await input.persistAcquisition(acquisition);
      } catch (error) {
        throw new Error(`ADK_LIVE_ARTIFACT_PERSISTENCE_REQUIRES_RECONCILIATION: ${key}`, {
          cause: error,
        });
      }
      if (
        persisted.lineage.assignmentId !== assignmentId ||
        persisted.lineage.provider !== provider ||
        persisted.lineage.submissionId !== acquisition.submission.submissionId ||
        persisted.lineage.distilledArtifactId !== acquisition.artifact.artifactId ||
        !persisted.rawProviderReceiptId ||
        !persisted.markdownReceiptId ||
        persisted.rawProviderReceiptId === persisted.markdownReceiptId ||
        !Number.isSafeInteger(persisted.bytesPrepared) ||
        persisted.bytesPrepared < 0
      ) {
        throw new Error(`ADK_LIVE_PERSISTED_LINEAGE_MISMATCH: ${key}`);
      }

      const durableCell: AdkLivePilotDurableCellV1 = {
        status: "DURABLE",
        ...persisted.lineage,
        rawProviderReceiptId: persisted.rawProviderReceiptId,
        markdownReceiptId: persisted.markdownReceiptId,
        bytesPrepared: persisted.bytesPrepared,
        recordedAt: now().toISOString(),
      };
      checkpoint = {
        ...withoutInFlight(checkpoint),
        cells: [...checkpoint.cells, durableCell],
        updatedAt: now().toISOString(),
      };
      saveCheckpoint(input.checkpointPath, checkpoint);
      durableByKey.set(key, durableCell);
    }
  }

  return resultFromCheckpoint(checkpoint);
}
