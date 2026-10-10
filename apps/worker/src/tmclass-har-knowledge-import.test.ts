import { describe, expect, it } from "vitest";
import type { TmclassHarPageCapture } from "./tmclass-har-extractor.js";
import { tmclassEvidenceFromHarCapture } from "./tmclass-har-knowledge-import.js";

const capture: TmclassHarPageCapture = {
  sourceUri: "https://euipo.europa.eu/ec2/concept/11452493/en",
  observedAt: "2026-10-10T03:04:14.000Z",
  responseSha256: "a".repeat(64),
  page: {
    pageKind: "CONCEPT_LANGUAGE",
    conceptId: "11452493",
    title: "Abrasives (Auxiliary fluids for use with -)",
    status: "Published",
    niceClass: 1,
    sourceName: "ILPO Supplement",
    sourceDateText: null,
    referenceId: "0024010",
    scopeStatus: "Accepted",
    taxonomy: [{ label: "Class 1", sourceNodeId: null }],
    languageCode: "en",
    terms: [
      { termId: "262", text: "Abrasives", role: "MASTER", ordinal: 1 },
      { termId: "263", text: "Fluids for use with abrasives", role: "VARIANT", ordinal: 2 },
    ],
  },
};

describe("TMclass HAR Knowledge import", () => {
  it("binds normalized pages to the exact finalized RawArtifact", () => {
    expect(
      tmclassEvidenceFromHarCapture(capture, {
        workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        sourceDefinitionId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        collectionRunId: "run_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        rawArtifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        artifactVersion: 1,
        canonicalUri: capture.sourceUri,
        sha256: capture.responseSha256,
      }),
    ).toMatchObject({
      sourceOwner: "MARKORBIT_KNOWLEDGE",
      evidence: {
        rawArtifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        sourceUri: capture.sourceUri,
      },
      page: { terms: [{ role: "MASTER" }, { role: "VARIANT" }] },
    });
  });

  it("rejects a normalized page bound to different raw bytes", () => {
    expect(() =>
      tmclassEvidenceFromHarCapture(capture, {
        workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        sourceDefinitionId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        collectionRunId: "run_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        rawArtifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        artifactVersion: 1,
        canonicalUri: capture.sourceUri,
        sha256: "b".repeat(64),
      }),
    ).toThrow("TMCLASS_HAR_RAW_ARTIFACT_LINEAGE_MISMATCH");
  });
});
