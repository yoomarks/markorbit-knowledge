import type { CoreIntakeResult } from "@markorbit/contracts";
import { createCoreIntakeRequest } from "@markorbit/worker-runtime";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
} from "@markorbit/persistence";
import type {
  ReadyPackageCoreIntakeReceipt,
  ReadyPackageRegistryRepository,
} from "@markorbit/persistence/ready-packages";
import type {
  ReadyPackageCoreIntakeSubmission,
  ReadyPackageCoreIntakeSubmissionRepository,
} from "@markorbit/persistence/ready-package-core-intake-submissions";
import type { CoreIntakeTransport } from "./core-intake-http-transport";
import { recordReadyPackageCoreIntakeAcknowledgment } from "./ready-package-core-intake-handoff";

const SHA256 = /^[a-f0-9]{64}$/;

export type ReadyPackageCoreIntakeSubmitRepository = Pick<
  ReadyPackageRegistryRepository,
  "getById" | "recordCoreIntakeAcknowledgment" | "listCoreIntakeReceipts"
>;

export type ReadyPackageCoreIntakeSubmitInput = {
  workspaceId: string;
  readyPackageId: string;
  expectedDigest: string;
  submit: true;
};

function resultKey(intakeId: string, status: CoreIntakeResult["status"]): string {
  return `${intakeId}\u0000${status}`;
}

function findReconciliationReceipt(
  submission: ReadyPackageCoreIntakeSubmission,
  submissionHistory: ReadyPackageCoreIntakeSubmission[],
  receipts: ReadyPackageCoreIntakeReceipt[],
): ReadyPackageCoreIntakeReceipt | null {
  const recordedResults = new Set(
    submissionHistory.flatMap((item) =>
      item.state === "RESULT_RECORDED" && item.result
        ? [resultKey(item.result.intakeId, item.result.status)]
        : [],
    ),
  );
  const submittedAt = Date.parse(submission.submittedAt);
  return (
    receipts.find(
      (receipt) =>
        receipt.expectedDigest === submission.expectedDigest &&
        Date.parse(receipt.recordedAt) >= submittedAt &&
        !recordedResults.has(resultKey(receipt.intakeId, receipt.status)),
    ) ?? null
  );
}

function coreIntakeResultFromReceipt(receipt: ReadyPackageCoreIntakeReceipt): CoreIntakeResult {
  return {
    intakeId: receipt.intakeId,
    status: receipt.status,
    readyPackageId: receipt.readyPackageId,
  };
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

  const prepared = submissions.prepare({
    workspaceId: input.workspaceId,
    readyPackageId: input.readyPackageId,
    expectedDigest: input.expectedDigest,
  });
  const request = createCoreIntakeRequest(readyPackage, prepared.submission.submittedAt);
  const reconciliationReceipt = findReconciliationReceipt(
    prepared.submission,
    submissionHistory,
    readyPackages.listCoreIntakeReceipts(input.readyPackageId, input.workspaceId),
  );
  const coreIntakeResult = reconciliationReceipt
    ? coreIntakeResultFromReceipt(reconciliationReceipt)
    : await transport.submit(request, prepared.submission.idempotencyKey);

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
    reconciledFromReceipt: reconciliationReceipt !== null,
    acknowledgment,
  };
}
