import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError } from "@/server/api-errors";
import {
  CONVERSION_RECOVERY_STATES,
  listConversionRecoveryCases,
  type ConversionRecoveryState,
} from "@/server/conversion-failure-recovery";
import { resolveOperatorServiceReadAccess } from "@/server/operator-service-api-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function integerParam(value: string | null, field: string, minimum: number): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new RegistryValidationError(`${field} must be an integer >= ${minimum}`);
  }
  return parsed;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const assertedWorkspaceId = url.searchParams.get("workspaceId")?.trim() ?? "";
    if (!assertedWorkspaceId) throw new RegistryValidationError("workspaceId is required");
    const principal = resolveOperatorServiceReadAccess(request, assertedWorkspaceId);
    const stateValue = url.searchParams.get("state")?.trim();
    let state: ConversionRecoveryState | undefined;
    if (stateValue) {
      if (!CONVERSION_RECOVERY_STATES.includes(stateValue as ConversionRecoveryState)) {
        throw new RegistryValidationError("Unknown conversion recovery state");
      }
      state = stateValue as ConversionRecoveryState;
    }
    return NextResponse.json(
      listConversionRecoveryCases({
        workspaceId: principal.workspaceId,
        state,
        limit: integerParam(url.searchParams.get("limit"), "limit", 1),
        offset: integerParam(url.searchParams.get("offset"), "offset", 0),
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
