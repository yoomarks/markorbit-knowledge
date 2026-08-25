import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  CASE_CANDIDATE_OBJECT_TYPE,
  CASE_CANDIDATE_PROTOCOL_VERSION,
  CASE_CANDIDATE_SOURCE_SYSTEM,
  CASE_EVIDENCE_COLLECTION_OBJECT_TYPE,
  CASE_EVIDENCE_COLLECTION_PROTOCOL_VERSION,
  CASE_EVIDENCE_SOURCE_SYSTEM,
  type CaseCandidateV1,
  type CaseEvidenceCollectionV1,
  type ExactCaseSourcePayloadV1,
} from "@markorbit/contracts";
import { SqliteCaseCandidateIntakeRepository } from "./case-candidate-intake";
import { SqliteCaseEvidenceCollectionRepository } from "./case-evidence-collection";
import { RegistryConflictError, RegistryValidationError } from "./index";

function exactPayload(sourceRef: string, value: unknown): ExactCaseSourcePayloadV1 {
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  return {
    sourceRef,
    mediaType: "application/json",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.byteLength,
    dataBase64: bytes.toString("base64"),
  };
}

function candidate(overrides: Partial<CaseCandidateV1> = {}): CaseCandidateV1 {
  return {
    protocolVersion: CASE_CANDIDATE_PROTOCOL_VERSION,
    objectType: CASE_CANDIDATE_OBJECT_TYPE,
    candidateId: "case-candidate_01",
    sourceSystem: CASE_CANDIDATE_SOURCE_SYSTEM,
    sourceMatterId: "formal-matter_12345678",
    sourceMatterVersion: 1,
    sourceSnapshotSha256: "a".repeat(64),
    sourceRetrievalRef: "markreg:authorized-ref:01",
    promotedBy: "operator:test",
    promotedAt: "2026-08-25T03:20:00.000Z",
    accessScope: {
      sourceWorkspaceId: "workspace:test",
      classification: "CONFIDENTIAL",
    },
    idempotencyKey: "case-intake-001",
    ...overrides,
  };
}

function collection(overrides: Partial<CaseEvidenceCollectionV1> = {}): CaseEvidenceCollectionV1 {
  return {
    protocolVersion: CASE_EVIDENCE_COLLECTION_PROTOCOL_VERSION,
    objectType: CASE_EVIDENCE_COLLECTION_OBJECT_TYPE,
    collectionId: "case-evidence_01",
    candidateId: "case-candidate_01",
    sourceSystem: CASE_EVIDENCE_SOURCE_SYSTEM,
    sourceMatter: {
      sourceMatterId: "formal-matter_12345678",
      sourceMatterVersion: 1,
      sourceSnapshotSha256: "a".repeat(64),
      sourceRetrievalRef: "markreg:authorized-ref:01",
      sourceWorkspaceId: "workspace:test",
    },
    formalMatter: exactPayload("markreg:/v1/formal-matters/formal-matter_12345678", {
      formalMatter: {
        formalMatterId: "formal-matter_12345678",
        version: 1,
        snapshotSha256: "a".repeat(64),
      },
    }),
    lifecycleProvenance: exactPayload(
      "markreg:/v1/operations/formal-matters/formal-matter_12345678/lifecycle-provenance",
      { currentView: null, events: [], recommendedAction: null },
    ),
    documentPackages: [
      {
        documentPackageId: "document-package_01",
        sourceFormalMatterVersion: 1,
        sourceFormalMatterHash: "a".repeat(64),
        payload: exactPayload("markreg:/v1/document-packages/document-package_01", {
          documentPackageId: "document-package_01",
          formalMatterId: "formal-matter_12345678",
          sourceFormalMatterVersion: 1,
          sourceFormalMatterHash: "a".repeat(64),
        }),
      },
    ],
    omissions: [],
    collectedAt: "2026-08-25T04:00:00.000Z",
    provenance: {
      sourceFamily: "CASE",
      originalSystem: "MARKREG",
      originalSystemAuthoritative: true,
      knowledgeSnapshotIsSystemOfRecord: false,
    },
    ...overrides,
  };
}

