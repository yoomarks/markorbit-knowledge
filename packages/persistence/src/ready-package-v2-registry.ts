import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  READY_PACKAGE_V2_CONTRACT_VERSION,
  READY_PACKAGE_V2_OBJECT_TYPE,
  READY_PACKAGE_V2_STATUS,
  type ReadyPackageV2,
  type ReadyPackageV2Evidence,
} from "@markorbit/contracts";
import {
  SqliteCanonicalDownstreamDocumentRepository,
  ensureCanonicalDownstreamDocumentRegistry,
  type CanonicalDownstreamDocumentRepository,
} from "./canonical-downstream-document";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";

const MIGRATION_ID = "0029_ready_package_v2";
const SHA256 = /^[a-f0-9]{64}$/u;
const MAX_LIMIT = 100;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type CreateReadyPackageV2Input = {
  workspaceId: string;
  canonicalDocumentId: string;
};

export type ReadyPackageV2CreateResult = {
  readyPackage: ReadyPackageV2;
  replayed: boolean;
};

export interface ReadyPackageV2RegistryRepository {
  createFromCanonical(input: CreateReadyPackageV2Input): ReadyPackageV2CreateResult;
  getById(workspaceId: string, readyPackageId: string): ReadyPackageV2 | null;
  getByCanonicalDocument(workspaceId: string, canonicalDocumentId: string): ReadyPackageV2 | null;
  list(workspaceId: string, limit?: number): ReadyPackageV2[];
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

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
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

function required(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function limit(value = 20): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RegistryValidationError("limit must be a positive integer");
  }
  return Math.min(value, MAX_LIMIT);
}

function parseReadyPackage(value: string): ReadyPackageV2 {
  const parsed = JSON.parse(value) as ReadyPackageV2;
  if (
    parsed?.contractVersion !== READY_PACKAGE_V2_CONTRACT_VERSION ||
    parsed.objectType !== READY_PACKAGE_V2_OBJECT_TYPE ||
    !parsed.id?.startsWith("rdp_") ||
    !parsed.workspaceId?.trim() ||
    parsed.status !== READY_PACKAGE_V2_STATUS ||
    !parsed.evidence?.canonicalDocumentId?.startsWith("cdd_") ||
    Number.isNaN(Date.parse(parsed.evidence.canonicalPromotedAt)) ||
    parsed.evidence.origin?.kind !== "VAULT_IMPORT" ||
    !parsed.evidence.origin.vaultStagingDocumentId?.startsWith("vst_") ||
    !SHA256.test(parsed.evidence.content?.sha256) ||
    !Number.isSafeInteger(parsed.evidence.content.sizeBytes) ||
    parsed.evidence.content.sizeBytes < 0 ||
    parsed.evidence.content.contentAddressedRef !==
      `cas:sha256:${parsed.evidence.content.sha256}` ||
    parsed.evidence.content.mediaType !== "text/markdown" ||
    parsed.evidence.content.encoding !== "utf-8" ||
    !SHA256.test(parsed.evidence.digest) ||
    parsed.evidence.legalTruthVerified !== false ||
    Number.isNaN(Date.parse(parsed.createdAt))
  ) {
    throw new RegistryConflictError(
      "READY_PACKAGE_V2_PERSISTED_STATE_INVALID",
      "Persisted ReadyPackage V2 is invalid",
    );
  }
  return parsed;
}

function evidenceBase(document: ReturnType<CanonicalDownstreamDocumentRepository["getById"]>) {
  if (!document)
    throw new RegistryError(
      "CANONICAL_DOWNSTREAM_DOCUMENT_NOT_FOUND",
      "Missing canonical document",
    );
  return {
    canonicalDocumentId: document.id,
    canonicalPromotedAt: document.promotedAt,
    origin: {
      ...document.origin,
      binding: { ...document.origin.binding },
    },
    content: { ...document.content },
    legalTruthVerified: false as const,
  };
}

function buildEvidence(
  document: NonNullable<ReturnType<CanonicalDownstreamDocumentRepository["getById"]>>,
): ReadyPackageV2Evidence {
  const base = evidenceBase(document);
  return { ...base, digest: sha256(stable(base)) };
}

