import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import {
  bindExpertTaskWorkspace,
  listExpertTaskIdsForWorkspace,
  resolveExpertMutationPrincipal,
  resolveExpertReadPrincipal,
} from "@/server/expert-api-access";
import { ExpertQaOperatorService } from "@/server/expert-qa-operator-service";
import { getExpertSourceRepository } from "@/server/expert-source-registry";
import { withRegistryTransaction } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stringField(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new RegistryValidationError(`${field} is required`);
  }
  return value;
}

function service(): ExpertQaOperatorService {
  return new ExpertQaOperatorService(getExpertSourceRepository());
}

export async function GET(request: Request) {
  try {
    const principal = await resolveExpertReadPrincipal(request);
    const operator = service();
    const items = listExpertTaskIdsForWorkspace(principal.workspaceId).map((id) =>
      operator.getView(id),
    );
    return NextResponse.json({
      items,
      communication: {
        connected: false,
        reason:
          "Shared Communication bridge is intentionally fail-closed until K-CAP-COMM-005 is implemented.",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const principal = await resolveExpertMutationPrincipal(request);
    const body = requireRecord(await readJson(request));
    const created = withRegistryTransaction(() => {
      const task = service().createDraft({
        topic: stringField(body, "topic"),
        jurisdiction: stringField(body, "jurisdiction"),
        question: stringField(body, "question"),
        expertRef: stringField(body, "expertRef"),
        ...(typeof body.organizationRef === "string" && body.organizationRef.trim()
          ? { organizationRef: body.organizationRef }
          : {}),
        requestedBy: principal.userId,
        accessClassification:
          body.accessClassification === "INTERNAL" ||
          body.accessClassification === "RESTRICTED" ||
          body.accessClassification === "CONFIDENTIAL"
            ? body.accessClassification
            : "CONFIDENTIAL",
      });
      bindExpertTaskWorkspace(task.taskId, principal.workspaceId);
      return task;
    });
    return NextResponse.json({ task: created }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
