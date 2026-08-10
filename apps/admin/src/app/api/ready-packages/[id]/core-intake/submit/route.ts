import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteReadyPackageCoreIntakeSubmissionRepository } from "@markorbit/persistence/ready-package-core-intake-submissions";
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
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    const expectedDigest =
      typeof body.expectedDigest === "string" ? body.expectedDigest.trim() : "";
    if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
    if (!expectedDigest) throw new RegistryValidationError("expectedDigest is required");
    if (body.submit !== true) throw new RegistryValidationError("submit=true is required");

    const { id } = await context.params;
    const readyPackages = getReadyPackageRepository();
    const submissions = new SqliteReadyPackageCoreIntakeSubmissionRepository(
      getRegistryDatabase(),
    );
    const result = await submitReadyPackageCoreIntake(
      {
        workspaceId,
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
