import { describe, expect, it } from "vitest";
import {
  buildCnipaGazetteOrchestrationNextBatchPlan,
  buildCnipaGazetteOrchestrationNextPreparation,
  cnipaGazetteOrchestrationPlanSha256,
  deriveCnipaGazetteOrchestrationProgress,
  expandCnipaGazetteOrchestrationIssues,
  expectedCnipaGazetteOrchestrationAuthorityToken,
  parseCnipaGazetteOrchestrationPlan,
  recordCnipaGazetteOrchestrationIssueEvidence,
  type CnipaGazetteOrchestrationPlan,
} from "./cnipa-gazette-orchestration-plan";

const WORKSPACE = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const BUNDLE_SHA = "a".repeat(64);
const DATASET_SHA = "b".repeat(64);
const STATE_73 = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const STATE_74 = "art_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const STATE_75 = "art_01ARZ3NDEKTSV4RRFFQ69G5FAX";
const RECEIPT_73 = "art_01ARZ3NDEKTSV4RRFFQ69G5FAY";
const RECEIPT_75 = "art_01ARZ3NDEKTSV4RRFFQ69G5FAZ";
const LOGICAL_1 = "art_01ARZ3NDEKTSV4RRFFQ69G5FB0";
const LOGICAL_2 = "art_01ARZ3NDEKTSV4RRFFQ69G5FB1";
const FIRST_RAW = "art_01ARZ3NDEKTSV4RRFFQ69G5FB2";
const FIRST_PROJECTION = "art_01ARZ3NDEKTSV4RRFFQ69G5FB3";
const PREVIOUS_PROJECTION = "art_01ARZ3NDEKTSV4RRFFQ69G5FB4";

function resumeFrom(stateArtifactId: string) {
  return {
    stateArtifactId,
    logicalProjectionArtifactIds: [LOGICAL_1, LOGICAL_2],
    firstSourceRawArtifactId: FIRST_RAW,
    firstSourceProjectionArtifactId: FIRST_PROJECTION,
    previousSourceProjectionArtifactId: PREVIOUS_PROJECTION,
  } as const;
}

function historicalPlan(): CnipaGazetteOrchestrationPlan {
  return parseCnipaGazetteOrchestrationPlan({
    version: 1,
    operationId: "historical-73-75-r1",
    workspaceId: WORKSPACE,
    authorityMode: "INTERNAL_SERVICE_GO_V1",
    stage: "MULTI_ISSUE_ORCHESTRATION",
    purpose: "HISTORICAL_BACKFILL",
    issueSelection: {
      mode: "RANGE",
      startIssue: 73,
      endIssue: 75,
    },
    announcementTypeSelection: "ALL",
    anncType: "",
    concurrency: 1,
    browserTemplate: {
      targetLogicalPagesPerCheckpoint: 10,
      maxRuntimeSeconds: 3600,
      captureToolVersion: "1.0.3",
      captureToolBundleName: "MO_CNIPA_Network_Capture_v1.0.3.zip",
      captureToolBundleSha256: BUNDLE_SHA,
    },
    dataEngineMutation: "DISABLED",
    historicalReplayActivated: true,
  });
}

function completedEvidence(
  announcementIssue: number,
  stateArtifactId: string,
  finalizeReceiptArtifactId: string,
) {
  return {
    announcementIssue,
    browser: {
      stateArtifactId,
      completed: true,
      nextSourcePageIndex: 7,
      rowsSeen: 576,
    },
    admission: {
      sourceDatasetSha256: DATASET_SHA,
      finalizeReceiptArtifactId,
    },
  } as const;
}

