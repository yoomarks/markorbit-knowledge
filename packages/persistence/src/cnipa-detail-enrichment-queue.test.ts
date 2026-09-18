import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, initializeRegistry } from "./index";
import { SqliteWorkspaceRepository } from "./workspace-registry";
import {
  SqliteCnipaDetailEnrichmentQueueRepository,
  cnipaDetailQueueCanonicalUri,
} from "./cnipa-detail-enrichment-queue";

function fixture() {
  const database = new DatabaseSync(":memory:");
  initializeRegistry(database);
  let tick = 0;
  const repository = new SqliteCnipaDetailEnrichmentQueueRepository(
    database,
    () => new Date(`2026-09-18T09:0${tick++}:00.000Z`),
  );
  return { database, repository };
}

function pointer(sourceRecordId: string, observedAt = "2026-09-18T08:00:00Z") {
  return {
    workspaceId: DEFAULT_WORKSPACE.id,
    documentKind: "OPPOSITION_DECISION" as const,
    sourceRecordId,
    detailCanonicalUri: cnipaDetailQueueCanonicalUri("OPPOSITION_DECISION", sourceRecordId),
    listArtifactRef: `artifact:list:${sourceRecordId}:${observedAt}`,
    observedAt,
  };
}

describe("CNIPA DETAIL enrichment queue", () => {
  it("admits one durable PENDING item from a LIST-derived pointer", () => {
    const { repository } = fixture();
    const admitted = repository.admit(pointer("record-1"));
    expect(admitted).toMatchObject({
      workspaceId: DEFAULT_WORKSPACE.id,
      documentKind: "OPPOSITION_DECISION",
      sourceRecordId: "record-1",
      lifecycle: "PENDING",
      holdReason: null,
      attemptCount: 0,
      observationCount: 1,
      discoveredAt: "2026-09-18T08:00:00.000Z",
      lastObservedAt: "2026-09-18T08:00:00.000Z",
    });
    expect(admitted.firstListArtifactRef).toBe(admitted.lastListArtifactRef);
  });

  it("replays admission idempotently without resetting operational state", () => {
    const { database, repository } = fixture();
    repository.admit(pointer("record-2", "2026-09-18T08:00:00Z"));
    database
      .prepare(
        `UPDATE cnipa_detail_enrichment_queue
            SET lifecycle = 'RETRYABLE',
                attempt_count = 3,
                next_attempt_at = '2026-09-19T00:00:00.000Z',
                last_error_code = 'TEMP',
                detail_sha256 = ?,
                detail_artifact_ref = ?
          WHERE workspace_id = ? AND document_kind = ? AND source_record_id = ?`,
      )
      .run(
        "a".repeat(64),
        "artifact:detail:old",
        DEFAULT_WORKSPACE.id,
        "OPPOSITION_DECISION",
        "record-2",
      );

    const replay = repository.admit(pointer("record-2", "2026-09-18T09:00:00Z"));
    expect(replay.observationCount).toBe(2);
    expect(replay.discoveredAt).toBe("2026-09-18T08:00:00.000Z");
    expect(replay.lastObservedAt).toBe("2026-09-18T09:00:00.000Z");
    expect(replay.lifecycle).toBe("RETRYABLE");
    expect(replay.attemptCount).toBe(3);
    expect(replay.nextAttemptAt).toBe("2026-09-19T00:00:00.000Z");
    expect(replay.lastErrorCode).toBe("TEMP");
    expect(replay.detailSha256).toBe("a".repeat(64));
    expect(replay.detailArtifactRef).toBe("artifact:detail:old");
  });

  it("does not let an older replay replace the latest LIST provenance", () => {
    const { repository } = fixture();
    repository.admit(pointer("record-3", "2026-09-18T09:00:00Z"));
    const latestRef = repository.getByIdentity(
      DEFAULT_WORKSPACE.id,
      "OPPOSITION_DECISION",
      "record-3",
    )!.lastListArtifactRef;

    const replay = repository.admit(pointer("record-3", "2026-09-18T08:00:00Z"));
    expect(replay.lastObservedAt).toBe("2026-09-18T09:00:00.000Z");
    expect(replay.lastListArtifactRef).toBe(latestRef);
    expect(replay.observationCount).toBe(2);
  });

  it("rejects a DETAIL URI that does not match stable LIST identity", () => {
    const { repository } = fixture();
    expect(() =>
      repository.admit({
        ...pointer("record-4"),
        detailCanonicalUri:
          "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/pubnotice/portal/tmpsJudgment/queryInfo?id=record-4",
      }),
    ).toThrow(/does not match/i);
  });

  it("claims at most one eligible item and preserves serial ordering", () => {
    const { repository } = fixture();
    repository.admit(pointer("record-a", "2026-09-18T08:00:00Z"));
    repository.admit(pointer("record-b", "2026-09-18T08:01:00Z"));

    const first = repository.claimNext({
      workspaceId: DEFAULT_WORKSPACE.id,
      leaseId: "lease-1",
      now: "2026-09-18T09:00:00Z",
      leaseMs: 60_000,
    });
    expect(first).toMatchObject({
      sourceRecordId: "record-a",
      lifecycle: "LEASED",
      leaseId: "lease-1",
      leaseExpiresAt: "2026-09-18T09:01:00.000Z",
    });

    const second = repository.claimNext({
      workspaceId: DEFAULT_WORKSPACE.id,
      leaseId: "lease-2",
      now: "2026-09-18T09:00:00Z",
      leaseMs: 60_000,
    });
    expect(second?.sourceRecordId).toBe("record-b");
  });

  it("skips held and not-yet-due retry items", () => {
    const { database, repository } = fixture();
    repository.admit(pointer("held"));
    repository.admit(pointer("future", "2026-09-18T08:01:00Z"));
    database
      .prepare(
        `UPDATE cnipa_detail_enrichment_queue
            SET hold_reason = 'AUTH_SECURITY'
          WHERE source_record_id = 'held'`,
      )
      .run();
    database
      .prepare(
        `UPDATE cnipa_detail_enrichment_queue
            SET lifecycle = 'RETRYABLE', next_attempt_at = '2026-09-19T00:00:00.000Z'
          WHERE source_record_id = 'future'`,
      )
      .run();

    expect(
      repository.claimNext({
        workspaceId: DEFAULT_WORKSPACE.id,
        leaseId: "lease-none",
        now: "2026-09-18T09:00:00Z",
      }),
    ).toBeNull();
  });

  it("reclaims an expired lease and can claim it again without incrementing attempts", () => {
    const { repository } = fixture();
    repository.admit(pointer("expired"));
    repository.claimNext({
      workspaceId: DEFAULT_WORKSPACE.id,
      leaseId: "lease-old",
      now: "2026-09-18T09:00:00Z",
      leaseMs: 60_000,
    });

    const reclaimed = repository.claimNext({
      workspaceId: DEFAULT_WORKSPACE.id,
      leaseId: "lease-new",
      now: "2026-09-18T09:02:00Z",
      leaseMs: 60_000,
    });
    expect(reclaimed).toMatchObject({
      sourceRecordId: "expired",
      lifecycle: "LEASED",
      leaseId: "lease-new",
      attemptCount: 0,
      lastErrorCode: "CNIPA_DETAIL_LEASE_EXPIRED",
    });
  });

  it("persists a fetched transition only for the active lease and preserves LIST provenance", () => {
    const { repository } = fixture();
    const admitted = repository.admit(pointer("fetched"));
    const leased = repository.claimNext({
      workspaceId: DEFAULT_WORKSPACE.id,
      leaseId: "lease-fetched",
      now: "2026-09-18T09:00:00Z",
    })!;
    const persisted = repository.persistAttemptTransition({
      workspaceId: DEFAULT_WORKSPACE.id,
      documentKind: leased.documentKind,
      sourceRecordId: leased.sourceRecordId,
      expectedLeaseId: "lease-fetched",
      lifecycle: "FETCHED",
      holdReason: null,
      attemptCount: 1,
      lastAttemptAt: "2026-09-18T09:00:30Z",
      nextAttemptAt: null,
      lastErrorCode: null,
      lastHttpStatus: null,
      lastBusinessCode: null,
      lastSuccessAt: "2026-09-18T09:00:30Z",
      detailArtifactRef: "artifact:detail:fetched",
      detailSha256: "b".repeat(64),
    });
    expect(persisted).toMatchObject({
      lifecycle: "FETCHED",
      leaseId: null,
      attemptCount: 1,
      detailArtifactRef: "artifact:detail:fetched",
      detailSha256: "b".repeat(64),
      firstListArtifactRef: admitted.firstListArtifactRef,
      lastListArtifactRef: admitted.lastListArtifactRef,
      discoveredAt: admitted.discoveredAt,
      observationCount: admitted.observationCount,
    });
  });

  it("rejects stale lease writers after an attempt transition", () => {
    const { repository } = fixture();
    repository.admit(pointer("stale"));
    const leased = repository.claimNext({
      workspaceId: DEFAULT_WORKSPACE.id,
      leaseId: "lease-current",
      now: "2026-09-18T09:00:00Z",
    })!;
    repository.persistAttemptTransition({
      workspaceId: DEFAULT_WORKSPACE.id,
      documentKind: leased.documentKind,
      sourceRecordId: leased.sourceRecordId,
      expectedLeaseId: "lease-current",
      lifecycle: "RETRYABLE",
      holdReason: null,
      attemptCount: 1,
      lastAttemptAt: "2026-09-18T09:00:10Z",
      nextAttemptAt: "2026-09-18T09:05:10Z",
      lastErrorCode: "CNIPA_SOURCE_TEMPORARY_FAILURE",
      lastHttpStatus: 503,
      lastBusinessCode: null,
      lastSuccessAt: null,
      detailArtifactRef: null,
      detailSha256: null,
    });
    expect(() =>
      repository.persistAttemptTransition({
        workspaceId: DEFAULT_WORKSPACE.id,
        documentKind: leased.documentKind,
        sourceRecordId: leased.sourceRecordId,
        expectedLeaseId: "lease-current",
        lifecycle: "RETRYABLE",
        holdReason: null,
        attemptCount: 2,
        lastAttemptAt: "2026-09-18T09:00:20Z",
        nextAttemptAt: "2026-09-18T09:10:20Z",
        lastErrorCode: "TEMP",
        lastHttpStatus: null,
        lastBusinessCode: null,
        lastSuccessAt: null,
        detailArtifactRef: null,
        detailSha256: null,
      }),
    ).toThrow(/active queue lease/i);
  });

  it("persists auth/security hold without burning attempts and releases it explicitly", () => {
    const { repository } = fixture();
    repository.admit(pointer("auth"));
    const leased = repository.claimNext({
      workspaceId: DEFAULT_WORKSPACE.id,
      leaseId: "lease-auth",
      now: "2026-09-18T09:00:00Z",
    })!;
    const held = repository.persistAttemptTransition({
      workspaceId: DEFAULT_WORKSPACE.id,
      documentKind: leased.documentKind,
      sourceRecordId: leased.sourceRecordId,
      expectedLeaseId: "lease-auth",
      lifecycle: "PENDING",
      holdReason: "AUTH_SECURITY",
      attemptCount: 0,
      lastAttemptAt: "2026-09-18T09:00:05Z",
      nextAttemptAt: null,
      lastErrorCode: "CNIPA_REAUTH_REQUIRED",
      lastHttpStatus: 401,
      lastBusinessCode: null,
      lastSuccessAt: null,
      detailArtifactRef: null,
      detailSha256: null,
    });
    expect(held).toMatchObject({
      lifecycle: "PENDING",
      holdReason: "AUTH_SECURITY",
      leaseId: null,
      attemptCount: 0,
    });
    expect(
      repository.claimNext({
        workspaceId: DEFAULT_WORKSPACE.id,
        leaseId: "lease-blocked",
        now: "2026-09-18T10:00:00Z",
      }),
    ).toBeNull();

    const released = repository.releaseAuthSecurityHold({
      workspaceId: DEFAULT_WORKSPACE.id,
      documentKind: held.documentKind,
      sourceRecordId: held.sourceRecordId,
    });
    expect(released.holdReason).toBeNull();
    expect(released.attemptCount).toBe(0);
    expect(released.lastErrorCode).toBe("CNIPA_REAUTH_REQUIRED");
    expect(
      repository.claimNext({
        workspaceId: DEFAULT_WORKSPACE.id,
        leaseId: "lease-after-auth",
        now: "2026-09-18T10:00:00Z",
      })?.sourceRecordId,
    ).toBe("auth");
  });

  it("governed claim atomically reserves one request budget unit", () => {
    const { repository } = fixture();
    repository.admit(pointer("governed-a"));
    repository.admit(pointer("governed-b", "2026-09-18T08:01:00Z"));

    const claimed = repository.claimNextGoverned({
      workspaceId: DEFAULT_WORKSPACE.id,
      leaseId: "lease-governed-1",
      now: "2026-09-18T09:00:00Z",
      budgetWindowKey: "2026-09-18-asia-shanghai",
      minIntervalMs: 60_000,
      maxRequestsPerBudgetWindow: 2,
    });
    expect(claimed).toMatchObject({
      status: "CLAIMED",
      requestCount: 1,
      budgetWindowKey: "2026-09-18-asia-shanghai",
    });
    if (claimed.status !== "CLAIMED") return;
    expect(claimed.record.sourceRecordId).toBe("governed-a");
    expect(claimed.record.lifecycle).toBe("LEASED");
  });

  it("pacing block creates no queue lease and consumes no additional budget", () => {
    const { repository } = fixture();
    repository.admit(pointer("paced-a"));
    repository.admit(pointer("paced-b", "2026-09-18T08:01:00Z"));

    const first = repository.claimNextGoverned({
      workspaceId: DEFAULT_WORKSPACE.id,
      leaseId: "lease-paced-1",
      now: "2026-09-18T09:00:00Z",
      budgetWindowKey: "window-1",
      minIntervalMs: 120_000,
      maxRequestsPerBudgetWindow: 10,
    });
    expect(first.status).toBe("CLAIMED");

    const blocked = repository.claimNextGoverned({
      workspaceId: DEFAULT_WORKSPACE.id,
      leaseId: "lease-paced-2",
      now: "2026-09-18T09:01:00Z",
      budgetWindowKey: "window-1",
      minIntervalMs: 120_000,
      maxRequestsPerBudgetWindow: 10,
    });
    expect(blocked).toEqual({
      status: "PACING_BLOCKED",
      record: null,
      budgetWindowKey: "window-1",
      requestCount: 1,
      nextEligibleAt: "2026-09-18T09:02:00.000Z",
    });
    expect(
      repository.getByIdentity(
        DEFAULT_WORKSPACE.id,
        "OPPOSITION_DECISION",
        "paced-b",
      )?.lifecycle,
    ).toBe("PENDING");
  });

  it("durably exhausts the budget across repository restarts", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const firstRepository = new SqliteCnipaDetailEnrichmentQueueRepository(database);
    firstRepository.admit(pointer("budget-a"));
    firstRepository.admit(pointer("budget-b", "2026-09-18T08:01:00Z"));
    firstRepository.claimNextGoverned({
      workspaceId: DEFAULT_WORKSPACE.id,
      leaseId: "lease-budget-1",
      now: "2026-09-18T09:00:00Z",
      budgetWindowKey: "window-budget",
      minIntervalMs: 0,
      maxRequestsPerBudgetWindow: 1,
    });

    const restarted = new SqliteCnipaDetailEnrichmentQueueRepository(database);
    const blocked = restarted.claimNextGoverned({
      workspaceId: DEFAULT_WORKSPACE.id,
      leaseId: "lease-budget-2",
      now: "2026-09-18T10:00:00Z",
      budgetWindowKey: "window-budget",
      minIntervalMs: 0,
      maxRequestsPerBudgetWindow: 1,
    });
    expect(blocked).toEqual({
      status: "BUDGET_EXHAUSTED",
      record: null,
      budgetWindowKey: "window-budget",
      requestCount: 1,
      nextEligibleAt: null,
    });
    expect(
      restarted.getByIdentity(
        DEFAULT_WORKSPACE.id,
        "OPPOSITION_DECISION",
        "budget-b",
      )?.lifecycle,
    ).toBe("PENDING");
  });

  it("resets count for a new budget window while preserving global pacing", () => {
    const { repository } = fixture();
    repository.admit(pointer("window-a"));
    repository.admit(pointer("window-b", "2026-09-18T08:01:00Z"));
    repository.claimNextGoverned({
      workspaceId: DEFAULT_WORKSPACE.id,
      leaseId: "lease-window-1",
      now: "2026-09-18T09:00:00Z",
      budgetWindowKey: "window-old",
      minIntervalMs: 120_000,
      maxRequestsPerBudgetWindow: 1,
    });

    const paced = repository.claimNextGoverned({
      workspaceId: DEFAULT_WORKSPACE.id,
      leaseId: "lease-window-2",
      now: "2026-09-18T09:01:00Z",
      budgetWindowKey: "window-new",
      minIntervalMs: 120_000,
      maxRequestsPerBudgetWindow: 1,
    });
    expect(paced).toEqual({
      status: "PACING_BLOCKED",
      record: null,
      budgetWindowKey: "window-new",
      requestCount: 0,
      nextEligibleAt: "2026-09-18T09:02:00.000Z",
    });

    const claimed = repository.claimNextGoverned({
      workspaceId: DEFAULT_WORKSPACE.id,
      leaseId: "lease-window-3",
      now: "2026-09-18T09:02:00Z",
      budgetWindowKey: "window-new",
      minIntervalMs: 120_000,
      maxRequestsPerBudgetWindow: 1,
    });
    expect(claimed.status).toBe("CLAIMED");
    expect(claimed.requestCount).toBe(1);
  });

  it("does not consume budget when no due queue item exists", () => {
    const { repository } = fixture();
    const empty = repository.claimNextGoverned({
      workspaceId: DEFAULT_WORKSPACE.id,
      leaseId: "lease-empty-governed",
      now: "2026-09-18T09:00:00Z",
      budgetWindowKey: "window-empty",
      minIntervalMs: 0,
      maxRequestsPerBudgetWindow: 1,
    });
    expect(empty).toEqual({
      status: "EMPTY",
      record: null,
      budgetWindowKey: "window-empty",
      requestCount: 0,
      nextEligibleAt: null,
    });

    repository.admit(pointer("empty-later"));
    const claimed = repository.claimNextGoverned({
      workspaceId: DEFAULT_WORKSPACE.id,
      leaseId: "lease-empty-governed-2",
      now: "2026-09-18T09:00:01Z",
      budgetWindowKey: "window-empty",
      minIntervalMs: 0,
      maxRequestsPerBudgetWindow: 1,
    });
    expect(claimed.status).toBe("CLAIMED");
    expect(claimed.requestCount).toBe(1);
  });

  it("isolates identical CNIPA source identity by workspace", () => {
    const { database, repository } = fixture();
    const otherWorkspace = new SqliteWorkspaceRepository(
      database,
      () => new Date("2026-09-18T08:00:00.000Z"),
      () => "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAW",
    ).create({
      slug: "cnipa-other",
      name: "CNIPA Other",
    });

    repository.admit(pointer("same-id"));
    const second = repository.admit({
      ...pointer("same-id"),
      workspaceId: otherWorkspace.id,
    });
    expect(second.workspaceId).toBe(otherWorkspace.id);
    expect(repository.list(DEFAULT_WORKSPACE.id)).toHaveLength(1);
    expect(repository.list(otherWorkspace.id)).toHaveLength(1);
  });
});
