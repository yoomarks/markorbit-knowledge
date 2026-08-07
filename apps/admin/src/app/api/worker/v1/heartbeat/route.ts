import { NextResponse } from "next/server";
import { assertHeartbeatInput, type HeartbeatInput } from "@markorbit/persistence/workers";
import { apiError, bearerCredential, readJson, requireRecord } from "@/server/api-errors";
import { getWorkerRegistryRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const credential = bearerCredential(request);
    const body = requireRecord(await readJson(request));
    const input = body as HeartbeatInput;
    assertHeartbeatInput(input);
    const view = getWorkerRegistryRepository().heartbeat(input, credential);
    return NextResponse.json({ view });
  } catch (error) {
    return apiError(error);
  }
}
