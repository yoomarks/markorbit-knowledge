import type { DatabaseSync } from "node:sqlite";
import {
  converterAccepts,
  mimePatternMatches,
  type ConversionProfile,
  type RawArtifact,
} from "@markorbit/contracts";
import { RegistryError, RegistryValidationError } from "@markorbit/persistence";
import type { ConversionRunLedgerRepository } from "@markorbit/persistence/conversion-runs";
import type { ConverterRegistryRepository } from "@markorbit/persistence/converters";
import type { RawArtifactRepository } from "@markorbit/persistence/raw-artifacts";
import { ensureM3CanonicalDocumentAutoProfiles } from "./m3-converter-bootstrap";
import {
  authorizeRawArtifactForConversionWithDependencies,
  type ConversionAuthorizationDependencies,
} from "./raw-artifact-conversion-authorization";
import {
  getConversionRunLedgerRepository,
  getConverterRegistryRepository,
  getRawArtifactRepository,
  getRegistryDatabase,
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

export type AutomaticConversionDependencies = ConversionAuthorizationDependencies & {
  conversionRuns: ConversionRunLedgerRepository;
};

export type AutomaticConversionReconciliationFailure = {
  artifactId: string;
  code: string;
};

export type AutomaticConversionReconciliationResult = {
  status: "COMPLETED";
  workspaceId: string;
  candidateCount: number;
  enqueued: number;
  replayed: number;
  alreadyProcessed: number;
  notApplicable: number;
  failed: number;
  failures: AutomaticConversionReconciliationFailure[];
};

export type AutomaticConversionReconciliationOptions = {
  limit?: number;
};

function productionDependencies(): AutomaticConversionDependencies {
  return {
    database: getRegistryDatabase(),
    artifacts: getRawArtifactRepository(),
    converters: getConverterRegistryRepository(),
    conversionRuns: getConversionRunLedgerRepository(),
  };
}

function profileCompatible(
  workspaceId: string,
  artifact: RawArtifact,
  profile: ConversionProfile,
  converters: ConverterRegistryRepository,
): boolean {
  if (!profile.autoConvert) return false;
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

function compatibleAutomaticProfile(
  workspaceId: string,
  artifact: RawArtifact,
  converters: ConverterRegistryRepository,
): ConversionProfile | null {
  // READY_FOR_CONVERSION is a sticky authorization boundary. Recovery must continue with the
  // profile that already authorized the immutable bytes rather than silently switching to a
  // newly higher-precedence profile.
  if (artifact.status === "READY_FOR_CONVERSION") {
    const authorizedProfileId = artifact.extensions?.["x-conversion-profile-id"];
    if (typeof authorizedProfileId !== "string") return null;
    const authorizedProfile = converters.getProfile(authorizedProfileId);
    return authorizedProfile &&
      profileCompatible(workspaceId, artifact, authorizedProfile, converters)
      ? authorizedProfile
      : null;
  }

  return (
    converters
      .listProfiles({ workspaceId, status: "ACTIVE", limit: 100 })
      .items.filter((profile) => profileCompatible(workspaceId, artifact, profile, converters))
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

export function dispatchAutomaticConversionForArtifactWithDependencies(
  dependencies: AutomaticConversionDependencies,
  artifactId: string,
  workspaceId: string,
): AutomaticConversionHandoffResult {
  const view = dependencies.artifacts.getArtifact(artifactId);
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

  ensureM3CanonicalDocumentAutoProfiles(dependencies.converters, workspaceId);
  const profile = compatibleAutomaticProfile(
    workspaceId,
    artifact,
    dependencies.converters,
  );
  if (!profile) {
    return { status: "NOT_APPLICABLE", reason: "NO_AUTO_PROFILE", artifactId };
  }

  const authorization = authorizeRawArtifactForConversionWithDependencies(
    dependencies,
    artifactId,
    workspaceId,
    { conversionProfileId: profile.id },
  );
  const dispatch = dependencies.conversionRuns.dispatchManual({
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

export function dispatchAutomaticConversionForArtifact(
  artifactId: string,
  workspaceId: string,
): AutomaticConversionHandoffResult {
  return dispatchAutomaticConversionForArtifactWithDependencies(
    productionDependencies(),
    artifactId,
    workspaceId,
  );
}

function normalizedRecoveryLimit(value: number | undefined): number {
  if (value === undefined) return 25;
  if (!Number.isInteger(value) || value <= 0) {
    throw new RegistryValidationError("Automatic conversion recovery limit must be positive");
  }
  return Math.min(value, 100);
}

/**
 * Return RawArtifacts that should have an AUTO_PROFILE ConversionRun but do not.
 *
 * The query deliberately excludes artifacts that are merely raw evidence for another canonical
 * representation (for example HTML when the source profile canonicalizes MARKDOWN), and it only
 * treats READY_FOR_CONVERSION as recoverable when its already-authorized profile is still ACTIVE
 * and autoConvert=true.
 */
export function automaticConversionRecoveryCandidateIds(
  database: DatabaseSync,
  workspaceId: string,
  limit = 25,
): string[] {
  const normalizedWorkspaceId = workspaceId.trim();
  if (!normalizedWorkspaceId) {
    throw new RegistryValidationError("workspaceId is required for automatic conversion recovery");
  }
  const normalizedLimit = normalizedRecoveryLimit(limit);
  const rows = database
    .prepare(
      `WITH active_auto_profiles AS (
         SELECT p.id, p.workspace_id, p.source_id, p.document_json
         FROM conversion_profiles p
         JOIN converter_manifests m
           ON m.converter_id = p.converter_id AND m.version = p.converter_version
         WHERE p.workspace_id = ?
           AND p.status = 'ACTIVE'
           AND p.auto_convert = 1
           AND m.status = 'ACTIVE'
           AND m.output_format = 'MARKDOWN'
       )
       SELECT a.id
       FROM raw_artifacts a
       WHERE a.workspace_id = ?
         AND a.status IN ('REGISTERED', 'DUPLICATE_CHECKED', 'READY_FOR_CONVERSION')
         AND NOT EXISTS (
           SELECT 1
           FROM conversion_runs r
           WHERE r.workspace_id = a.workspace_id
             AND r.raw_artifact_id = a.id
             AND r.trigger_type = 'AUTO_PROFILE'
         )
         AND (
           (
             a.status IN ('REGISTERED', 'DUPLICATE_CHECKED')
             AND EXISTS (
               SELECT 1
               FROM active_auto_profiles p
               WHERE (p.source_id IS NULL OR p.source_id = a.source_id)
                 AND EXISTS (
                   SELECT 1
                   FROM json_each(p.document_json, '$.input.artifactKinds') kinds
                   WHERE kinds.value = a.artifact_kind
                 )
                 AND EXISTS (
                   SELECT 1
                   FROM json_each(p.document_json, '$.input.mimePatterns') patterns
                   WHERE
                     (
                       substr(patterns.value, 1, instr(patterns.value, '/') - 1) = '*'
                       OR substr(patterns.value, 1, instr(patterns.value, '/') - 1) =
                          substr(a.mime_type, 1, instr(a.mime_type, '/') - 1)
                     )
                     AND (
                       substr(patterns.value, instr(patterns.value, '/') + 1) = '*'
                       OR substr(patterns.value, instr(patterns.value, '/') + 1) =
                          substr(a.mime_type, instr(a.mime_type, '/') + 1)
                     )
                 )
             )
           )
           OR
           (
             a.status = 'READY_FOR_CONVERSION'
             AND EXISTS (
               SELECT 1
               FROM active_auto_profiles p
               WHERE p.id = json_extract(
                 a.document_json,
                 '$.extensions.\"x-conversion-profile-id\"'
               )
                 AND (p.source_id IS NULL OR p.source_id = a.source_id)
                 AND EXISTS (
                   SELECT 1
                   FROM json_each(p.document_json, '$.input.artifactKinds') kinds
                   WHERE kinds.value = a.artifact_kind
                 )
                 AND EXISTS (
                   SELECT 1
                   FROM json_each(p.document_json, '$.input.mimePatterns') patterns
                   WHERE
                     (
                       substr(patterns.value, 1, instr(patterns.value, '/') - 1) = '*'
                       OR substr(patterns.value, 1, instr(patterns.value, '/') - 1) =
                          substr(a.mime_type, 1, instr(a.mime_type, '/') - 1)
                     )
                     AND (
                       substr(patterns.value, instr(patterns.value, '/') + 1) = '*'
                       OR substr(patterns.value, instr(patterns.value, '/') + 1) =
                          substr(a.mime_type, instr(a.mime_type, '/') + 1)
                     )
                 )
             )
           )
         )
       ORDER BY
         CASE a.status WHEN 'READY_FOR_CONVERSION' THEN 0 ELSE 1 END,
         a.created_at ASC,
         a.id ASC
       LIMIT ?`,
    )
    .all(normalizedWorkspaceId, normalizedWorkspaceId, normalizedLimit) as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

function reconciliationFailureCode(error: unknown): string {
  if (error instanceof RegistryError) return error.code;
  if (error instanceof Error && error.name) return error.name;
  return "AUTO_CONVERSION_RECOVERY_FAILED";
}

export function reconcileAutomaticConversions(
  workspaceId: string,
  options: AutomaticConversionReconciliationOptions = {},
): AutomaticConversionReconciliationResult {
  const dependencies = productionDependencies();
  // Ensure all tables referenced by the recovery query have been initialized before selecting.
  ensureM3CanonicalDocumentAutoProfiles(dependencies.converters, workspaceId);

  const candidateIds = automaticConversionRecoveryCandidateIds(
    dependencies.database,
    workspaceId,
    normalizedRecoveryLimit(options.limit),
  );
  const result: AutomaticConversionReconciliationResult = {
    status: "COMPLETED",
    workspaceId,
    candidateCount: candidateIds.length,
    enqueued: 0,
    replayed: 0,
    alreadyProcessed: 0,
    notApplicable: 0,
    failed: 0,
    failures: [],
  };

  for (const artifactId of candidateIds) {
    try {
      const handoff = dispatchAutomaticConversionForArtifactWithDependencies(
        dependencies,
        artifactId,
        workspaceId,
      );
      if (handoff.status === "ENQUEUED") result.enqueued += 1;
      else if (handoff.status === "REPLAYED") result.replayed += 1;
      else if (handoff.status === "ALREADY_PROCESSED") result.alreadyProcessed += 1;
      else result.notApplicable += 1;
    } catch (error) {
      result.failed += 1;
      if (result.failures.length < 10) {
        result.failures.push({ artifactId, code: reconciliationFailureCode(error) });
      }
    }
  }

  return result;
}
