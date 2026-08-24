import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  isAiGroundedProviderExecutionAuthorizationV1,
  type AiGroundedProviderExecutionAuthorizationV1,
} from "@markorbit/contracts";
import {
  ensureAiGroundedPreparedExecutionEvidenceRegistry,
  SqliteAiGroundedPreparedExecutionEvidenceRepository,
} from "./ai-grounded-prepared-execution-evidence";
import { RegistryConflictError, RegistryValidationError } from "./index";

const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();

export function ensureAiGroundedProviderAuthorizationRegistry(database: DatabaseSync): void {
  if (INITIALIZED_DATABASES.has(database)) return;
  ensureAiGroundedPreparedExecutionEvidenceRegistry(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS ai_grounded_provider_execution_authorizations (
      authorization_id TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision > 0),
      status TEXT NOT NULL,
      execution_input_sha256 TEXT NOT NULL,
      queue_job_id TEXT NOT NULL,
      assignment_id TEXT NOT NULL,
      binding_id TEXT NOT NULL,
      source_pack_id TEXT NOT NULL,
      source_pack_revision INTEGER NOT NULL CHECK (source_pack_revision > 0),
      rendered_prompt_sha256 TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      repository_commit_sha TEXT NOT NULL,
      approval_ref TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      decision_at TEXT,
      expires_at TEXT NOT NULL,
      document_sha256 TEXT NOT NULL,
      document_json TEXT NOT NULL,
      PRIMARY KEY(authorization_id, revision),
      FOREIGN KEY(execution_input_sha256)
        REFERENCES ai_grounded_prepared_execution_evidence(execution_input_sha256)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS ai_grounded_provider_authorization_execution_idx
      ON ai_grounded_provider_execution_authorizations(
        execution_input_sha256, authorization_id, revision
      );

    CREATE INDEX IF NOT EXISTS ai_grounded_provider_authorization_status_idx
      ON ai_grounded_provider_execution_authorizations(status, expires_at);
  `);
  INITIALIZED_DATABASES.add(database);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseAuthorization(
  value: string,
  expectedSha256?: string,
): AiGroundedProviderExecutionAuthorizationV1 {
  if (expectedSha256 !== undefined && sha256(value) !== expectedSha256) {
    throw new RegistryValidationError(
      "Stored grounded provider authorization SHA-256 does not match document JSON",
    );
  }
  const parsed = JSON.parse(value) as unknown;
  if (!isAiGroundedProviderExecutionAuthorizationV1(parsed)) {
    throw new RegistryValidationError("Stored grounded provider authorization is invalid");
  }
  return parsed;
}

function assertPreparedEvidenceMatches(
  database: DatabaseSync,
  authorization: AiGroundedProviderExecutionAuthorizationV1,
): void {
  const evidence = new SqliteAiGroundedPreparedExecutionEvidenceRepository(database).get(
    authorization.executionInputSha256,
  );
  if (!evidence) {
    throw new RegistryValidationError(
      `Grounded PREPARED execution evidence ${authorization.executionInputSha256} was not found`,
    );
  }
  if (
    evidence.assignmentId !== authorization.assignmentId ||
    evidence.bindingId !== authorization.bindingId ||
    evidence.sourcePackId !== authorization.sourcePackId ||
    evidence.sourcePackRevision !== authorization.sourcePackRevision ||
    evidence.renderedPromptSha256 !== authorization.renderedPromptSha256
  ) {
    throw new RegistryConflictError(
      "AI_GROUNDED_PROVIDER_AUTHORIZATION_EVIDENCE_MISMATCH",
      "Grounded provider authorization does not match the canonical PREPARED execution evidence",
    );
  }
}

function assertImmutableIdentity(
  previous: AiGroundedProviderExecutionAuthorizationV1,
  next: AiGroundedProviderExecutionAuthorizationV1,
): void {
  if (
    previous.authorizationId !== next.authorizationId ||
    previous.executionInputSha256 !== next.executionInputSha256 ||
    previous.queueJobId !== next.queueJobId ||
    previous.assignmentId !== next.assignmentId ||
    previous.bindingId !== next.bindingId ||
    previous.sourcePackId !== next.sourcePackId ||
    previous.sourcePackRevision !== next.sourcePackRevision ||
    previous.renderedPromptSha256 !== next.renderedPromptSha256 ||
    previous.provider !== next.provider ||
    previous.model !== next.model ||
    previous.repositoryCommitSha !== next.repositoryCommitSha ||
    previous.approvalRef !== next.approvalRef ||
    previous.gateEvidence.adk06AcceptanceRef !== next.gateEvidence.adk06AcceptanceRef ||
    previous.gateEvidence.repositoryGovernanceRef !== next.gateEvidence.repositoryGovernanceRef ||
    previous.requestedAt !== next.requestedAt ||
    previous.expiresAt !== next.expiresAt ||
    previous.maxProviderCalls !== next.maxProviderCalls
  ) {
    throw new RegistryConflictError(
      "AI_GROUNDED_PROVIDER_AUTHORIZATION_IDENTITY_CHANGED",
      `Grounded provider authorization ${next.authorizationId} immutable identity changed`,
    );
  }
}

function assertTransition(
  previous: AiGroundedProviderExecutionAuthorizationV1,
  next: AiGroundedProviderExecutionAuthorizationV1,
): void {
  if (next.revision !== previous.revision + 1) {
    throw new RegistryConflictError(
      "AI_GROUNDED_PROVIDER_AUTHORIZATION_REVISION_GAP",
      `Grounded provider authorization ${next.authorizationId} must advance exactly one revision`,
    );
  }
  if (
    previous.decisionAt !== null &&
    next.decisionAt !== null &&
    Date.parse(next.decisionAt) < Date.parse(previous.decisionAt)
  ) {
    throw new RegistryConflictError(
      "AI_GROUNDED_PROVIDER_AUTHORIZATION_DECISION_TIME_REGRESSION",
      "Grounded provider authorization decisions cannot move backward in time",
    );
  }

  if (previous.status === "PENDING") {
    if (next.status !== "GRANTED" && next.status !== "REVOKED") {
      throw new RegistryConflictError(
        "AI_GROUNDED_PROVIDER_AUTHORIZATION_TRANSITION_INVALID",
        "Pending grounded provider authorization may only be granted or revoked",
      );
    }
    return;
  }

  if (previous.status === "GRANTED") {
    if (next.status !== "REVOKED") {
      throw new RegistryConflictError(
        "AI_GROUNDED_PROVIDER_AUTHORIZATION_TRANSITION_INVALID",
        "Granted grounded provider authorization may only be revoked",
      );
    }
    if (JSON.stringify(previous.gateEvidence) !== JSON.stringify(next.gateEvidence)) {
      throw new RegistryConflictError(
        "AI_GROUNDED_PROVIDER_AUTHORIZATION_GATE_EVIDENCE_CHANGED",
        "Revocation cannot rewrite the gate evidence recorded by a granted authorization",
      );
    }
    return;
  }

  throw new RegistryConflictError(
    "AI_GROUNDED_PROVIDER_AUTHORIZATION_TERMINAL",
    "Revoked grounded provider authorization is terminal",
  );
}

export class SqliteAiGroundedProviderExecutionAuthorizationRepository {
  constructor(private readonly database: DatabaseSync) {
    this.database.exec("PRAGMA foreign_keys = ON;");
    this.database.exec("PRAGMA busy_timeout = 5000;");
    ensureAiGroundedProviderAuthorizationRegistry(database);
  }

  get(
    authorizationId: string,
    revision: number,
  ): AiGroundedProviderExecutionAuthorizationV1 | null {
    const row = this.database
      .prepare(
        `SELECT document_json, document_sha256
         FROM ai_grounded_provider_execution_authorizations
         WHERE authorization_id = ? AND revision = ?`,
      )
      .get(authorizationId, revision) as
      { document_json: string; document_sha256: string } | undefined;
    return row ? parseAuthorization(row.document_json, row.document_sha256) : null;
  }

  getLatest(authorizationId: string): AiGroundedProviderExecutionAuthorizationV1 | null {
    const row = this.database
      .prepare(
        `SELECT document_json, document_sha256
         FROM ai_grounded_provider_execution_authorizations
         WHERE authorization_id = ?
         ORDER BY revision DESC
         LIMIT 1`,
      )
      .get(authorizationId) as { document_json: string; document_sha256: string } | undefined;
    return row ? parseAuthorization(row.document_json, row.document_sha256) : null;
  }

  listByExecutionInput(executionInputSha256: string): AiGroundedProviderExecutionAuthorizationV1[] {
    const rows = this.database
      .prepare(
        `SELECT document_json, document_sha256
         FROM ai_grounded_provider_execution_authorizations
         WHERE execution_input_sha256 = ?
         ORDER BY authorization_id ASC, revision ASC`,
      )
      .all(executionInputSha256) as { document_json: string; document_sha256: string }[];
    return rows.map((row) => parseAuthorization(row.document_json, row.document_sha256));
  }

  save(
    authorization: AiGroundedProviderExecutionAuthorizationV1,
  ): AiGroundedProviderExecutionAuthorizationV1 {
    if (!isAiGroundedProviderExecutionAuthorizationV1(authorization)) {
      throw new RegistryValidationError("Grounded provider authorization is invalid");
    }
    assertPreparedEvidenceMatches(this.database, authorization);

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const existing = this.get(authorization.authorizationId, authorization.revision);
      if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(authorization)) {
          throw new RegistryConflictError(
            "AI_GROUNDED_PROVIDER_AUTHORIZATION_REVISION_CONFLICT",
            `Grounded provider authorization ${authorization.authorizationId}@${authorization.revision} already exists with different content`,
          );
        }
        this.database.exec("COMMIT;");
        return existing;
      }

      const competingLineage = this.database
        .prepare(
          `SELECT authorization_id
           FROM ai_grounded_provider_execution_authorizations
           WHERE execution_input_sha256 = ? AND provider = ?
           LIMIT 1`,
        )
        .get(authorization.executionInputSha256, authorization.provider) as
        { authorization_id: string } | undefined;
      if (competingLineage && competingLineage.authorization_id !== authorization.authorizationId) {
        throw new RegistryConflictError(
          "AI_GROUNDED_PROVIDER_AUTHORIZATION_LINEAGE_CONFLICT",
          `Grounded execution ${authorization.executionInputSha256} already has an authorization lineage for ${authorization.provider}`,
        );
      }

      const latest = this.getLatest(authorization.authorizationId);
      if (!latest) {
        if (authorization.revision !== 1 || authorization.status !== "PENDING") {
          throw new RegistryConflictError(
            "AI_GROUNDED_PROVIDER_AUTHORIZATION_INITIAL_STATE_INVALID",
            "Grounded provider authorization must begin at revision 1 in PENDING state",
          );
        }
      } else {
        assertImmutableIdentity(latest, authorization);
        assertTransition(latest, authorization);
      }

      const json = JSON.stringify(authorization);
      const documentSha256 = sha256(json);
      this.database
        .prepare(
          `INSERT INTO ai_grounded_provider_execution_authorizations(
            authorization_id, revision, status, execution_input_sha256, queue_job_id,
            assignment_id, binding_id, source_pack_id, source_pack_revision,
            rendered_prompt_sha256, provider, model, repository_commit_sha, approval_ref,
            requested_at, decision_at, expires_at, document_sha256, document_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          authorization.authorizationId,
          authorization.revision,
          authorization.status,
          authorization.executionInputSha256,
          authorization.queueJobId,
          authorization.assignmentId,
          authorization.bindingId,
          authorization.sourcePackId,
          authorization.sourcePackRevision,
          authorization.renderedPromptSha256,
          authorization.provider,
          authorization.model,
          authorization.repositoryCommitSha,
          authorization.approvalRef,
          authorization.requestedAt,
          authorization.decisionAt,
          authorization.expiresAt,
          documentSha256,
          json,
        );
      this.database.exec("COMMIT;");
      return structuredClone(authorization);
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }
}
