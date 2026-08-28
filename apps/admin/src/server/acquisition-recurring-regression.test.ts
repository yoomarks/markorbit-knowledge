import { describe, expect, it } from "vitest";
import type { AcquisitionRunEvidence, SourceFingerprint } from "@markorbit/contracts";
import { evaluateAcquisitionRecurringRegression } from "./acquisition-recurring-regression";

function evidence(overrides: Partial<AcquisitionRunEvidence> = {}): AcquisitionRunEvidence {
  return {
    protocolVersion: "1.0",
    objectType: "ACQUISITION_RUN_EVIDENCE",
    runId: "run-baseline",
    sourceId: "src-official",
    playbookId: "official-index-v1",
    playbookRevision: 1,
    startedAt: "2026-08-28T00:00:00.000Z",
    finishedAt: "2026-08-28T00:01:00.000Z",
    outcome: "SUCCESS",
    counts: {
      discovered: 100,
      attempted: 100,
      fetched: 100,
      accepted: 95,
      duplicates: 5,
      retries: 0,
    },
    coverage: { knownCorpus: 100, ratio: 0.95, previousRatio: null },
    httpStatusCounts: { "200": 100 },
    failureSignatures: [],
    surfaceOutcomes: [{ surface: "INDEX_PAGE", discovered: 100, accepted: 95, knownCorpus: 100 }],
    rendering: { used: false },
    changeDetection: {
      etagObserved: true,
      lastModifiedObserved: true,
      validator304Count: 10,
      digestChanges: 0,
    },
    performance: { durationMs: 60_000, bytes: 1000 },
    evidenceRefs: ["artifact:baseline"],
    boundaries: {
      legalTruthVerified: false,
      autoPromotionApplied: false,
      collectionAuthorityGranted: false,
    },
    ...overrides,
  };
}

function fingerprint(overrides: Partial<SourceFingerprint> = {}): SourceFingerprint {
  return {
    protocolVersion: "1.0",
    objectType: "SOURCE_FINGERPRINT",
    sourceId: "src-official",
    observedAt: "2026-08-28T00:01:00.000Z",
    architecture: "STATIC_HTML",
    discoverySurfaces: ["INDEX_PAGE"],
    renderRequirement: "NONE",
    localeStructure: "SINGLE",
    supportsHttpValidators: true,
    attachmentKinds: [],
    confidence: 0.95,
    evidenceRefs: ["fingerprint:baseline"],
    ...overrides,
  };
}

function pair(currentOverrides: Partial<AcquisitionRunEvidence> = {}) {
  const baseline = evidence();
  const current = evidence({
    runId: "run-current",
    startedAt: "2026-08-29T00:00:00.000Z",
    finishedAt: "2026-08-29T00:01:00.000Z",
    evidenceRefs: ["artifact:current"],
    ...currentOverrides,
  });
  return {
    baseline,
    current,
    baselineFingerprint: fingerprint(),
    currentFingerprint: fingerprint({
      observedAt: "2026-08-29T00:01:00.000Z",
      evidenceRefs: ["fingerprint:current"],
    }),
  };
}

