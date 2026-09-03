import { NextResponse } from "next/server";
import { CANDIDATE_OBSERVATION_DELTAS, type CandidateObservationDelta } from "@markorbit/contracts";
import { DEFAULT_WORKSPACE, RegistryValidationError } from "@markorbit/persistence";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getSourceDiscoveryRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readLimit(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new RegistryValidationError("limit must be a positive integer");
  }
  return parsed;
}

function readDelta(value: string | null): CandidateObservationDelta {
  const normalized = value?.trim() || "REJECTED_CHANGED";
  if (!CANDIDATE_OBSERVATION_DELTAS.includes(normalized as CandidateObservationDelta)) {
    throw new RegistryValidationError("delta must be a supported candidate observation delta");
  }
  return normalized as CandidateObservationDelta;
}

export async function GET(request: Request) {
  try {
    await resolveAdminBrowserApiReadAccess(request, DEFAULT_WORKSPACE.id);
    const url = new URL(request.url);
    const delta = readDelta(url.searchParams.get("delta"));
    const limit = readLimit(url.searchParams.get("limit"));
    const discovery = getSourceDiscoveryRepository();
    const observations = discovery.listCandidateObservations({ delta, limit });
    const items = observations.map((observation) => ({
      observation,
      previous: discovery.previousCandidateObservation(observation.observationId),
      candidate: discovery.getCandidate(observation.candidateId),
    }));
    return NextResponse.json({ delta, count: items.length, items });
  } catch (error) {
    return apiError(error);
  }
}
