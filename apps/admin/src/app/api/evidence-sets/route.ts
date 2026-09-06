import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteEvidenceSetRegistryRepository } from "@markorbit/persistence/evidence-sets";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { requiredKnowledgeWorkspaceId } from "@/server/knowledge-workspace-access";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function repository() {
  return new SqliteEvidenceSetRegistryRepository(getRegistryDatabase());
}

function strings(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new RegistryValidationError(`${field} must be an array of strings`);
  }
  return value;
}

export async function GET(request: Request) {
  try {
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(
      request,
      requiredKnowledgeWorkspaceId(request),
    );
    return NextResponse.json({ items: repository().list(workspaceId) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const assertedWorkspaceId = requiredKnowledgeWorkspaceId(request);
    const { workspaceId, principal } = await resolveAdminBrowserApiMutationAccess(
      request,
      assertedWorkspaceId,
    );
    const body = requireRecord(await readJson(request));
    if (typeof body.title !== "string") throw new RegistryValidationError("title is required");
    if (body.note !== undefined && body.note !== null && typeof body.note !== "string") {
      throw new RegistryValidationError("note must be a string or null");
    }
    if (typeof body.idempotencyKey !== "string") {
      throw new RegistryValidationError("idempotencyKey is required");
    }
    const result = repository().create({
      workspaceId,
      title: body.title,
      note: body.note as string | null | undefined,
      stagingDocumentIds: strings(body.stagingDocumentIds, "stagingDocumentIds"),
      idempotencyKey: body.idempotencyKey,
      creator: {
        userId: principal.userId,
        membershipId: principal.membershipId,
        role: principal.role,
      },
    });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
