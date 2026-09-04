import type { DatabaseSync } from "node:sqlite";
import type { DocumentChangeEvidence, ReadyPackageV2 } from "@markorbit/contracts";
import { SqliteDocumentChangeEvidenceRepository } from "@markorbit/persistence/document-change-evidence";
import type { ExecutionLedgerRepository } from "@markorbit/persistence/execution-ledger";
import {
  diagnoseReadyPackageV2Delivery,
  type ReadyPackageV2DeliveryDiagnosis,
} from "@markorbit/persistence/ready-package-v2-delivery-reconciliation";
import {
  SqliteReadyPackageV2DeliverySubmissionRepository,
  type ReadyPackageV2DeliverySubmissionRepository,
} from "@markorbit/persistence/ready-package-v2-deliveries";
import {
  SqliteReadyPackageV2RegistryRepository,
  type ReadyPackageV2RegistryRepository,
} from "@markorbit/persistence/ready-packages-v2";
import {
  SqliteSourceSupplyHealthRepository,
  type SourceSupplyHealthRepository,
} from "@markorbit/persistence/source-supply-health";
import {
  SqliteVaultInspectionRunRepository,
  type VaultInspectionRunRepository,
} from "@markorbit/persistence/vault-inspection-runs";
import {
  deriveOperatorInbox,
  type OperatorInboxResult,
  type OperatorInboxSnapshot,
  type OperatorInboxUncategorizedEvidenceItem,
} from "./operator-inbox-model";

const PAGE_SIZE = 100;

interface ChangeEvidenceReader {
  feed(request: {
    workspaceId: string;
    cursor?: string;
    limit?: number;
  }): { items: DocumentChangeEvidence[]; nextCursor: string | null };
}

export type OperatorInboxReadDependencies = {
  runs: ExecutionLedgerRepository;
  sourceSupply: SourceSupplyHealthRepository;
  changeEvidence: ChangeEvidenceReader;
  vaultInspection: VaultInspectionRunRepository;
  readyPackages: ReadyPackageV2RegistryRepository;
  deliveries: ReadyPackageV2DeliverySubmissionRepository;
};

function evidence(input: {
  id: string;
  objectType: string;
  objectId: string;
  title: string;
  reason: string;
  occurredAt: string;
  href: string;
}): OperatorInboxUncategorizedEvidenceItem {
  return input;
}

function collectFailedRuns(
  workspaceId: string,
  repository: ExecutionLedgerRepository,
): OperatorInboxUncategorizedEvidenceItem[] {
  const items: OperatorInboxUncategorizedEvidenceItem[] = [];
  let offset = 0;
  while (true) {
    const page = repository.list({ workspaceId, status: "FAILED", limit: PAGE_SIZE, offset });
    items.push(
      ...page.items.map(({ run }) =>
        evidence({
          id: `run:${run.id}`,
          objectType: "COLLECTION_RUN",
          objectId: run.id,
          title: run.sourceSnapshot.name,
          reason: `Collection run ${run.id} failed`,
          occurredAt: run.updatedAt,
          href: `/runs/${encodeURIComponent(run.id)}`,
        }),
      ),
    );
    offset += page.items.length;
    if (offset >= page.total || page.items.length === 0) return items;
  }
}

function collectSourceHealth(
  workspaceId: string,
  repository: SourceSupplyHealthRepository,
): OperatorInboxUncategorizedEvidenceItem[] {
  const result = repository.list({ workspaceId });
  return result.items
    .filter(
      (item) =>
        item.registrationState === "REGISTERED" &&
        (item.state === "DEGRADED" ||
          item.state === "BLOCKED" ||
          item.freshness.state === "STALE"),
    )
    .map((item) =>
      evidence({
        id: `source-health:${item.targetId}`,
        objectType: "SOURCE_SUPPLY_HEALTH",
        objectId: item.targetId,
        title: item.displayName,
        reason:
          item.gaps.length > 0
            ? item.gaps.join(", ")
            : `Source freshness is ${item.freshness.state.toLowerCase()}`,
        occurredAt:
          item.latestRun?.updatedAt ?? item.acquisition.latestArtifactAt ?? result.observedAt,
        href: item.sourceIds[0]
          ? `/sources/${encodeURIComponent(item.sourceIds[0])}`
          : "/sources",
      }),
    );
}