describe("acquisition recurring regression", () => {
  it("returns UNCHANGED for stable objective evidence without reevaluation", () => {
    const result = evaluateAcquisitionRecurringRegression(pair());
    expect(result.state).toBe("UNCHANGED");
    expect(result.reasonCodes).toEqual(["OBJECTIVE_ACQUISITION_SIGNALS_STABLE"]);
    expect(result.evidenceRefs).toEqual([
      "acquisition-run:run-baseline",
      "acquisition-run:run-current",
      "artifact:baseline",
      "artifact:current",
      "fingerprint:baseline",
      "fingerprint:current",
    ]);
    expect(result.deltas.httpErrorRatio).toBe(0);
    expect(result.reevaluationRequest).toBeNull();
    expect(result.boundaries.autoPromotionApplied).toBe(false);
  });

  it("detects a controlled coverage regression and emits governed reevaluation evidence", () => {
    const result = evaluateAcquisitionRecurringRegression(
      pair({ coverage: { knownCorpus: 100, ratio: 0.89, previousRatio: 0.95 } }),
    );
    expect(result.state).toBe("COVERAGE_DEGRADED");
    expect(result.reasonCodes).toEqual(["COVERAGE_DROP_GTE_5_POINTS"]);
    expect(result.deltas.coverageRatio).toBeCloseTo(-0.06);
    expect(result.reevaluationRequest).toEqual({
      protocolVersion: "1.0",
      objectType: "ACQUISITION_STRATEGY_REEVALUATION_REQUEST",
      id: "recurring-regression:run-current:COVERAGE_DEGRADED",
      runId: "run-current",
      sourceId: "src-official",
      playbookId: "official-index-v1",
      playbookRevision: 1,
      requestedAt: "2026-08-29T00:01:00.000Z",
      status: "PENDING",
      lessonTypes: ["COVERAGE_REGRESSION"],
      reasonCodes: ["COVERAGE_DROP_GTE_5_POINTS"],
      fallbackPlaybookIds: [],
      evidenceRefs: result.evidenceRefs,
      boundaries: {
        autoDispatchApplied: false,
        autoPromotionApplied: false,
        collectionAuthorityGranted: false,
      },
    });
  });

  it("distinguishes structural source identity drift and requests reevaluation without promotion", () => {
    const input = pair();
    input.currentFingerprint = fingerprint({
      architecture: "SPA",
      renderRequirement: "REQUIRED",
      observedAt: "2026-08-29T00:01:00.000Z",
    });
    const result = evaluateAcquisitionRecurringRegression(input);
    expect(result.state).toBe("SOURCE_IDENTITY_DRIFT");
    expect(result.reevaluationRequest?.reasonCodes).toEqual(["STRUCTURAL_FINGERPRINT_CHANGED"]);
    expect(result.reevaluationRequest?.lessonTypes).toEqual([]);
    expect(result.reevaluationRequest?.boundaries.autoDispatchApplied).toBe(false);
    expect(result.reevaluationRequest?.boundaries.autoPromotionApplied).toBe(false);
  });

  it("detects playbook revision and behavioral drift without activating anything", () => {
    const revision = evaluateAcquisitionRecurringRegression(pair({ playbookRevision: 2 }));
    expect(revision.state).toBe("PLAYBOOK_BEHAVIOR_DRIFT");
    expect(revision.reevaluationRequest?.playbookRevision).toBe(2);
    expect(revision.reevaluationRequest?.boundaries.autoPromotionApplied).toBe(false);

    const behavioral = pair({
      outcome: "DEGRADED",
      failureSignatures: [{ code: "HTTP_429", count: 2 }],
    });
    const result = evaluateAcquisitionRecurringRegression(behavioral);
    expect(result.state).toBe("PLAYBOOK_BEHAVIOR_DRIFT");
    expect(result.reasonCodes).toEqual(["FAILURE_COUNT_INCREASED", "OUTCOME_CHANGED"]);
    expect(result.reevaluationRequest?.reasonCodes).toEqual([
      "FAILURE_COUNT_INCREASED",
      "OUTCOME_CHANGED",
    ]);
    expect(result.boundaries.collectionAuthorityGranted).toBe(false);
  });

  it("detects material HTTP error-distribution drift", () => {
    const result = evaluateAcquisitionRecurringRegression(
      pair({ httpStatusCounts: { "200": 90, "429": 10 } }),
    );
    expect(result.state).toBe("PLAYBOOK_BEHAVIOR_DRIFT");
    expect(result.reasonCodes).toEqual(["HTTP_ERROR_RATIO_INCREASE_GTE_5_POINTS"]);
    expect(result.deltas.httpErrorRatio).toBeCloseTo(0.1);
    expect(result.reevaluationRequest?.status).toBe("PENDING");
  });

  it("treats content digest movement without acquisition regression as EXPECTED_CHANGE", () => {
    const result = evaluateAcquisitionRecurringRegression(
      pair({
        changeDetection: {
          etagObserved: true,
          lastModifiedObserved: true,
          validator304Count: 8,
          digestChanges: 3,
        },
      }),
    );
    expect(result.state).toBe("EXPECTED_CHANGE");
    expect(result.reasonCodes).toEqual(["CONTENT_DIGEST_CHANGE_WITHOUT_ACQUISITION_REGRESSION"]);
    expect(result.reevaluationRequest).toBeNull();
  });

  it.each([
    ["USPTO", "src-uspto", "official-index-v1", ["INDEX_PAGE"] as const],
    ["WIPO", "src-wipo", "official-index-v1", ["INDEX_PAGE", "DOCUMENT_CATALOG"] as const],
    ["IP Australia", "src-ip-australia", "official-index-v1", ["INDEX_PAGE"] as const],
    [
      "Country Index",
      "src-country-index",
      "official-jurisdiction-index",
      ["COUNTRY_INDEX"] as const,
    ],
  ])(
    "replays stable deterministic %s family evidence",
    (_family, sourceId, playbookId, surfaces) => {
      const baseline = evidence({ sourceId, playbookId, evidenceRefs: [`${sourceId}:baseline`] });
      const current = evidence({
        runId: `${sourceId}:current`,
        sourceId,
        playbookId,
        evidenceRefs: [`${sourceId}:current-evidence`],
      });
      const baselineFingerprint = fingerprint({
        sourceId,
        discoverySurfaces: [...surfaces],
        evidenceRefs: [`${sourceId}:fingerprint-baseline`],
      });
      const currentFingerprint = fingerprint({
        sourceId,
        discoverySurfaces: [...surfaces],
        observedAt: "2026-08-29T00:01:00.000Z",
        evidenceRefs: [`${sourceId}:fingerprint-current`],
      });
      const result = evaluateAcquisitionRecurringRegression({
        baseline,
        current,
        baselineFingerprint,
        currentFingerprint,
      });
      expect(result.state).toBe("UNCHANGED");
      expect(result.reevaluationRequest).toBeNull();
    },
  );

  it("fails closed when evidence is missing or identities are incompatible", () => {
    const missing = evaluateAcquisitionRecurringRegression({
      baseline: evidence(),
      current: null,
      baselineFingerprint: fingerprint(),
      currentFingerprint: null,
    });
    expect(missing.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(missing.reevaluationRequest).toBeNull();

    const sourceMismatch = evaluateAcquisitionRecurringRegression(
      pair({ sourceId: "src-different" }),
    );
    expect(sourceMismatch.reasonCodes).toEqual(["SOURCE_IDENTITY_INCOMPATIBLE"]);
    expect(sourceMismatch.reevaluationRequest).toBeNull();

    const playbookMismatch = evaluateAcquisitionRecurringRegression(
      pair({ playbookId: "different-playbook" }),
    );
    expect(playbookMismatch.reasonCodes).toEqual(["PLAYBOOK_ID_INCOMPATIBLE"]);
    expect(playbookMismatch.reevaluationRequest).toBeNull();
  });

  it("is deterministic for the same baseline and current evidence", () => {
    const input = pair({ coverage: { knownCorpus: 100, ratio: 0.89, previousRatio: 0.95 } });
    expect(JSON.stringify(evaluateAcquisitionRecurringRegression(input))).toBe(
      JSON.stringify(evaluateAcquisitionRecurringRegression(input)),
    );
  });
});
