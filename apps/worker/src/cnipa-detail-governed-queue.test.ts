import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE,
  initializeRegistry,
} from "@markorbit/persistence";
import {
  SqliteCnipaDetailEnrichmentQueueRepository,
  cnipaDetailQueueCanonicalUri,
} from "@markorbit/persistence/cnipa-detail-enrichment-queue";
import { createGovernedCnipaDetailQueuePort } from "./cnipa-detail-governed-queue";

function fixture() {
  const database = new DatabaseSync(":memory:");
  initializeRegistry(database);
  const repository = new SqliteCnipaDetailEnrichmentQueueRepository(database);
  return { repository };
}

function admit(
  repository: SqliteCnipaDetailEnrichmentQueueRepository,
  sourceRecordId: string,
) {
  repository.admit({
    workspaceId: DEFAULT_WORKSPACE.id,
    documentKind: "OPPOSITION_DECISION",
    sourceRecordId,
    detailCanonicalUri: cnipaDetailQueueCanonicalUri(
      "OPPOSITION_DECISION",
      sourceRecordId,
    ),
    listArtifactRef: `artifact:list:${sourceRecordId}`,
    observedAt: "2026-09-18T09:00:00Z",
  });
}

describe("governed CNIPA DETAIL queue adapter", () => {
  it("returns a claimed record when lane governance admits a source request", () => {
    const { repository } = fixture();
    admit(repository, "record-a");
    const queue = createGovernedCnipaDetailQueuePort({
      repository,
      policy: {
        budgetWindowKey: "window-1",
        minIntervalMs: 60_000,
        maxRequestsPerBudgetWindow: 2,
      },
    });

    const claimed = queue.claimNext({
      workspaceId: DEFAULT_WORKSPACE.id,
      leaseId: "lease-1",
      now: "2026-09-18T10:00:00Z",
    });

    expect(claimed?.sourceRecordId).toBe("record-a");
    expect(queue.lastClaimDecision()).toMatchObject({
      status: "CLAIMED",
      requestCount: 1,
    });
  });

  it("returns null before worker session creation when pacing blocks the lane", () => {
    const { repository } = fixture();
    admit(repository, "record-a");
    admit(repository, "record-b");
    const queue = createGovernedCnipaDetailQueuePort({
      repository,
      policy: {
        budgetWindowKey: "window-1",
        minIntervalMs: 120_000,
        maxRequestsPerBudgetWindow: 10,
      },
    });

    expect(
      queue.claimNext({
        workspaceId: DEFAULT_WORKSPACE.id,
        leaseId: "lease-1",
        now: "2026-09-18T10:00:00Z",
      }),
    ).not.toBeNull();

    const blocked = queue.claimNext({
      workspaceId: DEFAULT_WORKSPACE.id,
      leaseId: "lease-2",
      now: "2026-09-18T10:01:00Z",
    });
    expect(blocked).toBeNull();
    expect(queue.lastClaimDecision()).toEqual({
      status: "PACING_BLOCKED",
      record: null,
      budgetWindowKey: "window-1",
      requestCount: 1,
      nextEligibleAt: "2026-09-18T10:02:00.000Z",
    });
  });

  it("returns null when the durable budget is exhausted", () => {
    const { repository } = fixture();
    admit(repository, "record-a");
    admit(repository, "record-b");
    const queue = createGovernedCnipaDetailQueuePort({
      repository,
      policy: {
        budgetWindowKey: "window-1",
        minIntervalMs: 0,
        maxRequestsPerBudgetWindow: 1,
      },
    });

    expect(
      queue.claimNext({
        workspaceId: DEFAULT_WORKSPACE.id,
        leaseId: "lease-1",
        now: "2026-09-18T10:00:00Z",
      }),
    ).not.toBeNull();

    const blocked = queue.claimNext({
      workspaceId: DEFAULT_WORKSPACE.id,
      leaseId: "lease-2",
      now: "2026-09-18T11:00:00Z",
    });
    expect(blocked).toBeNull();
    expect(queue.lastClaimDecision()).toEqual({
      status: "BUDGET_EXHAUSTED",
      record: null,
      budgetWindowKey: "window-1",
      requestCount: 1,
      nextEligibleAt: null,
    });
  });
});
