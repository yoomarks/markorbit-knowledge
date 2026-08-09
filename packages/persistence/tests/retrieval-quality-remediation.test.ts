import { describe, expect, it } from "vitest";
import type { RetrievalQualityAuditRecord } from "../src/retrieval-quality-audit";
import {
  deriveRetrievalQualityRemediationActions,
  planRetrievalQualityRemediation,
} from "../src/retrieval-quality-remediation";

function audit(
  gaps: RetrievalQualityAuditRecord["gaps"],
  state: RetrievalQualityAuditRecord["state"],
): RetrievalQualityAuditRecord {
  return {
    protocolVersion: "1.0",
    objectType: "RETRIEVAL_QUALITY_AUDIT",
    workspaceId: "wsp_test",
    sourceId: "src_test",
    documentId: "doc_test",
    stagingDocumentId: "std_test",
    readyPackageId: "rdp_test",
    rawArtifactId: "art_test",
    artifactVersion: 2,
    title: "Official trademark evidence",
    jurisdictions: ["US"],
    isCurrent: true,
    state,
    gaps,
    metrics: {
      declaredChunkCount: 3,
      actualChunkCount: 3,
      distinctChunkTexts: 3,
      emptyChunkCount: 0,
      ftsRowCount: 3,
      firstOrdinal: 1,
      lastOrdinal: 3,
      currentVersionCount: 1,
      latestArtifactVersion: 2,
    },
    auditedAt: "2026-08-09T15:45:00.000Z",
  };
}

describe("retrieval quality remediation planning", () => {
  it("does not invent work for a READY audit", () => {
    const plan = planRetrievalQualityRemediation(audit([], "READY"));
    expect(plan.state).toBe("NO_ACTION");
    expect(plan.actions).toEqual([]);
  });

  it("collapses provenance failures into one manual blocking action", () => {
    const actions = deriveRetrievalQualityRemediationActions([
      "RAW_ARTIFACT_MISSING",
      "STAGING_DOCUMENT_MISSING",
      "READY_PACKAGE_MISSING",
      "PROVENANCE_LINK_MISMATCH",
    ]);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      code: "RESTORE_PROVENANCE_EVIDENCE",
      severity: "BLOCKING",
      automaticExecution: false,
    });
    expect(actions[0].gapCodes).toEqual([
      "RAW_ARTIFACT_MISSING",
      "STAGING_DOCUMENT_MISSING",
      "READY_PACKAGE_MISSING",
      "PROVENANCE_LINK_MISMATCH",
    ]);
  });

  it("orders version, index and duplicate review actions deterministically", () => {
    const plan = planRetrievalQualityRemediation(
      audit(
        [
          "CURRENT_VERSION_NOT_LATEST",
          "CHUNK_COUNT_MISMATCH",
          "FTS_ROW_COUNT_MISMATCH",
          "DUPLICATE_CHUNK_CONTENT",
        ],
        "BLOCKED",
      ),
    );

    expect(plan.state).toBe("REMEDIATION_REQUIRED");
    expect(plan.actions.map((action) => action.code)).toEqual([
      "RECONCILE_CURRENT_VERSION",
      "REBUILD_RETRIEVAL_INDEX",
      "REVIEW_DUPLICATE_CHUNKING",
    ]);
    expect(plan.actions.every((action) => action.automaticExecution === false)).toBe(true);
  });

  it("keeps duplicate-only degradation as review rather than destructive repair", () => {
    const plan = planRetrievalQualityRemediation(
      audit(["DUPLICATE_CHUNK_CONTENT"], "DEGRADED"),
      "2026-08-09T15:46:00.000Z",
    );

    expect(plan.state).toBe("REVIEW_REQUIRED");
    expect(plan.plannedAt).toBe("2026-08-09T15:46:00.000Z");
    expect(plan.actions).toEqual([
      expect.objectContaining({
        code: "REVIEW_DUPLICATE_CHUNKING",
        severity: "REVIEW",
        automaticExecution: false,
      }),
    ]);
  });
});
