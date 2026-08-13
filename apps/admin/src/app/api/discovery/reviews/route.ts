import { NextResponse } from "next/server";
import { RegistryError, RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getDiscoveryCollectionService } from "@/server/discovery-collection-service";
import { getDiscoveryWorkflowService } from "@/server/discovery-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function candidateIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new RegistryValidationError("candidateIds must contain 1 to 100 candidate IDs");
  }
  const ids = value.map((item) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new RegistryValidationError("candidateIds must contain non-empty strings");
    }
    return item.trim();
  });
  return [...new Set(ids)];
}

function failure(error: unknown) {
  return {
    code: error instanceof RegistryError ? error.code : "SOURCE_REVIEW_FAILED",
    message: error instanceof Error ? error.message : "Source review failed",
  };
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const ids = candidateIds(body.candidateIds);
    if (body.decision !== "ACCEPTED" && body.decision !== "REJECTED") {
      throw new RegistryValidationError("decision must be ACCEPTED or REJECTED");
    }
    if (body.reviewer !== undefined && typeof body.reviewer !== "string") {
      throw new RegistryValidationError("reviewer must be a string");
    }
    if (body.note !== undefined && typeof body.note !== "string") {
      throw new RegistryValidationError("note must be a string");
    }
    if (body.startCollection !== undefined && typeof body.startCollection !== "boolean") {
      throw new RegistryValidationError("startCollection must be a boolean");
    }

    const reviewer =
      typeof body.reviewer === "string" && body.reviewer.trim()
        ? body.reviewer.trim()
        : "admin-console";
    const startCollection = body.decision === "ACCEPTED" && body.startCollection !== false;
    const workflow = getDiscoveryWorkflowService();
    const collection = getDiscoveryCollectionService();
    const items: Array<
      | {
          candidateId: string;
          status: "ACCEPTED" | "REJECTED";
          sourceId?: string;
          planId?: string;
          runId?: string;
          replayed?: boolean;
        }
      | {
          candidateId: string;
          status: "FAILED";
          error: { code: string; message: string };
        }
    > = [];

    for (const candidateId of ids) {
      try {
        const reviewed = workflow.review(candidateId, {
          decision: body.decision,
          reviewer,
          note: typeof body.note === "string" ? body.note : undefined,
        });
        if (body.decision === "REJECTED") {
          items.push({ candidateId, status: "REJECTED" });
          continue;
        }

        if (!reviewed.source || !reviewed.plan) {
          throw new RegistryError(
            "SOURCE_REVIEW_ACCEPTANCE_INCOMPLETE",
            "Accepted candidate did not resolve to its Source and default Collection Plan",
          );
        }
        if (!startCollection) {
          items.push({
            candidateId,
            status: "ACCEPTED",
            sourceId: reviewed.source.id,
            planId: reviewed.plan.id,
          });
          continue;
        }

        const dispatched = collection.authorizeAndDispatch(candidateId, {
          requestedBy: reviewer,
          idempotencyKey: `source-review-${candidateId}`.slice(0, 128),
        });
        items.push({
          candidateId,
          status: "ACCEPTED",
          sourceId: dispatched.source.id,
          planId: dispatched.plan.id,
          runId: dispatched.run.id,
          replayed: dispatched.replayed,
        });
      } catch (error) {
        items.push({ candidateId, status: "FAILED", error: failure(error) });
      }
    }

    const failed = items.filter((item) => item.status === "FAILED").length;
    return NextResponse.json(
      {
        items,
        summary: {
          requested: ids.length,
          succeeded: ids.length - failed,
          failed,
          collectionStarted: items.filter(
            (item) => item.status === "ACCEPTED" && "runId" in item && Boolean(item.runId),
          ).length,
        },
      },
      { status: failed > 0 ? 207 : 200 },
    );
  } catch (error) {
    return apiError(error);
  }
}
