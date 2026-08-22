import { describe, expect, it } from "vitest";
import {
  ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
  type AcquisitionRunEvidence,
  type SourceFingerprint,
  isAcquisitionRunEvidence,
  isSourceFingerprint,
} from "../src/acquisition-intelligence-v1";
import {
  extractAcquisitionRunLessons,
  selectAcquisitionPlaybook,
} from "../src/acquisition-intelligence-learning-v1";
import { ACQUISITION_SEED_PLAYBOOKS } from "../src/acquisition-playbooks-v1";

function fingerprint(
  input: Partial<SourceFingerprint> & Pick<SourceFingerprint, "sourceId">,
): SourceFingerprint {
  return {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "SOURCE_FINGERPRINT",
    sourceId: input.sourceId,
    observedAt: "2026-08-22T00:00:00.000Z",
    architecture: "STATIC_HTML",
    discoverySurfaces: ["INDEX_PAGE"],
    renderRequirement: "NONE",
    localeStructure: "SINGLE",
    supportsHttpValidators: true,
    attachmentKinds: ["HTML"],
    confidence: 0.9,
    evidenceRefs: ["run:probe-1"],
    ...input,
  };
}

function runEvidence(input: Partial<AcquisitionRunEvidence> = {}): AcquisitionRunEvidence {
  return {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "ACQUISITION_RUN_EVIDENCE",
    runId: "run_001",
    sourceId: "src_official_manual",
    playbookId: "official-static-index-tree",
    playbookRevision: 1,
    startedAt: "2026-08-22T00:00:00.000Z",
    finishedAt: "2026-08-22T00:05:00.000Z",
    outcome: "SUCCESS",
    counts: {
      discovered: 577,
      attempted: 577,
      fetched: 577,
      accepted: 577,
      duplicates: 0,
      retries: 0,
    },
    coverage: {
      knownCorpus: 577,
      ratio: 1,
      previousRatio: 1,
    },
    httpStatusCounts: { "200": 577 },
    failureSignatures: [],
    surfaceOutcomes: [
      {
        surface: "INDEX_PAGE",
        discovered: 577,
        accepted: 577,
        knownCorpus: 577,
      },
    ],
    rendering: {
      used: false,
      comparativeProbe: { staticAccepted: 20, renderedAccepted: 20 },
    },
    changeDetection: {
      etagObserved: true,
      lastModifiedObserved: true,
      validator304Count: 12,
      digestChanges: 0,
    },
    performance: {
      durationMs: 300_000,
      bytes: 10_000_000,
    },
    evidenceRefs: ["raw-artifact:corpus", "workflow:live-validation"],
    boundaries: {
      legalTruthVerified: false,
      autoPromotionApplied: false,
      collectionAuthorityGranted: false,
    },
    ...input,
  };
}

