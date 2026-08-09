import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteSourceSupplyHealthRepository } from "@markorbit/persistence/source-supply-health";
import { normalizeFoundationalJurisdiction } from "@markorbit/worker-runtime/foundational-readiness";
import {
  CONVERSION_RECOVERY_STATES,
  listConversionRecoveryCases,
  type ConversionRecoveryCase,
  type ConversionRecoveryState,
} from "./conversion-failure-recovery";
import { getConversionRunLedgerRepository, getRegistryDatabase } from "./source-registry";

export type FoundationalConversionRecoverySnapshot = {
  objectType: "FOUNDATIONAL_CONVERSION_RECOVERY_SNAPSHOT";
  version: "1.0";
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
  sourceIds: string[];
  items: ConversionRecoveryCase[];
  summary: Record<ConversionRecoveryState, number> & { total: number };
  executionPolicy: "EXISTING_M11_OPERATOR_RETRY_ONLY";
  automaticReconcile: false;
  automaticRetry: false;
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

function recoverySummary(items: readonly ConversionRecoveryCase[]) {
  const summary = Object.fromEntries(
    CONVERSION_RECOVERY_STATES.map((state) => [state, 0]),
  ) as Record<ConversionRecoveryState, number>;
  for (const item of items) summary[item.state] += 1;
  return {
    ...summary,
    total: items.length,
  };
}

export function listFoundationalConversionRecovery(input: {
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
}): FoundationalConversionRecoverySnapshot {
  const workspaceId = normalizedWorkspaceId(input.workspaceId);
  const jurisdiction = normalizeFoundationalJurisdiction(input.jurisdiction);
  const targetId = normalizedTargetId(input.targetId);

  getConversionRunLedgerRepository();
  const database = getRegistryDatabase();
  const health = new SqliteSourceSupplyHealthRepository(database).list({
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

  const sourceIds = [...target.sourceIds];
  if (sourceIds.length === 0) {
    return {
      objectType: "FOUNDATIONAL_CONVERSION_RECOVERY_SNAPSHOT",
      version: "1.0",
      workspaceId,
      jurisdiction,
      targetId,
      sourceIds,
      items: [],
      summary: recoverySummary([]),
      executionPolicy: "EXISTING_M11_OPERATOR_RETRY_ONLY",
      automaticReconcile: false,
      automaticRetry: false,
    };
  }

  const placeholders = sourceIds.map(() => "?").join(",");
  const rows = database
    .prepare(
      `SELECT id FROM raw_artifacts
       WHERE workspace_id = ? AND source_id IN (${placeholders})`,
    )
    .all(workspaceId, ...sourceIds) as Array<{ id: string }>;
  const rawArtifactIds = new Set(rows.map((row) => row.id));
  const recovery = listConversionRecoveryCases({ workspaceId, limit: 100 });
  const items = recovery.items.filter((item) => rawArtifactIds.has(item.rawArtifactId));

  return {
    objectType: "FOUNDATIONAL_CONVERSION_RECOVERY_SNAPSHOT",
    version: "1.0",
    workspaceId,
    jurisdiction,
    targetId,
    sourceIds,
    items,
    summary: recoverySummary(items),
    executionPolicy: "EXISTING_M11_OPERATOR_RETRY_ONLY",
    automaticReconcile: false,
    automaticRetry: false,
  };
}
