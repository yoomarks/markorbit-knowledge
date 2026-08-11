import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteReadyPackageCoreIntakeSubmissionRepository } from "@markorbit/persistence/ready-package-core-intake-submissions";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { configuredCoreContentTransport } from "@/server/core-content-http-transport";
import { buildConfiguredReadyPackageContentExportV1 } from "@/server/ready-package-content-export";
import { submitReadyPackageCoreContent } from "@/server/ready-package-core-content-submit";
import { getReadyPackageRepository, getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = requireRecord(await readJson(request));
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    const expectedDigest =
      typeof body.expectedDigest === "string" ? body.expectedDigest.trim() : "";
    if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
    if (!expectedDigest) throw new RegistryValidationError("expectedDigest is required");
    if (body.submit !== true) throw new RegistryValidationError("submit=true is required");

    const { id } = await context.params;
    const database = getRegistryDatabase();
    const result = await submitReadyPackageCoreContent(
      {
        workspaceId,
        readyPackageId: id,
        expectedDigest,
        submit: true,
      },
      getReadyPackageRepository(),
      new SqliteReadyPackageCoreIntakeSubmissionRepository(database),
      buildConfiguredReadyPackageContentExportV1,
      configuredCoreContentTransport(),
    );
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
