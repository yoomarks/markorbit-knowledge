import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
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
import type { ConverterRegistryRepository } from "@markorbit/persistence/converters";
import type { RawArtifactRepository } from "@markorbit/persistence/raw-artifacts";
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

export type ConversionAuthorizationOptions = {
  conversionProfileId?: string;
};

export type ConversionAuthorizationDependencies = {
  database: DatabaseSync;
  artifacts: RawArtifactRepository;
  converters: ConverterRegistryRepository;
  clock?: () => Date;
};

function profileCompatible(
  workspaceId: string,
  artifact: RawArtifact,
  profile: ConversionProfile,
  converters: ConverterRegistryRepository,
) {
  if (profile.workspaceId !== workspaceId || profile.status !== "ACTIVE") return false;
  if (profile.sourceId && profile.sourceId !== artifact.sourceId) return false;
  if (!profile.input.artifactKinds.includes(artifact.artifactKind)) return false;
  if (
    !profile.input.mimePatterns.some((pattern) => mimePatternMatches(pattern, artifact.mimeType))
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
}

function findProfile(
  workspaceId: string,
  artifact: RawArtifact,
  converters: ConverterRegistryRepository,
  selectedProfileId?: string,
): ConversionProfile | null {
  const profiles = selectedProfileId
    ? [converters.getProfile(selectedProfileId)].filter(
        (profile): profile is ConversionProfile => profile !== null,
      )
    : converters.listProfiles({ workspaceId, status: "ACTIVE", limit: 100 }).items;
  return (
    profiles
      .filter((profile) => profileCompatible(workspaceId, artifact, profile, converters))
      .sort((left, right) => {
        const sourceScope = Number(Boolean(right.sourceId)) - Number(Boolean(left.sourceId));
        if (sourceScope !== 0) return sourceScope;
        if (right.precedence !== left.precedence) return right.precedence - left.precedence;
        return left.id.localeCompare(right.id);
      })[0] ?? null
  );
}

export function authorizeRawArtifactForConversionWithDependencies(
  dependencies: ConversionAuthorizationDependencies,
  artifactId: string,
  workspaceId: string,
  options: ConversionAuthorizationOptions = {},
): ConversionAuthorizationResult {
  const { artifacts, converters, database } = dependencies;
  const view = artifacts.getArtifact(artifactId);
  if (!view)
    throw new RegistryError("RAW_ARTIFACT_NOT_FOUND", `RawArtifact ${artifactId} was not found`);
  const artifact = view.artifact;
  if (artifact.workspaceId !== workspaceId) {
    throw new RegistryConflictError(
      "RAW_ARTIFACT_WORKSPACE_MISMATCH",
      "RawArtifact belongs to another Workspace",
    );
  }
  const profile = findProfile(workspaceId, artifact, converters, options.conversionProfileId);
  if (!profile) {
    throw new RegistryConflictError(
      "RAW_ARTIFACT_NO_ACTIVE_CONVERSION_PROFILE",
      "RawArtifact has no compatible ACTIVE Conversion Profile",
    );
  }
  if (artifact.status === "READY_FOR_CONVERSION") {
    const authorizedProfileId = artifact.extensions?.["x-conversion-profile-id"];
    if (typeof authorizedProfileId === "string" && authorizedProfileId !== profile.id) {
      throw new RegistryConflictError(
        "RAW_ARTIFACT_CONVERSION_PROFILE_CONFLICT",
        "RawArtifact was already authorized with another Conversion Profile",
      );
    }
    return {
      artifactId,
      status: "READY_FOR_CONVERSION",
      conversionProfileId: profile.id,
      replayed: true,
    };
  }
  if (artifact.status !== "REGISTERED" && artifact.status !== "DUPLICATE_CHECKED") {
    throw new RegistryConflictError(
      "RAW_ARTIFACT_CONVERSION_AUTHORIZATION_INVALID_STATE",
      `RawArtifact in ${artifact.status} cannot be authorized for conversion`,
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
      "x-conversion-authorized-at": (dependencies.clock ?? (() => new Date()))().toISOString(),
      "x-conversion-authorization-basis": "immutable-bytes+active-profile",
      "x-conversion-profile-id": profile.id,
    },
  };
  if (!isRawArtifact(next)) {
    throw new RegistryValidationError("Conversion authorization produced an invalid RawArtifact");
  }
  const update = database
    .prepare(
      "UPDATE raw_artifacts SET status = ?, document_json = ? WHERE id = ? AND workspace_id = ? AND status = ?",
    )
    .run(next.status, JSON.stringify(next), artifactId, workspaceId, artifact.status);
  if (Number(update.changes) !== 1) {
    throw new RegistryConflictError(
      "RAW_ARTIFACT_CONVERSION_AUTHORIZATION_RACE",
      "RawArtifact changed while conversion authorization was being applied",
    );
  }
  return {
    artifactId,
    status: "READY_FOR_CONVERSION",
    conversionProfileId: profile.id,
    replayed: false,
  };
}

export function authorizeRawArtifactForConversion(
  artifactId: string,
  workspaceId: string,
  options: ConversionAuthorizationOptions = {},
): ConversionAuthorizationResult {
  return authorizeRawArtifactForConversionWithDependencies(
    {
      database: getRegistryDatabase(),
      artifacts: getRawArtifactRepository(),
      converters: getConverterRegistryRepository(),
    },
    artifactId,
    workspaceId,
    options,
  );
}
