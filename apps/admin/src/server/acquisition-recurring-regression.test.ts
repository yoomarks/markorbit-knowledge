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
    surfaceOutcomes: [
      { surface: "INDEX_PAGE", discovered: 100, accepted: 95, knownCorpus: 100 },
    ],
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
  it("returns UNCHANGED for stable objective evidence", () => {
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
    expect(result.boundaries.autoPromotionApplied).toBe(false);
  });

  it("detects a controlled coverage regression", () => {
    const result = evaluateAcquisitionRecurringRegression(
      pair({ coverage: { knownCorpus: 100, ratio: 0.89, previousRatio: 0.95 } }),
    );
    expect(result.state).toBe("COVERAGE_DEGRADED");
    expect(result.reasonCodes).toEqual(["COVERAGE_DROP_GTE_5_POINTS"]);
    expect(result.deltas.coverageRatio).toBeCloseTo(-0.06);
  });

  it("distinguishes structural source identity drift from content change", () => {
    const input = pair();
    input.currentFingerprint = fingerprint({
      architecture: "SPA",
      renderRequirement: "REQUIRED",
      observedAt: "2026-08-29T00:01:00.000Z",
    });
    expect(evaluateAcquisitionRecurringRegression(input).state).toBe("SOURCE_IDENTITY_DRIFT");
  });

  it("detects playbook revision and behavioral drift without activating anything", () => {
    expect(
      evaluateAcquisitionRecurringRegression(pair({ playbookRevision: 2 })).state,
    ).toBe("PLAYBOOK_BEHAVIOR_DRIFT");

    const behavioral = pair({
      outcome: "DEGRADED",
      failureSignatures: [{ code: "HTTP_429", count: 2 }],
    });
    const result = evaluateAcquisitionRecurringRegression(behavioral);
    expect(result.state).toBe("PLAYBOOK_BEHAVIOR_DRIFT");
    expect(result.reasonCodes).toEqual(["FAILURE_COUNT_INCREASED", "OUTCOME_CHANGED"]);
    expect(result.boundaries.collectionAuthorityGranted).toBe(false);
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
    expect(result.reasonCodes).toEqual([
      "CONTENT_DIGEST_CHANGE_WITHOUT_ACQUISITION_REGRESSION",
    ]);
  });

  it("fails closed when evidence is missing or identities are incompatible", () => {
    expect(
      evaluateAcquisitionRecurringRegression({
        baseline: evidence(),
        current: null,
        baselineFingerprint: fingerprint(),
        currentFingerprint: null,
      }).state,
    ).toBe("INSUFFICIENT_EVIDENCE");

    expect(
      evaluateAcquisitionRecurringRegression(
        pair({ sourceId: "src-different" }),
      ).reasonCodes,
    ).toEqual(["SOURCE_IDENTITY_INCOMPATIBLE"]);

    expect(
      evaluateAcquisitionRecurringRegression(
        pair({ playbookId: "different-playbook" }),
      ).reasonCodes,
    ).toEqual(["PLAYBOOK_ID_INCOMPATIBLE"]);
  });

  it("is deterministic for the same baseline and current evidence", () => {
    const input = pair();
    expect(JSON.stringify(evaluateAcquisitionRecurringRegression(input))).toBe(
      JSON.stringify(evaluateAcquisitionRecurringRegression(input)),
    );
  });
});
