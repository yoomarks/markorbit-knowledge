import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { CoreIntakeResult, ReadyPackage, ReadyPackageEvidence } from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";

const MIGRATION_ID = "0014_ready_package_registry";
const CORE_INTAKE_RECEIPT_MIGRATION_ID = "0019_ready_package_core_intake_receipts";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CORE_INTAKE_STATUSES = new Set<CoreIntakeResult["status"]>([
  "RECEIVED",
  "ACCEPTED",
  "REJECTED",
]);

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

export type ReadyPackageCoreIntakeReceipt = {
  intakeId: string;
  workspaceId: string;
  readyPackageId: string;
  expectedDigest: string;
  status: CoreIntakeResult["status"];
  recordedAt: string;
};

export type RecordReadyPackageCoreIntakeAcknowledgmentInput = {
  workspaceId: string;
  readyPackageId: string;
  expectedDigest: string;
  coreIntakeResult: CoreIntakeResult;
};

export type ReadyPackageCoreIntakeAcknowledgmentPersistenceResult = {
  readyPackage: ReadyPackage;
  receipt: ReadyPackageCoreIntakeReceipt;
  coreIntakeResult: CoreIntakeResult;
  handoffRecorded: boolean;
  replayed: boolean;
  disposition: "HANDOFF_RECORDED" | "HANDOFF_ALREADY_RECORDED" | "REJECTED_NOT_HANDED_OFF";
};

