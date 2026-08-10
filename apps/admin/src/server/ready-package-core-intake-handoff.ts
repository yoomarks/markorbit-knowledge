import type { CoreIntakeResult } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import type {
  ReadyPackageCoreIntakeAcknowledgmentPersistenceResult,
  ReadyPackageRegistryRepository,
} from "@markorbit/persistence/ready-packages";

export type CoreIntakeHandoffRepository = Pick<
  ReadyPackageRegistryRepository,
  "recordCoreIntakeAcknowledgment"
>;

export type ReadyPackageCoreIntakeAcknowledgmentInput = {
  workspaceId: string;
  readyPackageId: string;
  expectedDigest: string;
  acknowledge: true;
  coreIntakeResult: CoreIntakeResult;
};

export type ReadyPackageCoreIntakeAcknowledgmentResult =
  ReadyPackageCoreIntakeAcknowledgmentPersistenceResult;

export function recordReadyPackageCoreIntakeAcknowledgment(
  input: ReadyPackageCoreIntakeAcknowledgmentInput,
  repository: CoreIntakeHandoffRepository,
): ReadyPackageCoreIntakeAcknowledgmentResult {
  if (input.acknowledge !== true) {
    throw new RegistryValidationError("acknowledge=true is required");
  }
  return repository.recordCoreIntakeAcknowledgment({
    workspaceId: input.workspaceId,
    readyPackageId: input.readyPackageId,
    expectedDigest: input.expectedDigest,
    coreIntakeResult: input.coreIntakeResult,
  });
}
