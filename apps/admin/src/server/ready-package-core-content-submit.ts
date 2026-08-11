import { createHash } from "node:crypto";
import {
  assertReadyPackageContentExportV1,
  serializeReadyPackageContentExportV1,
  type ReadyPackageContentExportV1,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
} from "@markorbit/persistence";
import type { ReadyPackageRegistryRepository } from "@markorbit/persistence/ready-packages";
import type {
  ReadyPackageCoreContentDeliveryRepository,
  ReadyPackageCoreContentResult,
  ReadyPackageCoreContentResultEvidence,
  ReadyPackageCoreIntakeSubmission,
} from "@markorbit/persistence/ready-package-core-intake-submissions";
import type { CoreContentTransport } from "./core-content-http-transport";

const SHA256 = /^[a-f0-9]{64}$/u;

export type ReadyPackageCoreContentSubmitInput = {
  workspaceId: string;
  readyPackageId: string;
  expectedDigest: string;
  submit: true;
};

export type ReadyPackageContentExporter = (input: {
  workspaceId: string;
  readyPackageId: string;
}) => Promise<ReadyPackageContentExportV1>;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function resultFromEvidence(
  evidence: ReadyPackageCoreContentResultEvidence | undefined,
): ReadyPackageCoreContentResult | null {
  if (!evidence) return null;
  return {
    intakeId: evidence.intakeId,
    readyPackageId: evidence.readyPackageId,
    status: evidence.status,
    exportSha256: evidence.exportSha256,
  };
}

function parseFrozenRequest(
  submission: ReadyPackageCoreIntakeSubmission,
): ReadyPackageContentExportV1 {
  const delivery = submission.contentDelivery;
  if (!delivery) {
    throw new RegistryConflictError(
      "CORE_CONTENT_DELIVERY_NOT_PREPARED",
      "Core content delivery has no frozen request",
    );
  }
  if (sha256(delivery.requestJson) !== delivery.requestSha256) {
    throw new RegistryConflictError(
      "CORE_CONTENT_FROZEN_REQUEST_CORRUPTED",
      "Frozen Core content request no longer matches its persisted fingerprint",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(delivery.requestJson);
  } catch {
    throw new RegistryConflictError(
      "CORE_CONTENT_FROZEN_REQUEST_INVALID",
      "Frozen Core content request is not valid JSON",
    );
  }
  try {
    assertReadyPackageContentExportV1(parsed);
  } catch {
    throw new RegistryConflictError(
      "CORE_CONTENT_FROZEN_REQUEST_INVALID",
      "Frozen Core content request no longer satisfies Content Export V1",
    );
  }
  if (serializeReadyPackageContentExportV1(parsed) !== delivery.requestJson) {
    throw new RegistryConflictError(
      "CORE_CONTENT_FROZEN_REQUEST_NON_CANONICAL",
      "Frozen Core content request is not the canonical V1 serialization",
    );
  }
  return parsed;
}

function completedIntake(
  submissions: ReadyPackageCoreIntakeSubmission[],
  expectedDigest: string,
): ReadyPackageCoreIntakeSubmission {
  const submission = submissions.find(
    (candidate) =>
      candidate.expectedDigest === expectedDigest &&
      candidate.state === "RESULT_RECORDED" &&
      candidate.result,
  );
  if (!submission?.result) {
    throw new RegistryConflictError(
      "CORE_CONTENT_INTAKE_RESULT_NOT_RECORDED",
      "A durable Core intake result is required before content delivery",
    );
  }
  if (submission.result.status === "REJECTED") {
    throw new RegistryConflictError(
      "CORE_CONTENT_INTAKE_REJECTED",
      "Rejected Core intake cannot receive ReadyPackage content",
    );
  }
  return submission;
}

export async function submitReadyPackageCoreContent(
  input: ReadyPackageCoreContentSubmitInput,
  readyPackages: Pick<ReadyPackageRegistryRepository, "getById">,
  submissions: ReadyPackageCoreContentDeliveryRepository,
  exportContent: ReadyPackageContentExporter,
  transport: CoreContentTransport,
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
  if (readyPackage.status !== "HANDED_OFF") {
    throw new RegistryConflictError(
      "CORE_CONTENT_READY_PACKAGE_NOT_HANDED_OFF",
      "ReadyPackage content can be sent only after durable Core intake handoff",
    );
  }

  let intakeSubmission = completedIntake(
    submissions.list(input.readyPackageId, input.workspaceId),
    input.expectedDigest,
  );
  const intakeId = intakeSubmission.result!.intakeId;

  if (intakeSubmission.contentDelivery?.state === "RESULT_RECORDED") {
    const frozenRequest = parseFrozenRequest(intakeSubmission);
    const result = resultFromEvidence(intakeSubmission.contentDelivery.result);
    if (!result) {
      throw new RegistryConflictError(
        "CORE_CONTENT_RESULT_MISSING",
        "Recorded Core content delivery has no durable result evidence",
      );
    }
    return {
      coreContentExport: frozenRequest,
      coreContentResult: result,
      submission: intakeSubmission,
      deliveryReplayed: true,
      transportResultReplayed: true,
    };
  }

  let frozenRequest: ReadyPackageContentExportV1;
  let requestJson: string;
  let requestSha256: string;
  let deliveryReplayed = false;

  if (intakeSubmission.contentDelivery) {
    frozenRequest = parseFrozenRequest(intakeSubmission);
    requestJson = intakeSubmission.contentDelivery.requestJson;
    requestSha256 = intakeSubmission.contentDelivery.requestSha256;
    deliveryReplayed = true;
  } else {
    frozenRequest = await exportContent({
      workspaceId: input.workspaceId,
      readyPackageId: input.readyPackageId,
    });
    assertReadyPackageContentExportV1(frozenRequest);
    if (
      frozenRequest.readyPackageId !== input.readyPackageId ||
      frozenRequest.knowledgeWorkspaceId !== input.workspaceId ||
      frozenRequest.readyPackageDigest !== input.expectedDigest
    ) {
      throw new RegistryConflictError(
        "CORE_CONTENT_EXPORT_SCOPE_MISMATCH",
        "Content Export V1 does not match the ReadyPackage being delivered",
      );
    }
    requestJson = serializeReadyPackageContentExportV1(frozenRequest);
    requestSha256 = sha256(requestJson);
    const prepared = submissions.prepareContentDelivery(
      intakeSubmission.submissionId,
      input.workspaceId,
      { coreIntakeId: intakeId, requestJson, requestSha256 },
    );
    intakeSubmission = prepared.submission;
    deliveryReplayed = prepared.replayed;
  }

  const persistedTransportResult = resultFromEvidence(
    intakeSubmission.contentDelivery?.transportResult,
  );
  const transportResultReplayed = persistedTransportResult !== null;
  const coreContentResult =
    persistedTransportResult ??
    (await transport.submit(intakeId, requestJson, {
      readyPackageId: input.readyPackageId,
      exportSha256: requestSha256,
    }));

  if (!transportResultReplayed) {
    intakeSubmission = submissions.recordContentTransportResult(
      intakeSubmission.submissionId,
      input.workspaceId,
      coreContentResult,
    );
  }
  const submission = submissions.recordContentResult(
    intakeSubmission.submissionId,
    input.workspaceId,
    coreContentResult,
  );

  return {
    coreContentExport: frozenRequest,
    coreContentResult,
    submission,
    deliveryReplayed,
    transportResultReplayed,
  };
}
