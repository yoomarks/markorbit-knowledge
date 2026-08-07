import { NextResponse } from "next/server";
import { apiError } from "@/server/api-errors";
import { getWorkerRegistryRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const reaped = getWorkerRegistryRepository().reapExpired();
    return NextResponse.json({ reaped });
  } catch (error) {
    return apiError(error);
  }
}
