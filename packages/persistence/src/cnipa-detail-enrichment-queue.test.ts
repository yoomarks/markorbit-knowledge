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

function pointer(
  sourceRecordId: string,
  observedAt = "2026-09-18T08:00:00Z",
) {
  return {
    workspaceId: DEFAULT_WORKSPACE.id,
    documentKind: "OPPOSITION_DECISION" as const,
    sourceRecordId,
    detailCanonicalUri: cnipaDetailQueueCanonicalUri(
      "OPPOSITION_DECISION",
      sourceRecordId,
    ),
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

    const replay = repository.admit(
      pointer("record-2", "2026-09-18T09:00:00Z"),
    );
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

    const replay = repository.admit(
      pointer("record-3", "2026-09-18T08:00:00Z"),
    );
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

  it("isolates identical CNIPA source identity by workspace", () => {
    const { database, repository } = fixture();
    const otherWorkspace = new SqliteWorkspaceRepository(
      database,
      () => new Date("2026-09-18T08:00:00.000Z"),
      () => "wsp_cnipa_other",
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
