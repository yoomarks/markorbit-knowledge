import { NextResponse } from "next/server";
import { RegistryConflictError, RegistryValidationError } from "@markorbit/persistence";
import { SqliteCompatibilityAwareSupplyHealthRepository } from "@markorbit/persistence/source-compatibility-supply-health";
import {
  SOURCE_SUPPLY_PROMOTION_RECEIPT_STATUSES,
  SOURCE_SUPPLY_PROMOTION_RECEIPT_VERSION,
  SqliteSourceSupplyPromotionReceiptLedger,
  type SourceSupplyPromotionReceiptStatus,
} from "@markorbit/persistence/source-supply-promotion-receipts";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import {
  resolveOperatorServiceMutationAccess,
  resolveOperatorServiceReadAccess,
} from "@/server/operator-service-api-access";
import { getExecutionLedgerRepository, getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RegistryValidationError(`${field} is required`);
  }
  return value.trim();
}

function optionalLimit(value: string | null): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 100) {
    throw new RegistryValidationError("limit must be an integer between 1 and 100");
  }
  return parsed;
}

function optionalStatus(value: string | null): SourceSupplyPromotionReceiptStatus | undefined {
  if (!value) return undefined;
  if (
    !SOURCE_SUPPLY_PROMOTION_RECEIPT_STATUSES.includes(value as SourceSupplyPromotionReceiptStatus)
  ) {
    throw new RegistryValidationError("Unknown source supply promotion receipt status");
  }
  return value as SourceSupplyPromotionReceiptStatus;
}

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const assertedWorkspaceId = search.get("workspaceId")?.trim();
    if (!assertedWorkspaceId) {
      throw new RegistryValidationError("workspaceId query parameter is required");
    }
    const principal = resolveOperatorServiceReadAccess(request, assertedWorkspaceId);
    const database = getRegistryDatabase();
    const ledgerExists = database
      .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get("source_supply_promotion_receipts");
    const items = ledgerExists
      ? new SqliteSourceSupplyPromotionReceiptLedger(database).list({
          workspaceId: principal.workspaceId,
          jurisdiction: search.get("jurisdiction")?.trim() || undefined,
          targetId: search.get("targetId")?.trim() || undefined,
          status: optionalStatus(search.get("status")),
          limit: optionalLimit(search.get("limit")),
        })
      : [];
    return NextResponse.json({
      version: SOURCE_SUPPLY_PROMOTION_RECEIPT_VERSION,
      objectType: "SOURCE_SUPPLY_PROMOTION_RECEIPT_LIST",
      workspaceId: principal.workspaceId,
      items,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const allowed = new Set([
      "workspaceId",
      "jurisdiction",
      "targetId",
      "collectionRunId",
      "operatorActor",
    ]);
    if (Object.keys(body).some((key) => !allowed.has(key))) {
      throw new RegistryValidationError("Unknown source supply promotion receipt field");
    }
    const assertedWorkspaceId = requiredString(body.workspaceId, "workspaceId");
    const principal = resolveOperatorServiceMutationAccess(request, assertedWorkspaceId);
    const workspaceId = principal.workspaceId;
    const jurisdiction = requiredString(body.jurisdiction, "jurisdiction").toUpperCase();
    const targetId = requiredString(body.targetId, "targetId");
    const collectionRunId = requiredString(body.collectionRunId, "collectionRunId");
    const execution = getExecutionLedgerRepository().getById(collectionRunId);
    if (!execution) {
      throw new RegistryValidationError(`CollectionRun ${collectionRunId} was not found`);
    }
    if (execution.run.workspaceId !== workspaceId || execution.run.trigger.type !== "MANUAL") {
      throw new RegistryConflictError(
        "SOURCE_SUPPLY_PROMOTION_RUN_MISMATCH",
        "Supply promotion receipt requires a matching manual CollectionRun",
      );
    }

    const health = new SqliteCompatibilityAwareSupplyHealthRepository(getRegistryDatabase()).list({
      workspaceId,
      jurisdiction,
      targetId,
      coverageTier: "FOUNDATIONAL",
      catalogState: "ACTIVE",
    });
    const target = health.items.find((item) => item.targetId === targetId);
    if (!target || !target.sourceIds.includes(execution.run.sourceId)) {
      throw new RegistryConflictError(
        "SOURCE_SUPPLY_PROMOTION_TARGET_MISMATCH",
        "CollectionRun source does not match the requested supply promotion target",
      );
    }

    const result = new SqliteSourceSupplyPromotionReceiptLedger(getRegistryDatabase()).start({
      workspaceId,
      jurisdiction,
      targetId,
      sourceId: execution.run.sourceId,
      planId: execution.run.planId,
      collectionRunId: execution.run.id,
      operatorActor: principal.userId,
      idempotencyKey: request.headers.get("Idempotency-Key") ?? undefined,
      dispatchedAt: execution.run.requestedAt,
    });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
