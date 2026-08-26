import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import {
  authenticateExpertMutationRequest,
  authenticateExpertReadRequest,
  authorizeExpertTaskWorkspace,
} from "@/server/expert-api-access";
import { ExpertQaOperatorService } from "@/server/expert-qa-operator-service";
import { getExpertSourceRepository } from "@/server/expert-source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function service(): ExpertQaOperatorService {
  return new ExpertQaOperatorService(getExpertSourceRepository());
}

function requiredString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new RegistryValidationError(`${field} is required`);
  }
  return value;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = authenticateExpertReadRequest(request);
    const { id } = await context.params;
    authorizeExpertTaskWorkspace(id, principal.workspaceId);
    return NextResponse.json(service().getView(id));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = authenticateExpertMutationRequest(request);
    const { id } = await context.params;
    authorizeExpertTaskWorkspace(id, principal.workspaceId);
    const body = requireRecord(await readJson(request));
    const action = requiredString(body, "action");
    const operator = service();

    switch (action) {
      case "READY":
        return NextResponse.json({ task: operator.markReady(id) });
      case "SEND":
        return NextResponse.json({ task: await operator.sendReady(id) });
      case "CAPTURE":
        return NextResponse.json({ task: operator.capture(id) });
      case "CLOSE":
        return NextResponse.json({ task: operator.close(id) });
      case "FOLLOW_UP": {
        const followUp = operator.createFollowUp(
          id,
          requiredString(body, "question"),
          principal.userId,
        );
        bindFollowUpWorkspace(followUp.taskId, principal.workspaceId);
        return NextResponse.json({ task: followUp });
      }
      default:
        throw new RegistryValidationError(`Unknown Expert task action ${action}`);
    }
  } catch (error) {
    return apiError(error);
  }
}

function bindFollowUpWorkspace(taskId: string, workspaceId: string): void {
  // Local import avoidance keeps action flow synchronous while preserving the parent workspace.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { bindExpertTaskWorkspace } = require("@/server/expert-api-access") as typeof import("@/server/expert-api-access");
  bindExpertTaskWorkspace(taskId, workspaceId);
}
