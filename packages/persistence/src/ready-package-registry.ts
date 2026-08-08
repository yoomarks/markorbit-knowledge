import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { ReadyPackage, ReadyPackageEvidence } from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";

const MIGRATION_ID = "0014_ready_package_registry";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export type CreateVerifiedReadyPackageInput = {
  workspaceId: string;
  sourceId: string;
  rawArtifactId: string;
  rawArtifactSha256: string;
  capturedAt: string;
  conversionRunId: string;
  converter: { converterId: string; version: string };
  stagingDocumentId: string;
  stagingSha256: string;
  verificationId: string;
  verificationOutcome: "PASS" | "PASS_WITH_WARNINGS";
  idempotencyKey: string;
};

export type ReadyPackageCreateResult = { readyPackage: ReadyPackage; replayed: boolean };

export interface ReadyPackageRegistryRepository {
  createVerified(input: CreateVerifiedReadyPackageInput): ReadyPackageCreateResult;
  getById(id: string, workspaceId: string): ReadyPackage | null;
  getByConversionRun(conversionRunId: string, workspaceId: string): ReadyPackage | null;
  markHandedOff(id: string, workspaceId: string, expectedDigest: string): ReadyPackage;
}

function encodeBase32(value: bigint, length: number): string {
  let output = "";
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    output = CROCKFORD[Number(remaining & 31n)] + output;
    remaining >>= 5n;
  }
  return output;
}

function typedId(now = Date.now()): string {
  const timestamp = encodeBase32(BigInt(now), 10);
  const randomValue = BigInt(`0x${randomBytes(10).toString("hex")}`);
  return `rdp_${timestamp}${encodeBase32(randomValue, 16)}`;
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

function digest(value: unknown): string {
  return createHash("sha256").update(stable(value), "utf8").digest("hex");
}

function parseReadyPackage(value: string): ReadyPackage {
  const parsed = JSON.parse(value) as ReadyPackage;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof parsed.id !== "string" ||
    typeof parsed.workspaceId !== "string" ||
    !["CREATED", "VERIFIED", "HANDED_OFF"].includes(parsed.status) ||
    !parsed.evidence ||
    typeof parsed.evidence.digest !== "string"
  ) {
    throw new RegistryValidationError("Persisted ReadyPackage is invalid");
  }
  return parsed;
}

function validate(input: CreateVerifiedReadyPackageInput): void {
  if (!KEY.test(input.idempotencyKey))
    throw new RegistryValidationError("Invalid ReadyPackage idempotency key");
  if (!SHA256.test(input.rawArtifactSha256) || !SHA256.test(input.stagingSha256)) {
    throw new RegistryValidationError("ReadyPackage evidence requires SHA-256 digests");
  }
  if (Number.isNaN(Date.parse(input.capturedAt))) {
    throw new RegistryValidationError("ReadyPackage capturedAt is invalid");
  }
}

