import { NextResponse } from "next/server";
import { resolveAdminBrowserApiMutationAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import {
  getWorkerExecutionRepository,
  getWorkerRegistryRepository,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await resolveAdminBrowserApiMutationAccess(request);
    const reaped = getWorkerRegistryRepository().reapExpired();
    const reconciledExecutions = getWorkerExecutionRepository().reconcileExpired();
    return NextResponse.json({ reaped, reconciledExecutions });
  } catch (error) {
    return apiError(error);
  }
}
