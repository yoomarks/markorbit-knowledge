import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type {
  AiGroundedPreparedExecutionEvidenceV1,
  AiGroundedProviderExecutionAuthorizationV1,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "./index";
import { SqliteAiGroundedProviderExecutionAuthorizationRepository } from "./ai-grounded-provider-authorization-registry";

const EXECUTION_SHA = "a".repeat(64);
const PROMPT_SHA = "b".repeat(64);
const SOURCE_SHA = "c".repeat(64);
const SOURCE_RECEIPTS_SHA = "d".repeat(64);
const COMMIT_SHA = "e".repeat(40);
const SOURCE_ID = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SOURCE_ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const PROMPT_SOURCE_ID = "src_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const PROMPT_ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const WORKSPACE_ID = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function evidence(): AiGroundedPreparedExecutionEvidenceV1 {
  return {
    protocolVersion: "1.0",
    objectType: "AI_GROUNDED_PREPARED_EXECUTION_EVIDENCE",
    executionInputSha256: EXECUTION_SHA,
    assignmentId: "kas_us_trademark_section_8",
    bindingId: "asb_us_trademark_section_8_official",
    sourcePackId: "asp_us_trademark_section_8_official",
    sourcePackRevision: 1,
    rendererVersion: "1.0.0",
    renderedPromptSha256: PROMPT_SHA,
    sourceReceiptsSha256: SOURCE_RECEIPTS_SHA,
    sourceReceipts: [
      {
        sourceId: SOURCE_ID,
        artifactId: SOURCE_ARTIFACT_ID,
        canonicalUri: "https://www.uspto.gov/trademarks",
        mediaType: "text/html",
        contentSha256: SOURCE_SHA,
        sizeBytes: 128,
      },
    ],
    promptArtifact: {
      artifactId: PROMPT_ARTIFACT_ID,
      workspaceId: WORKSPACE_ID,
      sourceId: PROMPT_SOURCE_ID,
      contentSha256: PROMPT_SHA,
      sizeBytes: 512,
      canonicalUri: `ai+markorbit://grounded-executions/${EXECUTION_SHA}/prompt`,
      sourceUri: `ai+markorbit://grounded-executions/${EXECUTION_SHA}/rendered-prompt`,
    },
    canonicalPreparedAt: "2026-08-24T12:00:00.000Z",
    persistedAt: "2026-08-24T12:01:00.000Z",
    providerCallAuthorized: false,
    providerCallExecuted: false,
    externalBrowsingAllowed: false,
    legalTruthVerified: false,
    executionAuthorityGranted: false,
  };
}

function pending(): AiGroundedProviderExecutionAuthorizationV1 {
  const prepared = evidence();
  return {
    protocolVersion: "1.0",
    objectType: "AI_GROUNDED_PROVIDER_EXECUTION_AUTHORIZATION",
    authorizationId: "gpa_us_section_8_openai",
    revision: 1,
    status: "PENDING",
    executionInputSha256: EXECUTION_SHA,
    queueJobId: "akj_0123456789abcdef0123456789abcdef",
    assignmentId: prepared.assignmentId,
    bindingId: prepared.bindingId,
    sourcePackId: prepared.sourcePackId,
    sourcePackRevision: prepared.sourcePackRevision,
    renderedPromptSha256: PROMPT_SHA,
    provider: "OPENAI",
    model: "gpt-5.6-luna",
    repositoryCommitSha: COMMIT_SHA,
    approvalRef: "github:yoomarks/markorbit-knowledge#405",
    gateEvidence: {
      adk06AcceptanceRef: "github:yoomarks/markorbit-knowledge#405",
      adk06AcceptanceSatisfied: false,
      repositoryGovernanceRef: "github:yoomarks/markorbit-knowledge#429",
      repositoryGovernanceSatisfied: false,
    },
    requestedAt: "2026-08-24T12:02:00.000Z",
    decisionAt: null,
    expiresAt: "2026-08-25T12:02:00.000Z",
    maxProviderCalls: 1,
    providerCallAuthorized: false,
    executionAuthorityGranted: false,
    externalBrowsingAllowed: false,
    legalTruthVerified: false,
    semanticClaimCoverageVerified: false,
    candidateAutoActivationAuthorized: false,
    protectedActionsAuthorized: false,
  };
}

function granted(): AiGroundedProviderExecutionAuthorizationV1 {
  const request = pending();
  return {
    ...request,
    revision: 2,
    status: "GRANTED",
    gateEvidence: {
      ...request.gateEvidence,
      adk06AcceptanceSatisfied: true,
      repositoryGovernanceSatisfied: true,
    },
    decisionAt: "2026-08-24T12:10:00.000Z",
    providerCallAuthorized: true,
    executionAuthorityGranted: true,
  };
}

function revoked(): AiGroundedProviderExecutionAuthorizationV1 {
  return {
    ...granted(),
    revision: 3,
    status: "REVOKED",
    decisionAt: "2026-08-24T12:20:00.000Z",
    providerCallAuthorized: false,
    executionAuthorityGranted: false,
  };
}