export function ensureReadyPackageRegistry(database: DatabaseSync): void {
  initializeRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS ready_packages (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        raw_artifact_id TEXT NOT NULL,
        conversion_run_id TEXT NOT NULL,
        staging_document_id TEXT NOT NULL,
        digest TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('VERIFIED','HANDED_OFF')),
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (workspace_id, conversion_run_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS ready_package_idempotency (
        workspace_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_digest TEXT NOT NULL,
        ready_package_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, idempotency_key),
        FOREIGN KEY (ready_package_id) REFERENCES ready_packages(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_ready_packages_workspace_status
        ON ready_packages(workspace_id, status, created_at DESC);
    `);
    database
      .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
      .run(MIGRATION_ID, new Date().toISOString());
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

export class SqliteReadyPackageRegistryRepository implements ReadyPackageRegistryRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
    private readonly idFactory: () => string = () => typedId(),
  ) {
    ensureReadyPackageRegistry(database);
  }

  createVerified(input: CreateVerifiedReadyPackageInput): ReadyPackageCreateResult {
    validate(input);
    const requestDigest = digest(input);
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const replay = this.database
        .prepare(
          `SELECT request_digest, ready_package_id FROM ready_package_idempotency
         WHERE workspace_id = ? AND idempotency_key = ?`,
        )
        .get(input.workspaceId, input.idempotencyKey) as
        { request_digest: string; ready_package_id: string } | undefined;
      if (replay) {
        if (replay.request_digest !== requestDigest) {
          throw new RegistryConflictError(
            "READY_PACKAGE_IDEMPOTENCY_CONFLICT",
            "ReadyPackage idempotency key was reused with different evidence",
          );
        }
        const readyPackage = this.require(replay.ready_package_id, input.workspaceId);
        this.database.exec("COMMIT;");
        return { readyPackage, replayed: true };
      }

      const existing = this.getByConversionRun(input.conversionRunId, input.workspaceId);
      if (existing) {
        throw new RegistryConflictError(
          "READY_PACKAGE_CONVERSION_ALREADY_PACKAGED",
          "ConversionRun already has a ReadyPackage",
        );
      }
      const createdAt = this.clock().toISOString();
      const evidenceBase = {
        artifactIds: [input.rawArtifactId],
        stagingDocumentId: input.stagingDocumentId,
        sourceId: input.sourceId,
        conversionRunId: input.conversionRunId,
        rawArtifactSha256: input.rawArtifactSha256,
        stagingSha256: input.stagingSha256,
        verificationId: input.verificationId,
        verificationOutcome: input.verificationOutcome,
        converter: input.converter,
        capturedAt: input.capturedAt,
        legalTruthVerified: false as const,
      };
      const packageDigest = digest(evidenceBase);
      const evidence: ReadyPackageEvidence = { ...evidenceBase, digest: packageDigest };
      const readyPackage: ReadyPackage = {
        id: this.idFactory(),
        workspaceId: input.workspaceId,
        status: "VERIFIED",
        evidence,
        createdAt,
        verifiedAt: createdAt,
      };

      this.database
        .prepare(
          `INSERT INTO ready_packages
         (id, workspace_id, source_id, raw_artifact_id, conversion_run_id, staging_document_id,
          digest, status, document_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          readyPackage.id,
          input.workspaceId,
          input.sourceId,
          input.rawArtifactId,
          input.conversionRunId,
          input.stagingDocumentId,
          packageDigest,
          readyPackage.status,
          JSON.stringify(readyPackage),
          createdAt,
          createdAt,
        );
      this.database
        .prepare(
          `INSERT INTO ready_package_idempotency
         (workspace_id, idempotency_key, request_digest, ready_package_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        )
        .run(input.workspaceId, input.idempotencyKey, requestDigest, readyPackage.id, createdAt);
      this.database.exec("COMMIT;");
      return { readyPackage, replayed: false };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  getById(id: string, workspaceId: string): ReadyPackage | null {
    const row = this.database
      .prepare("SELECT document_json FROM ready_packages WHERE id = ? AND workspace_id = ?")
      .get(id, workspaceId) as { document_json: string } | undefined;
    return row ? parseReadyPackage(row.document_json) : null;
  }

  getByConversionRun(conversionRunId: string, workspaceId: string): ReadyPackage | null {
    const row = this.database
      .prepare(
        "SELECT document_json FROM ready_packages WHERE conversion_run_id = ? AND workspace_id = ?",
      )
      .get(conversionRunId, workspaceId) as { document_json: string } | undefined;
    return row ? parseReadyPackage(row.document_json) : null;
  }

  markHandedOff(id: string, workspaceId: string, expectedDigest: string): ReadyPackage {
    const current = this.require(id, workspaceId);
    if (current.evidence.digest !== expectedDigest) {
      throw new RegistryConflictError(
        "READY_PACKAGE_DIGEST_MISMATCH",
        "ReadyPackage digest mismatch",
      );
    }
    if (current.status === "HANDED_OFF") return current;
    if (current.status !== "VERIFIED") {
      throw new RegistryConflictError(
        "READY_PACKAGE_NOT_VERIFIED",
        "Only VERIFIED packages can be handed off",
      );
    }
    const now = this.clock().toISOString();
    const next: ReadyPackage = { ...current, status: "HANDED_OFF", handedOffAt: now };
    this.database
      .prepare(
        `UPDATE ready_packages SET status = 'HANDED_OFF', document_json = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ? AND status = 'VERIFIED'`,
      )
      .run(JSON.stringify(next), now, id, workspaceId);
    return next;
  }

  private require(id: string, workspaceId: string): ReadyPackage {
    const readyPackage = this.getById(id, workspaceId);
    if (!readyPackage)
      throw new RegistryError("READY_PACKAGE_NOT_FOUND", `ReadyPackage ${id} was not found`);
    return readyPackage;
  }
}