export function ensureReadyPackageV2Registry(database: DatabaseSync): void {
  initializeRegistry(database);
  ensureCanonicalDownstreamDocumentRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS ready_packages_v2 (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        canonical_document_id TEXT NOT NULL,
        digest TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status = 'VERIFIED'),
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY (canonical_document_id) REFERENCES canonical_downstream_documents(id),
        UNIQUE (workspace_id, canonical_document_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_ready_packages_v2_workspace_created
        ON ready_packages_v2(workspace_id, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_ready_packages_v2_digest
        ON ready_packages_v2(workspace_id, digest);
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

export class SqliteReadyPackageV2RegistryRepository implements ReadyPackageV2RegistryRepository {
  private readonly canonical: CanonicalDownstreamDocumentRepository;

  constructor(
    private readonly database: DatabaseSync,
    canonical?: CanonicalDownstreamDocumentRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly idFactory: () => string = () => typedId(),
  ) {
    ensureReadyPackageV2Registry(database);
    this.canonical = canonical ?? new SqliteCanonicalDownstreamDocumentRepository(database);
  }

  createFromCanonical(input: CreateReadyPackageV2Input): ReadyPackageV2CreateResult {
    const workspaceId = required(input.workspaceId, "workspaceId");
    const canonicalDocumentId = required(input.canonicalDocumentId, "canonicalDocumentId");
    const existing = this.getByCanonicalDocument(workspaceId, canonicalDocumentId);
    if (existing) return { readyPackage: existing, replayed: true };

    const canonical = this.canonical.getById(workspaceId, canonicalDocumentId);
    if (!canonical) {
      throw new RegistryError(
        "CANONICAL_DOWNSTREAM_DOCUMENT_NOT_FOUND",
        `Canonical downstream document ${canonicalDocumentId} was not found`,
      );
    }
    if (canonical.status !== "READY") {
      throw new RegistryConflictError(
        "READY_PACKAGE_V2_CANONICAL_NOT_READY",
        "ReadyPackage V2 requires a READY canonical downstream document",
      );
    }

    const evidence = buildEvidence(canonical);
    const createdAt = this.clock().toISOString();
    const readyPackage: ReadyPackageV2 = {
      contractVersion: READY_PACKAGE_V2_CONTRACT_VERSION,
      objectType: READY_PACKAGE_V2_OBJECT_TYPE,
      id: this.idFactory(),
      workspaceId,
      status: READY_PACKAGE_V2_STATUS,
      evidence,
      createdAt,
    };

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const raced = this.getByCanonicalDocument(workspaceId, canonicalDocumentId);
      if (raced) {
        this.database.exec("COMMIT;");
        return { readyPackage: raced, replayed: true };
      }
      this.database
        .prepare(
          `INSERT INTO ready_packages_v2
           (id, workspace_id, canonical_document_id, digest, status, document_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          readyPackage.id,
          workspaceId,
          canonicalDocumentId,
          evidence.digest,
          readyPackage.status,
          JSON.stringify(readyPackage),
          createdAt,
        );
      this.database.exec("COMMIT;");
      return { readyPackage, replayed: false };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  getById(workspaceIdValue: string, readyPackageIdValue: string): ReadyPackageV2 | null {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const readyPackageId = required(readyPackageIdValue, "readyPackageId");
    const row = this.database
      .prepare(
        `SELECT document_json FROM ready_packages_v2
         WHERE workspace_id = ? AND id = ?`,
      )
      .get(workspaceId, readyPackageId) as { document_json: string } | undefined;
    return row ? parseReadyPackage(row.document_json) : null;
  }

  getByCanonicalDocument(
    workspaceIdValue: string,
    canonicalDocumentIdValue: string,
  ): ReadyPackageV2 | null {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const canonicalDocumentId = required(canonicalDocumentIdValue, "canonicalDocumentId");
    const row = this.database
      .prepare(
        `SELECT document_json FROM ready_packages_v2
         WHERE workspace_id = ? AND canonical_document_id = ?`,
      )
      .get(workspaceId, canonicalDocumentId) as { document_json: string } | undefined;
    return row ? parseReadyPackage(row.document_json) : null;
  }

  list(workspaceIdValue: string, limitValue = 20): ReadyPackageV2[] {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const rows = this.database
      .prepare(
        `SELECT document_json FROM ready_packages_v2
         WHERE workspace_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
      )
      .all(workspaceId, limit(limitValue)) as Array<{ document_json: string }>;
    return rows.map((row) => parseReadyPackage(row.document_json));
  }
}
