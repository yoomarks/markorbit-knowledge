import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
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

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json(service().getView(id));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
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
      case "FOLLOW_UP":
        return NextResponse.json({
          task: operator.createFollowUp(
            id,
            requiredString(body, "question"),
            requiredString(body, "requestedBy"),
          ),
        });
      default:
        throw new RegistryValidationError(`Unknown Expert task action ${action}`);
    }
  } catch (error) {
    return apiError(error);
  }
}
