import type { FoundationalReadinessGate } from "./foundational-readiness";
import type { FoundationalRemediationQueue } from "./foundational-remediation-queue";

export const FOUNDATIONAL_REMEDIATION_QUEUE_SNAPSHOT_PROTOCOL_VERSION = "1.0" as const;

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
};

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
    executionPolicy: "READ_ONLY",
    collectionAuthorization: "NONE",
    mutationPerformed: false,
  };
}
