import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import {
  SqliteCnipaDetailEnrichmentQueueRepository,
  cnipaDetailQueueCanonicalUri,
} from "@markorbit/persistence/cnipa-detail-enrichment-queue";
import type { CnipaDetailRawArtifactIngestionResult } from "@markorbit/persistence/cnipa-detail-ingestion";
import { DEFAULT_WORKSPACE, initializeRegistry } from "@markorbit/persistence";
import type {
  CnipaAuthenticatedSessionResponse,
} from "@markorbit/worker-runtime";
import type { CnipaAuthenticatedSessionExecutorFactory } from "@markorbit/worker-runtime/cnipa-artifact-acquirer";
import { processNextCnipaDetail } from "./cnipa-detail-worker";

function queueFixture(sourceRecordId = "detail-1") {
  const database = new DatabaseSync(":memory:");
  initializeRegistry(database);
  const queue = new SqliteCnipaDetailEnrichmentQueueRepository(
    database,
    () => new Date("2026-09-18T10:00:00.000Z"),
  );
  queue.admit({
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
  return { database, queue };
}

function response(input: Partial<CnipaAuthenticatedSessionResponse> = {}): CnipaAuthenticatedSessionResponse {
  return {
    status: 200,
    sourceUri:
      "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/pubnotice/portal/tmyyJudgment/queryInfo?id=detail-1",
    contentType: "application/json;charset=UTF-8",
    observedAt: "2026-09-18T10:00:05.000Z",
    body: new TextEncoder().encode(JSON.stringify({ code: 0, data: { id: "detail-1" } })),
    securityState: "OK",
    ...input,
  };
}

function factory(
  next: CnipaAuthenticatedSessionResponse | Error,
  close = vi.fn(async () => undefined),
): CnipaAuthenticatedSessionExecutorFactory {
  return {
    async create() {
      return {
        async execute() {
          if (next instanceof Error) throw next;
          return next;
        },
        close,
      };
    },
  };
}

function rawResult(id = "raw_detail_1", sha = "a".repeat(64)): CnipaDetailRawArtifactIngestionResult {
  return {
    artifact: {
      artifact: { id },
      contentObject: { sha256: sha },
    } as CnipaDetailRawArtifactIngestionResult["artifact"],
    sha256: sha,
  };
}

describe("CNIPA serial DETAIL worker", () => {
  it("fetches exactly one item, closes the source session, persists RawArtifact first, then marks FETCHED", async () => {
    const { queue } = queueFixture();
    const close = vi.fn(async () => undefined);
    const sink = vi.fn(async () => rawResult());
    const result = await processNextCnipaDetail({
      queue,
      workspaceId: DEFAULT_WORKSPACE.id,
      queueLeaseId: "detail-lease-1",
      sessionFactory: factory(response(), close),
      rawArtifactSink: sink,
      now: () => new Date("2026-09-18T10:00:00.000Z"),
    });

    expect(result?.outcome).toBe("FETCHED");
    expect(result?.record).toMatchObject({
      lifecycle: "FETCHED",
      attemptCount: 1,
      detailArtifactRef: "raw_detail_1",
      detailSha256: "a".repeat(64),
      leaseId: null,
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.invocationCallOrder[0]).toBeGreaterThan(close.mock.invocationCallOrder[0]!);
  });

  it("persists known transient business responses as RETRYABLE with bounded backoff", async () => {
    const { queue } = queueFixture();
    const result = await processNextCnipaDetail({
      queue,
      workspaceId: DEFAULT_WORKSPACE.id,
      queueLeaseId: "detail-lease-transient",
      sessionFactory: factory(
        response({
          body: new TextEncoder().encode(
            JSON.stringify({ code: -107, message: "temporary" }),
          ),
        }),
      ),
      rawArtifactSink: vi.fn(async () => rawResult()),
      now: () => new Date("2026-09-18T10:00:00.000Z"),
      retryPolicy: { retryBaseMs: 60_000, retryMaxMs: 60_000 },
    });

    expect(result?.record).toMatchObject({
      lifecycle: "RETRYABLE",
      attemptCount: 1,
      lastBusinessCode: -107,
      lastErrorCode: "CNIPA_SOURCE_TEMPORARY_FAILURE",
      nextAttemptAt: "2026-09-18T10:01:05.000Z",
    });
  });

  it("pauses the lane on authentication/security challenge without burning an attempt", async () => {
    const { queue } = queueFixture();
    const result = await processNextCnipaDetail({
      queue,
      workspaceId: DEFAULT_WORKSPACE.id,
      queueLeaseId: "detail-lease-auth",
      sessionFactory: factory(
        response({
          status: 401,
          securityState: "REAUTH_REQUIRED",
          body: new Uint8Array(),
        }),
      ),
      rawArtifactSink: vi.fn(async () => rawResult()),
      now: () => new Date("2026-09-18T10:00:00.000Z"),
    });

    expect(result?.pauseLane).toBe(true);
    expect(result?.record).toMatchObject({
      lifecycle: "PENDING",
      holdReason: "AUTH_SECURITY",
      attemptCount: 0,
      lastErrorCode: "CNIPA_REAUTH_REQUIRED",
      lastHttpStatus: 401,
    });
  });

  it("marks explicit 404 as permanently unavailable", async () => {
    const { queue } = queueFixture();
    const result = await processNextCnipaDetail({
      queue,
      workspaceId: DEFAULT_WORKSPACE.id,
      queueLeaseId: "detail-lease-404",
      sessionFactory: factory(response({ status: 404 })),
      rawArtifactSink: vi.fn(async () => rawResult()),
      now: () => new Date("2026-09-18T10:00:00.000Z"),
    });

    expect(result?.record).toMatchObject({
      lifecycle: "PERMANENTLY_UNAVAILABLE",
      attemptCount: 1,
      lastErrorCode: "CNIPA_SOURCE_REJECTED",
      lastHttpStatus: 404,
    });
  });

  it("does not silently mark an unclassified business failure as fetched", async () => {
    const { queue } = queueFixture();
    const sink = vi.fn(async () => rawResult());
    await expect(
      processNextCnipaDetail({
        queue,
        workspaceId: DEFAULT_WORKSPACE.id,
        queueLeaseId: "detail-lease-unknown",
        sessionFactory: factory(
          response({
            body: new TextEncoder().encode(JSON.stringify({ code: -999, message: "unknown" })),
          }),
        ),
        rawArtifactSink: sink,
        now: () => new Date("2026-09-18T10:00:00.000Z"),
      }),
    ).rejects.toThrow(/unclassified business code/i);
    expect(sink).not.toHaveBeenCalled();
    expect(
      queue.getByIdentity(
        DEFAULT_WORKSPACE.id,
        "OPPOSITION_DECISION",
        "detail-1",
      )?.lifecycle,
    ).toBe("LEASED");
  });

  it("does not mark FETCHED when RawArtifact persistence is uncertain", async () => {
    const { queue } = queueFixture();
    await expect(
      processNextCnipaDetail({
        queue,
        workspaceId: DEFAULT_WORKSPACE.id,
        queueLeaseId: "detail-lease-artifact",
        sessionFactory: factory(response()),
        rawArtifactSink: vi.fn(async () => {
          throw new Error("artifact persistence uncertain");
        }),
        now: () => new Date("2026-09-18T10:00:00.000Z"),
      }),
    ).rejects.toThrow(/artifact persistence uncertain/i);
    expect(
      queue.getByIdentity(
        DEFAULT_WORKSPACE.id,
        "OPPOSITION_DECISION",
        "detail-1",
      )?.lifecycle,
    ).toBe("LEASED");
  });

  it("returns null without opening a browser when no queue item is due", async () => {
    const { queue } = queueFixture();
    const claimed = queue.claimNext({
      workspaceId: DEFAULT_WORKSPACE.id,
      leaseId: "existing",
      now: "2026-09-18T10:00:00Z",
    });
    expect(claimed).not.toBeNull();
    const create = vi.fn();
    const result = await processNextCnipaDetail({
      queue,
      workspaceId: DEFAULT_WORKSPACE.id,
      queueLeaseId: "second",
      sessionFactory: { create } as unknown as CnipaAuthenticatedSessionExecutorFactory,
      rawArtifactSink: vi.fn(async () => rawResult()),
      now: () => new Date("2026-09-18T10:00:00.000Z"),
    });
    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});
