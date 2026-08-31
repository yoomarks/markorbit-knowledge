import { describe, expect, it } from "vitest";
import { knowledgeRetrievalRegressionCorpusV1 } from "./fixtures/knowledge-retrieval-regression-corpus-v1";
import {
  runKnowledgeRetrievalRegression,
  type KnowledgeRetrievalRegressionFixtureV1,
} from "./knowledge-retrieval-regression";

describe("Knowledge retrieval representative corpus regression", () => {
  it("passes all versioned US trademark representative queries", () => {
    const result = runKnowledgeRetrievalRegression(knowledgeRetrievalRegressionCorpusV1);

    expect(result).toMatchObject({
      schemaVersion: 1,
      fixtureId: "knowledge-retrieval-us-trademark-representative-v1",
      corpusVersion: "us-trademark-representative-2026-08-28.v1",
      passed: true,
    });
    expect(result.cases.map((regressionCase) => regressionCase.caseId)).toEqual([
      "us-filing-basis",
      "us-section-8-maintenance",
      "us-ttab-procedure",
    ]);
    expect(result.cases.every((regressionCase) => regressionCase.passed)).toBe(true);
    expect(result.cases.map((regressionCase) => regressionCase.failures)).toEqual([[], [], []]);
  });

  it("freezes channel-native metric behavior for the representative corpus", () => {
    const result = runKnowledgeRetrievalRegression(knowledgeRetrievalRegressionCorpusV1);

    expect(
      result.cases.map((regressionCase) => ({
        caseId: regressionCase.caseId,
        documentRecallAtK: regressionCase.metrics.documentRecallAtK,
        exactChunkHitRate: regressionCase.metrics.exactChunkHitRate,
        provenanceCompletenessRate: regressionCase.metrics.provenanceCompletenessRate,
        relationshipExpansionContributionRate:
          regressionCase.metrics.relationshipExpansionContributionRate,
        relationshipExpansionNoiseRate: regressionCase.metrics.relationshipExpansionNoiseRate,
      })),
    ).toEqual([
      {
        caseId: "us-filing-basis",
        documentRecallAtK: 2 / 3,
        exactChunkHitRate: 1,
        provenanceCompletenessRate: 1,
        relationshipExpansionContributionRate: 0.5,
        relationshipExpansionNoiseRate: 0.5,
      },
      {
        caseId: "us-section-8-maintenance",
        documentRecallAtK: 0.5,
        exactChunkHitRate: 1,
        provenanceCompletenessRate: 1,
        relationshipExpansionContributionRate: 1,
        relationshipExpansionNoiseRate: 0,
      },
      {
        caseId: "us-ttab-procedure",
        documentRecallAtK: 1 / 3,
        exactChunkHitRate: 1,
        provenanceCompletenessRate: 1,
        relationshipExpansionContributionRate: 0.5,
        relationshipExpansionNoiseRate: 0.5,
      },
    ]);
  });

  it("compares metadata/filter, lexical-only, and lexical+relationship variants without a blended score", () => {
    const result = runKnowledgeRetrievalRegression(knowledgeRetrievalRegressionCorpusV1);

    expect(
      result.cases.map((regressionCase) => ({
        caseId: regressionCase.caseId,
        metadataCoverage:
          regressionCase.variantComparison.metadataFilterBaseline.expectedDocumentCoverageRate,
        lexicalCoverage: regressionCase.variantComparison.lexicalOnly.expectedDocumentCoverageRate,
        relationshipCoverage:
          regressionCase.variantComparison.lexicalRelationship.expectedDocumentCoverageRate,
        lexicalDelta: regressionCase.variantComparison.deltas.lexicalVsMetadataFilterCoverageDelta,
        relationshipDelta:
          regressionCase.variantComparison.deltas.relationshipVsLexicalCoverageDelta,
        lexicalRelationshipContribution:
          regressionCase.variantComparison.lexicalOnly.metrics
            .relationshipExpansionContributionRate,
        combinedRelationshipContribution:
          regressionCase.variantComparison.lexicalRelationship.metrics
            .relationshipExpansionContributionRate,
      })),
    ).toEqual([
      {
        caseId: "us-filing-basis",
        metadataCoverage: 2 / 3,
        lexicalCoverage: 2 / 3,
        relationshipCoverage: 1,
        lexicalDelta: 0,
        relationshipDelta: 1 / 3,
        lexicalRelationshipContribution: null,
        combinedRelationshipContribution: 0.5,
      },
      {
        caseId: "us-section-8-maintenance",
        metadataCoverage: 0.5,
        lexicalCoverage: 0.5,
        relationshipCoverage: 1,
        lexicalDelta: 0,
        relationshipDelta: 0.5,
        lexicalRelationshipContribution: null,
        combinedRelationshipContribution: 1,
      },
      {
        caseId: "us-ttab-procedure",
        metadataCoverage: 2 / 3,
        lexicalCoverage: 2 / 3,
        relationshipCoverage: 1,
        lexicalDelta: 0,
        relationshipDelta: 1 / 3,
        lexicalRelationshipContribution: null,
        combinedRelationshipContribution: 0.5,
      },
    ]);
  });

  it("is deterministic over an unchanged versioned fixture", () => {
    const first = runKnowledgeRetrievalRegression(knowledgeRetrievalRegressionCorpusV1);
    const second = runKnowledgeRetrievalRegression(knowledgeRetrievalRegressionCorpusV1);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("reports a factual quality-gate failure without collapsing metrics into one score", () => {
    const fixture = structuredClone(
      knowledgeRetrievalRegressionCorpusV1,
    ) as KnowledgeRetrievalRegressionFixtureV1;
    fixture.cases[0]!.thresholds.minDocumentRecallAtK = 1;

    const result = runKnowledgeRetrievalRegression(fixture);

    expect(result.passed).toBe(false);
    expect(result.cases[0]).toMatchObject({
      passed: false,
      failures: ["documentRecallAtK 0.6666666666666666 is below minimum 1"],
    });
    expect(result.cases[0]!.metrics.exactChunkHitRate).toBe(1);
  });

  it("fails closed on duplicate case identities", () => {
    const fixture = structuredClone(
      knowledgeRetrievalRegressionCorpusV1,
    ) as KnowledgeRetrievalRegressionFixtureV1;
    fixture.cases[1]!.caseId = fixture.cases[0]!.caseId;

    expect(() => runKnowledgeRetrievalRegression(fixture)).toThrow(
      "Retrieval regression fixture contains duplicate caseId",
    );
  });

  it("fails closed on duplicate metadata/filter baseline candidates", () => {
    const fixture = structuredClone(
      knowledgeRetrievalRegressionCorpusV1,
    ) as KnowledgeRetrievalRegressionFixtureV1;
    fixture.cases[0]!.metadataFilterBaselineCandidates.push(
      fixture.cases[0]!.metadataFilterBaselineCandidates[0]!,
    );

    expect(() => runKnowledgeRetrievalRegression(fixture)).toThrow(
      "Retrieval regression metadata/filter baseline contains duplicate candidates",
    );
  });

  it("fails closed on invalid rate thresholds", () => {
    const fixture = structuredClone(
      knowledgeRetrievalRegressionCorpusV1,
    ) as KnowledgeRetrievalRegressionFixtureV1;
    fixture.cases[0]!.thresholds.maxRelationshipExpansionNoiseRate = 1.01;

    expect(() => runKnowledgeRetrievalRegression(fixture)).toThrow(
      "Retrieval regression threshold maxRelationshipExpansionNoiseRate must be between 0 and 1",
    );
  });
});
