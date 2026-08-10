import { RegistryConflictError, RegistryValidationError } from "@markorbit/persistence";
import {
  SqliteRetrievalQualityRemediationRepository,
  type RetrievalQualityRemediationAction,
  type RetrievalQualityRemediationActionCode,
  type RetrievalQualityRemediationRecord,
} from "@markorbit/persistence/retrieval-quality-remediation";
import {
  SqliteRetrievalRemediationExecutionRepository,
  type RetrievalRemediationExecution,
} from "@markorbit/persistence/retrieval-remediation-execution";
import { SqliteSourceSupplyHealthRepository } from "@markorbit/persistence/source-supply-health";
import { normalizeFoundationalJurisdiction } from "@markorbit/worker-runtime/foundational-readiness";
import { getRegistryDatabase } from "./source-registry";

export type FoundationalQualityActionDisposition =
  | "M17_EXECUTABLE"
  | "MANUAL_REVIEW_ONLY"
  | "CANONICAL_REINDEX_REQUIRED";

export type FoundationalQualityRemediationAction = RetrievalQualityRemediationAction & {
  disposition: FoundationalQualityActionDisposition;
};

export type FoundationalQualityRemediationItem = Omit<RetrievalQualityRemediationRecord, "actions"> & {
  actions: FoundationalQualityRemediationAction[];
};

export type FoundationalRetrievalQualityRemediationSnapshot = {
  objectType: "FOUNDATIONAL_RETRIEVAL_QUALITY_REMEDIATION_SNAPSHOT";
  version: "1.0";
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
  sourceIds: string[];
  items: FoundationalQualityRemediationItem[];
  summary: {
    total: number;
    executableActionCount: number;
    manualReviewActionCount: number;
    canonicalReindexRequiredCount: number;
  };
  executionPolicy: "M16_PLAN_M17_EXPLICIT_OPERATOR_ONLY";
  automaticExecution: false;
  automaticProvenanceRestoration: false;
  automaticDuplicateDeduplication: false;
};

export type FoundationalRetrievalQualityRemediationExecution = {
  objectType: "FOUNDATIONAL_RETRIEVAL_QUALITY_REMEDIATION_EXECUTION";
  version: "1.0";
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
  execution: RetrievalRemediationExecution;
  automaticExecution: false;
};

function normalizedWorkspaceId(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new RegistryValidationError("workspaceId is required");
  return normalized;
}

function normalizedTargetId(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new RegistryValidationError("targetId is required");
  return normalized;
}

function resolveTarget(input: { workspaceId: string; jurisdiction: string; targetId: string }) {
  const workspaceId = normalizedWorkspaceId(input.workspaceId);
  const jurisdiction = normalizeFoundationalJurisdiction(input.jurisdiction);
  const targetId = normalizedTargetId(input.targetId);
  const health = new SqliteSourceSupplyHealthRepository(getRegistryDatabase()).list({
    workspaceId,
    jurisdiction,
    coverageTier: "FOUNDATIONAL",
    catalogState: "ACTIVE",
    targetId,
  });
  const target = health.items.find((item) => item.targetId === targetId);
  if (!target) {
    throw new RegistryValidationError(
      `No ACTIVE FOUNDATIONAL target ${targetId} is configured for ${jurisdiction}`,
    );
  }
  return { workspaceId, jurisdiction, targetId, sourceIds: [...target.sourceIds] };
}

export function foundationalQualityActionDisposition(
  action: RetrievalQualityRemediationAction,
): FoundationalQualityActionDisposition {
  if (action.code === "RECONCILE_CURRENT_VERSION") return "M17_EXECUTABLE";
  if (action.code === "REBUILD_RETRIEVAL_INDEX") {
    return action.gapCodes.every((gap) => gap === "FTS_ROW_COUNT_MISMATCH")
      ? "M17_EXECUTABLE"
      : "CANONICAL_REINDEX_REQUIRED";
  }
  return "MANUAL_REVIEW_ONLY";
}

function targetPlans(input: {
  workspaceId: string;
  jurisdiction: string;
  sourceIds: readonly string[];
}): FoundationalQualityRemediationItem[] {
  const repository = new SqliteRetrievalQualityRemediationRepository(getRegistryDatabase());
  const records = new Map<string, RetrievalQualityRemediationRecord>();
  for (const sourceId of input.sourceIds) {
    const result = repository.list({
      workspaceId: input.workspaceId,
      sourceId,
      jurisdiction: input.jurisdiction,
      includeHistorical: false,
    });
    for (const item of result.items) records.set(item.stagingDocumentId, item);
  }
  return [...records.values()]
    .map((item) => ({
      ...item,
      actions: item.actions.map((action) => ({
        ...action,
        disposition: foundationalQualityActionDisposition(action),
      })),
    }))
    .sort((left, right) => {
      const bySource = left.sourceId.localeCompare(right.sourceId);
      if (bySource !== 0) return bySource;
      return left.stagingDocumentId.localeCompare(right.stagingDocumentId);
    });
}

