import { NextResponse } from "next/server";
import type { CoreIntakeResult } from "@markorbit/contracts";
import { RegistryError, RegistryValidationError } from "@markorbit/persistence";
import { SqliteCoreWorkspaceBindingRepository } from "@markorbit/persistence/core-workspace-bindings";
import {
  SqliteReadyPackageCoreIntakeSubmissionRepository,
  type ReadyPackageCoreIntakeSubmission,
} from "@markorbit/persistence/ready-package-core-intake-submissions";
import { createCoreIntakeRequestPreview } from "@markorbit/worker-runtime";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { coreContentTransportReadiness } from "@/server/core-content-http-transport";
import { coreIntakeTransportReadiness } from "@/server/core-intake-http-transport";
import {
  assertOperatorServiceResourceWorkspace,
  resolveOperatorServiceMutationAccess,
} from "@/server/operator-service-api-access";
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

function submissionStatusView(submission: ReadyPackageCoreIntakeSubmission) {
  const { contentDelivery, ...submissionWithoutContentBody } = submission;
  return {
    ...submissionWithoutContentBody,
    ...(contentDelivery
      ? {
          contentDelivery: {
            state: contentDelivery.state,
            coreIntakeId: contentDelivery.coreIntakeId,
            requestSha256: contentDelivery.requestSha256,
            transportResult: contentDelivery.transportResult,
            result: contentDelivery.result,
            preparedAt: contentDelivery.preparedAt,
            updatedAt: contentDelivery.updatedAt,
          },
        }
      : {}),
  };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const assertedWorkspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim();
    if (!assertedWorkspaceId) {
      throw new RegistryValidationError("workspaceId query parameter is required");
    }
    const { principal, workspaceId } = await resolveAdminBrowserApiReadAccess(
      request,
      assertedWorkspaceId,
    );
    const { id } = await context.params;
    const database = getRegistryDatabase();
    const repository = getReadyPackageRepository();
    const readyPackage = repository.getById(id, workspaceId);
    if (!readyPackage) {
      throw new RegistryError("READY_PACKAGE_NOT_FOUND", `ReadyPackage ${id} was not found`);
    }
    assertAdminBrowserResourceWorkspace(principal, readyPackage.workspaceId);
    const binding = new SqliteCoreWorkspaceBindingRepository(database).getByKnowledgeWorkspaceId(
      workspaceId,
    );
    const coreIntakeReceipts = repository.listCoreIntakeReceipts(id, workspaceId);
    const coreIntakeSubmissions = new SqliteReadyPackageCoreIntakeSubmissionRepository(
      database,
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
    const previewCoreWorkspaceId =
      pendingCoreIntakeSubmission?.coreWorkspaceId ?? binding?.coreWorkspaceId ?? null;
    const outboundTransport =
      pendingCoreIntakeSubmission &&
      !pendingCoreIntakeSubmission.coreWorkspaceId &&
      !pendingCoreIntakeSubmission.transportResult
        ? {
            configured: false,
            issueCode: "CORE_INTAKE_PENDING_DESTINATION_WORKSPACE_UNBOUND",
          }
        : coreIntakeTransportReadiness(previewCoreWorkspaceId);

    const completedIntakeSubmission = coreIntakeSubmissions.find(
      (submission) =>
        submission.expectedDigest === readyPackage.evidence.digest &&
        submission.state === "RESULT_RECORDED" &&
        submission.result,
    );
    const contentDelivery = completedIntakeSubmission?.contentDelivery;
    const contentTransportStatus = !completedIntakeSubmission?.result
      ? "WAITING_FOR_INTAKE"
      : completedIntakeSubmission.result.status === "REJECTED"
        ? "BLOCKED_REJECTED"
        : !contentDelivery
          ? "READY_TO_DELIVER"
          : contentDelivery.state === "RESULT_RECORDED"
            ? "ACCEPTED"
            : contentDelivery.transportResult
              ? "CONTENT_FINALIZATION_PENDING"
              : "CONTENT_PENDING_RESULT";
    const contentOutboundTransport = coreContentTransportReadiness();

    return NextResponse.json({
      readyPackageStatus: readyPackage.status,
      coreWorkspaceBinding: binding,
      coreIntakeRequestPreview: previewCoreWorkspaceId
        ? createCoreIntakeRequestPreview(readyPackage, previewCoreWorkspaceId)
        : null,
      transportStatus,
      outboundTransport,
      latestCoreIntakeSubmission: latestCoreIntakeSubmission
        ? submissionStatusView(latestCoreIntakeSubmission)
        : null,
      coreIntakeSubmissions: coreIntakeSubmissions.map(submissionStatusView),
      latestCoreIntakeReceipt,
      coreIntakeReceipts,
      contentTransportStatus,
      contentOutboundTransport,
      coreContentDelivery: contentDelivery
        ? {
            state: contentDelivery.state,
            coreIntakeId: contentDelivery.coreIntakeId,
            requestSha256: contentDelivery.requestSha256,
            transportResult: contentDelivery.transportResult,
            result: contentDelivery.result,
            preparedAt: contentDelivery.preparedAt,
            updatedAt: contentDelivery.updatedAt,
          }
        : null,
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
            : "Knowledge exposes a handoff preview only after a canonical Core workspace binding exists; it does not claim submission before receipt evidence exists.",
      contentNote:
        contentTransportStatus === "WAITING_FOR_INTAKE"
          ? "Content delivery remains blocked until the parent Core intake result is durably recorded."
          : contentTransportStatus === "BLOCKED_REJECTED"
            ? "The latest durable Core intake result is REJECTED, so this intake cannot receive content."
            : contentTransportStatus === "READY_TO_DELIVER"
              ? "The parent Core intake is durably recorded. An explicit content action will freeze Content Export V1 before outbound HTTP."
              : contentTransportStatus === "CONTENT_PENDING_RESULT"
                ? "Knowledge has frozen the exact Content Export V1 request. An explicit retry reuses the same Core intake ID, canonical JSON and SHA-256 fingerprint."
                : contentTransportStatus === "CONTENT_FINALIZATION_PENDING"
                  ? "Knowledge has durably persisted the Core content result. An explicit retry completes local finalization without another HTTP request."
                  : "Knowledge has durably recorded Core acceptance of the frozen ReadyPackage Content Export V1.",
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = (await request.json()) as PostBody;
    const assertedWorkspaceId = body.workspaceId?.trim();
    const expectedDigest = body.expectedDigest?.trim();
    if (!assertedWorkspaceId) throw new RegistryValidationError("workspaceId is required");
    if (!expectedDigest) throw new RegistryValidationError("expectedDigest is required");
    if (body.acknowledge !== true) {
      throw new RegistryValidationError("acknowledge=true is required");
    }
    if (!body.coreIntakeResult) {
      throw new RegistryValidationError("coreIntakeResult is required");
    }

    const principal = resolveOperatorServiceMutationAccess(request, assertedWorkspaceId);
    const { id } = await context.params;
    const readyPackages = getReadyPackageRepository();
    const readyPackage = readyPackages.getById(id, principal.workspaceId);
    if (!readyPackage) {
      throw new RegistryError("READY_PACKAGE_NOT_FOUND", `ReadyPackage ${id} was not found`);
    }
    assertOperatorServiceResourceWorkspace(principal, readyPackage.workspaceId);
    return NextResponse.json(
      recordReadyPackageCoreIntakeAcknowledgment(
        {
          workspaceId: principal.workspaceId,
          readyPackageId: id,
          expectedDigest,
          acknowledge: true,
          coreIntakeResult: body.coreIntakeResult,
        },
        readyPackages,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
