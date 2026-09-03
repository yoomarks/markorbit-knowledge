import { NextResponse } from "next/server";
import { queueRadarSourceIntakeForDiscovery } from "@markorbit/persistence/radar-source-discovery-intake";
import { apiError, readJson } from "@/server/api-errors";
import { resolveOperatorServiceMutationAccess } from "@/server/operator-service-api-access";
import { parseRadarDiscoveryIntakeRequest } from "@/server/radar-source-intake-request";
import {
  getSourceDiscoveryRepository,
  getSourceRepository,
  withRegistryTransaction,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { workspaceId, plan } = parseRadarDiscoveryIntakeRequest(await readJson(request));
    resolveOperatorServiceMutationAccess(request, workspaceId);
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
