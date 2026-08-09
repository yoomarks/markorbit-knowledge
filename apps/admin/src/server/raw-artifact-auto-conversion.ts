import {
  converterAccepts,
  mimePatternMatches,
  type ConversionProfile,
  type RawArtifact,
} from "@markorbit/contracts";
import { RegistryError } from "@markorbit/persistence";
import { authorizeRawArtifactForConversion } from "./raw-artifact-conversion-authorization";
import {
  getConversionRunLedgerRepository,
  getConverterRegistryRepository,
  getRawArtifactRepository,
} from "./source-registry";

export type AutomaticConversionHandoffResult =
  | {
      status: "NOT_APPLICABLE";
      reason: "NO_AUTO_PROFILE";
      artifactId: string;
    }
  | {
      status: "ALREADY_PROCESSED";
      artifactId: string;
      artifactStatus: "CONVERTED" | "STAGED" | "ARCHIVED";
    }
  | {
      status: "ENQUEUED" | "REPLAYED";
      artifactId: string;
      conversionProfileId: string;
      conversionRunId: string;
    };

function compatibleAutomaticProfile(
  workspaceId: string,
  artifact: RawArtifact,
): ConversionProfile | null {
  const converters = getConverterRegistryRepository();
  return (
    converters
      .listProfiles({ workspaceId, status: "ACTIVE", limit: 100 })
      .items.filter((profile) => {
        if (!profile.autoConvert) return false;
        if (profile.sourceId && profile.sourceId !== artifact.sourceId) return false;
        if (!profile.input.artifactKinds.includes(artifact.artifactKind)) return false;
        if (
          !profile.input.mimePatterns.some((pattern) =>
            mimePatternMatches(pattern, artifact.mimeType),
          )
        ) {
          return false;
        }
        const manifest = converters.getManifest(
          profile.converter.converterId,
          profile.converter.version,
        )?.manifest;
        return Boolean(
          manifest &&
          manifest.status === "ACTIVE" &&
          manifest.outputFormat === "MARKDOWN" &&
          converterAccepts(manifest, artifact.artifactKind, artifact.mimeType),
        );
      })
      .sort((left, right) => {
        const sourceScope = Number(Boolean(right.sourceId)) - Number(Boolean(left.sourceId));
        if (sourceScope !== 0) return sourceScope;
        if (right.precedence !== left.precedence) return right.precedence - left.precedence;
        return left.id.localeCompare(right.id);
      })[0] ?? null
  );
}

function automaticIdempotencyKey(artifactId: string, profileId: string): string {
  return `auto-profile:${artifactId}:${profileId}`;
}

export function dispatchAutomaticConversionForArtifact(
  artifactId: string,
  workspaceId: string,
): AutomaticConversionHandoffResult {
  const view = getRawArtifactRepository().getArtifact(artifactId);
  if (!view) {
    throw new RegistryError("RAW_ARTIFACT_NOT_FOUND", `RawArtifact ${artifactId} was not found`);
  }
  const artifact = view.artifact;
  if (artifact.workspaceId !== workspaceId) {
    throw new RegistryError(
      "RAW_ARTIFACT_WORKSPACE_MISMATCH",
      "RawArtifact belongs to another Workspace",
    );
  }
  if (
    artifact.status === "CONVERTED" ||
    artifact.status === "STAGED" ||
    artifact.status === "ARCHIVED"
  ) {
    return {
      status: "ALREADY_PROCESSED",
      artifactId,
      artifactStatus: artifact.status,
    };
  }

  const profile = compatibleAutomaticProfile(workspaceId, artifact);
  if (!profile) {
    return { status: "NOT_APPLICABLE", reason: "NO_AUTO_PROFILE", artifactId };
  }

  const authorization = authorizeRawArtifactForConversion(artifactId, workspaceId, {
    conversionProfileId: profile.id,
  });
  const dispatch = getConversionRunLedgerRepository().dispatchManual({
    workspaceId,
    rawArtifactId: artifactId,
    conversionProfileId: authorization.conversionProfileId,
    requestedOutput: {
      format: profile.outputFormat,
      targetPathTemplate: profile.targetPathTemplate,
    },
    trigger: "AUTO_PROFILE",
    actor: { type: "SYSTEM", id: "artifact-finalize-auto-profile" },
    idempotencyKey: automaticIdempotencyKey(artifactId, profile.id),
  });
  return {
    status: dispatch.replayed ? "REPLAYED" : "ENQUEUED",
    artifactId,
    conversionProfileId: profile.id,
    conversionRunId: dispatch.record.run.id,
  };
}
