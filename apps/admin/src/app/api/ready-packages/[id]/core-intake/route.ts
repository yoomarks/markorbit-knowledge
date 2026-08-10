import { NextResponse } from "next/server";
import type { CoreIntakeResult } from "@markorbit/contracts";
import { RegistryError, RegistryValidationError } from "@markorbit/persistence";
import { createCoreIntakeRequest } from "@markorbit/worker-runtime";
import { apiError } from "@/server/api-errors";
import { recordReadyPackageCoreIntakeAcknowledgment } from "@/server/ready-package-core-intake-handoff";
import { getReadyPackageRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
type PostBody = {
  workspaceId?: string;
  expectedDigest?: string;
  acknowledge?: boolean;
  coreIntakeResult?: CoreIntakeResult;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim();
    if (!workspaceId) throw new RegistryValidationError("workspaceId query parameter is required");
    const { id } = await context.params;
    const readyPackage = getReadyPackageRepository().getById(id, workspaceId);
    if (!readyPackage)
      throw new RegistryError("READY_PACKAGE_NOT_FOUND", `ReadyPackage ${id} was not found`);
    const acknowledged = readyPackage.status === "HANDED_OFF";
    return NextResponse.json({
      readyPackageStatus: readyPackage.status,
      coreIntakeRequest: createCoreIntakeRequest(readyPackage),
      transportStatus: acknowledged ? "ACKNOWLEDGED" : "NOT_SUBMITTED",
      note: acknowledged
        ? "Knowledge has recorded an explicit Core intake acknowledgment for this ReadyPackage."
        : "Knowledge prepares the handoff envelope but does not invent a Core acceptance receipt.",
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = (await request.json()) as PostBody;
    const workspaceId = body.workspaceId?.trim();
    const expectedDigest = body.expectedDigest?.trim();
    if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
    if (!expectedDigest) throw new RegistryValidationError("expectedDigest is required");
    if (body.acknowledge !== true) {
      throw new RegistryValidationError("acknowledge=true is required");
    }
    if (!body.coreIntakeResult) {
      throw new RegistryValidationError("coreIntakeResult is required");
    }

    const { id } = await context.params;
    return NextResponse.json(
      recordReadyPackageCoreIntakeAcknowledgment(
        {
          workspaceId,
          readyPackageId: id,
          expectedDigest,
          acknowledge: true,
          coreIntakeResult: body.coreIntakeResult,
        },
        getReadyPackageRepository(),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