export interface ReadyPackageRegistryRepository {
  createVerified(input: CreateVerifiedReadyPackageInput): ReadyPackageCreateResult;
  getById(id: string, workspaceId: string): ReadyPackage | null;
  getByConversionRun(conversionRunId: string, workspaceId: string): ReadyPackage | null;
  markHandedOff(id: string, workspaceId: string, expectedDigest: string): ReadyPackage;
  recordCoreIntakeAcknowledgment(
    input: RecordReadyPackageCoreIntakeAcknowledgmentInput,
  ): ReadyPackageCoreIntakeAcknowledgmentPersistenceResult;
  listCoreIntakeReceipts(
    readyPackageId: string,
    workspaceId: string,
  ): ReadyPackageCoreIntakeReceipt[];
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

function parseCoreIntakeReceipt(value: string): ReadyPackageCoreIntakeReceipt {
  const parsed = JSON.parse(value) as ReadyPackageCoreIntakeReceipt;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof parsed.intakeId !== "string" ||
    !parsed.intakeId.trim() ||
    typeof parsed.workspaceId !== "string" ||
    !parsed.workspaceId.trim() ||
    typeof parsed.readyPackageId !== "string" ||
    !parsed.readyPackageId.trim() ||
    !SHA256.test(parsed.expectedDigest) ||
    !CORE_INTAKE_STATUSES.has(parsed.status) ||
    Number.isNaN(Date.parse(parsed.recordedAt))
  ) {
    throw new RegistryValidationError("Persisted Core intake receipt is invalid");
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

function validateCoreIntakeAcknowledgment(
  input: RecordReadyPackageCoreIntakeAcknowledgmentInput,
): void {
  if (!input.workspaceId?.trim()) throw new RegistryValidationError("workspaceId is required");
  if (!input.readyPackageId?.trim())
    throw new RegistryValidationError("readyPackageId is required");
  if (!SHA256.test(input.expectedDigest)) {
    throw new RegistryValidationError("expectedDigest must be a SHA-256 digest");
  }
  if (!input.coreIntakeResult || typeof input.coreIntakeResult !== "object") {
    throw new RegistryValidationError("coreIntakeResult is required");
  }
  if (!input.coreIntakeResult.intakeId?.trim()) {
    throw new RegistryValidationError("coreIntakeResult.intakeId is required");
  }
  if (!input.coreIntakeResult.readyPackageId?.trim()) {
    throw new RegistryValidationError("coreIntakeResult.readyPackageId is required");
  }
  if (!CORE_INTAKE_STATUSES.has(input.coreIntakeResult.status)) {
    throw new RegistryValidationError("coreIntakeResult.status is invalid");
  }
  if (input.coreIntakeResult.readyPackageId !== input.readyPackageId) {
    throw new RegistryConflictError(
      "CORE_INTAKE_READY_PACKAGE_MISMATCH",
      "Core intake result belongs to another ReadyPackage",
    );
  }
}

function hasMigration(database: DatabaseSync, id: string): boolean {
  return Boolean(database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(id));
}

function applyMigration(database: DatabaseSync, id: string, sql: string): void {
  if (hasMigration(database, id)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(sql);
    database
      .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
      .run(id, new Date().toISOString());
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

export function ensureReadyPackageRegistry(database: DatabaseSync): void {
  initializeRegistry(database);
  applyMigration(
    database,
    MIGRATION_ID,
    `
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
    `,
  );
  applyMigration(
    database,
    CORE_INTAKE_RECEIPT_MIGRATION_ID,
    `
      CREATE TABLE IF NOT EXISTS ready_package_core_intake_receipts (
        workspace_id TEXT NOT NULL,
        intake_id TEXT NOT NULL,
        ready_package_id TEXT NOT NULL,
        expected_digest TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('RECEIVED','ACCEPTED','REJECTED')),
        document_json TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, intake_id, status),
        FOREIGN KEY (ready_package_id) REFERENCES ready_packages(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_ready_package_core_intake_receipts_package
        ON ready_package_core_intake_receipts(
          workspace_id,
          ready_package_id,
          recorded_at DESC,
          intake_id DESC
        );
    `,
  );
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
    return this.transitionHandedOff(current, expectedDigest, this.clock().toISOString());
  }

  recordCoreIntakeAcknowledgment(
    input: RecordReadyPackageCoreIntakeAcknowledgmentInput,
  ): ReadyPackageCoreIntakeAcknowledgmentPersistenceResult {
    validateCoreIntakeAcknowledgment(input);
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const current = this.require(input.readyPackageId, input.workspaceId);
      if (current.evidence.digest !== input.expectedDigest) {
        throw new RegistryConflictError(
          "READY_PACKAGE_DIGEST_MISMATCH",
          "ReadyPackage digest mismatch",
        );
      }

      const intakeReceipts = this.getCoreIntakeReceiptsByIntakeId(
        input.coreIntakeResult.intakeId,
        input.workspaceId,
      );
      if (
        intakeReceipts.some(
          (receipt) =>
            receipt.readyPackageId !== input.readyPackageId ||
            receipt.expectedDigest !== input.expectedDigest,
        )
      ) {
        throw new RegistryConflictError(
          "CORE_INTAKE_RECEIPT_IDEMPOTENCY_CONFLICT",
          "Core intake receipt intakeId was reused for different ReadyPackage evidence",
        );
      }

      const existing = intakeReceipts.find(
        (receipt) => receipt.status === input.coreIntakeResult.status,
      );
      if (existing) {
        this.database.exec("COMMIT;");
        const handoffRecorded = existing.status !== "REJECTED";
        return {
          readyPackage: current,
          receipt: existing,
          coreIntakeResult: input.coreIntakeResult,
          handoffRecorded,
          replayed: true,
          disposition: handoffRecorded ? "HANDOFF_ALREADY_RECORDED" : "REJECTED_NOT_HANDED_OFF",
        };
      }

      if (input.coreIntakeResult.status === "REJECTED" && current.status === "HANDED_OFF") {
        throw new RegistryConflictError(
          "CORE_INTAKE_REJECTION_AFTER_HANDOFF",
          "A rejected Core intake result cannot reverse an already recorded handoff",
        );
      }

      const recordedAt = this.clock().toISOString();
      const handoffWasAlreadyRecorded = current.status === "HANDED_OFF";
      const readyPackage =
        input.coreIntakeResult.status === "REJECTED"
          ? current
          : this.transitionHandedOff(current, input.expectedDigest, recordedAt);
      const receipt: ReadyPackageCoreIntakeReceipt = {
        intakeId: input.coreIntakeResult.intakeId,
        workspaceId: input.workspaceId,
        readyPackageId: input.readyPackageId,
        expectedDigest: input.expectedDigest,
        status: input.coreIntakeResult.status,
        recordedAt,
      };
      this.database
        .prepare(
          `INSERT INTO ready_package_core_intake_receipts
           (workspace_id, intake_id, ready_package_id, expected_digest, status, document_json, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          receipt.workspaceId,
          receipt.intakeId,
          receipt.readyPackageId,
          receipt.expectedDigest,
          receipt.status,
          JSON.stringify(receipt),
          receipt.recordedAt,
        );
      this.database.exec("COMMIT;");

      const handoffRecorded = receipt.status !== "REJECTED";
      return {
        readyPackage,
        receipt,
        coreIntakeResult: input.coreIntakeResult,
        handoffRecorded,
        replayed: false,
        disposition: handoffRecorded
          ? handoffWasAlreadyRecorded
            ? "HANDOFF_ALREADY_RECORDED"
            : "HANDOFF_RECORDED"
          : "REJECTED_NOT_HANDED_OFF",
      };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  listCoreIntakeReceipts(
    readyPackageId: string,
    workspaceId: string,
  ): ReadyPackageCoreIntakeReceipt[] {
    this.require(readyPackageId, workspaceId);
    return this.database
      .prepare(
        `SELECT document_json FROM ready_package_core_intake_receipts
         WHERE workspace_id = ? AND ready_package_id = ?
         ORDER BY recorded_at DESC, rowid DESC`,
      )
      .all(workspaceId, readyPackageId)
      .map((row) =>
        parseCoreIntakeReceipt(String((row as { document_json: string }).document_json)),
      );
  }

  private getCoreIntakeReceiptsByIntakeId(
    intakeId: string,
    workspaceId: string,
  ): ReadyPackageCoreIntakeReceipt[] {
    return this.database
      .prepare(
        `SELECT document_json FROM ready_package_core_intake_receipts
         WHERE workspace_id = ? AND intake_id = ?
         ORDER BY rowid ASC`,
      )
      .all(workspaceId, intakeId)
      .map((row) =>
        parseCoreIntakeReceipt(String((row as { document_json: string }).document_json)),
      );
  }

  private transitionHandedOff(
    current: ReadyPackage,
    expectedDigest: string,
    handedOffAt: string,
  ): ReadyPackage {
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
    const next: ReadyPackage = { ...current, status: "HANDED_OFF", handedOffAt };
    this.database
      .prepare(
        `UPDATE ready_packages SET status = 'HANDED_OFF', document_json = ?, updated_at = ?
         WHERE id = ? AND workspace_id = ? AND status = 'VERIFIED'`,
      )
      .run(JSON.stringify(next), handedOffAt, current.id, current.workspaceId);
    return next;
  }

  private require(id: string, workspaceId: string): ReadyPackage {
    const readyPackage = this.getById(id, workspaceId);
    if (!readyPackage)
      throw new RegistryError("READY_PACKAGE_NOT_FOUND", `ReadyPackage ${id} was not found`);
    return readyPackage;
  }
}
