import { describe, expect, it } from "vitest";
import {
  caseCandidateSourceIdentityKeyV1,
  isCaseCandidateV1,
  type CaseCandidateV1,
} from "./case-candidate-v1";

const snapshotSha = "a".repeat(64);

function candidate(overrides: Partial<CaseCandidateV1> = {}): CaseCandidateV1 {
  return {
    protocolVersion: "1.0",
    objectType: "CASE_CANDIDATE",
    candidateId: "case-candidate_01",
    sourceSystem: "MARKREG",
    sourceMatterId: "formal-matter_550e8400-e29b-41d4-a716-446655440000",
    sourceMatterVersion: 1,
    sourceSnapshotSha256: snapshotSha,
    sourceRetrievalRef: "/v1/formal-matters/formal-matter_550e8400-e29b-41d4-a716-446655440000",
    promotedBy: "user:operator:01",
    promotedAt: "2026-08-25T02:45:00.000Z",
    accessScope: {
      sourceWorkspaceId: "550e8400-e29b-41d4-a716-446655440001",
      classification: "CONFIDENTIAL",
    },
    idempotencyKey: "promote:formal-matter:550e8400",
    ...overrides,
  };
}

describe("CaseCandidateV1", () => {
  it("accepts an exact MarkReg Formal Matter promotion pointer", () => {
    expect(isCaseCandidateV1(candidate())).toBe(true);
  });

  it("uses the exact source snapshot identity as the stable natural key", () => {
    const first = candidate({
      candidateId: "case-candidate_first",
      promotedBy: "user:operator:first",
      operatorCaseValueNote: "Useful completed prosecution history.",
      idempotencyKey: "promotion:first:123456",
    });
    const replay = candidate({
      candidateId: "case-candidate_replay",
      promotedBy: "user:operator:second",
      promotedAt: "2026-08-25T03:00:00.000Z",
      operatorCaseValueNote: "Second operator observed the same source snapshot.",
      idempotencyKey: "promotion:second:123456",
    });

    expect(caseCandidateSourceIdentityKeyV1(first)).toBe(caseCandidateSourceIdentityKeyV1(replay));
  });

  it("changes natural identity when the MarkReg source snapshot changes", () => {
    const first = candidate();
    const changed = candidate({ sourceMatterVersion: 2, sourceSnapshotSha256: "b".repeat(64) });
    expect(caseCandidateSourceIdentityKeyV1(first)).not.toBe(
      caseCandidateSourceIdentityKeyV1(changed),
    );
  });

  it("rejects guessed or incomplete producer identity", () => {
    expect(isCaseCandidateV1({ ...candidate(), sourceMatterId: "matter_123" })).toBe(false);
    expect(isCaseCandidateV1({ ...candidate(), sourceMatterVersion: 0 })).toBe(false);
    expect(isCaseCandidateV1({ ...candidate(), sourceSnapshotSha256: "not-a-sha" })).toBe(false);
    expect(isCaseCandidateV1({ ...candidate(), sourceRetrievalRef: "" })).toBe(false);
    expect(isCaseCandidateV1({ ...candidate(), idempotencyKey: "short" })).toBe(false);
  });

  it("rejects Brain-style lessons, recommendations and truth claims", () => {
    expect(isCaseCandidateV1({ ...candidate(), recommendation: "Do this next" })).toBe(false);
    expect(isCaseCandidateV1({ ...candidate(), truthScore: 0.99 })).toBe(false);
    expect(isCaseCandidateV1({ ...candidate(), lessons: ["Always file early"] })).toBe(false);
  });
});
