import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type {
  CanonicalMarkdownMetadataV1,
  CaseCandidateV1,
  ExpertQuestionTaskV1,
  ExpertSourceRecordV1,
  KnowledgeFederatedRetrievalQueryV1,
} from "@markorbit/contracts";
import { SqliteCaseCandidateIntakeRepository } from "@markorbit/persistence/case-candidate-intake";
import { SqliteExpertSourceRepository } from "@markorbit/persistence/expert-sources";
import { SqliteExpertSourceRetrievalRepository } from "@markorbit/persistence/expert-source-retrieval";
import { SqliteExpertTaskWorkspaceBindingRepository } from "@markorbit/persistence/expert-task-workspace-bindings";
import { SqliteRetrievalIndexRepository } from "@markorbit/persistence/retrieval-index";
import { KnowledgeFederatedCaseReader } from "./knowledge-federated-case-reader";
import { retrieveKnowledgeFederated } from "./knowledge-federated-retrieval";

const encoder = new TextEncoder();
const WORKSPACE_A = "wsp_01H00000000000000000000000";
const WORKSPACE_B = "wsp_01H00000000000000000000001";

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalMarkdown(body: string): Uint8Array {
  return encoder.encode(`---\nmarkorbit:\n  schemaVersion: "1.0"\n---\n\n${body}\n`);
}

function metadata(input: {
  workspaceId: string;
  ordinal: number;
  documentId: string;
  sourceUri: string;
  canonicalUri: string;
  artifactKind: "HTML" | "MARKDOWN";
}): CanonicalMarkdownMetadataV1 {
  const id = String(input.ordinal).padStart(26, "0");
  return {
    schemaVersion: "1.0",
    objectType: "CANONICAL_MARKDOWN_METADATA",
    documentId: input.documentId,
    workspaceId: input.workspaceId,
    sourceId: `src_${id}`,
    sourceName: input.documentId,
    sourceCategory: "OFFICIAL_GUIDANCE",
    authorityLevel: "PRIMARY_OFFICIAL",
    jurisdictions: ["US"],
    languages: ["en"],
    rawArtifactId: `art_${id}`,
    logicalDocumentId: input.documentId,
    artifactVersion: 1,
    artifactKind: input.artifactKind,
    originalName: `${input.documentId}.md`,
    canonicalUri: input.canonicalUri,
    sourceUri: input.sourceUri,
    capturedAt: "2026-08-31T08:00:00.000Z",
    publishedAt: null,
    conversionRunId: `cvr_${id}`,
    converterId: "kfed-integration-fixture",
    converterVersion: "1.0.0",
    inputSha256: input.ordinal.toString(16).repeat(64).slice(0, 64),
  };
}

function indexCanonical(
  repository: SqliteRetrievalIndexRepository,
  input: {
    workspaceId: string;
    ordinal: number;
    documentId: string;
    sourceUri: string;
    canonicalUri: string;
    artifactKind: "HTML" | "MARKDOWN";
  },
): void {
  const markdown = canonicalMarkdown(
    "# Trademark assignment\n\nAssignment evidence for a governed trademark knowledge source.",
  );
  repository.indexVerified({
    metadata: metadata(input),
    stagingDocumentId: `std_${String(input.ordinal).padStart(26, "0")}`,
    readyPackageId: `rdp_${String(input.ordinal).padStart(26, "0")}`,
    title: `${input.documentId} assignment evidence`,
    targetPath: `K-FED/${input.documentId}.md`,
    contentSha256: sha256(markdown),
    canonicalMarkdown: markdown,
  });
}

