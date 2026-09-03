import { NextResponse } from "next/server";
import type { CoreDiscoveryProposalV1 } from "@markorbit/contracts";
import { CORE_DISCOVERY_PROPOSAL_VERSION, CORE_DISCOVERY_PROPOSER } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getCoreDiscoveryProposalService } from "@/server/core-discovery-proposal-service";
import { resolveOperatorServiceMutationAccess } from "@/server/operator-service-api-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RegistryValidationError(`${field} is required`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new RegistryValidationError(`${field} must be a string`);
  }
  return value;
}

export async function POST(request: Request) {
  try {
    resolveOperatorServiceMutationAccess(request);
    const body = requireRecord(await readJson(request));
    if (body.version !== CORE_DISCOVERY_PROPOSAL_VERSION) {
      throw new RegistryValidationError(`version must be ${CORE_DISCOVERY_PROPOSAL_VERSION}`);
    }
    if (body.proposedBy !== CORE_DISCOVERY_PROPOSER) {
      throw new RegistryValidationError(`proposedBy must be ${CORE_DISCOVERY_PROPOSER}`);
    }

    const proposedFromSourceId = optionalString(body.proposedFromSourceId, "proposedFromSourceId");
    const evidenceUrl = optionalString(body.evidenceUrl, "evidenceUrl");
    const opaqueContextRef = optionalString(body.opaqueContextRef, "opaqueContextRef");
    const proposal: CoreDiscoveryProposalV1 = {
      version: CORE_DISCOVERY_PROPOSAL_VERSION,
      proposalId: requiredString(body.proposalId, "proposalId"),
      proposedBy: CORE_DISCOVERY_PROPOSER,
      proposedAt: requiredString(body.proposedAt, "proposedAt"),
      locator: requiredString(body.locator, "locator"),
      ...(proposedFromSourceId ? { proposedFromSourceId } : {}),
      ...(evidenceUrl ? { evidenceUrl } : {}),
      ...(opaqueContextRef ? { opaqueContextRef } : {}),
    };

    const result = getCoreDiscoveryProposalService().submit(proposal);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