describe("acquisition intelligence v1", () => {
  it("validates governed source fingerprints and run evidence", () => {
    expect(isSourceFingerprint(fingerprint({ sourceId: "src_1" }))).toBe(true);
    expect(isAcquisitionRunEvidence(runEvidence())).toBe(true);
  });

  it("selects structural playbooks without source-name branching", () => {
    const cases = [
      {
        label: "static official index",
        source: fingerprint({ sourceId: "src_us", discoverySurfaces: ["INDEX_PAGE"] }),
        expected: "official-static-index-tree",
      },
      {
        label: "manual TOC graph",
        source: fingerprint({
          sourceId: "src_au",
          discoverySurfaces: ["TOC"],
        }),
        expected: "official-toc-graph",
      },
      {
        label: "jurisdiction country index",
        source: fingerprint({
          sourceId: "src_country_index",
          discoverySurfaces: ["COUNTRY_INDEX"],
          localeStructure: "JURISDICTION_GRAPH",
        }),
        expected: "official-jurisdiction-index",
      },
      {
        label: "API-backed catalog",
        source: fingerprint({
          sourceId: "src_wipo_like",
          architecture: "API_BACKED",
          discoverySurfaces: ["API", "DOCUMENT_CATALOG"],
        }),
        expected: "official-api-catalog",
      },
    ];

    for (const testCase of cases) {
      const selection = selectAcquisitionPlaybook({
        fingerprint: testCase.source,
        playbooks: ACQUISITION_SEED_PLAYBOOKS,
      });
      expect(selection.selectedPlaybookId, testCase.label).toBe(testCase.expected);
      expect(selection.boundaries.selectionGrantsCollectionAuthority).toBe(false);
      expect(selection.boundaries.autoPromotionApplied).toBe(false);
    }
  });

  it("uses repeated outcomes to rank compatible playbooks while keeping rationale", () => {
    const source = fingerprint({
      sourceId: "src_manual",
      discoverySurfaces: ["INDEX_PAGE", "TOC"],
    });
    const selection = selectAcquisitionPlaybook({
      fingerprint: source,
      playbooks: ACQUISITION_SEED_PLAYBOOKS,
      history: {
        "official-static-index-tree@1": {
          runs: 8,
          successRate: 0.97,
          averageCoverage: 0.99,
          averageDurationMs: 240_000,
        },
        "official-toc-graph@1": {
          runs: 8,
          successRate: 0.9,
          averageCoverage: 0.93,
          averageDurationMs: 260_000,
        },
      },
    });

    expect(selection.selectedPlaybookId).toBe("official-static-index-tree");
    expect(selection.ranked[0]?.reasonCodes).toContain("HISTORICAL_OUTCOMES_APPLIED");
    expect(selection.ranked[0]?.reasonCodes).toContain("REPEATED_EVIDENCE_AVAILABLE");
  });

  it("extracts reusable lessons from successful production evidence", () => {
    const lessons = extractAcquisitionRunLessons(runEvidence());
    expect(lessons.map((item) => item.lessonType)).toEqual(
      expect.arrayContaining([
        "AUTHORITATIVE_ENUMERATOR",
        "RENDERING_UNNECESSARY",
        "HTTP_VALIDATORS_EFFECTIVE",
        "PLAYBOOK_SUCCESS",
      ]),
    );
    expect(
      lessons.find((item) => item.lessonType === "AUTHORITATIVE_ENUMERATOR")
        ?.recommendedPrimitive,
    ).toBe("INDEX_TREE_ENUMERATION");
  });

  it("turns coverage loss, weak enumerators and failures into explicit revalidation lessons", () => {
    const lessons = extractAcquisitionRunLessons(
      runEvidence({
        outcome: "DEGRADED",
        counts: {
          discovered: 600,
          attempted: 600,
          fetched: 570,
          accepted: 480,
          duplicates: 120,
          retries: 18,
        },
        coverage: {
          knownCorpus: 577,
          ratio: 0.83,
          previousRatio: 1,
        },
        surfaceOutcomes: [
          {
            surface: "SITEMAP",
            discovered: 480,
            accepted: 480,
            knownCorpus: 577,
          },
        ],
        failureSignatures: [{ code: "HTTP_429", count: 18 }],
        changeDetection: {
          etagObserved: false,
          lastModifiedObserved: false,
          validator304Count: 0,
          digestChanges: 3,
        },
      }),
    );

    expect(lessons.map((item) => item.lessonType)).toEqual(
      expect.arrayContaining([
        "INCOMPLETE_ENUMERATOR",
        "COVERAGE_REGRESSION",
        "HTTP_VALIDATORS_UNAVAILABLE",
        "DIGEST_WATCH_REQUIRED",
        "DUPLICATION_HIGH",
        "FAILURE_SIGNATURE",
      ]),
    );
    expect(
      lessons.find((item) => item.lessonType === "COVERAGE_REGRESSION")?.recommendedPrimitive,
    ).toBe("CORPUS_RECONCILIATION");
  });

  it("never auto-activates a non-active strategy candidate through selection", () => {
    const candidate = {
      ...ACQUISITION_SEED_PLAYBOOKS[0]!,
      id: "candidate-index-strategy",
      stage: "CANDIDATE" as const,
      prior: {
        expectedCoverage: 1,
        expectedSuccessRate: 1,
        expectedCostScore: 0,
        confidence: 1,
      },
    };
    const selection = selectAcquisitionPlaybook({
      fingerprint: fingerprint({ sourceId: "src_guardrail" }),
      playbooks: [candidate],
    });

    expect(selection.selectedPlaybookId).toBeNull();
    expect(selection.ranked[0]?.reasonCodes).toContain("PLAYBOOK_NOT_ACTIVE");
  });
});