function persistExpert(
  database: DatabaseSync,
  input: { suffix: string; workspaceId: string },
): string {
  const writer = new SqliteExpertSourceRepository(database);
  const taskId = `eqt_kfed_${input.suffix}`;
  const base: ExpertQuestionTaskV1 = {
    protocolVersion: "1.0",
    objectType: "EXPERT_QUESTION_TASK",
    taskId,
    topic: "ASSIGNMENT",
    jurisdiction: "US",
    question: "What evidence is required for a trademark assignment?",
    expertRef: `expert:us:${input.suffix}`,
    requestedBy: "user:kfed-integration",
    state: "DRAFT",
    createdAt: "2026-08-31T08:00:00.000Z",
    relatedSourceRefs: [],
    relatedCaseRefs: [],
    accessClassification: "CONFIDENTIAL",
  };
  writer.saveTask(base);
  writer.saveTask({ ...base, state: "READY_TO_SEND" });
  writer.saveTask({
    ...base,
    state: "SENT",
    communicationSendRequestRef: `comm:send:kfed:${input.suffix}`,
    communicationThreadRef: `comm:thread:kfed:${input.suffix}`,
    sentAt: "2026-08-31T08:05:00.000Z",
  });
  new SqliteExpertTaskWorkspaceBindingRepository(database).bind(taskId, input.workspaceId);

  const record: ExpertSourceRecordV1 = {
    protocolVersion: "1.0",
    objectType: "EXPERT_SOURCE_RECORD",
    sourceRecordId: `esr_kfed_${input.suffix}`,
    taskId,
    expertRef: `expert:us:${input.suffix}`,
    jurisdiction: "US",
    topic: "ASSIGNMENT",
    communication: {
      communicationThreadRef: `comm:thread:kfed:${input.suffix}`,
      messageRefs: [`comm:message:kfed:${input.suffix}`],
    },
    rawAnswerArtifactRefs: [`raw:expert:kfed:${input.suffix}`],
    normalizedDerivativeRef: `normalized:expert:kfed:${input.suffix}`,
    attachmentRefs: [],
    receivedAt: "2026-08-31T08:10:00.000Z",
    capturedAt: "2026-08-31T08:11:00.000Z",
    relatedSourceRefs: [],
    relatedCaseRefs: [],
    provenance: {
      sourceFamily: "EXPERT",
      originalEvidenceAuthoritative: true,
      normalizedDerivativeIsOriginalEvidence: false,
    },
    accessClassification: "CONFIDENTIAL",
  };
  writer.saveSourceRecord(record);
  return taskId;
}

function persistCase(
  database: DatabaseSync,
  input: { suffix: string; workspaceId: string; snapshotCharacter: string },
): void {
  const candidate: CaseCandidateV1 = {
    protocolVersion: "1.0",
    objectType: "CASE_CANDIDATE",
    candidateId: `case-candidate_kfed_${input.suffix}`,
    sourceSystem: "MARKREG",
    sourceMatterId: `formal-matter_kfed_${input.suffix}`,
    sourceMatterVersion: 1,
    sourceSnapshotSha256: input.snapshotCharacter.repeat(64),
    sourceRetrievalRef: `markreg:/v1/formal-matters/formal-matter_kfed_${input.suffix}`,
    promotedBy: "operator:kfed-integration",
    promotedAt: "2026-08-31T08:15:00.000Z",
    accessScope: {
      sourceWorkspaceId: input.workspaceId,
      classification: "CONFIDENTIAL",
    },
    idempotencyKey: `kfed-case-intake-${input.suffix}`,
  };
  new SqliteCaseCandidateIntakeRepository(database).acceptCandidate(
    candidate,
    "2026-08-31T08:16:00.000Z",
  );
}

function query(workspaceId: string): KnowledgeFederatedRetrievalQueryV1 {
  return {
    protocolVersion: "1.0",
    objectType: "KNOWLEDGE_FEDERATED_RETRIEVAL_QUERY",
    workspaceId,
    queryText: "assignment evidence",
    jurisdiction: "US",
    topic: "ASSIGNMENT",
    limitPerFamily: 10,
  };
}

