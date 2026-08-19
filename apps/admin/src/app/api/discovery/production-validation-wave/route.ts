import { NextResponse } from "next/server";
import { queueProductionValidationWaveForDiscovery } from "@markorbit/persistence/production-validation-discovery-intake";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { loadProductionValidationWave } from "@/server/production-validation-wave";
import {
  getSourceDiscoveryRepository,
  getSourceRepository,
  withRegistryTransaction,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function workspaceId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
  return value.trim();
}

export async function GET() {
  try {
    const manifest = loadProductionValidationWave();
    return NextResponse.json({ manifest }, { status: 200 });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const manifest = loadProductionValidationWave();
    const result = withRegistryTransaction(() =>
      queueProductionValidationWaveForDiscovery(
        { workspaceId: workspaceId(body.workspaceId), manifest },
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
