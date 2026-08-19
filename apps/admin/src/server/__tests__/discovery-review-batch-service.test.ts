import { describe, expect, it } from "vitest";
import { reviewDiscoveryCandidatesBatch } from "../discovery-review-batch-service";

describe("reviewDiscoveryCandidatesBatch", () => {
  it("reviews every candidate before dispatching once per shared Source/default plan", () => {
    const events: string[] = [];
    const result = reviewDiscoveryCandidatesBatch(
      {
        candidateIds: ["cand_a", "cand_b"],
        decision: "ACCEPTED",
        reviewer: "operator-test",
        startCollection: true,
      },
      {
        workflow: {
          review(candidateId) {
            events.push(`review:${candidateId}`);
            return {
              candidate: {} as never,
              source: { id: "src_shared" } as never,
              plan: { id: "pln_shared" } as never,
            };
          },
        },
        collection: {
          authorizeAndDispatch(candidateId) {
            events.push(`dispatch:${candidateId}`);
            expect(events).toEqual(["review:cand_a", "review:cand_b", "dispatch:cand_a"]);
            return {
              candidate: {} as never,
              source: { id: "src_shared" } as never,
              plan: { id: "pln_shared" } as never,
              run: { id: "run_shared" } as never,
              jobs: [],
              replayed: false,
            };
          },
        },
      },
    );

    expect(result.items).toEqual([
      {
        candidateId: "cand_a",
        status: "ACCEPTED",
        sourceId: "src_shared",
        planId: "pln_shared",
        runId: "run_shared",
        replayed: false,
      },
      {
        candidateId: "cand_b",
        status: "ACCEPTED",
        sourceId: "src_shared",
        planId: "pln_shared",
        runId: "run_shared",
        replayed: false,
      },
    ]);
    expect(result.summary).toEqual({
      requested: 2,
      succeeded: 2,
      failed: 0,
      collectionStarted: 1,
      collectionDeferred: 0,
    });
  });

  it("dispatches distinct Source/default-plan groups separately and does not count replays", () => {
    const dispatches: string[] = [];
    const result = reviewDiscoveryCandidatesBatch(
      {
        candidateIds: ["cand_a", "cand_b", "cand_c"],
        decision: "ACCEPTED",
        reviewer: "operator-test",
        startCollection: true,
      },
      {
        workflow: {
          review(candidateId) {
            const shared = candidateId !== "cand_c";
            return {
              candidate: {} as never,
              source: { id: shared ? "src_shared" : "src_other" } as never,
              plan: { id: shared ? "pln_shared" : "pln_other" } as never,
            };
          },
        },
        collection: {
          authorizeAndDispatch(candidateId) {
            dispatches.push(candidateId);
            const replayed = candidateId === "cand_c";
            return {
              candidate: {} as never,
              source: {} as never,
              plan: {} as never,
              run: { id: replayed ? "run_prior" : "run_new" } as never,
              jobs: [],
              replayed,
            };
          },
        },
      },
    );

    expect(dispatches).toEqual(["cand_a", "cand_c"]);
    expect(result.summary.collectionStarted).toBe(1);
    expect(result.summary.collectionDeferred).toBe(0);
    expect(result.items[1]).toMatchObject({ runId: "run_new", replayed: false });
    expect(result.items[2]).toMatchObject({ runId: "run_prior", replayed: true });
  });

  it("accepts Radar onboarding into Sources but defers collection even when the client requests it", () => {
    let dispatchCount = 0;
    const result = reviewDiscoveryCandidatesBatch(
      {
        candidateIds: ["cand_radar"],
        decision: "ACCEPTED",
        reviewer: "admin-console",
        startCollection: true,
      },
      {
        workflow: {
          review() {
            return {
              candidate: {
                candidate: {
                  metadata: {
                    radarIntake: { origin: "RADAR_CODEX_ONBOARDING" },
                  },
                },
              } as never,
              source: { id: "src_radar" } as never,
              plan: { id: "pln_radar" } as never,
            };
          },
        },
        collection: {
          authorizeAndDispatch() {
            dispatchCount += 1;
            throw new Error("Radar approval must not authorize collection");
          },
        },
      },
    );

    expect(dispatchCount).toBe(0);
    expect(result.items).toEqual([
      {
        candidateId: "cand_radar",
        status: "ACCEPTED",
        sourceId: "src_radar",
        planId: "pln_radar",
        collectionDeferred: true,
      },
    ]);
    expect(result.summary).toEqual({
      requested: 1,
      succeeded: 1,
      failed: 0,
      collectionStarted: 0,
      collectionDeferred: 1,
    });
  });

  it("accepts production validation candidates but requires separate collection authorization", () => {
    let dispatchCount = 0;
    const result = reviewDiscoveryCandidatesBatch(
      {
        candidateIds: ["cand_wave1"],
        decision: "ACCEPTED",
        reviewer: "admin-console",
        startCollection: true,
      },
      {
        workflow: {
          review() {
            return {
              candidate: {
                candidate: {
                  metadata: {
                    productionValidation: {
                      waveId: "official-wave-1",
                      targetId: "us-uspto-trademarks",
                      collectionAuthorizationRequired: true,
                      noAutomaticProductionScheduling: true,
                    },
                  },
                },
              } as never,
              source: { id: "src_uspto" } as never,
              plan: { id: "pln_uspto" } as never,
            };
          },
        },
        collection: {
          authorizeAndDispatch() {
            dispatchCount += 1;
            throw new Error("Production validation review must not authorize collection");
          },
        },
      },
    );

    expect(dispatchCount).toBe(0);
    expect(result.items).toEqual([
      {
        candidateId: "cand_wave1",
        status: "ACCEPTED",
        sourceId: "src_uspto",
        planId: "pln_uspto",
        collectionDeferred: true,
      },
    ]);
    expect(result.summary).toEqual({
      requested: 1,
      succeeded: 1,
      failed: 0,
      collectionStarted: 0,
      collectionDeferred: 1,
    });
  });

  it("never dispatches rejected reviews", () => {
    let dispatchCount = 0;
    const result = reviewDiscoveryCandidatesBatch(
      {
        candidateIds: ["cand_a", "cand_b"],
        decision: "REJECTED",
        reviewer: "operator-test",
        startCollection: false,
      },
      {
        workflow: {
          review() {
            return { candidate: {} as never };
          },
        },
        collection: {
          authorizeAndDispatch() {
            dispatchCount += 1;
            throw new Error("should not dispatch");
          },
        },
      },
    );

    expect(dispatchCount).toBe(0);
    expect(result.items.map((item) => item.status)).toEqual(["REJECTED", "REJECTED"]);
    expect(result.summary.collectionStarted).toBe(0);
    expect(result.summary.collectionDeferred).toBe(0);
  });
});
