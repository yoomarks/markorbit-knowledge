import type { CoreIntakeResult, ReadyPackage } from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
} from "@markorbit/persistence";

const SHA256 = /^[a-f0-9]{64}$/;
const CORE_INTAKE_STATUSES = new Set<CoreIntakeResult["status"]>([
  "RECEIVED",
  "ACCEPTED",
  "REJECTED",
]);

export type CoreIntakeHandoffRepository = {
  getById(id: string, workspaceId: string): ReadyPackage | null;
  markHandedOff(id: string, workspaceId: string, expectedDigest: string): ReadyPackage;
};

export type ReadyPackageCoreIntakeAcknowledgmentInput = {
  workspaceId: string;
  readyPackageId: string;
  expectedDigest: string;
  acknowledge: true;
  coreIntakeResult: CoreIntakeResult;
};

export type ReadyPackageCoreIntakeAcknowledgmentResult = {
  readyPackage: ReadyPackage;
  coreIntakeResult: CoreIntakeResult;
  handoffRecorded: boolean;
  replayed: boolean;
  disposition: "HANDOFF_RECORDED" | "HANDOFF_ALREADY_RECORDED" | "REJECTED_NOT_HANDED_OFF";
};

function validateCoreIntakeResult(value: CoreIntakeResult): void {
  if (!value || typeof value !== "object") {
    throw new RegistryValidationError("coreIntakeResult is required");
  }
  if (!value.intakeId?.trim()) {
    throw new RegistryValidationError("coreIntakeResult.intakeId is required");
  }
  if (!value.readyPackageId?.trim()) {
    throw new RegistryValidationError("coreIntakeResult.readyPackageId is required");
  }
  if (!CORE_INTAKE_STATUSES.has(value.status)) {
    throw new RegistryValidationError("coreIntakeResult.status is invalid");
  }
}

export function recordReadyPackageCoreIntakeAcknowledgment(
  input: ReadyPackageCoreIntakeAcknowledgmentInput,
  repository: CoreIntakeHandoffRepository,
): ReadyPackageCoreIntakeAcknowledgmentResult {
  const workspaceId = input.workspaceId?.trim();
  const readyPackageId = input.readyPackageId?.trim();
  const expectedDigest = input.expectedDigest?.trim();

  if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
  if (!readyPackageId) throw new RegistryValidationError("readyPackageId is required");
  if (!expectedDigest || !SHA256.test(expectedDigest)) {
    throw new RegistryValidationError("expectedDigest must be a SHA-256 digest");
  }
  if (input.acknowledge !== true) {
    throw new RegistryValidationError("acknowledge=true is required");
  }
  validateCoreIntakeResult(input.coreIntakeResult);

  if (input.coreIntakeResult.readyPackageId !== readyPackageId) {
    throw new RegistryConflictError(
      "CORE_INTAKE_READY_PACKAGE_MISMATCH",
      "Core intake result belongs to another ReadyPackage",
    );
  }

  const current = repository.getById(readyPackageId, workspaceId);
  if (!current) {
    throw new RegistryError(
      "READY_PACKAGE_NOT_FOUND",
      `ReadyPackage ${readyPackageId} was not found`,
    );
  }
  if (current.evidence.digest !== expectedDigest) {
    throw new RegistryConflictError(
      "READY_PACKAGE_DIGEST_MISMATCH",
      "ReadyPackage digest mismatch",
    );
  }

  if (input.coreIntakeResult.status === "REJECTED") {
    if (current.status === "HANDED_OFF") {
      throw new RegistryConflictError(
        "CORE_INTAKE_REJECTION_AFTER_HANDOFF",
        "A rejected Core intake result cannot reverse an already recorded handoff",
      );
    }
    return {
      readyPackage: current,
      coreIntakeResult: input.coreIntakeResult,
      handoffRecorded: false,
      replayed: false,
      disposition: "REJECTED_NOT_HANDED_OFF",
    };
  }

  const replayed = current.status === "HANDED_OFF";
  const readyPackage = repository.markHandedOff(readyPackageId, workspaceId, expectedDigest);
  return {
    readyPackage,
    coreIntakeResult: input.coreIntakeResult,
    handoffRecorded: true,
    replayed,
    disposition: replayed ? "HANDOFF_ALREADY_RECORDED" : "HANDOFF_RECORDED",
  };
}
