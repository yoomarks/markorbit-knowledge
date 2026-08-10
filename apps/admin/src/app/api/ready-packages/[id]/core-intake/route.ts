import { NextResponse } from "next/server";
import type { CoreIntakeResult } from "@markorbit/contracts";
import { RegistryError, RegistryValidationError } from "@markorbit/persistence";
import { SqliteReadyPackageCoreIntakeSubmissionRepository } from "@markorbit/persistence/ready-package-core-intake-submissions";
import { createCoreIntakeRequestPreview } from "@markorbit/worker-runtime";
import { apiError } from "@/server/api-errors";
import { coreIntakeTransportReadiness } from "@/server/core-intake-http-transport";
import { recordReadyPackageCoreIntakeAcknowledgment } from "@/server/ready-package-core-intake-handoff";
import { getReadyPackageRepository, getRegistryDatabase } from "@/server/source-registry";

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
    const coreIntakeSubmissions = new SqliteReadyPackageCoreIntakeSubmissionRepository(
      getRegistryDatabase(),
    ).list(id, workspaceId);
    const latestCoreIntakeReceipt = coreIntakeReceipts[0] ?? null;
    const latestCoreIntakeSubmission = coreIntakeSubmissions[0] ?? null;
    const pendingCoreIntakeSubmission =
      latestCoreIntakeSubmission?.state === "PENDING" ? latestCoreIntakeSubmission : null;
    const transportStatus = pendingCoreIntakeSubmission
      ? pendingCoreIntakeSubmission.transportResult
        ? "SUBMISSION_FINALIZATION_PENDING"
        : "SUBMISSION_PENDING_RESULT"
      : latestCoreIntakeReceipt
        ? latestCoreIntakeReceipt.status === "REJECTED"
          ? "REJECTED"
          : "ACKNOWLEDGED"
        : readyPackage.status === "HANDED_OFF"
          ? "HANDED_OFF_WITHOUT_RECEIPT"
          : "NOT_SUBMITTED";
    const outboundTransport =
      pendingCoreIntakeSubmission &&
      !pendingCoreIntakeSubmission.coreWorkspaceId &&
      !pendingCoreIntakeSubmission.transportResult
        ? {
            configured: false,
            issueCode: "CORE_INTAKE_PENDING_DESTINATION_WORKSPACE_UNBOUND",
          }
        : coreIntakeTransportReadiness(
            readyPackage.workspaceId,
            pendingCoreIntakeSubmission?.coreWorkspaceId,
          );
    return NextResponse.json({
      readyPackageStatus: readyPackage.status,
      coreIntakeRequestPreview: createCoreIntakeRequestPreview(readyPackage),
      transportStatus,
      outboundTransport,
      latestCoreIntakeSubmission,
      coreIntakeSubmissions,
      latestCoreIntakeReceipt,
      coreIntakeReceipts,
      note: pendingCoreIntakeSubmission
        ? pendingCoreIntakeSubmission.transportResult
          ? "Knowledge has durably persisted the Core transport result; an explicit retry completes local receipt/handoff finalization without submitting to Core again."
          : pendingCoreIntakeSubmission.coreWorkspaceId
            ? "Knowledge has durable submission evidence with a frozen Core workspace binding; an explicit retry reuses the exact destination workspace, submittedAt and idempotency key."
            : "This legacy pending submission predates durable Core workspace binding. Knowledge will not rewrite its frozen request under the same idempotency key."
        : latestCoreIntakeReceipt
          ? latestCoreIntakeReceipt.status === "REJECTED"
            ? "Knowledge has persisted a rejected Core intake receipt; this ReadyPackage remains eligible for a later delivery attempt."
            : "Knowledge has persisted explicit Core intake receipt evidence for this ReadyPackage."
          : readyPackage.status === "HANDED_OFF"
            ? "This ReadyPackage predates persisted Core intake receipts; Knowledge does not invent historical receipt evidence."
            : "Knowledge exposes a handoff preview but does not claim the ReadyPackage has been submitted to Core.",
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