function seed(): {
  database: DatabaseSync;
  repository: SqliteAiGroundedProviderExecutionAuthorizationRepository;
} {
  const database = new DatabaseSync(":memory:");
  const repository = new SqliteAiGroundedProviderExecutionAuthorizationRepository(database);
  const value = evidence();
  const json = JSON.stringify(value);

  database.exec("PRAGMA foreign_keys = OFF;");
  database
    .prepare(
      `INSERT INTO ai_grounded_prepared_execution_evidence(
        execution_input_sha256, assignment_id, binding_id, source_pack_id,
        source_pack_revision, renderer_version, rendered_prompt_sha256,
        source_receipts_sha256, prompt_artifact_id, prompt_workspace_id,
        prompt_source_id, evidence_sha256, document_json, canonical_prepared_at, persisted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      value.executionInputSha256,
      value.assignmentId,
      value.bindingId,
      value.sourcePackId,
      value.sourcePackRevision,
      value.rendererVersion,
      value.renderedPromptSha256,
      value.sourceReceiptsSha256,
      value.promptArtifact.artifactId,
      value.promptArtifact.workspaceId,
      value.promptArtifact.sourceId,
      sha256(json),
      json,
      value.canonicalPreparedAt,
      value.persistedAt,
    );
  database.exec("PRAGMA foreign_keys = ON;");
  return { database, repository };
}

describe("SqliteAiGroundedProviderExecutionAuthorizationRepository", () => {
  it("persists PENDING authorization and replays the exact revision idempotently", () => {
    const { database, repository } = seed();
    expect(repository.save(pending())).toEqual(pending());
    expect(repository.save(pending())).toEqual(pending());

    const restarted = new SqliteAiGroundedProviderExecutionAuthorizationRepository(database);
    expect(restarted.get(pending().authorizationId, 1)).toEqual(pending());
    expect(restarted.getLatest(pending().authorizationId)).toEqual(pending());
    expect(restarted.listByExecutionInput(EXECUTION_SHA)).toEqual([pending()]);
    database.close();
  });

  it("requires revision 1 to begin PENDING and rejects same-revision mutation", () => {
    const { database, repository } = seed();
    expect(() => repository.save({ ...pending(), revision: 2 })).toThrow(RegistryConflictError);
    repository.save(pending());
    expect(() =>
      repository.save({
        ...pending(),
        model: "different-model",
      }),
    ).toThrow(/already exists with different content/u);
    database.close();
  });

  it("permits only one authorization lineage per PREPARED execution and provider", () => {
    const { database, repository } = seed();
    repository.save(pending());
    expect(() =>
      repository.save({
        ...pending(),
        authorizationId: "gpa_us_section_8_openai_duplicate",
      }),
    ).toThrow(/already has an authorization lineage/u);
    database.close();
  });

  it("grants only after both external gates are recorded satisfied", () => {
    const { database, repository } = seed();
    repository.save(pending());

    expect(() =>
      repository.save({
        ...granted(),
        gateEvidence: {
          ...granted().gateEvidence,
          repositoryGovernanceSatisfied: false,
        },
      }),
    ).toThrow(RegistryValidationError);

    expect(repository.save(granted())).toEqual(granted());
    expect(repository.getLatest(pending().authorizationId)?.status).toBe("GRANTED");
    database.close();
  });

  it("rejects revision gaps and immutable execution/provider identity drift", () => {
    const { database, repository } = seed();
    repository.save(pending());
    expect(() => repository.save({ ...granted(), revision: 3 })).toThrow(/advance exactly one/u);
    expect(() =>
      repository.save({
        ...granted(),
        provider: "DEEPSEEK",
      }),
    ).toThrow(/immutable identity changed/u);
    database.close();
  });

  it("rejects decision timestamps that move backward after a grant", () => {
    const { database, repository } = seed();
    repository.save(pending());
    repository.save(granted());
    expect(() =>
      repository.save({
        ...revoked(),
        decisionAt: "2026-08-24T12:09:59.000Z",
      }),
    ).toThrow(/cannot move backward/u);
    database.close();
  });

  it("revokes a grant terminally without rewriting the granted gate evidence", () => {
    const { database, repository } = seed();
    repository.save(pending());
    repository.save(granted());
    expect(repository.save(revoked())).toEqual(revoked());

    expect(() =>
      repository.save({
        ...revoked(),
        revision: 4,
        decisionAt: "2026-08-24T12:30:00.000Z",
      }),
    ).toThrow(/terminal/u);

    expect(() =>
      repository.save({
        ...revoked(),
        decisionAt: "2026-08-24T12:21:00.000Z",
        gateEvidence: {
          ...revoked().gateEvidence,
          repositoryGovernanceSatisfied: false,
        },
      }),
    ).toThrow(/already exists with different content/u);
    database.close();
  });

  it("rejects authorizations whose frozen identities do not match PREPARED evidence", () => {
    const { database, repository } = seed();
    expect(() =>
      repository.save({
        ...pending(),
        renderedPromptSha256: "f".repeat(64),
      }),
    ).toThrow(/does not match the canonical PREPARED execution evidence/u);
    database.close();
  });
});
