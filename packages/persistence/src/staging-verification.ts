import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  isConversionRun,
  isStagingDocumentDescriptor,
  type ConversionRun,
  type FrontmatterValueType,
  type StagingDocumentDescriptor,
  type StagingValidationCheck,
  type StagingValidationOutcome,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryError, RegistryValidationError } from "./index";
import {
  ensureStagingContentRegistry,
  type StagingContentRegistryRepository,
  type StagingDocumentRecord,
} from "./staging-content-registry";

const MIGRATION_ID = "0013_staging_verification_pipeline";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const VERIFIER_ID = "builtin-staging-verifier";
const VERIFIER_VERSION = "1.0.0";
const MAX_FRONTMATTER_BYTES = 32_768;
const MAX_FIELDS = 64;
const MAX_DEPTH = 2;
const MAX_KEY_LENGTH = 80;
const MAX_SCALAR_LENGTH = 2_000;
const MAX_LIST_ITEMS = 32;

export const BUILTIN_STAGING_VERIFIER = {
  verifierId: VERIFIER_ID,
  version: VERIFIER_VERSION,
} as const;

export type VerifyGeneratedStagingInput = {
  workspaceId: string;
  stagingDocumentId: string;
  verifierId?: typeof VERIFIER_ID;
  verifierVersion?: typeof VERIFIER_VERSION;
  idempotencyKey: string;
};

export type StagingVerificationEvidence = {
  id: string;
  workspaceId: string;
  stagingDocumentId: string;
  conversionRunId: string;
  verifier: { verifierId: typeof VERIFIER_ID; version: typeof VERIFIER_VERSION };
  contentSha256: string;
  outcome: StagingValidationOutcome;
  checks: StagingValidationCheck[];
  warnings: string[];
  frontmatterSummary: StagingDocumentDescriptor["frontmatterSummary"];
  createdAt: string;
};

export type StagingVerificationResult = {
  evidence: StagingVerificationEvidence;
  record: StagingDocumentRecord;
  replayed: boolean;
};

export interface StagingVerificationRepository {
  verifyGenerated(input: VerifyGeneratedStagingInput): StagingVerificationResult;
  getVerification(id: string, workspaceId: string): StagingVerificationEvidence | null;
  getByDocument(stagingDocumentId: string, workspaceId: string): StagingVerificationEvidence | null;
}

type Scalar = string | number | boolean | null | string[];
type ParsedFrontmatter = {
  values: Map<string, Scalar>;
  types: Map<string, FrontmatterValueType>;
  extraKeys: string[];
};

type ParseResult =
  | { ok: true; frontmatter: ParsedFrontmatter; body: string }
  | { ok: false; code: string; message: string; body: string };

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

function parseRun(value: string): ConversionRun {
  const parsed = JSON.parse(value) as unknown;
  if (!isConversionRun(parsed))
    throw new RegistryValidationError("Persisted ConversionRun is invalid");
  return parsed;
}

function parseDescriptor(value: string): StagingDocumentDescriptor {
  const parsed = JSON.parse(value) as unknown;
  if (!isStagingDocumentDescriptor(parsed)) {
    throw new RegistryValidationError("Persisted StagingDocumentDescriptor is invalid");
  }
  return parsed;
}

function parseEvidence(value: string): StagingVerificationEvidence {
  const parsed = JSON.parse(value) as StagingVerificationEvidence;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof parsed.id !== "string" ||
    typeof parsed.workspaceId !== "string" ||
    typeof parsed.stagingDocumentId !== "string" ||
    typeof parsed.conversionRunId !== "string" ||
    !Array.isArray(parsed.checks) ||
    !Array.isArray(parsed.warnings)
  ) {
    throw new RegistryValidationError("Persisted Staging verification evidence is invalid");
  }
  return parsed;
}

function check(
  code: string,
  status: "PASS" | "WARN" | "FAIL",
  message?: string,
): StagingValidationCheck {
  return message ? { code, status, message } : { code, status };
}

