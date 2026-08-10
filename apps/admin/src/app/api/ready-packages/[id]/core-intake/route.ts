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
    const repository = getReadyPackageRepository();
    const readyPackage = repository.getById(id, workspaceId);
    if (!readyPackage)
      throw new RegistryError("READY_PACKAGE_NOT_FOUND", `ReadyPackage ${id} was not found`);
    const coreIntakeReceipts = repository.listCoreIntakeReceipts(id, workspaceId);
    const latestCoreIntakeReceipt = coreIntakeReceipts[0] ?? null;
    const transportStatus = latestCoreIntakeReceipt
      ? "ACKNOWLEDGED"
      : readyPackage.status === "HANDED_OFF"
        ? "HANDED_OFF_WITHOUT_RECEIPT"
        : "NOT_SUBMITTED";
    return NextResponse.json({
      readyPackageStatus: readyPackage.status,
      coreIntakeRequest: createCoreIntakeRequest(readyPackage),
      transportStatus,
      latestCoreIntakeReceipt,
      coreIntakeReceipts,
      note: latestCoreIntakeReceipt
        ? "Knowledge has persisted explicit Core intake receipt evidence for this ReadyPackage."
        : readyPackage.status === "HANDED_OFF"
          ? "This ReadyPackage predates persisted Core intake receipts; Knowledge does not invent historical receipt evidence."
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