describe("K-FED repository integration", () => {
  it("federates real Web, AI, Expert and Case repositories without cross-workspace leakage", () => {
    const database = new DatabaseSync(":memory:");
    const retrieval = new SqliteRetrievalIndexRepository(
      database,
      () => new Date("2026-08-31T08:20:00.000Z"),
    );

    indexCanonical(retrieval, {
      workspaceId: WORKSPACE_A,
      ordinal: 1,
      documentId: "doc-kfed-web-a",
      sourceUri: "https://www.uspto.gov/kfed/assignment-a",
      canonicalUri: "https://www.uspto.gov/kfed/assignment-a",
      artifactKind: "HTML",
    });
    indexCanonical(retrieval, {
      workspaceId: WORKSPACE_A,
      ordinal: 2,
      documentId: "doc-kfed-ai-a",
      sourceUri: "ai+markorbit://openai/submissions/kfed-a/markdown",
      canonicalUri: "ai+markorbit://openai/assignments/kfed-a/models/test",
      artifactKind: "MARKDOWN",
    });
    indexCanonical(retrieval, {
      workspaceId: WORKSPACE_B,
      ordinal: 3,
      documentId: "doc-kfed-web-b",
      sourceUri: "https://www.uspto.gov/kfed/assignment-b",
      canonicalUri: "https://www.uspto.gov/kfed/assignment-b",
      artifactKind: "HTML",
    });
    indexCanonical(retrieval, {
      workspaceId: WORKSPACE_B,
      ordinal: 4,
      documentId: "doc-kfed-ai-b",
      sourceUri: "ai+markorbit://openai/submissions/kfed-b/markdown",
      canonicalUri: "ai+markorbit://openai/assignments/kfed-b/models/test",
      artifactKind: "MARKDOWN",
    });

    persistExpert(database, { suffix: "a", workspaceId: WORKSPACE_A });
    persistExpert(database, { suffix: "b", workspaceId: WORKSPACE_B });
    persistCase(database, { suffix: "a", workspaceId: WORKSPACE_A, snapshotCharacter: "a" });
    persistCase(database, { suffix: "b", workspaceId: WORKSPACE_B, snapshotCharacter: "b" });

    const expertRetrieval = new SqliteExpertSourceRetrievalRepository(database);
    const bindings = new SqliteExpertTaskWorkspaceBindingRepository(database);
    const cases = new KnowledgeFederatedCaseReader(database);

    const resultA = retrieveKnowledgeFederated(query(WORKSPACE_A), {
      canonical: retrieval,
      expert: expertRetrieval,
      cases,
      expertTaskIds: bindings.listTaskIds(WORKSPACE_A),
    });

    expect(resultA.families.WEB.map((item) => item.sourceIdentity)).toEqual(["doc-kfed-web-a"]);
    expect(resultA.families.AI.map((item) => item.sourceIdentity)).toEqual(["doc-kfed-ai-a"]);
    expect(resultA.families.EXPERT.map((item) => item.sourceIdentity)).toEqual(["esr_kfed_a"]);
    expect(resultA.families.CASE.map((item) => item.sourceIdentity)).toEqual([
      "case-candidate_kfed_a",
    ]);
    expect(resultA.families.WEB[0]?.rawEvidenceRefs).toEqual(["art_00000000000000000000000001"]);
    expect(resultA.families.AI[0]?.rawEvidenceRefs).toEqual(["art_00000000000000000000000002"]);
    expect(resultA.families.EXPERT[0]?.rawEvidenceRefs).toEqual(["raw:expert:kfed:a"]);
    expect(resultA.families.CASE[0]?.rawEvidenceRefs).toEqual([
      "markreg:/v1/formal-matters/formal-matter_kfed_a",
    ]);

    const resultB = retrieveKnowledgeFederated(query(WORKSPACE_B), {
      canonical: retrieval,
      expert: expertRetrieval,
      cases,
      expertTaskIds: bindings.listTaskIds(WORKSPACE_B),
    });

    expect(resultB.families.WEB.map((item) => item.sourceIdentity)).toEqual(["doc-kfed-web-b"]);
    expect(resultB.families.AI.map((item) => item.sourceIdentity)).toEqual(["doc-kfed-ai-b"]);
    expect(resultB.families.EXPERT.map((item) => item.sourceIdentity)).toEqual(["esr_kfed_b"]);
    expect(resultB.families.CASE.map((item) => item.sourceIdentity)).toEqual([
      "case-candidate_kfed_b",
    ]);

    database.close();
  });
});