function summarize(items: readonly FoundationalQualityRemediationItem[]) {
  let executableActionCount = 0;
  let manualReviewActionCount = 0;
  let canonicalReindexRequiredCount = 0;
  for (const item of items) {
    for (const action of item.actions) {
      if (action.disposition === "M17_EXECUTABLE") executableActionCount += 1;
      else if (action.disposition === "MANUAL_REVIEW_ONLY") manualReviewActionCount += 1;
      else canonicalReindexRequiredCount += 1;
    }
  }
  return {
    total: items.length,
    executableActionCount,
    manualReviewActionCount,
    canonicalReindexRequiredCount,
  };
}

export function listFoundationalRetrievalQualityRemediation(input: {
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
}): FoundationalRetrievalQualityRemediationSnapshot {
  const target = resolveTarget(input);
  const items = targetPlans(target);
  return {
    objectType: "FOUNDATIONAL_RETRIEVAL_QUALITY_REMEDIATION_SNAPSHOT",
    version: "1.0",
    workspaceId: target.workspaceId,
    jurisdiction: target.jurisdiction,
    targetId: target.targetId,
    sourceIds: target.sourceIds,
    items,
    summary: summarize(items),
    executionPolicy: "M16_PLAN_M17_EXPLICIT_OPERATOR_ONLY",
    automaticExecution: false,
    automaticProvenanceRestoration: false,
    automaticDuplicateDeduplication: false,
  };
}

export function executeFoundationalRetrievalQualityRemediation(input: {
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
  stagingDocumentId: string;
  actionCode: RetrievalQualityRemediationActionCode;
  actorId: string;
  idempotencyKey: string;
  approved: boolean;
}): FoundationalRetrievalQualityRemediationExecution {
  if (input.approved !== true) {
    throw new RegistryValidationError("approved=true is required for M17 remediation execution");
  }
  const target = resolveTarget(input);
  const stagingDocumentId = input.stagingDocumentId.trim();
  if (!stagingDocumentId) throw new RegistryValidationError("stagingDocumentId is required");

  const plan = targetPlans(target).find((item) => item.stagingDocumentId === stagingDocumentId);
  if (!plan) {
    throw new RegistryConflictError(
      "FOUNDATIONAL_QUALITY_PLAN_NOT_FOUND",
      "No current M16 remediation plan exists for this staging document in the requested foundational target",
    );
  }
  const action = plan.actions.find((candidate) => candidate.code === input.actionCode);
  if (!action) {
    throw new RegistryConflictError(
      "FOUNDATIONAL_QUALITY_ACTION_NOT_PLANNED",
      `Action ${input.actionCode} is not present in the current M16 remediation plan`,
    );
  }
  if (action.disposition === "MANUAL_REVIEW_ONLY") {
    throw new RegistryConflictError(
      "FOUNDATIONAL_QUALITY_ACTION_MANUAL_ONLY",
      "This M16 action remains manual review and is not authorized for M17 execution",
    );
  }
  if (action.disposition === "CANONICAL_REINDEX_REQUIRED") {
    throw new RegistryConflictError(
      "FOUNDATIONAL_QUALITY_CANONICAL_REINDEX_REQUIRED",
      "Chunk-structure remediation requires verified canonical reindex through the existing M28 indexing boundary rather than M17 projection repair",
      { gapCodes: action.gapCodes },
    );
  }

  const execution = new SqliteRetrievalRemediationExecutionRepository(
    getRegistryDatabase(),
  ).execute({
    workspaceId: target.workspaceId,
    stagingDocumentId,
    actionCode: input.actionCode,
    actorId: input.actorId,
    idempotencyKey: input.idempotencyKey,
    approved: true,
  });
  return {
    objectType: "FOUNDATIONAL_RETRIEVAL_QUALITY_REMEDIATION_EXECUTION",
    version: "1.0",
    workspaceId: target.workspaceId,
    jurisdiction: target.jurisdiction,
    targetId: target.targetId,
    execution,
    automaticExecution: false,
  };
}
