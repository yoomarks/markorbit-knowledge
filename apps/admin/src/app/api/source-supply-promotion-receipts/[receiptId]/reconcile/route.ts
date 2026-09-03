import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteCompatibilityAwareSupplyHealthRepository } from "@markorbit/persistence/source-compatibility-supply-health";
import {
  evaluateSourceSupplyPromotionProof,
  SqliteSourceSupplyPromotionReceiptLedger,
} from "@markorbit/persistence/source-supply-promotion-receipts";
import { apiError } from "@/server/api-errors";
import {
  assertOperatorServiceResourceWorkspace,
  resolveOperatorServiceMutationAccess,
} from "@/server/operator-service-api-access";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ receiptId: string }> }) {
  try {
    const principal = resolveOperatorServiceMutationAccess(request);
    const { receiptId } = await context.params;
    if (!receiptId?.trim()) throw new RegistryValidationError("receiptId is required");
    const database = getRegistryDatabase();
    const ledger = new SqliteSourceSupplyPromotionReceiptLedger(database);
    const current = ledger.getById(receiptId.trim());
    if (!current) {
      throw new RegistryValidationError(`Supply promotion receipt ${receiptId} was not found`);
    }
    assertOperatorServiceResourceWorkspace(principal, current.workspaceId);
    if (current.status === "PROVEN") {
      return NextResponse.json({ receipt: current, replayed: true });
    }

    const checkedAt = new Date().toISOString();
    try {
      const health = new SqliteCompatibilityAwareSupplyHealthRepository(database).list({
        workspaceId: current.workspaceId,
        jurisdiction: current.jurisdiction,
        targetId: current.targetId,
        coverageTier: "FOUNDATIONAL",
        catalogState: "ACTIVE",
      });
      const target = health.items.find((item) => item.targetId === current.targetId);
      if (!target) {
        const receipt = ledger.recordProof({
          receiptId: current.id,
          checkedAt,
          error: `Source supply health did not return target ${current.targetId}`,
        });
        return NextResponse.json({ receipt, replayed: false });
      }
      if (
        target.latestRun?.runId !== current.collectionRunId ||
        target.latestRun.status !== "COMPLETE"
      ) {
        const observedRun = target.latestRun
          ? `${target.latestRun.runId}:${target.latestRun.status}`
          : "none";
        const receipt = ledger.recordProof({
          receiptId: current.id,
          checkedAt,
          error: `Dispatched CollectionRun ${current.collectionRunId} is not the latest COMPLETE run for ${current.targetId}; observed ${observedRun}`,
        });
        return NextResponse.json({ receipt, replayed: false });
      }
      const receipt = ledger.recordProof({
        receiptId: current.id,
        checkedAt,
        proof: evaluateSourceSupplyPromotionProof(target),
      });
      return NextResponse.json({ receipt, replayed: false });
    } catch (error) {
      const receipt = ledger.recordProof({
        receiptId: current.id,
        checkedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({ receipt, replayed: false });
    }
  } catch (error) {
    return apiError(error);
  }
}