describe("CNIPA Gazette orchestration authority", () => {
  it("freezes a bounded historical range and exact GO token", () => {
    const plan = historicalPlan();
    expect(expandCnipaGazetteOrchestrationIssues(plan)).toEqual([73, 74, 75]);
    expect(plan.historicalReplayActivated).toBe(true);
    const sha = cnipaGazetteOrchestrationPlanSha256(plan);
    expect(sha).toMatch(/^[a-f0-9]{64}$/u);
    expect(expectedCnipaGazetteOrchestrationAuthorityToken(plan, sha)).toBe(
      `GO #898 CNIPA-GAZETTE-ORCHESTRATION historical-73-75-r1 MULTI_ISSUE_ORCHESTRATION ${sha}`,
    );
  });

  it("requires explicit historical replay authority for historical backfill", () => {
    const plan = historicalPlan();
    expect(() =>
      parseCnipaGazetteOrchestrationPlan({
        ...plan,
        historicalReplayActivated: false,
      }),
    ).toThrow(/historical backfill requires explicit historical replay/u);
  });

  it("rejects oversized historical mega-plans", () => {
    const plan = historicalPlan();
    expect(() =>
      parseCnipaGazetteOrchestrationPlan({
        ...plan,
        issueSelection: {
          mode: "RANGE",
          startIssue: 73,
          endIssue: 173,
        },
      }),
    ).toThrow(/at most 100 issues/u);
  });

  it("freezes incremental selection below observed max without widening to max", () => {
    const plan = parseCnipaGazetteOrchestrationPlan({
      version: 1,
      operationId: "incremental-1999-2000-r1",
      workspaceId: WORKSPACE,
      authorityMode: "INTERNAL_SERVICE_GO_V1",
      stage: "MULTI_ISSUE_ORCHESTRATION",
      purpose: "INCREMENTAL_CATCHUP",
      issueSelection: {
        mode: "EXPLICIT",
        issues: [1999, 2000],
      },
      observedMaxIssue: 2002,
      announcementTypeSelection: "ALL",
      anncType: "",
      concurrency: 1,
      browserTemplate: {
        targetLogicalPagesPerCheckpoint: 10,
        maxRuntimeSeconds: 3600,
        captureToolVersion: "1.0.3",
        captureToolBundleName: "MO_CNIPA_Network_Capture_v1.0.3.zip",
        captureToolBundleSha256: BUNDLE_SHA,
      },
      dataEngineMutation: "DISABLED",
      historicalReplayActivated: false,
    });
    expect(expandCnipaGazetteOrchestrationIssues(plan)).toEqual([1999, 2000]);
    expect(plan.observedMaxIssue).toBe(2002);
  });

  it("rejects incremental selection above observed max", () => {
    const plan = historicalPlan();
    expect(() =>
      parseCnipaGazetteOrchestrationPlan({
        ...plan,
        operationId: "incremental-over-max-r1",
        purpose: "INCREMENTAL_CATCHUP",
        issueSelection: { mode: "EXPLICIT", issues: [2000, 2001] },
        observedMaxIssue: 2000,
        historicalReplayActivated: false,
      }),
    ).toThrow(/exceed observedMaxIssue/u);
  });

  it("rejects duplicate or unordered explicit issues", () => {
    const plan = historicalPlan();
    expect(() =>
      parseCnipaGazetteOrchestrationPlan({
        ...plan,
        issueSelection: { mode: "EXPLICIT", issues: [73, 75, 74] },
      }),
    ).toThrow(/strictly ascending/u);
  });
});

