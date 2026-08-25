import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  CASE_LIVE_ACCEPTANCE_OBJECT_TYPE,
  CASE_LIVE_ACCEPTANCE_PROTOCOL_VERSION,
  type CaseLiveAcceptanceReceiptV1,
} from "@markorbit/contracts";
import { RegistryConflictError } from "./index";
import { SqliteCaseLiveAcceptanceRepository } from "./case-live-acceptance";

const sha = "a".repeat(64);

function started(
  overrides: Partial<CaseLiveAcceptanceReceiptV1> = {},
): CaseLiveAcceptanceReceiptV1 {
  return {
    protocolVersion: CASE_LIVE_ACCEPTANCE_PROTOCOL_VERSION,
    objectType: CASE_LIVE_ACCEPTANCE_OBJECT_TYPE,
    runId: "case-live-run_01",
    runMode: "TEST",
    transportMode: "INJECTED_TEST",
    state: "STARTED",
    candidate: {
      candidateId: "case-candidate_01",
      sourceSystem: "MARKREG",
      sourceMatterId: "formal-matter_01",
      sourceMatterVersion: 1,
      sourceSnapshotSha256: sha,
      sourceWorkspaceId: "workspace:test",
      sourceAccessClassification: "CONFIDENTIAL",
    },
    privacyPlan: {
      reviewId: "case-privacy-review_01",
      reviewerRef: "user:privacy-reviewer:01",
    },
    eligibleForKCase008Review: false,
    publicationAuthorized: false,
    startedAt: "2026-08-25T09:30:00.000Z",
    updatedAt: "2026-08-25T09:30:00.000Z",
    ...overrides,
  };
}

function privacyRequired(): CaseLiveAcceptanceReceiptV1 {
  return started({
    state: "PRIVACY_REVIEW_REQUIRED",
    evidence: { collectionId: "case-evidence_01", documentSha256: sha },
    assembledDossier: { dossierId: "case-dossier_01", version: 1, documentSha256: sha },
    privacyReview: { reviewId: "case-privacy-review_01", state: "REVIEW_REQUIRED" },
    updatedAt: "2026-08-25T09:35:00.000Z",
  });
}

function finalized(): CaseLiveAcceptanceReceiptV1 {
  return {
    ...privacyRequired(),
    state: "FINALIZED",
    privacyReview: { reviewId: "case-privacy-review_01", state: "FINALIZED" },
    finalized: {
      derivativeId: "case-redacted_01",
      derivativeSha256: sha,
      dossierId: "case-dossier_01",
      dossierVersion: 2,
      dossierSha256: sha,
    },
    updatedAt: "2026-08-25T09:40:00.000Z",
  };
}

describe("SqliteCaseLiveAcceptanceRepository", () => {
  it("persists append-only acceptance snapshots across repository restart", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteCaseLiveAcceptanceRepository(database);
    expect(repository.saveReceipt(started()).revision).toBe(1);
    expect(repository.saveReceipt(privacyRequired()).revision).toBe(2);
    expect(repository.saveReceipt(finalized()).revision).toBe(3);

    const restarted = new SqliteCaseLiveAcceptanceRepository(database);
    expect(restarted.getReceipt("case-live-run_01")?.receipt).toEqual(finalized());
    expect(restarted.listEvents("case-live-run_01").map((event) => event.receipt.state)).toEqual([
      "STARTED",
      "PRIVACY_REVIEW_REQUIRED",
      "FINALIZED",
    ]);
  });

  it("deduplicates exact receipt replay without adding an event", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteCaseLiveAcceptanceRepository(database);
    repository.saveReceipt(started());
    const first = repository.saveReceipt(privacyRequired());
    const replay = repository.saveReceipt(privacyRequired());
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.revision).toBe(first.revision);
    expect(repository.listEvents("case-live-run_01")).toHaveLength(2);
  });

  it("supports retryable WAITING_SOURCE progression without pretending evidence exists", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteCaseLiveAcceptanceRepository(database);
    repository.saveReceipt(started());
    repository.saveReceipt(
      started({
        state: "WAITING_SOURCE",
        failure: { stage: "COLLECTION", code: "MARKREG_TIMEOUT", retryable: true },
        updatedAt: "2026-08-25T09:31:00.000Z",
      }),
    );
    repository.saveReceipt(privacyRequired());
    expect(repository.getReceipt("case-live-run_01")?.receipt.state).toBe(
      "PRIVACY_REVIEW_REQUIRED",
    );
  });

  it("rejects source or privacy-plan lineage drift and terminal mutation", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteCaseLiveAcceptanceRepository(database);
    repository.saveReceipt(started());
    expect(() =>
      repository.saveReceipt(
        started({
          candidate: { ...started().candidate, sourceWorkspaceId: "workspace:other" },
          updatedAt: "2026-08-25T09:31:00.000Z",
        }),
      ),
    ).toThrowError(RegistryConflictError);
    expect(() =>
      repository.saveReceipt(
        started({
          privacyPlan: {
            reviewId: "case-privacy-review_other",
            reviewerRef: "user:privacy-reviewer:02",
          },
          updatedAt: "2026-08-25T09:31:00.000Z",
        }),
      ),
    ).toThrowError(RegistryConflictError);

    repository.saveReceipt(privacyRequired());
    repository.saveReceipt(finalized());
    expect(() =>
      repository.saveReceipt({
        ...finalized(),
        finalized: { ...finalized().finalized!, dossierSha256: "b".repeat(64) },
        updatedAt: "2026-08-25T09:41:00.000Z",
      }),
    ).toThrowError(RegistryConflictError);
  });
});