function parseQuoted(value: string): string | null {
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === "string" ? parsed : null;
    } catch {
      return null;
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return null;
}

function scalar(value: string): { value: Scalar; type: FrontmatterValueType } | null {
  if (value.length > MAX_SCALAR_LENGTH) return null;
  const quoted = parseQuoted(value);
  if (quoted !== null) return { value: quoted, type: "STRING" };
  if (value === "null" || value === "~") return { value: null, type: "NULL" };
  if (value === "true" || value === "false") return { value: value === "true", type: "BOOLEAN" };
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return { value: Number(value), type: "NUMBER" };
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    return { value, type: "DATE" };
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    const body = value.slice(1, -1).trim();
    if (!body) return { value: [], type: "STRING_LIST" };
    const items = body.split(",").map((item) => item.trim());
    if (items.length > MAX_LIST_ITEMS) return null;
    const parsed = items.map(parseQuoted);
    if (parsed.some((item) => item === null)) return null;
    return { value: parsed as string[], type: "STRING_LIST" };
  }
  if (/^[^\[\]{}&*!<>`]+$/.test(value)) return { value, type: "STRING" };
  return null;
}

function parseFrontmatter(text: string): ParseResult {
  if (!text.startsWith("---\n")) {
    return {
      ok: false,
      code: "FRONTMATTER_PRESENT",
      message: "Markdown frontmatter is missing",
      body: text,
    };
  }
  const closing = text.indexOf("\n---\n", 4);
  if (closing < 0) {
    return {
      ok: false,
      code: "FRONTMATTER_DELIMITERS_VALID",
      message: "Markdown frontmatter closing delimiter is missing",
      body: "",
    };
  }
  const raw = text.slice(4, closing);
  const body = text.slice(closing + 5);
  if (new TextEncoder().encode(raw).byteLength > MAX_FRONTMATTER_BYTES) {
    return {
      ok: false,
      code: "FRONTMATTER_LIMITS_VALID",
      message: "Frontmatter exceeds byte limit",
      body,
    };
  }
  if (/(^|\s)(?:&|\*|!|<<:)/m.test(raw)) {
    return {
      ok: false,
      code: "FRONTMATTER_PARSE_VALID",
      message: "YAML aliases, anchors, tags and merge keys are forbidden",
      body,
    };
  }
  const values = new Map<string, Scalar>();
  const types = new Map<string, FrontmatterValueType>();
  const seen = new Set<string>();
  const extraKeys: string[] = [];
  let parent: string | null = null;
  const lines = raw.split("\n");
  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    if (indent % 2 !== 0 || indent > MAX_DEPTH * 2) {
      return {
        ok: false,
        code: "FRONTMATTER_LIMITS_VALID",
        message: "Invalid frontmatter nesting",
        body,
      };
    }
    const match = /^([A-Za-z0-9_.-]+):(.*)$/.exec(line.trim());
    if (!match)
      return {
        ok: false,
        code: "FRONTMATTER_PARSE_VALID",
        message: "Malformed frontmatter line",
        body,
      };
    const key = match[1];
    const rest = match[2].trim();
    if (key.length > MAX_KEY_LENGTH) {
      return {
        ok: false,
        code: "FRONTMATTER_LIMITS_VALID",
        message: "Frontmatter key exceeds limit",
        body,
      };
    }
    if (indent === 0 && rest === "") {
      parent = key;
      continue;
    }
    if (indent === 0) parent = null;
    if (indent > 0 && !parent) {
      return {
        ok: false,
        code: "FRONTMATTER_PARSE_VALID",
        message: "Nested field has no parent",
        body,
      };
    }
    const path = indent > 0 ? `${parent}.${key}` : key;
    if (seen.has(path)) {
      return {
        ok: false,
        code: "FRONTMATTER_KEYS_UNIQUE",
        message: `Duplicate frontmatter key: ${path}`,
        body,
      };
    }
    seen.add(path);
    if (seen.size > MAX_FIELDS) {
      return {
        ok: false,
        code: "FRONTMATTER_LIMITS_VALID",
        message: "Frontmatter field count exceeds limit",
        body,
      };
    }
    const parsed = scalar(rest);
    if (!parsed)
      return {
        ok: false,
        code: "FRONTMATTER_PARSE_VALID",
        message: `Unsupported value for ${path}`,
        body,
      };
    values.set(path, parsed.value);
    types.set(path, parsed.type);
    if (!path.startsWith("markorbit.")) extraKeys.push(path);
  }
  return { ok: true, frontmatter: { values, types, extraKeys }, body };
}

function requestDigest(
  input: VerifyGeneratedStagingInput,
  descriptor: StagingDocumentDescriptor,
): string {
  return sha256(
    stable({
      workspaceId: input.workspaceId,
      stagingDocumentId: input.stagingDocumentId,
      verifierId: input.verifierId ?? VERIFIER_ID,
      verifierVersion: input.verifierVersion ?? VERIFIER_VERSION,
      idempotencyKey: input.idempotencyKey,
      contentSha256: descriptor.contentHash.value,
      sizeBytes: descriptor.sizeBytes,
    }),
  );
}

export function ensureStagingVerification(database: DatabaseSync): void {
  ensureStagingContentRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS staging_document_verifications (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        staging_document_id TEXT NOT NULL,
        conversion_run_id TEXT NOT NULL,
        verifier_id TEXT NOT NULL,
        verifier_version TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('PASS','PASS_WITH_WARNINGS','FAIL')),
        check_count INTEGER NOT NULL CHECK (check_count >= 0),
        warning_count INTEGER NOT NULL CHECK (warning_count >= 0),
        content_sha256 TEXT NOT NULL,
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (staging_document_id) REFERENCES staging_documents(id),
        FOREIGN KEY (conversion_run_id) REFERENCES conversion_runs(id),
        UNIQUE (staging_document_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS staging_verification_idempotency (
        workspace_id TEXT NOT NULL,
        staging_document_id TEXT NOT NULL,
        verifier_id TEXT NOT NULL,
        verifier_version TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_digest TEXT NOT NULL,
        verification_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, staging_document_id, verifier_id, verifier_version, idempotency_key),
        FOREIGN KEY (verification_id) REFERENCES staging_document_verifications(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_staging_verifications_workspace_created
        ON staging_document_verifications(workspace_id, created_at DESC);
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

export class SqliteStagingVerificationRepository implements StagingVerificationRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly staging: StagingContentRegistryRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly verificationId: () => string = () => typedId("stv"),
  ) {
    ensureStagingVerification(database);
  }

  verifyGenerated(input: VerifyGeneratedStagingInput): StagingVerificationResult {
    const verifierId = input.verifierId ?? VERIFIER_ID;
    const verifierVersion = input.verifierVersion ?? VERIFIER_VERSION;
    if (verifierId !== VERIFIER_ID || verifierVersion !== VERIFIER_VERSION) {
      throw new RegistryValidationError("Only builtin-staging-verifier@1.0.0 is authorized");
    }
    if (!IDEMPOTENCY_KEY.test(input.idempotencyKey)) {
      throw new RegistryValidationError("Invalid staging verification idempotency key");
    }
    const initial = this.staging.getDocument(input.stagingDocumentId, input.workspaceId);
    if (!initial) {
      throw new RegistryError(
        "STAGING_DOCUMENT_NOT_FOUND",
        `Staging document ${input.stagingDocumentId} was not found`,
      );
    }
    const digest = requestDigest(input, initial.descriptor);
    const content = this.staging.readContent(input.stagingDocumentId, input.workspaceId);
    const now = this.clock().toISOString();

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const replay = this.database
        .prepare(
          `SELECT request_digest, verification_id FROM staging_verification_idempotency
           WHERE workspace_id = ? AND staging_document_id = ? AND verifier_id = ?
             AND verifier_version = ? AND idempotency_key = ?`,
        )
        .get(
          input.workspaceId,
          input.stagingDocumentId,
          verifierId,
          verifierVersion,
          input.idempotencyKey,
        ) as { request_digest: string; verification_id: string } | undefined;
      if (replay) {
        if (replay.request_digest !== digest) {
          throw new RegistryConflictError(
            "STAGING_VERIFICATION_IDEMPOTENCY_CONFLICT",
            "Staging verification idempotency key was reused with different evidence",
          );
        }
        const evidence = this.requireVerification(replay.verification_id, input.workspaceId);
        const record = this.requireDocument(input.stagingDocumentId, input.workspaceId);
        this.database.exec("COMMIT;");
        return { evidence, record, replayed: true };
      }

      const current = this.requireDocument(input.stagingDocumentId, input.workspaceId);
      if (current.descriptor.status !== "GENERATED") {
        throw new RegistryConflictError(
          "STAGING_VERIFICATION_ALREADY_DECIDED",
          "Staging document already has a terminal verification decision",
        );
      }
      const run = this.loadRun(current.descriptor.conversionRunId);
      if (run.workspaceId !== input.workspaceId) {
        throw new RegistryConflictError(
          "STAGING_VERIFICATION_WORKSPACE_MISMATCH",
          "ConversionRun belongs to another Workspace",
        );
      }
      if (run.status !== "VERIFYING") {
        throw new RegistryConflictError(
          "STAGING_VERIFICATION_RUN_STATUS_INVALID",
          "ConversionRun must remain VERIFYING during Staging verification",
        );
      }

      const evaluated = this.evaluate(current.descriptor, run, content);
      const evidence: StagingVerificationEvidence = {
        id: this.verificationId(),
        workspaceId: input.workspaceId,
        stagingDocumentId: current.descriptor.id,
        conversionRunId: run.id,
        verifier: { verifierId: VERIFIER_ID, version: VERIFIER_VERSION },
        contentSha256: current.descriptor.contentHash.value,
        outcome: evaluated.outcome,
        checks: evaluated.checks,
        warnings: evaluated.warnings,
        frontmatterSummary: evaluated.frontmatterSummary,
        createdAt: now,
      };
      const descriptor: StagingDocumentDescriptor = {
        ...current.descriptor,
        frontmatterSummary: evaluated.frontmatterSummary,
        validation: {
          outcome: evaluated.outcome,
          checks: evaluated.checks,
          warnings: evaluated.warnings,
        },
        status: evaluated.outcome === "FAIL" ? "BLOCKED" : "READY",
      };
      if (!isStagingDocumentDescriptor(descriptor)) {
        throw new RegistryValidationError("Verified StagingDocumentDescriptor is invalid");
      }

      this.database
        .prepare(
          `INSERT INTO staging_document_verifications
           (id, workspace_id, staging_document_id, conversion_run_id, verifier_id, verifier_version,
            outcome, check_count, warning_count, content_sha256, document_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          evidence.id,
          evidence.workspaceId,
          evidence.stagingDocumentId,
          evidence.conversionRunId,
          evidence.verifier.verifierId,
          evidence.verifier.version,
          evidence.outcome,
          evidence.checks.length,
          evidence.warnings.length,
          evidence.contentSha256,
          JSON.stringify(evidence),
          now,
        );
      this.database
        .prepare(
          `UPDATE staging_documents SET status = ?, document_json = ?, updated_at = ?
           WHERE id = ? AND workspace_id = ? AND status = 'GENERATED'`,
        )
        .run(
          descriptor.status,
          JSON.stringify(descriptor),
          now,
          descriptor.id,
          descriptor.workspaceId,
        );
      this.database
        .prepare(
          `INSERT INTO staging_verification_idempotency
           (workspace_id, staging_document_id, verifier_id, verifier_version, idempotency_key,
            request_digest, verification_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.workspaceId,
          input.stagingDocumentId,
          verifierId,
          verifierVersion,
          input.idempotencyKey,
          digest,
          evidence.id,
          now,
        );
      this.database.exec("COMMIT;");
      return {
        evidence,
        record: { descriptor, createdAt: current.createdAt, updatedAt: now },
        replayed: false,
      };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  getVerification(id: string, workspaceId: string): StagingVerificationEvidence | null {
    const row = this.database
      .prepare(
        "SELECT document_json FROM staging_document_verifications WHERE id = ? AND workspace_id = ?",
      )
      .get(id, workspaceId) as { document_json: string } | undefined;
    return row ? parseEvidence(row.document_json) : null;
  }

  getByDocument(
    stagingDocumentId: string,
    workspaceId: string,
  ): StagingVerificationEvidence | null {
    const row = this.database
      .prepare(
        "SELECT document_json FROM staging_document_verifications WHERE staging_document_id = ? AND workspace_id = ?",
      )
      .get(stagingDocumentId, workspaceId) as { document_json: string } | undefined;
    return row ? parseEvidence(row.document_json) : null;
  }

  private evaluate(descriptor: StagingDocumentDescriptor, run: ConversionRun, bytes: Uint8Array) {
    const checks: StagingValidationCheck[] = [check("STAGING_CAS_INTEGRITY", "PASS")];
    let text = "";
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      checks.push(check("MARKDOWN_UTF8_VALID", "PASS"));
    } catch {
      checks.push(check("MARKDOWN_UTF8_VALID", "FAIL", "Markdown is not valid UTF-8"));
      return this.outcome(checks, [], { fieldCount: 0, fields: [] });
    }
    const parsed = parseFrontmatter(text);
    if (!parsed.ok) {
      const standard = [
        "FRONTMATTER_PRESENT",
        "FRONTMATTER_DELIMITERS_VALID",
        "FRONTMATTER_PARSE_VALID",
        "FRONTMATTER_LIMITS_VALID",
        "FRONTMATTER_KEYS_UNIQUE",
      ];
      for (const code of standard) {
        checks.push(
          check(
            code,
            code === parsed.code ? "FAIL" : "PASS",
            code === parsed.code ? parsed.message : undefined,
          ),
        );
      }
      checks.push(check("MARKDOWN_BODY_PRESENT", parsed.body.trim() ? "PASS" : "FAIL"));
      return this.outcome(checks, [], { fieldCount: 0, fields: [] });
    }
    checks.push(check("FRONTMATTER_PRESENT", "PASS"));
    checks.push(check("FRONTMATTER_DELIMITERS_VALID", "PASS"));
    checks.push(check("FRONTMATTER_PARSE_VALID", "PASS"));
    checks.push(check("FRONTMATTER_LIMITS_VALID", "PASS"));
    checks.push(check("FRONTMATTER_KEYS_UNIQUE", "PASS"));

    const value = (key: string) => parsed.frontmatter.values.get(key);
    const requiredKeys = [
      "markorbit.workspaceId",
      "markorbit.sourceId",
      "markorbit.rawArtifactId",
      "markorbit.conversionRunId",
      "markorbit.converterId",
      "markorbit.converterVersion",
      "markorbit.inputSha256",
    ];
    checks.push(
      check(
        "MARKORBIT_METADATA_PRESENT",
        requiredKeys.every((key) => parsed.frontmatter.values.has(key)) ? "PASS" : "FAIL",
      ),
    );
    checks.push(
      check(
        "WORKSPACE_BINDING_VALID",
        value("markorbit.workspaceId") === descriptor.workspaceId ? "PASS" : "FAIL",
      ),
    );
    checks.push(
      check(
        "SOURCE_BINDING_VALID",
        value("markorbit.sourceId") === descriptor.sourceId ? "PASS" : "FAIL",
      ),
    );
    checks.push(
      check(
        "RAW_ARTIFACT_BINDING_VALID",
        value("markorbit.rawArtifactId") === descriptor.rawArtifactId ? "PASS" : "FAIL",
      ),
    );
    checks.push(
      check(
        "CONVERSION_RUN_BINDING_VALID",
        value("markorbit.conversionRunId") === descriptor.conversionRunId ? "PASS" : "FAIL",
      ),
    );
    checks.push(
      check(
        "CONVERTER_BINDING_VALID",
        value("markorbit.converterId") === descriptor.converter.converterId &&
          value("markorbit.converterVersion") === descriptor.converter.version
          ? "PASS"
          : "FAIL",
      ),
    );
    checks.push(
      check(
        "INPUT_HASH_BINDING_VALID",
        value("markorbit.inputSha256") === run.input.sha256 ? "PASS" : "FAIL",
      ),
    );
    checks.push(check("MARKDOWN_BODY_PRESENT", parsed.body.trim() ? "PASS" : "FAIL"));
    const warnings = parsed.frontmatter.extraKeys.length
      ? [`Unrecognized frontmatter fields: ${parsed.frontmatter.extraKeys.sort().join(", ")}`]
      : [];
    if (warnings.length) checks.push(check("FRONTMATTER_EXTRA_FIELDS", "WARN", warnings[0]));
    const usedSummaryKeys = new Set<string>();
    const fields = [...parsed.frontmatter.types.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, valueType]) => {
        let normalized = path
          .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
          .replace(/[^A-Za-z0-9_-]+/g, "_")
          .replace(/-+/g, "_")
          .toLowerCase();
        if (!/^[a-z]/.test(normalized)) normalized = `field_${normalized}`;

        let key = normalized;
        if (key.length > 64 || usedSummaryKeys.has(key)) {
          let attempt = 0;
          do {
            const suffix = sha256(attempt === 0 ? path : `${path}:${attempt}`).slice(0, 12);
            key = `${normalized.slice(0, 51)}_${suffix}`;
            attempt += 1;
          } while (usedSummaryKeys.has(key));
        }
        usedSummaryKeys.add(key);
        return { key, valueType };
      });
    return this.outcome(checks, warnings, { fieldCount: fields.length, fields });
  }

  private outcome(
    checks: StagingValidationCheck[],
    warnings: string[],
    frontmatterSummary: StagingDocumentDescriptor["frontmatterSummary"],
  ) {
    const outcome: StagingValidationOutcome = checks.some((item) => item.status === "FAIL")
      ? "FAIL"
      : checks.some((item) => item.status === "WARN")
        ? "PASS_WITH_WARNINGS"
        : "PASS";
    return { checks, warnings, frontmatterSummary, outcome };
  }

  private requireDocument(id: string, workspaceId: string): StagingDocumentRecord {
    const row = this.database
      .prepare(
        "SELECT document_json, created_at, updated_at FROM staging_documents WHERE id = ? AND workspace_id = ?",
      )
      .get(id, workspaceId) as
      { document_json: string; created_at: string; updated_at: string } | undefined;
    if (!row)
      throw new RegistryError("STAGING_DOCUMENT_NOT_FOUND", `Staging document ${id} was not found`);
    return {
      descriptor: parseDescriptor(row.document_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private requireVerification(id: string, workspaceId: string): StagingVerificationEvidence {
    const evidence = this.getVerification(id, workspaceId);
    if (!evidence)
      throw new RegistryError(
        "STAGING_VERIFICATION_EVIDENCE_INVALID",
        "Verification evidence is missing",
      );
    return evidence;
  }

  private loadRun(id: string): ConversionRun {
    const row = this.database
      .prepare("SELECT document_json FROM conversion_runs WHERE id = ?")
      .get(id) as { document_json: string } | undefined;
    if (!row)
      throw new RegistryError("CONVERSION_RUN_NOT_FOUND", `ConversionRun ${id} was not found`);
    return parseRun(row.document_json);
  }
}