describe("CNIPA Gazette orchestration progress", () => {
  it("does not silently skip an authority gap when later issues are complete", () => {
    const progress = deriveCnipaGazetteOrchestrationProgress({
      plan: historicalPlan(),
      evidence: [
        completedEvidence(73, STATE_73, RECEIPT_73),
        completedEvidence(75, STATE_75, RECEIPT_75),
      ],
    });

    expect(progress.counts).toEqual({
      total: 3,
      completed: 2,
      resume: 0,
      pending: 1,
    });
    expect(progress.nextIssue).toBe(74);
    expect(progress.issues).toEqual([
      expect.objectContaining({
        announcementIssue: 73,
        status: "COMPLETED",
        nextAction: "NONE",
      }),
      {
        announcementIssue: 74,
        status: "PENDING",
        nextAction: "START_CAPTURE",
      },
      expect.objectContaining({
        announcementIssue: 75,
        status: "COMPLETED",
        nextAction: "NONE",
      }),
    ]);
  });

  it("prioritizes durable partial capture as RESUME_CAPTURE", () => {
    const progress = deriveCnipaGazetteOrchestrationProgress({
      plan: historicalPlan(),
      evidence: [
        completedEvidence(73, STATE_73, RECEIPT_73),
        {
          announcementIssue: 74,
          browser: {
            stateArtifactId: STATE_74,
            completed: false,
            nextSourcePageIndex: 3,
            rowsSeen: 200,
            resumeFrom: resumeFrom(STATE_74),
          },
        },
      ],
    });

    expect(progress.nextIssue).toBe(74);
    expect(progress.issues[1]).toEqual({
      announcementIssue: 74,
      status: "RESUME",
      nextAction: "RESUME_CAPTURE",
      stateArtifactId: STATE_74,
    });
  });

  it("routes completed capture without finalize to BUILD_ADMISSION", () => {
    const progress = deriveCnipaGazetteOrchestrationProgress({
      plan: historicalPlan(),
      evidence: [
        {
          announcementIssue: 73,
          browser: {
            stateArtifactId: STATE_73,
            completed: true,
            nextSourcePageIndex: 7,
            rowsSeen: 576,
          },
        },
      ],
    });

    expect(progress.nextIssue).toBe(73);
    expect(progress.issues[0]).toEqual({
      announcementIssue: 73,
      status: "RESUME",
      nextAction: "BUILD_ADMISSION",
      stateArtifactId: STATE_73,
    });
  });

  it("rejects finalize evidence without completed browser evidence", () => {
    expect(() =>
      deriveCnipaGazetteOrchestrationProgress({
        plan: historicalPlan(),
        evidence: [
          {
            announcementIssue: 73,
            admission: {
              sourceDatasetSha256: DATASET_SHA,
              finalizeReceiptArtifactId: RECEIPT_73,
            },
          },
        ],
      }),
    ).toThrow(/finalized admission requires completed browser evidence/u);
  });

  it("rejects evidence outside frozen authority", () => {
    expect(() =>
      deriveCnipaGazetteOrchestrationProgress({
        plan: historicalPlan(),
        evidence: [
          {
            announcementIssue: 76,
            browser: {
              stateArtifactId: STATE_73,
              completed: false,
              nextSourcePageIndex: 2,
              rowsSeen: 100,
            },
          },
        ],
      }),
    ).toThrow(/outside frozen authority/u);
  });

  it("marks the plan complete only when every issue has finalized admission", () => {
    const progress = deriveCnipaGazetteOrchestrationProgress({
      plan: historicalPlan(),
      evidence: [
        completedEvidence(73, STATE_73, RECEIPT_73),
        completedEvidence(74, STATE_74, RECEIPT_73),
        completedEvidence(75, STATE_75, RECEIPT_75),
      ],
    });

    expect(progress.completed).toBe(true);
    expect(progress.nextIssue).toBeNull();
    expect(progress.counts).toEqual({
      total: 3,
      completed: 3,
      resume: 0,
      pending: 0,
    });
  });
});

describe("CNIPA Gazette orchestration next preparation", () => {
  it("builds one PREPARE_ONLY start plan for the first non-completed issue", () => {
    const result = buildCnipaGazetteOrchestrationNextPreparation({
      plan: historicalPlan(),
      evidence: [completedEvidence(73, STATE_73, RECEIPT_73)],
    });

    expect(result.next).not.toBeNull();
    expect(result.next).toMatchObject({
      announcementIssue: 74,
      status: "PENDING",
      nextAction: "START_CAPTURE",
    });
    expect(result.next?.browserPlan).toMatchObject({
      dispatchMode: "PREPARE_ONLY",
      announcementIssue: 74,
      operationId: "historical-73-75-r1-issue-74-start",
      historicalReplayActivated: false,
      maxRuntimeSeconds: 3600,
      captureToolVersion: "1.0.3",
    });
    expect(result.next?.browserPlan?.resumeFrom).toBeUndefined();
  });

  it("builds a deterministic resume browser plan from frozen resume refs", () => {
    const frozenResume = resumeFrom(STATE_74);
    const result = buildCnipaGazetteOrchestrationNextPreparation({
      plan: historicalPlan(),
      evidence: [
        completedEvidence(73, STATE_73, RECEIPT_73),
        {
          announcementIssue: 74,
          browser: {
            stateArtifactId: STATE_74,
            completed: false,
            nextSourcePageIndex: 3,
            rowsSeen: 200,
            resumeFrom: frozenResume,
          },
        },
      ],
    });

    expect(result.next).toMatchObject({
      announcementIssue: 74,
      status: "RESUME",
      nextAction: "RESUME_CAPTURE",
    });
    expect(result.next?.browserPlan).toMatchObject({
      dispatchMode: "PREPARE_ONLY",
      announcementIssue: 74,
      historicalReplayActivated: false,
      resumeFrom: frozenResume,
    });
    expect(result.next?.browserPlan?.operationId).toMatch(
      /^historical-73-75-r1-issue-74-resume-[a-f0-9]{12}$/u,
    );
  });

  it("does not create a browser plan when capture is complete and admission is pending", () => {
    const result = buildCnipaGazetteOrchestrationNextPreparation({
      plan: historicalPlan(),
      evidence: [
        {
          announcementIssue: 73,
          browser: {
            stateArtifactId: STATE_73,
            completed: true,
            nextSourcePageIndex: 7,
            rowsSeen: 576,
          },
        },
      ],
    });

    expect(result.next).toEqual({
      announcementIssue: 73,
      status: "RESUME",
      nextAction: "BUILD_ADMISSION",
      browserPlan: null,
    });
  });

  it("returns no next preparation after every authorized issue is finalized", () => {
    const result = buildCnipaGazetteOrchestrationNextPreparation({
      plan: historicalPlan(),
      evidence: [
        completedEvidence(73, STATE_73, RECEIPT_73),
        completedEvidence(74, STATE_74, RECEIPT_73),
        completedEvidence(75, STATE_75, RECEIPT_75),
      ],
    });

    expect(result.progress.completed).toBe(true);
    expect(result.next).toBeNull();
  });

  it("fails closed when partial browser evidence omits resume refs", () => {
    expect(() =>
      buildCnipaGazetteOrchestrationNextPreparation({
        plan: historicalPlan(),
        evidence: [
          {
            announcementIssue: 73,
            browser: {
              stateArtifactId: STATE_73,
              completed: false,
              nextSourcePageIndex: 2,
              rowsSeen: 100,
            },
          },
        ],
      }),
    ).toThrow(/partial browser progress requires frozen resumeFrom refs/u);
  });
});

