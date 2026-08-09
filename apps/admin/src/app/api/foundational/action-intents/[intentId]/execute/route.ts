import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError } from "@/server/api-errors";
import {
  executeApprovedFoundationalCollectionIntent,
  getFoundationalActionExecutionByIntent,
} from "@/server/foundational-action-executions";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RegistryValidationError(`${field} is required`);
  }
  return value.trim();
}

export async function GET(_request: Request, context: { params: Promise<{ intentId: string }> }) {
  try {
    const { intentId } = await context.params;
    const execution = getFoundationalActionExecutionByIntent(getRegistryDatabase(), intentId);
    if (!execution) {
      return NextResponse.json({ execution: null });
    }
    return NextResponse.json({ execution });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ intentId: string }> }) {
  try {
    const { intentId } = await context.params;
    const payload = (await request.json()) as Record<string, unknown>;
    const execution = executeApprovedFoundationalCollectionIntent(getRegistryDatabase(), {
      intentId,
      executedByActorId: requiredString(payload.executedByActorId, "executedByActorId"),
      idempotencyKey: requiredString(payload.idempotencyKey, "idempotencyKey"),
      execute: payload.execute === true,
    });
    return NextResponse.json(execution, { status: execution.replayed ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