function collectChangeEvidence(
  workspaceId: string,
  repository: ChangeEvidenceReader,
): OperatorInboxSnapshot["changeEvidence"] {
  const result: OperatorInboxSnapshot["changeEvidence"] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  while (true) {
    const page = repository.feed({ workspaceId, cursor, limit: PAGE_SIZE });
    for (const item of page.items) {
      if (item.changeKind === "UNCHANGED") continue;
      result.push({
        ...evidence({
          id: item.id,
          objectType: item.objectType,
          objectId: item.documentId,
          title: item.after.sourceUri,
          reason:
            item.changeKind === "CREATED"
              ? "New indexed material is available"
              : item.dimensions.length > 0
                ? item.dimensions.join(", ")
                : "Indexed evidence changed",
          occurredAt: item.observedAt,
          href: `/knowledge/${encodeURIComponent(item.after.stagingDocumentId)}`,
        }),
        changeKind: item.changeKind,
      });
    }
    if (!page.nextCursor) return result;
    if (seenCursors.has(page.nextCursor)) {
      throw new Error("Document change evidence pagination repeated a cursor");
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}

function collectVault(
  workspaceId: string,
  repository: VaultInspectionRunRepository,
): Pick<OperatorInboxSnapshot, "needsReview" | "vaultConflicts"> {
  const latest = repository.list(workspaceId, 1)[0];
  if (!latest) return { needsReview: [], vaultConflicts: [] };
  const needsReview: OperatorInboxUncategorizedEvidenceItem[] = [];
  const vaultConflicts: OperatorInboxUncategorizedEvidenceItem[] = [];
  for (const candidate of latest.candidates) {
    if (candidate.classification === "UNCHANGED") continue;
    const item = evidence({
      id: `vault:${latest.id}:${candidate.vaultRelativePath}`,
      objectType: "VAULT_INSPECTION_CANDIDATE",
      objectId: candidate.vaultRelativePath,
      title: candidate.vaultRelativePath,
      reason: `Vault inspection classified this path as ${candidate.classification}`,
      occurredAt: latest.observedAt,
      href: `/vault?inspectionId=${encodeURIComponent(latest.id)}&path=${encodeURIComponent(candidate.vaultRelativePath)}`,
    });
    if (candidate.classification === "CONFLICT") vaultConflicts.push(item);
    else needsReview.push(item);
  }
  return { needsReview, vaultConflicts };
}

function deliveryState(
  diagnosis: ReadyPackageV2DeliveryDiagnosis,
): "READY" | "NEEDS_REVIEW" | "BLOCKED" | "DELIVERED" {
  switch (diagnosis.state) {
    case "SAFE_TO_SUBMIT":
      return "READY";
    case "DELIVERED":
      return "DELIVERED";
    case "CONSUMER_REJECTED":
      return "NEEDS_REVIEW";
    case "OUTCOME_UNKNOWN_RETRY_EXACT_REQUEST":
    case "LOCAL_FINALIZATION_REQUIRED":
    case "EVIDENCE_INCONSISTENT":
      return "BLOCKED";
  }
}

function readyPackageItem(
  workspaceId: string,
  readyPackage: ReadyPackageV2,
  state: "READY" | "NEEDS_REVIEW" | "BLOCKED" | "DELIVERED",
  reason: string,
  occurredAt: string,
): OperatorInboxSnapshot["deliveries"][number] {
  return {
    ...evidence({
      id: `delivery:${readyPackage.id}`,
      objectType: "READY_PACKAGE_V2",
      objectId: readyPackage.id,
      title: readyPackage.evidence.canonicalDocumentId,
      reason,
      occurredAt,
      href: `/packages?readyPackageId=${encodeURIComponent(readyPackage.id)}`,
    }),
    state,
  };
}

function collectDeliveries(
  workspaceId: string,
  readyPackages: ReadyPackageV2RegistryRepository,
  deliveries: ReadyPackageV2DeliverySubmissionRepository,
): { items: OperatorInboxSnapshot["deliveries"]; bounded: boolean } {
  const packages = readyPackages.list(workspaceId, PAGE_SIZE);
  let bounded = packages.length === PAGE_SIZE;
  const items = packages.map((readyPackage) => {
    const submission = deliveries.getByReadyPackage(workspaceId, readyPackage.id);
    if (!submission) {
      return readyPackageItem(
        workspaceId,
        readyPackage,
        "READY",
        "ReadyPackage is verified and has no frozen delivery submission",
        readyPackage.createdAt,
      );
    }
    const auditEvents = deliveries.listAuditEvents(
      workspaceId,
      submission.submissionId,
      PAGE_SIZE,
    );
    if (auditEvents.length === PAGE_SIZE) bounded = true;
    const diagnosis = diagnoseReadyPackageV2Delivery(submission, auditEvents);
    return readyPackageItem(
      workspaceId,
      readyPackage,
      deliveryState(diagnosis),
      `${diagnosis.state}: ${diagnosis.recommendedAction}`,
      submission.updatedAt,
    );
  });
  return { items, bounded };
}

export function createOperatorInboxReadDependencies(
  database: DatabaseSync,
  runs: ExecutionLedgerRepository,
): OperatorInboxReadDependencies {
  return {
    runs,
    sourceSupply: new SqliteSourceSupplyHealthRepository(database),
    changeEvidence: new SqliteDocumentChangeEvidenceRepository(database),
    vaultInspection: new SqliteVaultInspectionRunRepository(database),
    readyPackages: new SqliteReadyPackageV2RegistryRepository(database),
    deliveries: new SqliteReadyPackageV2DeliverySubmissionRepository(database),
  };
}

export function readOperatorInbox(
  workspaceIdValue: string,
  dependencies: OperatorInboxReadDependencies,
  generatedAt = new Date().toISOString(),
): OperatorInboxResult {
  const workspaceId = workspaceIdValue.trim();
  if (!workspaceId) throw new TypeError("workspaceId is required");

  const snapshot: OperatorInboxSnapshot = {
    workspaceId,
    acquisitionFailures: [],
    sourceHealth: [],
    changeEvidence: [],
    needsReview: [],
    vaultConflicts: [],
    deliveries: [],
    unavailableEvidence: [],
  };
  const unavailable = snapshot.unavailableEvidence!;

  try {
    snapshot.acquisitionFailures = collectFailedRuns(workspaceId, dependencies.runs);
  } catch {
    unavailable.push("runs");
  }
  try {
    snapshot.sourceHealth = collectSourceHealth(workspaceId, dependencies.sourceSupply);
  } catch {
    unavailable.push("source-supply-health");
  }
  try {
    snapshot.changeEvidence = collectChangeEvidence(workspaceId, dependencies.changeEvidence);
  } catch {
    unavailable.push("change-evidence");
  }
  try {
    const vault = collectVault(workspaceId, dependencies.vaultInspection);
    snapshot.needsReview.push(...vault.needsReview);
    snapshot.vaultConflicts.push(...vault.vaultConflicts);
  } catch {
    unavailable.push("vault-inspection");
  }
  try {
    const delivery = collectDeliveries(
      workspaceId,
      dependencies.readyPackages,
      dependencies.deliveries,
    );
    snapshot.deliveries = delivery.items;
    if (delivery.bounded) unavailable.push("ready-package-delivery:bounded");
  } catch {
    unavailable.push("ready-package-delivery");
  }

  return deriveOperatorInbox(snapshot, generatedAt);
}
