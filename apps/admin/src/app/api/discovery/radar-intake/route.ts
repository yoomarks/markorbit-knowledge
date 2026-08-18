import { NextResponse } from "next/server";
import type { RadarSourceIntakePlan } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { queueRadarSourceIntakeForDiscovery } from "@markorbit/persistence/radar-source-discovery-intake";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import {
  getSourceDiscoveryRepository,
  getSourceRepository,
  withRegistryTransaction,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RegistryValidationError(`${field} is required`);
  }
  return value.trim();
}

function requireRadarPlan(value: unknown): RadarSourceIntakePlan {
  const plan = requireRecord(value);
  if (plan.version !== "radar-source-intake-v1") {
    throw new RegistryValidationError("Unsupported Radar source intake version");
  }
  if (
    plan.mode !== "PLAN" ||
    plan.mutationPerformed !== false ||
    plan.activationAuthorized !== false ||
    plan.collectionAuthorized !== false
  ) {
    throw new RegistryValidationError(
      "Radar intake apply requires a zero-mutation, zero-authorization PLAN document",
    );
  }
  if (!Array.isArray(plan.sourceProposals) || !Array.isArray(plan.candidateProposals)) {
    throw new RegistryValidationError("Radar intake proposal arrays are required");
  }
  if (!Array.isArray(plan.coverageGaps) || !Array.isArray(plan.issues)) {
    throw new RegistryValidationError("Radar intake evidence arrays are required");
  }
  const summary = requireRecord(plan.summary);
  if (
    typeof summary.errors !== "number" ||
    !Number.isInteger(summary.errors) ||
    summary.errors < 0
  ) {
    throw new RegistryValidationError("Radar intake summary.errors must be a non-negative integer");
  }
  return plan as unknown as RadarSourceIntakePlan;
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const allowed = new Set(["workspaceId", "plan"]);
    if (Object.keys(body).some((key) => !allowed.has(key))) {
      throw new RegistryValidationError("Unknown Radar Discovery intake field");
    }
    const workspaceId = requiredString(body.workspaceId, "workspaceId");
    const plan = requireRadarPlan(body.plan);

    const result = withRegistryTransaction(() =>
      queueRadarSourceIntakeForDiscovery(
        { workspaceId, plan },
        {
          sources: getSourceRepository(),
          discovery: getSourceDiscoveryRepository(),
        },
      ),
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return apiError(error);
  }
}
