import { describe, expect, it } from "vitest";
import {
  assertTmclassSourceEvidenceV1,
  type TmclassSourceEvidenceV1,
  validateTmclassSourceEvidenceV1,
} from "../src/tmclass-source-evidence-v1";

const lineage = {
  workspaceId: "global-public",
  sourceDefinitionId: "src_tmclass",
  collectionRunId: "run_tmclass",
  rawArtifactId: "art_tmclass",
  artifactVersion: 1,
  canonicalUri: "https://euipo.europa.eu/ec2/concept/11452493/en",
  sourceUri: "https://euipo.europa.eu/ec2/concept/11452493/en",
  sha256: "a".repeat(64),
};

function evidence(page: TmclassSourceEvidenceV1["page"]): TmclassSourceEvidenceV1 {
  return {
    contractVersion: "TMCLASS_SOURCE_EVIDENCE_V1",
    objectType: "TMCLASS_SOURCE_EVIDENCE",
    sourceOwner: "MARKORBIT_KNOWLEDGE",
    sourceId: "EUIPO_TMCLASS",
    observedAt: "2026-10-10T03:04:14.000Z",
    evidence: lineage,
    page,
  };
}

describe("TMclass source evidence V1", () => {
  it("preserves every useful Term-page fact and its exact RawArtifact lineage", () => {
    const value = evidence({
      pageKind: "TERM",
      termId: "262",
      text: "Abrasives (Auxiliary fluids for use with -)",
      niceClass: 1,
      languageCode: "en",
      languageLabel: "English",
      acceptedBy: [
        { name: "European Union Intellectual Property Office", code: "EUIPO" },
        { name: "Israel Patent Office", code: "ILPO" },
      ],
      taxonomy: [
        { label: "Class 1", sourceNodeId: null },
        {
          label: "Chemical substances, chemical materials and chemical preparations",
          sourceNodeId: null,
        },
      ],
      translationTargets: [
        {
          termId: "242746758",
          languageCode: "ja",
          niceClass: 1,
          text: "研磨用補助液",
          quality: "Terminology",
        },
      ],
      sources: [
        { conceptId: "19896306", sourceName: "Harmonized", referenceId: "0024010" },
        { conceptId: "11452493", sourceName: "ILPO Supplement", referenceId: "0024010" },
        { conceptId: "17729293", sourceName: "Nice (IPONZ)", referenceId: "0024010" },
      ],
    });

    expect(validateTmclassSourceEvidenceV1(value)).toEqual([]);
    expect(() => assertTmclassSourceEvidenceV1(value)).not.toThrow();
  });

  it("models Master and Variant as independent Terms related to one source-scoped Concept", () => {
    const value = evidence({
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
        {
          termId: "262",
          text: "Abrasives (Auxiliary fluids for use with -)",
          role: "MASTER",
          ordinal: 1,
        },
        {
          termId: "263",
          text: "Fluids for use with abrasives (Auxiliary -)",
          role: "VARIANT",
          ordinal: 2,
        },
      ],
    });

    expect(validateTmclassSourceEvidenceV1(value)).toEqual([]);
    expect(value.page.pageKind === "CONCEPT_LANGUAGE" && value.page.terms).toHaveLength(2);
  });

  it("retains concept status, source/date/reference/scope and language counts", () => {
    const value = evidence({
      pageKind: "CONCEPT_OVERVIEW",
      conceptId: "17729293",
      title: "Auxiliary fluids for use with abrasives",
      status: "Published",
      niceClass: 1,
      sourceName: "Nice (IPONZ)",
      sourceDateText: null,
      referenceId: "0024010",
      scopeStatus: "Accepted",
      taxonomy: [{ label: "Class 1", sourceNodeId: null }],
      languages: [
        {
          languageCode: "en",
          masterTermId: "264",
          masterTermText: "Auxiliary fluids for use with abrasives",
          variantCount: 2,
          totalTermCount: 3,
        },
      ],
      masterCount: 1,
      variantCount: 2,
    });

    expect(validateTmclassSourceEvidenceV1(value)).toEqual([]);
  });

  it("fails closed on a missing source-scoped reference or invalid role cardinality", () => {
    const value = evidence({
      pageKind: "CONCEPT_LANGUAGE",
      conceptId: "11452493",
      title: "Example",
      status: "Published",
      niceClass: 1,
      sourceName: "ILPO Supplement",
      sourceDateText: null,
      referenceId: "",
      scopeStatus: "Accepted",
      taxonomy: [{ label: "Class 1", sourceNodeId: null }],
      languageCode: "en",
      terms: [
        { termId: "262", text: "First", role: "VARIANT", ordinal: 1 },
        { termId: "263", text: "Second", role: "VARIANT", ordinal: 2 },
      ],
    });

    expect(validateTmclassSourceEvidenceV1(value)).toEqual(
      expect.arrayContaining(["REFERENCE_ID_MISSING", "CONCEPT_MASTER_CARDINALITY_INVALID"]),
    );
  });
});