describe("CNIPA Gazette orchestration evidence recording", () => {
  it("records durable partial progress monotonically and idempotently", () => {
    const partial = {
      announcementIssue: 74,
      browser: {
        stateArtifactId: STATE_74,
        completed: false,
        nextSourcePageIndex: 3,
        rowsSeen: 200,
        resumeFrom: resumeFrom(STATE_74),
      },
    } as const;
    const advancedState = "art_01ARZ3NDEKTSV4RRFFQ69G5FB5";
    const advanced = {
      announcementIssue: 74,
      browser: {
        stateArtifactId: advancedState,
        completed: false,
        nextSourcePageIndex: 4,
        rowsSeen: 300,
        resumeFrom: resumeFrom(advancedState),
      },
    } as const;

    const first = recordCnipaGazetteOrchestrationIssueEvidence({
      plan: historicalPlan(),
      existing: [completedEvidence(73, STATE_73, RECEIPT_73)],
      update: partial,
    });
    const duplicate = recordCnipaGazetteOrchestrationIssueEvidence({
      plan: historicalPlan(),
      existing: first,
      update: partial,
    });
    const next = recordCnipaGazetteOrchestrationIssueEvidence({
      plan: historicalPlan(),
      existing: duplicate,
      update: advanced,
    });

    expect(duplicate).toEqual(first);
    expect(next).toEqual([completedEvidence(73, STATE_73, RECEIPT_73), advanced]);

    expect(() =>
      recordCnipaGazetteOrchestrationIssueEvidence({
        plan: historicalPlan(),
        existing: next,
        update: partial,
      }),
    ).toThrow(/cannot move backwards/u);
  });

  it("allows completion and finalize to be recorded, then freezes finalized evidence", () => {
    const partial = {
      announcementIssue: 74,
      browser: {
        stateArtifactId: STATE_74,
        completed: false,
        nextSourcePageIndex: 3,
        rowsSeen: 200,
        resumeFrom: resumeFrom(STATE_74),
      },
    } as const;
    const finalState = "art_01ARZ3NDEKTSV4RRFFQ69G5FB6";
    const completed = {
      announcementIssue: 74,
      browser: {
        stateArtifactId: finalState,
        completed: true,
        nextSourcePageIndex: 7,
        rowsSeen: 576,
      },
    } as const;
    const finalized = {
      ...completed,
      admission: {
        sourceDatasetSha256: DATASET_SHA,
        finalizeReceiptArtifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FB7",
      },
    } as const;

    const afterPartial = recordCnipaGazetteOrchestrationIssueEvidence({
      plan: historicalPlan(),
      update: partial,
    });
    const afterCompleted = recordCnipaGazetteOrchestrationIssueEvidence({
      plan: historicalPlan(),
      existing: afterPartial,
      update: completed,
    });
    const afterFinalized = recordCnipaGazetteOrchestrationIssueEvidence({
      plan: historicalPlan(),
      existing: afterCompleted,
      update: finalized,
    });

    expect(afterFinalized).toEqual([finalized]);
    expect(() =>
      recordCnipaGazetteOrchestrationIssueEvidence({
        plan: historicalPlan(),
        existing: afterFinalized,
        update: {
          ...finalized,
          admission: {
            ...finalized.admission,
            sourceDatasetSha256: "c".repeat(64),
          },
        },
      }),
    ).toThrow(/finalized issue evidence is immutable/u);
  });
});

