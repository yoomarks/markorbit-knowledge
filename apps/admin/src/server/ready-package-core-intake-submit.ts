import type { CoreIntakeResult } from "@markorbit/contracts";
import { createCoreIntakeRequest } from "@markorbit/worker-runtime";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
} from "@markorbit/persistence";
import { isCanonicalCoreWorkspaceId } from "@markorbit/persistence/core-workspace-bindings";
import type { ReadyPackageRegistryRepository } from "@markorbit/persistence/ready-packages";
import type {
  ReadyPackageCoreIntakeSubmission,
  ReadyPackageCoreIntakeSubmissionRepository,
} from "@markorbit/persistence/ready-package-core-intake-submissions";
import type { CoreIntakeTransport } from "./core-intake-http-transport";
import { recordReadyPackageCoreIntakeAcknowledgment } from "./ready-package-core-intake-handoff";

const SHA256 = /^[a-f0-9]{64}$/;

export type ReadyPackageCoreIntakeSubmitRepository = Pick<
  ReadyPackageRegistryRepository,
  "getById" | "recordCoreIntakeAcknowledgment"
>;

export type ReadyPackageCoreIntakeSubmitInput = {
  workspaceId: string;
  coreWorkspaceId?: string | null;
  readyPackageId: string;
  expectedDigest: string;
  submit: true;
};

function coreIntakeResultFromTransportEvidence(
  submission: ReadyPackageCoreIntakeSubmission,
): CoreIntakeResult | null {
  if (!submission.transportResult) return null;
  return {
    intakeId: submission.transportResult.intakeId,
    status: submission.transportResult.status,
    readyPackageId: submission.readyPackageId,
  };
}

function requireCoreWorkspaceBinding(coreWorkspaceId: string | null | undefined): string {
  if (!coreWorkspaceId?.trim()) {
    throw new RegistryConflictError(
      "CORE_WORKSPACE_NOT_BOUND",
      "Knowledge workspace is not bound to a canonical Core workspace",
    );
  }
  if (!isCanonicalCoreWorkspaceId(coreWorkspaceId)) {
    throw new RegistryConflictError(
      "CORE_WORKSPACE_BINDING_INVALID",
      "Knowledge workspace Core binding must be a canonical UUID",
    );
  }
  return coreWorkspaceId.trim().toLowerCase();
}

export async function submitReadyPackageCoreIntake(
  input: ReadyPackageCoreIntakeSubmitInput,
  readyPackages: ReadyPackageCoreIntakeSubmitRepository,
  submissions: ReadyPackageCoreIntakeSubmissionRepository,
  transport: CoreIntakeTransport,
) {
  if (input.submit !== true) throw new RegistryValidationError("submit=true is required");
  if (!input.workspaceId?.trim()) throw new RegistryValidationError("workspaceId is required");
  if (!input.readyPackageId?.trim())
    throw new RegistryValidationError("readyPackageId is required");
  if (!SHA256.test(input.expectedDigest)) {
    throw new RegistryValidationError("expectedDigest must be a SHA-256 digest");
  }

  const readyPackage = readyPackages.getById(input.readyPackageId, input.workspaceId);
  if (!readyPackage) {
    throw new RegistryError(
      "READY_PACKAGE_NOT_FOUND",
      `ReadyPackage ${input.readyPackageId} was not found`,
    );
  }
  if (readyPackage.evidence.digest !== input.expectedDigest) {
    throw new RegistryConflictError(
      "READY_PACKAGE_DIGEST_MISMATCH",
      "ReadyPackage digest mismatch",
    );
  }

  const submissionHistory = submissions.list(input.readyPackageId, input.workspaceId);
  const pending = submissionHistory.find((submission) => submission.state === "PENDING");
  if (readyPackage.status === "HANDED_OFF" && !pending) {
    throw new RegistryConflictError(
      "READY_PACKAGE_ALREADY_HANDED_OFF",
      "ReadyPackage already has recorded handoff evidence",
    );
  }
  if (readyPackage.status !== "VERIFIED" && !pending) {
    throw new RegistryConflictError(
      "READY_PACKAGE_NOT_VERIFIED",
      "Only a VERIFIED ReadyPackage can start a Core intake submission",
    );
  }

  const pendingTransportResult = pending ? coreIntakeResultFromTransportEvidence(pending) : null;
  const coreWorkspaceId = pendingTransportResult
    ? isCanonicalCoreWorkspaceId(input.coreWorkspaceId)
      ? input.coreWorkspaceId.trim().toLowerCase()
      : null
    : requireCoreWorkspaceBinding(input.coreWorkspaceId);

  const prepared = submissions.prepare({
    workspaceId: input.workspaceId,
    readyPackageId: input.readyPackageId,
    expectedDigest: input.expectedDigest,
  });
  const persistedTransportResult = coreIntakeResultFromTransportEvidence(prepared.submission);
  const transportResultReplayed = persistedTransportResult !== null;
  const request = coreWorkspaceId
    ? createCoreIntakeRequest(readyPackage, prepared.submission.submittedAt, coreWorkspaceId)
    : null;

  if (!persistedTransportResult && !request) {
    throw new RegistryConflictError(
      "CORE_WORKSPACE_NOT_BOUND",
      "Knowledge workspace is not bound to a canonical Core workspace",
    );
  }

  const coreIntakeResult =
    persistedTransportResult ??
    (await transport.submit(request!, prepared.submission.idempotencyKey));

  if (!transportResultReplayed) {
    submissions.recordTransportResult(
      prepared.submission.submissionId,
      input.workspaceId,
      coreIntakeResult,
    );
  }

  const acknowledgment = recordReadyPackageCoreIntakeAcknowledgment(
    {
      workspaceId: input.workspaceId,
      readyPackageId: input.readyPackageId,
      expectedDigest: input.expectedDigest,
      acknowledge: true,
      coreIntakeResult,
    },
    readyPackages,
  );
  const submission: ReadyPackageCoreIntakeSubmission = submissions.recordResult(
    prepared.submission.submissionId,
    input.workspaceId,
    coreIntakeResult,
  );

  return {
    coreIntakeRequest: request,
    coreIntakeResult,
    submission,
    submissionReplayed: prepared.replayed,
    transportResultReplayed,
    reconciledFromReceipt: false,
    acknowledgment,
  };
}
