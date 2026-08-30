import { describe, expect, it } from "vitest";

import type { SourceCoverageTarget } from "./source-coverage-v1";
import type { SourceSupplyHealthRecord } from "./source-supply-health-v1";
import { projectCollectionLifecyclePolicy } from "./collection-lifecycle-policy-v1";

function makeTarget(overrides: Partial<SourceCoverageTarget> = {}): SourceCoverageTarget {
  return {
    protocolVersion: "1.0",
    objectType: "SOURCE_COVERAGE_TARGET",
    id: "coverage-uspto-tm-search",
    jurisdiction: "US",
    authorityName: "United States Patent and Trademark Office",
    authorityBasis: "EXPLICIT_CURATED",
    family: "SEARCH",
    displayName: "USPTO trademark search",
    canonicalUri: "https://www.uspto.gov/trademarks/search",
    entrypoints: [{ uri: "https://www.uspto.gov/trademarks/search" }],
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    languages: ["en"],
    coverageTier: "FOUNDATIONAL",
    catalogState: "ACTIVE",
    changeSensitivity: "NORMAL",
    acquisition: {
      mode: "WEB_CRAWL",
      renderJavascriptHint: false,
      fetchAttachmentsHint: true,
      expectedArtifactKinds: ["HTML"],
    },
    verifiedAt: "2026-08-31T00:00:00.000Z",
    verificationEvidenceUri: "https://www.uspto.gov/trademarks/search",
    ...overrides,
  };
}

function makeHealth(
  target: SourceCoverageTarget,
  state: SourceSupplyHealthRecord["state"] = "READY",
): SourceSupplyHealthRecord {
  return {
    protocolVersion: "1.5",
    objectType: "SOURCE_SUPPLY_HEALTH",
    targetId: target.id,
    workspaceId: "wsp_01H00000000000000000000000",
    jurisdiction: target.jurisdiction,
    family: target.family,
    coverageTier: target.coverageTier,
    catalogState: target.catalogState,
    changeSensitivity: target.changeSensitivity,
    displayName: target.displayName,
    canonicalUri: target.canonicalUri,
    registrationState: "REGISTERED",
    sourceIds: ["src_01H00000000000000000000000"],
    latestRun: null,
    acquisition: {
      artifactCount: 1,
      artifactKinds: ["HTML"],
      latestArtifactAt: "2026-08-31T00:00:00.000Z",
    },
    normalization: {
      stagingDocumentCount: 1,
      readyDocumentCount: 1,
      latestDocumentAt: "2026-08-31T00:00:00.000Z",
      latestStatus: "READY",
    },
    retrieval: {
      indexedDocumentCount: 1,
      currentDocumentCount: 1,
      currentArtifactVersion: 1,
      currentChunkCount: 1,
      latestIndexedAt: "2026-08-31T00:00:00.000Z",
    },
    freshness: {
      state: "FRESH",
      lastObservedAt: "2026-08-31T00:00:00.000Z",
      ageHours: 1,
      maxAgeHours: 24,
    },
    gaps: [],
    state,
    observedAt: "2026-08-31T01:00:00.000Z",
  };
}

describe("projectCollectionLifecyclePolicy", () => {
  it("projects all five lifecycle classes from explicit coverage metadata", () => {
    const cases: Array<{
      target: SourceCoverageTarget;
      expected: string;
    }> = [
      {
        target: makeTarget({ coverageTier: "CHANGE_SIGNAL" }),
        expected: "CHANGE_WATCH",
      },
      {
        target: makeTarget({ changeSensitivity: "HIGH" }),
        expected: "FREQUENT_REFRESH",
      },
      {
        target: makeTarget(),
        expected: "STANDARD_REFRESH",
      },
      {
        target: makeTarget({ catalogState: "WATCH" }),
        expected: "MANUAL_ON_DEMAND",
      },
      {
        target: makeTarget({ catalogState: "RETIRED" }),
        expected: "RETIRED",
      },
    ];

    expect(cases.map(({ target }) => projectCollectionLifecyclePolicy(target).policyClass)).toEqual(
      cases.map(({ expected }) => expected),
    );
  });

  it("uses supply health only as an operational directive, never as schedule authority", () => {
    const target = makeTarget({ coverageTier: "CHANGE_SIGNAL" });

    expect(projectCollectionLifecyclePolicy(target, makeHealth(target, "READY"))).toMatchObject({
      policyClass: "CHANGE_WATCH",
      healthDirective: "ELIGIBLE_FOR_PLAN_PROPOSAL",
      observedHealthState: "READY",
      boundaries: {
        collectionPlanCreated: false,
        schedulerMutationApplied: false,
        automaticCollectionApplied: false,
        grantsCollectionAuthority: false,
      },
    });

    expect(projectCollectionLifecyclePolicy(target, makeHealth(target, "DEGRADED"))).toMatchObject({
      policyClass: "CHANGE_WATCH",
      healthDirective: "REPAIR_BEFORE_EXPANSION",
      observedHealthState: "DEGRADED",
    });

    expect(projectCollectionLifecyclePolicy(target, makeHealth(target, "BLOCKED"))).toMatchObject({
      policyClass: "CHANGE_WATCH",
      healthDirective: "HOLD_AND_REPAIR",
      observedHealthState: "BLOCKED",
    });
  });

  it("keeps WATCH targets observe-only and RETIRED targets disabled", () => {
    const watchTarget = makeTarget({ catalogState: "WATCH" });
    const retiredTarget = makeTarget({ catalogState: "RETIRED" });

    expect(projectCollectionLifecyclePolicy(watchTarget, makeHealth(watchTarget))).toMatchObject({
      policyClass: "MANUAL_ON_DEMAND",
      healthDirective: "OBSERVE_ONLY",
    });
    expect(
      projectCollectionLifecyclePolicy(retiredTarget, makeHealth(retiredTarget)),
    ).toMatchObject({
      policyClass: "RETIRED",
      healthDirective: "DISABLED",
    });
  });

  it("fails closed when supply health belongs to another coverage target", () => {
    const target = makeTarget();
    const mismatched = makeHealth(makeTarget({ id: "another-target" }));

    expect(() => projectCollectionLifecyclePolicy(target, mismatched)).toThrow(
      "source supply health target mismatch",
    );
  });
});