describe("CNIPA Gazette orchestration next batch proposal", () => {
  const completeHistoricalEvidence = [
    completedEvidence(73, STATE_73, RECEIPT_73),
    completedEvidence(74, STATE_74, RECEIPT_73),
    completedEvidence(75, STATE_75, RECEIPT_75),
  ] as const;

  it("builds a bounded historical child plan with parent-plan lineage", () => {
    const current = historicalPlan();
    const parentSha = cnipaGazetteOrchestrationPlanSha256(current);
    const result = buildCnipaGazetteOrchestrationNextBatchPlan({
      plan: current,
      evidence: completeHistoricalEvidence,
      batchSize: 3,
      historicalUpperBound: 80,
    });

    expect(result.parentPlanSha256).toBe(parentSha);
    expect(result.nextPlan).toMatchObject({
      purpose: "HISTORICAL_BACKFILL",
      issueSelection: {
        mode: "RANGE",
        startIssue: 76,
        endIssue: 78,
      },
      parentPlanSha256: parentSha,
      historicalReplayActivated: true,
    });
    expect(result.nextPlanSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.expectedAuthorityToken).toContain(
      "GO #898 CNIPA-GAZETTE-ORCHESTRATION gazette-historical-76-78-",
    );
  });

  it("refuses to build a child batch while the current batch is incomplete", () => {
    expect(() =>
      buildCnipaGazetteOrchestrationNextBatchPlan({
        plan: historicalPlan(),
        evidence: [completedEvidence(73, STATE_73, RECEIPT_73)],
        batchSize: 3,
        historicalUpperBound: 80,
      }),
    ).toThrow(/current batch must be fully finalized/u);
  });

  it("returns no child plan after the explicit historical upper bound is reached", () => {
    const result = buildCnipaGazetteOrchestrationNextBatchPlan({
      plan: historicalPlan(),
      evidence: completeHistoricalEvidence,
      batchSize: 3,
      historicalUpperBound: 75,
    });
    expect(result.nextPlan).toBeNull();
    expect(result.nextPlanSha256).toBeNull();
    expect(result.expectedAuthorityToken).toBeNull();
  });

  it("builds incremental children only within the frozen observed max", () => {
    const incremental = parseCnipaGazetteOrchestrationPlan({
      version: 1,
      operationId: "incremental-1999-2000-r1",
      workspaceId: WORKSPACE,
      authorityMode: "INTERNAL_SERVICE_GO_V1",
      stage: "MULTI_ISSUE_ORCHESTRATION",
      purpose: "INCREMENTAL_CATCHUP",
      issueSelection: { mode: "RANGE", startIssue: 1999, endIssue: 2000 },
      observedMaxIssue: 2002,
      announcementTypeSelection: "ALL",
      anncType: "",
      concurrency: 1,
      browserTemplate: historicalPlan().browserTemplate,
      dataEngineMutation: "DISABLED",
      historicalReplayActivated: false,
    });
    const evidence = [
      completedEvidence(1999, STATE_73, RECEIPT_73),
      completedEvidence(2000, STATE_74, RECEIPT_75),
    ];
    const result = buildCnipaGazetteOrchestrationNextBatchPlan({
      plan: incremental,
      evidence,
      batchSize: 10,
    });

    expect(result.nextPlan).toMatchObject({
      purpose: "INCREMENTAL_CATCHUP",
      issueSelection: {
        mode: "RANGE",
        startIssue: 2001,
        endIssue: 2002,
      },
      observedMaxIssue: 2002,
      historicalReplayActivated: false,
      parentPlanSha256: cnipaGazetteOrchestrationPlanSha256(incremental),
    });

    expect(() =>
      buildCnipaGazetteOrchestrationNextBatchPlan({
        plan: incremental,
        evidence,
        batchSize: 10,
        historicalUpperBound: 2100,
      }),
    ).toThrow(/cannot override frozen observedMaxIssue/u);
  });

  it("rejects malformed parent-plan lineage in frozen plans", () => {
    expect(() =>
      parseCnipaGazetteOrchestrationPlan({
        ...historicalPlan(),
        parentPlanSha256: "NOT-A-SHA",
      }),
    ).toThrow(/parentPlanSha256 must be lowercase SHA-256/u);
  });
});
