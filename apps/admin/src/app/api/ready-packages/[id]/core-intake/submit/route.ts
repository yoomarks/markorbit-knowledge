import { NextResponse } from "next/server";
import { RegistryError, RegistryValidationError } from "@markorbit/persistence";
import { SqliteCoreWorkspaceBindingRepository } from "@markorbit/persistence/core-workspace-bindings";
import { SqliteReadyPackageCoreIntakeSubmissionRepository } from "@markorbit/persistence/ready-package-core-intake-submissions";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiMutationAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { configuredCoreIntakeTransport } from "@/server/core-intake-http-transport";
import { submitReadyPackageCoreIntake } from "@/server/ready-package-core-intake-submit";
import { getReadyPackageRepository, getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = requireRecord(await readJson(request));
    const assertedWorkspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    const expectedDigest =
      typeof body.expectedDigest === "string" ? body.expectedDigest.trim() : "";
    if (!assertedWorkspaceId) throw new RegistryValidationError("workspaceId is required");
    if (!expectedDigest) throw new RegistryValidationError("expectedDigest is required");
    if (body.submit !== true) throw new RegistryValidationError("submit=true is required");

    const { id } = await context.params;
    const { principal, workspaceId } = await resolveAdminBrowserApiMutationAccess(
      request,
      assertedWorkspaceId,
    );
    const database = getRegistryDatabase();
    const readyPackages = getReadyPackageRepository();
    const readyPackage = readyPackages.getById(id, workspaceId);
    if (!readyPackage) {
      throw new RegistryError("READY_PACKAGE_NOT_FOUND", `ReadyPackage ${id} was not found`);
    }
    assertAdminBrowserResourceWorkspace(principal, readyPackage.workspaceId);
    const submissions = new SqliteReadyPackageCoreIntakeSubmissionRepository(database);
    const bindings = new SqliteCoreWorkspaceBindingRepository(database);
    const binding = bindings.getByKnowledgeWorkspaceId(workspaceId);
    const result = await submitReadyPackageCoreIntake(
      {
        workspaceId,
        coreWorkspaceId: binding?.coreWorkspaceId ?? null,
        readyPackageId: id,
        expectedDigest,
        submit: true,
      },
      readyPackages,
      submissions,
      configuredCoreIntakeTransport(),
    );
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
