import type { FoundationalReadinessGate } from "./foundational-readiness";
import type { FoundationalRemediationQueue } from "./foundational-remediation-queue";

export const FOUNDATIONAL_REMEDIATION_QUEUE_SNAPSHOT_PROTOCOL_VERSION = "1.1" as const;

export type FoundationalApiRemediationState =
  "UNPREPARED" | "PREPARED_AWAITING_WORKER_BINDING" | "INVALID";

export type FoundationalApiRemediationItem = {
  targetId: string;
  state: FoundationalApiRemediationState;
  requiredArtifactKinds: string[];
  sourceId: string | null;
  planId: string | null;
  endpointBinding: string | null;
  workerEndpointBindingState: "EXTERNAL_UNVERIFIED";
  collectionAuthorization: "NONE";
  automaticExecution: false;
};

export type FoundationalApiRemediationStatus = {
  requiredCount: number;
  preparedCount: number;
  invalidCount: number;
  items: FoundationalApiRemediationItem[];
};

export type FoundationalRemediationQueueSnapshot = {
  protocolVersion: typeof FOUNDATIONAL_REMEDIATION_QUEUE_SNAPSHOT_PROTOCOL_VERSION;
  objectType: "FOUNDATIONAL_REMEDIATION_QUEUE_SNAPSHOT";
  workspaceId: string;
  jurisdiction: string;
  targetId: string | null;
  topK: number | null;
  observedAt: string;
  readiness: FoundationalReadinessGate;
  remediationQueue: FoundationalRemediationQueue;
  apiRemediation: FoundationalApiRemediationStatus;
  executionPolicy: "READ_ONLY";
  collectionAuthorization: "NONE";
  mutationPerformed: false;
};

export type AssembleFoundationalRemediationQueueSnapshotInput = {
  workspaceId: string;
  targetId?: string;
  topK?: number;
  observedAt: string;
  readiness: FoundationalReadinessGate;
  remediationQueue: FoundationalRemediationQueue;
  apiRemediation?: FoundationalApiRemediationStatus;
};

function emptyApiRemediation(): FoundationalApiRemediationStatus {
  return { requiredCount: 0, preparedCount: 0, invalidCount: 0, items: [] };
}

function validateApiRemediation(
  value: FoundationalApiRemediationStatus,
  readiness: FoundationalReadinessGate,
): void {
  if (value.requiredCount !== value.items.length) {
    throw new Error("Foundational API remediation required count must match item count");
  }
  const preparedCount = value.items.filter(
    (item) => item.state === "PREPARED_AWAITING_WORKER_BINDING",
  ).length;
  const invalidCount = value.items.filter((item) => item.state === "INVALID").length;
  if (value.preparedCount !== preparedCount || value.invalidCount !== invalidCount) {
    throw new Error("Foundational API remediation summary counts must match item states");
  }
  const targetIds = new Set(readiness.targets.map((target) => target.targetId));
  const seen = new Set<string>();
  for (const item of value.items) {
    if (!targetIds.has(item.targetId)) {
      throw new Error(
        `Foundational API remediation target ${item.targetId} is outside readiness scope`,
      );
    }
    if (seen.has(item.targetId)) {
      throw new Error(`Foundational API remediation target ${item.targetId} is duplicated`);
    }
    seen.add(item.targetId);
    if (item.requiredArtifactKinds.length === 0) {
      throw new Error(`Foundational API remediation target ${item.targetId} needs artifact kinds`);
    }
    if (
      item.workerEndpointBindingState !== "EXTERNAL_UNVERIFIED" ||
      item.collectionAuthorization !== "NONE" ||
      item.automaticExecution !== false
    ) {
      throw new Error(
        "Foundational API remediation status must remain non-authorizing and read-only",
      );
    }
  }
}

export function assembleFoundationalRemediationQueueSnapshot(
  input: AssembleFoundationalRemediationQueueSnapshotInput,
): FoundationalRemediationQueueSnapshot {
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) throw new Error("workspaceId is required");
  if (input.readiness.jurisdiction !== input.remediationQueue.jurisdiction) {
    throw new Error("Foundational readiness and remediation jurisdictions must match");
  }
  if (input.readiness.totalCount !== input.remediationQueue.totalTargetCount) {
    throw new Error("Foundational readiness and remediation target counts must match");
  }
  if (input.topK !== undefined && (!Number.isSafeInteger(input.topK) || input.topK <= 0)) {
    throw new Error("topK must be a positive integer");
  }
  if (!input.observedAt.trim()) throw new Error("observedAt is required");

  const apiRemediation = input.apiRemediation ?? emptyApiRemediation();
  validateApiRemediation(apiRemediation, input.readiness);

  return {
    protocolVersion: FOUNDATIONAL_REMEDIATION_QUEUE_SNAPSHOT_PROTOCOL_VERSION,
    objectType: "FOUNDATIONAL_REMEDIATION_QUEUE_SNAPSHOT",
    workspaceId,
    jurisdiction: input.readiness.jurisdiction,
    targetId: input.targetId?.trim() || null,
    topK: input.topK ?? null,
    observedAt: input.observedAt,
    readiness: input.readiness,
    remediationQueue: input.remediationQueue,
    apiRemediation,
    executionPolicy: "READ_ONLY",
    collectionAuthorization: "NONE",
    mutationPerformed: false,
  };
}