function repository(): {
  database: DatabaseSync;
  intake: SqliteCaseCandidateIntakeRepository;
  evidence: SqliteCaseEvidenceCollectionRepository;
} {
  const database = new DatabaseSync(":memory:");
  const intake = new SqliteCaseCandidateIntakeRepository(database);
  intake.acceptCandidate(candidate(), "2026-08-25T03:21:00.000Z");
  return {
    database,
    intake,
    evidence: new SqliteCaseEvidenceCollectionRepository(database),
  };
}

describe("SqliteCaseEvidenceCollectionRepository", () => {
  it("persists exact Case evidence across repository restart", () => {
    const fixture = repository();
    const saved = fixture.evidence.saveCollection(collection());
    expect(saved.replayed).toBe(false);
    expect(saved.collection.formalMatter.sha256).toHaveLength(64);

    const restarted = new SqliteCaseEvidenceCollectionRepository(fixture.database);
    expect(restarted.getCollection("case-evidence_01")).toEqual(saved.collection);
    expect(restarted.listCollectionsForCandidate("case-candidate_01")).toEqual([
      saved.collection,
    ]);
  });

  it("deduplicates the same evidence identity even when replay metadata changes", () => {
    const fixture = repository();
    const first = fixture.evidence.saveCollection(collection());
    const replay = fixture.evidence.saveCollection(
      collection({
        collectionId: "case-evidence_02",
        collectedAt: "2026-08-25T04:05:00.000Z",
      }),
    );

    expect(replay.replayed).toBe(true);
    expect(replay.collection).toEqual(first.collection);
    expect(fixture.evidence.getCollection("case-evidence_02")).toBeNull();
  });

  it("fails closed when a collection ID is reused for different evidence", () => {
    const fixture = repository();
    fixture.evidence.saveCollection(collection());
    const changedFormal = exactPayload(
      "markreg:/v1/formal-matters/formal-matter_12345678",
      { formalMatter: { changed: true } },
    );

    expect(() =>
      fixture.evidence.saveCollection(collection({ formalMatter: changedFormal })),
    ).toThrowError(RegistryConflictError);
    try {
      fixture.evidence.saveCollection(collection({ formalMatter: changedFormal }));
    } catch (error) {
      expect((error as RegistryConflictError).code).toBe(
        "CASE_EVIDENCE_COLLECTION_IMMUTABLE_CONFLICT",
      );
    }
  });

  it("rejects evidence that does not match its exact payload byte identity", () => {
    const fixture = repository();
    const bad = collection({
      formalMatter: {
        ...collection().formalMatter,
        sha256: "f".repeat(64),
      },
    });
    expect(() => fixture.evidence.saveCollection(bad)).toThrowError(RegistryValidationError);
  });

  it("rejects source identity and document lineage drift from the durable candidate", () => {
    const fixture = repository();
    expect(() =>
      fixture.evidence.saveCollection(
        collection({
          sourceMatter: {
            ...collection().sourceMatter,
            sourceMatterVersion: 2,
          },
        }),
      ),
    ).toThrowError(RegistryConflictError);

    expect(() =>
      fixture.evidence.saveCollection(
        collection({
          documentPackages: [
            {
              ...collection().documentPackages[0]!,
              sourceFormalMatterHash: "b".repeat(64),
            },
          ],
        }),
      ),
    ).toThrowError(RegistryConflictError);
  });

  it("rejects contradictory captured and omitted optional surfaces", () => {
    const fixture = repository();
    expect(() =>
      fixture.evidence.saveCollection(
        collection({
          omissions: [{ surface: "LIFECYCLE_PROVENANCE", reason: "NOT_AUTHORIZED" }],
        }),
      ),
    ).toThrowError(RegistryValidationError);
    expect(() =>
      fixture.evidence.saveCollection(
        collection({
          omissions: [{ surface: "DOCUMENT_PACKAGES", reason: "NOT_AVAILABLE" }],
        }),
      ),
    ).toThrowError(RegistryValidationError);
  });
});
