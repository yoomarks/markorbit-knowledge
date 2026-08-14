import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getDiscoveryWorkflowService } from "@/server/discovery-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    if (typeof body.candidateId !== "string" || !body.candidateId.trim()) {
      throw new RegistryValidationError("candidateId must be a non-empty string");
    }
    if (body.reviewer !== undefined && typeof body.reviewer !== "string") {
      throw new RegistryValidationError("reviewer must be a string");
    }
    if (body.note !== undefined && typeof body.note !== "string") {
      throw new RegistryValidationError("note must be a string");
    }

    const candidateId = body.candidateId.trim();
    const reviewer =
      typeof body.reviewer === "string" && body.reviewer.trim()
        ? body.reviewer.trim()
        : "admin-console";
    const result = getDiscoveryWorkflowService().reopen(candidateId, {
      reviewer,
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : undefined,
    });

    return NextResponse.json({
      candidateId,
      status: result.candidate.candidate.status,
      candidate: result.candidate,
    });
  } catch (error) {
    return apiError(error);
  }
}
