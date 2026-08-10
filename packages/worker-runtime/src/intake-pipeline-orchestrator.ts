import type { CoreIntakeAdapter } from "./core-intake-adapter";

export type IntakePipelineInput = {
  sourceId: string;
  artifactId: string;
  readyPackageId: string;
};

export type IntakePipelineReceipt = {
  readyPackageId: string;
  accepted: boolean;
  transportStatus: "NOT_SUBMITTED";
};

/**
 * Legacy boundary orchestrator for preparing the local Core handoff shape.
 * CoreIntakeAdapter is side-effect free, so this path must not claim submission or acceptance.
 */
export class IntakePipelineOrchestrator {
  constructor(private readonly intake: CoreIntakeAdapter) {}

  async handoff(input: IntakePipelineInput): Promise<IntakePipelineReceipt> {
    await this.intake.accept({
      readyPackageId: input.readyPackageId,
      sourceId: input.sourceId,
      artifactId: input.artifactId,
    });

    return {
      readyPackageId: input.readyPackageId,
      accepted: false,
      transportStatus: "NOT_SUBMITTED",
    };
  }
}
