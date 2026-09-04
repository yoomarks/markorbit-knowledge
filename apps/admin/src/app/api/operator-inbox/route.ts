import { NextResponse } from "next/server";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import {
  createOperatorInboxReadDependencies,
  readOperatorInbox,
} from "@/server/operator-inbox-read-service";
import {
  getExecutionLedgerRepository,
  getRegistryDatabase,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const assertedWorkspaceId = search.get("workspaceId")?.trim() || undefined;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId);
    const dependencies = createOperatorInboxReadDependencies(
      getRegistryDatabase(),
      getExecutionLedgerRepository(),
    );
    return NextResponse.json(readOperatorInbox(workspaceId, dependencies));
  } catch (error) {
    return apiError(error);
  }
}
