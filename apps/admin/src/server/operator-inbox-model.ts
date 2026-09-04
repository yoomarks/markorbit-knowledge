export const OPERATOR_INBOX_CATEGORIES = [
  "ACQUISITION_FAILED",
  "SOURCE_STALE_DEGRADED",
  "NEW_MATERIAL",
  "MATERIAL_CHANGE",
  "NEEDS_REVIEW",
  "VAULT_CONFLICT",
  "READY_FOR_DELIVERY",
  "DELIVERY_BLOCKED",
] as const;

export type OperatorInboxCategory = (typeof OPERATOR_INBOX_CATEGORIES)[number];

export type OperatorInboxEvidenceItem = {
  category: OperatorInboxCategory;
  id: string;
  objectType: string;
  objectId: string;
  title: string;
  reason: string;
  occurredAt: string;
  href: string;
};

export type OperatorInboxSnapshot = {
  workspaceId: string;
  acquisitionFailures: OperatorInboxEvidenceItem[];
  sourceHealth: OperatorInboxEvidenceItem[];
  changeEvidence: Array<
    Omit<OperatorInboxEvidenceItem, "category"> & { changeKind: "CREATED" | "UPDATED" }
  >;
  needsReview: OperatorInboxEvidenceItem[];
  vaultConflicts: OperatorInboxEvidenceItem[];
  deliveries: Array<
    Omit<OperatorInboxEvidenceItem, "category"> & {
      state:
        | "READY"
        | "NEEDS_REVIEW"
        | "BLOCKED"
        | "DELIVERED";
    }
  >;
  unavailableEvidence?: string[];
};

export type OperatorInboxCategoryResult = {
  category: OperatorInboxCategory;
  count: number;
  items: OperatorInboxEvidenceItem[];
};

export type OperatorInboxResult = {
  workspaceId: string;
  generatedAt: string;
  evidenceState: "COMPLETE" | "PARTIAL";
  unavailableEvidence: string[];
  total: number;
  categories: OperatorInboxCategoryResult[];
};

function sortItems(items: OperatorInboxEvidenceItem[]): OperatorInboxEvidenceItem[] {
  return [...items].sort((left, right) => {
    const time = right.occurredAt.localeCompare(left.occurredAt);
    return time !== 0 ? time : left.id.localeCompare(right.id);
  });
}

function withCategory(
  category: OperatorInboxCategory,
  item: Omit<OperatorInboxEvidenceItem, "category">,
): OperatorInboxEvidenceItem {
  return { ...item, category };
}

/**
 * Pure read-model derivation only. Inputs must already be workspace-scoped persisted evidence.
 * This function stores no workflow truth and deliberately assigns each delivery to one state.
 */
export function deriveOperatorInbox(
  snapshot: OperatorInboxSnapshot,
  generatedAt = new Date().toISOString(),
): OperatorInboxResult {
  const buckets = new Map<OperatorInboxCategory, OperatorInboxEvidenceItem[]>(
    OPERATOR_INBOX_CATEGORIES.map((category) => [category, []]),
  );

  for (const item of snapshot.acquisitionFailures) {
    buckets.get("ACQUISITION_FAILED")!.push(withCategory("ACQUISITION_FAILED", item));
  }
  for (const item of snapshot.sourceHealth) {
    buckets.get("SOURCE_STALE_DEGRADED")!.push(withCategory("SOURCE_STALE_DEGRADED", item));
  }
  for (const item of snapshot.changeEvidence) {
    const { changeKind, ...evidence } = item;
    const category = changeKind === "CREATED" ? "NEW_MATERIAL" : "MATERIAL_CHANGE";
    buckets.get(category)!.push(withCategory(category, evidence));
  }
  for (const item of snapshot.needsReview) {
    buckets.get("NEEDS_REVIEW")!.push(withCategory("NEEDS_REVIEW", item));
  }
  for (const item of snapshot.vaultConflicts) {
    buckets.get("VAULT_CONFLICT")!.push(withCategory("VAULT_CONFLICT", item));
  }
  for (const item of snapshot.deliveries) {
    const { state, ...delivery } = item;
    if (state === "DELIVERED") continue;
    const category =
      state === "READY"
        ? "READY_FOR_DELIVERY"
        : state === "NEEDS_REVIEW"
          ? "NEEDS_REVIEW"
          : "DELIVERY_BLOCKED";
    buckets.get(category)!.push(withCategory(category, delivery));
  }

  const categories = OPERATOR_INBOX_CATEGORIES.map((category) => {
    const items = sortItems(buckets.get(category)!);
    return { category, count: items.length, items };
  });
  const unavailableEvidence = [...new Set(snapshot.unavailableEvidence ?? [])].sort();

  return {
    workspaceId: snapshot.workspaceId,
    generatedAt,
    evidenceState: unavailableEvidence.length === 0 ? "COMPLETE" : "PARTIAL",
    unavailableEvidence,
    total: categories.reduce((sum, category) => sum + category.count, 0),
    categories,
  };
}
