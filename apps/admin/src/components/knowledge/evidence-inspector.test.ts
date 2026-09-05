import { describe, expect, it } from "vitest";
import type { DocumentChangeEvidence } from "@markorbit/contracts";
import { buildEvidenceHistoryRows, EVIDENCE_INSPECTOR_SECTIONS } from "./evidence-inspector-model";

function evidence(
  sequence: number,
  values: {
    evidenceId: string;
    documentId: string;
    stagingDocumentId: string;
    rawArtifactId: string;
    artifactVersion: number;
  },
): DocumentChangeEvidence {
  return {
    id: values.evidenceId,
    sequence,
    changeKind: sequence === 2 ? "UPDATED" : "CREATED",
    observedAt: `2026-09-0${sequence}T00:00:00.000Z`,
    documentId: values.documentId,
    after: {
      stagingDocumentId: values.stagingDocumentId,
      rawArtifactId: values.rawArtifactId,
      artifactVersion: values.artifactVersion,
      sourceUri: `https://example.com/evidence/${sequence}`,
    },
  } as unknown as DocumentChangeEvidence;
}

describe("Evidence Inspector V2", () => {
  it("keeps the required evidence workspace navigation stable", () => {
    expect(EVIDENCE_INSPECTOR_SECTIONS).toEqual([
      { id: "inspector-content", label: "Content" },
      { id: "evidence-change-review", label: "Changes" },
      { id: "inspector-provenance", label: "Provenance" },
      { id: "inspector-relations", label: "Relations" },
      { id: "inspector-history", label: "History" },
    ]);
  });

  it("orders durable history newest first without changing exact evidence identities", () => {
    const documentId = "doc_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const rows = buildEvidenceHistoryRows([
      evidence(1, {
        evidenceId: "chg_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        documentId,
        stagingDocumentId: "stg_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        rawArtifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        artifactVersion: 1,
      }),
      evidence(2, {
        evidenceId: "chg_01ARZ3NDEKTSV4RRFFQ69G5FAW",
        documentId,
        stagingDocumentId: "stg_01ARZ3NDEKTSV4RRFFQ69G5FAW",
        rawArtifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAW",
        artifactVersion: 2,
      }),
    ]);

    expect(rows.map((row) => row.sequence)).toEqual([2, 1]);
    expect(rows[0]).toMatchObject({
      evidenceId: "chg_01ARZ3NDEKTSV4RRFFQ69G5FAW",
      documentId,
      stagingDocumentId: "stg_01ARZ3NDEKTSV4RRFFQ69G5FAW",
      rawArtifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAW",
      artifactVersion: 2,
    });
  });
});
