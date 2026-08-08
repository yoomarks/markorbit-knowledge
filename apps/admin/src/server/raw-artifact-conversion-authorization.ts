import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  converterAccepts,
  isRawArtifact,
  mimePatternMatches,
  type ConversionProfile,
  type RawArtifact,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
} from "@markorbit/persistence";
import {
  getConverterRegistryRepository,
  getRawArtifactRepository,
  getRegistryDatabase,
} from "./source-registry";

export type ConversionAuthorizationResult = {
  artifactId: string;
  status: "READY_FOR_CONVERSION";
  conversionProfileId: string;
  replayed: boolean;
};

function findProfile(workspaceId: string, artifact: RawArtifact): ConversionProfile | null {
  const converters = getConverterRegistryRepository();
  return (
    converters
      .listProfiles({ workspaceId, status: "ACTIVE", limit: 100 })
      .items.find((profile) => {
        if (profile.sourceId && profile.sourceId !== artifact.sourceId) return false;
        if (!profile.input.artifactKinds.includes(artifact.artifactKind)) return false;
        if (!profile.input.mimePatterns.some((pattern) => mimePatternMatches(pattern, artifact.mimeType))) {
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
      }) ?? null
  );
}

export function authorizeRawArtifactForConversion(
  artifactId: string,
  workspaceId: string,
): ConversionAuthorizationResult {
  const artifacts = getRawArtifactRepository();
  const view = artifacts.getArtifact(artifactId);
  if (!view) throw new RegistryError("RAW_ARTIFACT_NOT_FOUND", `RawArtifact ${artifactId} was not found`);
  const artifact = view.artifact;
  if (artifact.workspaceId !== workspaceId) {
    throw new RegistryConflictError(
      "RAW_ARTIFACT_WORKSPACE_MISMATCH",
      "RawArtifact belongs to another Workspace",
    );
  }
  const profile = findProfile(workspaceId, artifact);
  if (!profile) {
    throw new RegistryConflictError(
      "RAW_ARTIFACT_NO_ACTIVE_CONVERSION_PROFILE",
      "RawArtifact has no compatible ACTIVE Conversion Profile",
    );
  }
  if (artifact.status === "READY_FOR_CONVERSION") {
    return { artifactId, status: "READY_FOR_CONVERSION", conversionProfileId: profile.id, replayed: true };
  }
  if (artifact.status !== "REGISTERED" && artifact.status !== "DUPLICATE_CHECKED") {
    throw new RegistryConflictError(
      "RAW_ARTIFACT_CONVERSION_AUTHORIZATION_INVALID_STATE",
      `RawArtifact in ${artifact.status} cannot be authorized for conversion`,
    );
  }
  if (artifact.artifactKind !== "MARKDOWN" || artifact.mimeType !== "text/markdown") {
    throw new RegistryConflictError(
      "RAW_ARTIFACT_PRODUCTION_CONVERTER_UNSUPPORTED",
      "Production conversion currently accepts MARKDOWN/text/markdown only",
    );
  }

  const content = artifacts.contentPath(artifactId);
  const bytes = new Uint8Array(readFileSync(content.path));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (
    bytes.byteLength !== artifact.sizeBytes ||
    bytes.byteLength !== view.contentObject.sizeBytes ||
    digest !== artifact.binaryHash.value ||
    digest !== view.contentObject.sha256
  ) {
    throw new RegistryConflictError(
      "RAW_ARTIFACT_CONVERSION_INTEGRITY_MISMATCH",
      "RawArtifact bytes failed the conversion-readiness integrity check",
    );
  }

  const next: RawArtifact = {
    ...artifact,
    status: "READY_FOR_CONVERSION",
    extensions: {
      ...(artifact.extensions ?? {}),
      "x-conversion-authorized-at": new Date().toISOString(),
      "x-conversion-authorization-basis": "immutable-bytes+active-profile",
      "x-conversion-profile-id": profile.id,
    },
  };
  if (!isRawArtifact(next)) {
    throw new RegistryValidationError("Conversion authorization produced an invalid RawArtifact");
  }
  const update = getRegistryDatabase()
    .prepare("UPDATE raw_artifacts SET status = ?, document_json = ? WHERE id = ? AND workspace_id = ? AND status = ?")
    .run(next.status, JSON.stringify(next), artifactId, workspaceId, artifact.status);
  if (Number(update.changes) !== 1) {
    throw new RegistryConflictError(
      "RAW_ARTIFACT_CONVERSION_AUTHORIZATION_RACE",
      "RawArtifact changed while conversion authorization was being applied",
    );
  }
  return { artifactId, status: "READY_FOR_CONVERSION", conversionProfileId: profile.id, replayed: false };
}
