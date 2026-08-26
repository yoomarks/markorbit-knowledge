import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  CONVERSION_RUNTIME_VERSION,
  conversionCapabilitySupports,
  isConversionAttempt,
  isConversionClaimRequest,
  isConversionClaimResult,
  isConversionLease,
  isConversionRun,
  isConversionWorkerCapability,
  isRawArtifactReadGrant,
  isStagingOutputUploadGrant,
  normalizeStagingTargetPath,
  type ConversionAttempt,
  type ConversionClaimRequest,
  type ConversionClaimResult,
  type ConversionLease,
  type ConversionWorkerCapability,
  type RawArtifactReadGrant,
  type StagingOutputUploadGrant,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryError, RegistryValidationError } from "./index";
import { ensureConversionRuntimePersistence } from "./conversion-runtime-persistence";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeBase32(value: bigint, length: number): string {
  let output = "";
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    output = CROCKFORD[Number(remaining & 31n)] + output;
    remaining >>= 5n;
  }
  return output;
}

function typedId(prefix: string, now = Date.now()): string {
  const timestamp = encodeBase32(BigInt(now), 10);
  const randomValue = BigInt(`0x${randomBytes(10).toString("hex")}`);
  return `${prefix}_${timestamp}${encodeBase32(randomValue, 16)}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stable(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseCapability(value: string): ConversionWorkerCapability {
  const parsed = JSON.parse(value) as unknown;
  if (!isConversionWorkerCapability(parsed)) {
    throw new RegistryValidationError("Persisted ConversionWorkerCapability is invalid");
  }
  return parsed;
}

function expandTargetPath(template: string, artifactId: string, runId: string): string {
  const expanded = normalizeStagingTargetPath(
    template
      .replaceAll("{{artifactId}}", artifactId)
      .replaceAll("{artifactId}", artifactId)
      .replaceAll("{{runId}}", runId)
      .replaceAll("{runId}", runId),
  );
  if (!expanded) {
    throw new RegistryValidationError("Conversion target path could not be normalized");
  }
  return expanded;
}

export type TargetedConversionClaimPersistenceResult = {
  result: ConversionClaimResult;
  replayed: boolean;
};

/**
 * Claim one exact pending ConversionRun without scanning or perturbing unrelated compatible work.
 *
 * This is intentionally a narrow facade for server-side orchestration that already knows the
 * durable ConversionRun identity. It persists the same attempt, lease and single-use grants as the
 * normal runtime claim path and shares the same claim idempotency ledger.
 */
export function claimSpecificConversionRun(
  database: DatabaseSync,
  request: ConversionClaimRequest,
  conversionRunId: string,
  clock: () => Date = () => new Date(),
): TargetedConversionClaimPersistenceResult {
  ensureConversionRuntimePersistence(database);
  if (!isConversionClaimRequest(request)) {
    throw new RegistryValidationError("Claim request does not satisfy Conversion Runtime Protocol v1");
  }
  const requestedRunId = conversionRunId.trim();
  if (!requestedRunId) throw new RegistryValidationError("conversionRunId is required");
  const requestDigest = sha256(stable({ request, conversionRunId: requestedRunId }));

  database.exec("BEGIN IMMEDIATE;");
  try {
    const previous = database
      .prepare(
        `SELECT request_digest, result_json FROM conversion_claim_idempotency
         WHERE workspace_id = ? AND worker_id = ? AND idempotency_key = ?`,
      )
      .get(request.workspaceId, request.workerId, request.idempotencyKey) as
      | { request_digest: string; result_json: string }
      | undefined;
    if (previous) {
      if (previous.request_digest !== requestDigest) {
        throw new RegistryConflictError(
          "CONVERSION_CLAIM_IDEMPOTENCY_CONFLICT",
          "Claim idempotency key was reused with a different exact-run request",
        );
      }
      const parsed = JSON.parse(previous.result_json) as unknown;
      if (!isConversionClaimResult(parsed)) {
        throw new RegistryValidationError("Persisted ConversionClaimResult is invalid");
      }
      database.exec("COMMIT;");
      return { result: parsed, replayed: true };
    }

    const worker = database
      .prepare("SELECT workspace_id, desired_state FROM worker_definitions WHERE id = ?")
      .get(request.workerId) as { workspace_id: string; desired_state: string } | undefined;
    if (!worker) {
      throw new RegistryError("WORKER_NOT_FOUND", `Worker ${request.workerId} was not found`);
    }
    if (worker.workspace_id !== request.workspaceId) {
      throw new RegistryConflictError(
        "CONVERSION_WORKER_WORKSPACE_MISMATCH",
        "Worker belongs to another Workspace",
      );
    }
    if (worker.desired_state !== "ACTIVE") {
      throw new RegistryConflictError("WORKER_NOT_ACTIVE", "Worker must be ACTIVE to claim conversion work");
    }

    const capabilityRow = database
      .prepare(
        `SELECT document_json FROM conversion_worker_capabilities
         WHERE worker_id = ? AND workspace_id = ? AND capability_revision = ? AND active = 1`,
      )
      .get(request.workerId, request.workspaceId, request.capabilityRevision) as
      | { document_json: string }
      | undefined;
    if (!capabilityRow) {
      throw new RegistryConflictError(
        "CONVERSION_CAPABILITY_NOT_ACTIVE",
        "Exact active capability revision was not found",
      );
    }
    const capability = parseCapability(capabilityRow.document_json);

    const runRow = database
      .prepare(
        `SELECT document_json FROM conversion_runs r
         WHERE r.id = ? AND r.workspace_id = ? AND r.status = 'PENDING'
           AND NOT EXISTS (
             SELECT 1 FROM conversion_leases l
             WHERE l.conversion_run_id = r.id AND l.status = 'ACTIVE'
           )`,
      )
      .get(requestedRunId, request.workspaceId) as { document_json: string } | undefined;
    if (!runRow) {
      throw new RegistryConflictError(
        "CONVERSION_TARGET_RUN_NOT_CLAIMABLE",
        "Target ConversionRun is not pending or already has an active lease",
      );
    }
    const run = JSON.parse(runRow.document_json) as unknown;
    if (!isConversionRun(run)) {
      throw new RegistryValidationError("Persisted ConversionRun is invalid");
    }
    if (
      !request.supportedConverters.some(
        (entry) =>
          entry.converterId === run.converter.converterId && entry.versions.includes(run.converter.version),
      ) ||
      !conversionCapabilitySupports(capability, {
        converterId: run.converter.converterId,
        version: run.converter.version,
        artifactKind: run.input.artifactKind,
        mimeType: run.input.mimeType,
        outputFormat: run.requestedOutput.format,
      })
    ) {
      throw new RegistryConflictError(
        "CONVERSION_TARGET_RUN_NOT_SUPPORTED",
        "Target ConversionRun is not supported by the authenticated worker capability",
      );
    }

    const targetPath = expandTargetPath(
      run.requestedOutput.targetPathTemplate,
      run.rawArtifactId,
      run.id,
    );
    const timestamp = clock().toISOString();
    const leaseSeconds = request.requestedLeaseDurationSeconds || 120;
    if (!Number.isInteger(leaseSeconds) || leaseSeconds <= 0 || leaseSeconds > 3600) {
      throw new RegistryValidationError("requestedLeaseDurationSeconds must be between 1 and 3600");
    }
    const expiresAt = new Date(Date.parse(timestamp) + leaseSeconds * 1000).toISOString();
    const renewableUntil = new Date(
      Date.parse(timestamp) + Math.max(leaseSeconds, 900) * 1000,
    ).toISOString();
    const ordinal =
      Number(
        (
          database
            .prepare("SELECT COUNT(*) AS total FROM conversion_attempts WHERE conversion_run_id = ?")
            .get(run.id) as { total: number }
        ).total,
      ) + 1;
    const attemptId = typedId("cva");
    const leaseId = typedId("cvl");
    const leaseSecret = randomBytes(32).toString("base64url");
    const lease: ConversionLease = {
      contractVersion: CONVERSION_RUNTIME_VERSION,
      objectType: "CONVERSION_LEASE",
      id: leaseId,
      workspaceId: request.workspaceId,
      conversionRunId: run.id,
      workerId: request.workerId,
      conversionAttemptId: attemptId,
      converter: { ...run.converter },
      generation: 1,
      tokenReference: `rtk_${typedId("ref").slice(4)}`,
      tokenDigest: sha256(leaseSecret),
      status: "ACTIVE",
      issuedAt: timestamp,
      expiresAt,
      renewableUntil,
    };
    const attempt: ConversionAttempt = {
      contractVersion: CONVERSION_RUNTIME_VERSION,
      objectType: "CONVERSION_ATTEMPT",
      id: attemptId,
      workspaceId: request.workspaceId,
      conversionRunId: run.id,
      workerId: request.workerId,
      conversionLeaseId: leaseId,
      ordinal,
      converter: { ...run.converter },
      createdAt: timestamp,
      status: "CLAIMED",
    };
    const readGrant: RawArtifactReadGrant = {
      contractVersion: CONVERSION_RUNTIME_VERSION,
      objectType: "RAW_ARTIFACT_READ_GRANT",
      id: typedId("rag"),
      workspaceId: request.workspaceId,
      rawArtifactId: run.rawArtifactId,
      conversionRunId: run.id,
      conversionAttemptId: attemptId,
      workerId: request.workerId,
      expectedSha256: run.input.sha256,
      expectedBytes: run.input.sizeBytes,
      expectedMime: run.input.mimeType,
      accessRef: `artifact-read:${run.rawArtifactId}:${attemptId}`,
      issuedAt: timestamp,
      expiresAt,
      maximumReads: 1,
      readsUsed: 0,
      usagePolicy: "CONVERSION_INPUT_ONLY",
      tokenReference: `rtk_${typedId("ref").slice(4)}`,
      tokenDigest: sha256(randomBytes(32).toString("base64url")),
    };
    const uploadGrant: StagingOutputUploadGrant = {
      contractVersion: CONVERSION_RUNTIME_VERSION,
      objectType: "STAGING_OUTPUT_UPLOAD_GRANT",
      id: typedId("sug"),
      workspaceId: request.workspaceId,
      conversionRunId: run.id,
      conversionAttemptId: attemptId,
      workerId: request.workerId,
      normalizedTargetPath: targetPath,
      allowedMediaType: "text/markdown",
      maximumBytes: 5_000_000,
      requiredDigestAlgorithm: "SHA-256",
      uploadSessionRef: `staging-upload:${run.id}:${attemptId}`,
      issuedAt: timestamp,
      expiresAt,
      tokenReference: `rtk_${typedId("ref").slice(4)}`,
      tokenDigest: sha256(randomBytes(32).toString("base64url")),
      allowedContentCount: 1,
      expectedProvenancePolicy: "CONVERSION_ATTEMPT_BOUND",
    };
    const result: ConversionClaimResult = {
      contractVersion: CONVERSION_RUNTIME_VERSION,
      objectType: "CONVERSION_CLAIM_RESULT",
      id: typedId("ccs"),
      workspaceId: request.workspaceId,
      workerId: request.workerId,
      result: "CLAIMED",
      idempotencyKey: request.idempotencyKey,
      lease,
      executionSummary: {
        conversionRunId: run.id,
        rawArtifactId: run.rawArtifactId,
        artifactKind: run.input.artifactKind,
        mimeType: run.input.mimeType,
        sha256: run.input.sha256,
        sizeBytes: run.input.sizeBytes,
        requestedOutputFormat: run.requestedOutput.format,
        targetPathTemplate: run.requestedOutput.targetPathTemplate,
      },
      converter: { ...run.converter },
      rawArtifactReadGrant: readGrant,
      stagingOutputUploadGrant: uploadGrant,
    };
    if (
      !isConversionLease(lease) ||
      !isConversionAttempt(attempt) ||
      !isRawArtifactReadGrant(readGrant) ||
      !isStagingOutputUploadGrant(uploadGrant) ||
      !isConversionClaimResult(result)
    ) {
      throw new RegistryValidationError("Exact-run claim objects violate Conversion Runtime Protocol v1");
    }

    database
      .prepare(
        `INSERT INTO conversion_attempts
         (id, workspace_id, conversion_run_id, worker_id, conversion_lease_id, ordinal,
          converter_id, converter_version, status, document_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        attempt.id,
        attempt.workspaceId,
        attempt.conversionRunId,
        attempt.workerId,
        attempt.conversionLeaseId,
        attempt.ordinal,
        attempt.converter.converterId,
        attempt.converter.version,
        attempt.status,
        JSON.stringify(attempt),
        attempt.createdAt,
      );
    database
      .prepare(
        `INSERT INTO conversion_leases
         (id, workspace_id, conversion_run_id, worker_id, conversion_attempt_id,
          converter_id, converter_version, generation, status, token_reference, token_digest,
          document_json, issued_at, expires_at, renewable_until)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        lease.id,
        lease.workspaceId,
        lease.conversionRunId,
        lease.workerId,
        lease.conversionAttemptId,
        lease.converter.converterId,
        lease.converter.version,
        lease.generation,
        lease.status,
        lease.tokenReference,
        lease.tokenDigest,
        JSON.stringify(lease),
        lease.issuedAt,
        lease.expiresAt,
        lease.renewableUntil,
      );
    database
      .prepare(
        `INSERT INTO conversion_read_grants
         (id, workspace_id, conversion_run_id, conversion_attempt_id, worker_id, expires_at, document_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        readGrant.id,
        readGrant.workspaceId,
        readGrant.conversionRunId,
        readGrant.conversionAttemptId,
        readGrant.workerId,
        readGrant.expiresAt,
        JSON.stringify(readGrant),
      );
    database
      .prepare(
        `INSERT INTO conversion_upload_grants
         (id, workspace_id, conversion_run_id, conversion_attempt_id, worker_id, expires_at, document_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        uploadGrant.id,
        uploadGrant.workspaceId,
        uploadGrant.conversionRunId,
        uploadGrant.conversionAttemptId,
        uploadGrant.workerId,
        uploadGrant.expiresAt,
        JSON.stringify(uploadGrant),
      );
    database
      .prepare(
        `INSERT INTO conversion_claim_idempotency
         (workspace_id, worker_id, idempotency_key, request_digest, result_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        request.workspaceId,
        request.workerId,
        request.idempotencyKey,
        requestDigest,
        JSON.stringify(result),
        timestamp,
      );
    database.exec("COMMIT;");
    return { result, replayed: false };
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}
