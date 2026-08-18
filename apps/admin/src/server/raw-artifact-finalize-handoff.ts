import { RegistryError } from "@markorbit/persistence";
import {
  dispatchAutomaticConversionForArtifact,
  type AutomaticConversionHandoffResult,
} from "./raw-artifact-auto-conversion";

export type FinalizedRawArtifactHandoffResult =
  | AutomaticConversionHandoffResult
  | {
      status: "FAILED";
      artifactId: string;
      code: string;
    };

type AutomaticConversionDispatcher = (
  artifactId: string,
  workspaceId: string,
) => AutomaticConversionHandoffResult;

export function createFinalizedRawArtifactHandoff(dispatch: AutomaticConversionDispatcher) {
  return function handoffFinalizedRawArtifact(
    artifactId: string,
    workspaceId: string,
  ): FinalizedRawArtifactHandoffResult {
    try {
      return dispatch(artifactId, workspaceId);
    } catch (error) {
      // Finalization is the evidence durability boundary. A downstream conversion dispatch failure
      // must never turn a successfully persisted RawArtifact into a failed acquisition; eligible
      // artifacts are replay-safe and can be recovered by automatic conversion reconciliation.
      return {
        status: "FAILED",
        artifactId,
        code: error instanceof RegistryError ? error.code : "AUTO_CONVERSION_DISPATCH_FAILED",
      };
    }
  };
}

export const handoffFinalizedRawArtifact = createFinalizedRawArtifactHandoff(
  dispatchAutomaticConversionForArtifact,
);
