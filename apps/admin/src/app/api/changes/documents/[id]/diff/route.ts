import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError } from "@/server/api-errors";
import { resolveOperatorServiceReadAccess } from "@/server/operator-service-api-access";
import { getDocumentChangeFeedRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function positiveVersion(value: string | null, label: string): number {
  if (!value?.trim()) throw new RegistryValidationError(`${label} query parameter is required`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new RegistryValidationError(`${label} query parameter must be a positive integer`);
  }
  return parsed;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const search = new URL(request.url).searchParams;
    const workspaceId = search.get("workspaceId")?.trim();
    if (!workspaceId) throw new RegistryValidationError("workspaceId query parameter is required");
    resolveOperatorServiceReadAccess(request, workspaceId);

    const toVersion = positiveVersion(search.get("toVersion"), "toVersion");
    const fromRaw = search.get("fromVersion")?.trim();
    let fromVersion: number | null = null;
    if (fromRaw) {
      fromVersion = positiveVersion(fromRaw, "fromVersion");
      if (fromVersion >= toVersion) {
        throw new RegistryValidationError("fromVersion must be lower than toVersion");
      }
    }

    const { id } = await context.params;
    const result = getDocumentChangeFeedRepository().compareVersions(
      workspaceId,
      id,
      fromVersion,
      toVersion,
    );
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
