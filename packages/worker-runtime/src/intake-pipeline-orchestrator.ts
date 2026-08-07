import type { CoreIntakeAdapter } from "./core-intake-adapter";

export type IntakePipelineInput = {
  sourceId: string;
  artifactId: string;
  readyPackageId: string;
};

export type IntakePipelineReceipt = {
  readyPackageId: string;
  accepted: boolean;
};

/**
 * Boundary orchestrator only.
 * It coordinates the handoff and does not own domain state.
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
      accepted: true,
    };
  }
}
