import { describe, expect, it } from "vitest";
import {
  evaluateOfficialEvidenceAdmissibility,
  type OfficialEvidenceItem,
} from "./official-evidence-admissibility";
import { USPTO_FEE_EVIDENCE_POLICY } from "./uspto-fee-evidence-policy";

function evidence(
  role: OfficialEvidenceItem["role"],
  overrides: Partial<OfficialEvidenceItem> = {},
): OfficialEvidenceItem {
  return {
    role,
    sourceUri:
      role === "NUMERIC_AUTHORITY"
        ? "https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule"
        : "https://www.uspto.gov/trademarks/trademark-fee-information",
    documentId: `document-${role.toLowerCase()}`,
    documentContentSha256:
      role === "NUMERIC_AUTHORITY" ? "a".repeat(64) : "b".repeat(64),
    chunkId: `chunk-${role.toLowerCase()}`,
    chunkContentSha256: role === "NUMERIC_AUTHORITY" ? "c".repeat(64) : "d".repeat(64),
    indexedAt: "2026-08-28T00:00:00.000Z",
    effectiveAt: "2025-01-18T00:00:00.000Z",
    expiresAt: null,
    supersedesDocumentId: null,
    temporalStatus: "CURRENT",
    conflictStatus: "NONE",
    supersessionStatus: "CURRENT",
    ...overrides,
  };
}

describe("official evidence admissibility", () => {
  it("admits the complete USPTO two-source authority set without interpreting fee values", () => {
    const input = [evidence("NUMERIC_AUTHORITY"), evidence("APPLICABILITY_CONTEXT")];

    expect(evaluateOfficialEvidenceAdmissibility(USPTO_FEE_EVIDENCE_POLICY, input)).toEqual({
      status: "ADMISSIBLE",
      evidence: input,
      reasons: [],
    });
  });

  it("fails closed when either required authority is missing", () => {
    const result = evaluateOfficialEvidenceAdmissibility(USPTO_FEE_EVIDENCE_POLICY, [
      evidence("NUMERIC_AUTHORITY"),
    ]);

    expect(result.status).toBe("FAIL_CLOSED");
    expect(result.reasons).toContain("MISSING_REQUIRED_AUTHORITY");
  });

  it("fails closed on incomplete or invalid lineage", () => {
    const result = evaluateOfficialEvidenceAdmissibility(USPTO_FEE_EVIDENCE_POLICY, [
      evidence("NUMERIC_AUTHORITY", { chunkId: "", chunkContentSha256: "not-a-sha" }),
      evidence("APPLICABILITY_CONTEXT"),
    ]);

    expect(result.status).toBe("FAIL_CLOSED");
    expect(result.reasons).toContain("INCOMPLETE_LINEAGE");
    expect(result.reasons).toContain("INVALID_LINEAGE_HASH");
  });

  it("fails closed when canonical source identity drifts", () => {
    const result = evaluateOfficialEvidenceAdmissibility(USPTO_FEE_EVIDENCE_POLICY, [
      evidence("NUMERIC_AUTHORITY", { sourceUri: "https://www.uspto.gov/trademarks/fees" }),
      evidence("APPLICABILITY_CONTEXT"),
    ]);

    expect(result.status).toBe("FAIL_CLOSED");
    expect(result.reasons).toContain("SOURCE_IDENTITY_MISMATCH");
  });

  it.each([
    ["missing effective date", { effectiveAt: null }, "MISSING_EFFECTIVE_AT" as const],
    ["invalid effective date", { effectiveAt: "not-a-date" }, "INVALID_EFFECTIVE_AT" as const],
    ["invalid expiry date", { expiresAt: "not-a-date" }, "INVALID_EXPIRES_AT" as const],
    [
      "unresolved temporal metadata",
      { temporalStatus: "UNRESOLVED" as const },
      "TEMPORAL_STATUS_UNRESOLVED" as const,
    ],
    ["stale evidence", { temporalStatus: "STALE" as const }, "STALE_EVIDENCE" as const],
    [
      "unresolved conflict",
      { conflictStatus: "UNRESOLVED" as const },
      "UNRESOLVED_CONFLICT" as const,
    ],
    [
      "unresolved supersession",
      { supersessionStatus: "UNRESOLVED" as const },
      "SUPERSESSION_STATUS_UNRESOLVED" as const,
    ],
    [
      "superseded evidence",
      { supersessionStatus: "SUPERSEDED" as const },
      "SUPERSEDED_EVIDENCE" as const,
    ],
  ])("fails closed for %s", (_label, overrides, reason) => {
    const result = evaluateOfficialEvidenceAdmissibility(USPTO_FEE_EVIDENCE_POLICY, [
      evidence("NUMERIC_AUTHORITY", overrides),
      evidence("APPLICABILITY_CONTEXT"),
    ]);

    expect(result.status).toBe("FAIL_CLOSED");
    expect(result.reasons).toContain(reason);
  });

  it("fails closed on duplicate evidence for a single authority role", () => {
    const result = evaluateOfficialEvidenceAdmissibility(USPTO_FEE_EVIDENCE_POLICY, [
      evidence("NUMERIC_AUTHORITY"),
      evidence("NUMERIC_AUTHORITY", {
        documentId: "duplicate-document",
        documentContentSha256: "e".repeat(64),
        chunkId: "duplicate-chunk",
        chunkContentSha256: "f".repeat(64),
      }),
      evidence("APPLICABILITY_CONTEXT"),
    ]);

    expect(result.status).toBe("FAIL_CLOSED");
    expect(result.reasons).toContain("DUPLICATE_AUTHORITY_ROLE");
  });
});
