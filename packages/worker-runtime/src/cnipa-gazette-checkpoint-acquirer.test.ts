import { describe, expect, it } from "vitest";
import {
  acquireCnipaGazetteCheckpointRange,
  CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_SCHEMA,
  type CnipaGazetteCheckpointRetryPolicy,
} from "./cnipa-gazette-checkpoint-acquirer";
import type {
  CnipaGazetteJsonTransport,
  CnipaGazetteJsonTransportResponse,
} from "./cnipa-gazette-page-acquirer";

function sourceRow(index: number) {
  const id = `row-${index}`;
  return {
    id,
    searchId: id,
    anncIssue: "75",
    anncDate: "1983-08-15",
    anncType: "TMZCSQ",
    anncTypeName: "商标初步审定公告",
    regNo: String(200000 + index),
    pageNo: 1,
    fileId: "file-1",
    imgDir: "/group/1983/75/page1.jpg",
    anncPageNum: 100,
  };
}

function payload(pageIndex: number, sourceTotal: number, sourcePages: number, count: number) {
  return {
    code: 0,
    data: {
      list: Array.from({ length: count }, (_, i) => sourceRow((pageIndex - 1) * 100 + i)),
      total: sourceTotal,
      pages: sourcePages,
      pageIndex,
      pageSize: 100,
    },
  };
}

class ScriptedTransport implements CnipaGazetteJsonTransport {
  readonly calls: number[] = [];
  constructor(private readonly script: Map<number, Array<{ status?: number; payload: unknown }>>) {}

  async postJson(input: {
    path: string;
    body: Readonly<Record<string, string | number>>;
  }): Promise<CnipaGazetteJsonTransportResponse> {
    const pageIndex = Number(input.body.pageIndex);
    this.calls.push(pageIndex);
    const queue = this.script.get(pageIndex);
    const next = queue?.shift();
    if (!next) throw new Error(`missing scripted response for page ${pageIndex}`);
    return {
      httpStatus: next.status ?? 200,
      rawBody: new TextEncoder().encode(JSON.stringify(next.payload)),
      observedAt: "2026-09-19T06:48:37.552Z",
      contentType: "application/json;charset=UTF-8",
    };
  }
}

const template = {
  anncIssue: "75",
  anncType: "",
  regNo: "",
  tmName: "",
  intlCls: "",
  registerCnName: "",
  coowner: "",
  agentName: "",
  tmType: "",
  tmDescType: "0",
  startDate: "",
  endDate: "",
  pageIndex: 1,
  pageSize: 10,
};

describe("CNIPA Gazette checkpoint acquirer", () => {
  it("discovers source metadata on first range and emits page lineage + checkpoint manifest", async () => {
    const transport = new ScriptedTransport(
      new Map([
        [1, [{ payload: payload(1, 250, 3, 100) }]],
        [2, [{ payload: payload(2, 250, 3, 100) }]],
      ]),
    );

    const result = await acquireCnipaGazetteCheckpointRange({
      announcementIssue: 75,
      range: { startPage: 1, endPage: 2 },
      requestTemplate: template,
      transport,
      pagesPerCheckpoint: 2,
    });

    expect(result.checkpoint).toMatchObject({
      announcementIssue: 75,
      sourceTotal: 250,
      sourcePages: 3,
      announcementDate: "1983-08-15",
      range: { startPage: 1, endPage: 2 },
      rowCount: 200,
      completeness: "RANGE_COMPLETE",
    });
    expect(result.plannedRanges).toEqual([
      { startPage: 1, endPage: 2 },
      { startPage: 3, endPage: 3 },
    ]);
    expect(result.pageArtifacts).toHaveLength(4);
    expect(result.checkpointArtifact.parentCanonicalUris).toEqual([
      "cnipa://trademark-gazette/issue/75/list/page/1/projection",
      "cnipa://trademark-gazette/issue/75/list/page/2/projection",
    ]);

    const manifest = JSON.parse(
      new TextDecoder().decode(result.checkpointArtifact.content),
    ) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      schemaVersion: CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_SCHEMA,
      sourceOwner: "MARKORBIT_KNOWLEDGE",
      queryScope: {
        announcementTypeSelection: "ALL",
        anncType: "",
      },
      announcementIssue: 75,
      sourceTotal: 250,
      sourcePages: 3,
      announcementDate: "1983-08-15",
    });
  });

  it("acquires a later range only with frozen source metadata", async () => {
    const transport = new ScriptedTransport(new Map([[3, [{ payload: payload(3, 250, 3, 50) }]]]));

    const result = await acquireCnipaGazetteCheckpointRange({
      announcementIssue: 75,
      range: { startPage: 3, endPage: 3 },
      requestTemplate: template,
      transport,
      expectedSourceTotal: 250,
      expectedSourcePages: 3,
      expectedAnnouncementDate: "1983-08-15",
    });

    expect(result.checkpoint.rowCount).toBe(50);
    expect(transport.calls).toEqual([3]);
  });

  it("retries only retryable source failures", async () => {
    const transport = new ScriptedTransport(
      new Map([[1, [{ payload: { code: -102 } }, { payload: payload(1, 100, 1, 100) }]]]),
    );
    const slept: number[] = [];
    const retry: CnipaGazetteCheckpointRetryPolicy = {
      maxAttempts: 3,
      retryDelayMs: 7,
      sleep: async (ms) => {
        slept.push(ms);
      },
    };

    const result = await acquireCnipaGazetteCheckpointRange({
      announcementIssue: 75,
      range: { startPage: 1, endPage: 1 },
      requestTemplate: template,
      transport,
      retry,
    });

    expect(result.checkpoint.rowCount).toBe(100);
    expect(transport.calls).toEqual([1, 1]);
    expect(slept).toEqual([7]);
  });

  it("does not retry auth/session expiry", async () => {
    const transport = new ScriptedTransport(new Map([[1, [{ payload: { code: 401 } }]]]));
    const slept: number[] = [];

    await expect(
      acquireCnipaGazetteCheckpointRange({
        announcementIssue: 75,
        range: { startPage: 1, endPage: 1 },
        requestTemplate: template,
        transport,
        retry: {
          maxAttempts: 3,
          retryDelayMs: 10,
          sleep: async (ms) => {
            slept.push(ms);
          },
        },
      }),
    ).rejects.toMatchObject({ code: "CNIPA_GAZETTE_AUTH_EXPIRED", retryable: false });

    expect(transport.calls).toEqual([1]);
    expect(slept).toEqual([]);
  });

  it("fails closed when source totals drift between ranges", async () => {
    const transport = new ScriptedTransport(new Map([[3, [{ payload: payload(3, 251, 3, 51) }]]]));

    await expect(
      acquireCnipaGazetteCheckpointRange({
        announcementIssue: 75,
        range: { startPage: 3, endPage: 3 },
        requestTemplate: template,
        transport,
        expectedSourceTotal: 250,
        expectedSourcePages: 3,
        expectedAnnouncementDate: "1983-08-15",
      }),
    ).rejects.toThrow(/drifted/);
  });

  it("requires expected metadata for non-first checkpoints", async () => {
    const transport = new ScriptedTransport(new Map());

    await expect(
      acquireCnipaGazetteCheckpointRange({
        announcementIssue: 75,
        range: { startPage: 2, endPage: 2 },
        requestTemplate: template,
        transport,
      }),
    ).rejects.toThrow(/non-first checkpoint requires expected source total\/pages/);
  });

  it("rejects oversized ranges and discovered range overflow", async () => {
    const transport = new ScriptedTransport(new Map([[1, [{ payload: payload(1, 100, 1, 100) }]]]));

    await expect(
      acquireCnipaGazetteCheckpointRange({
        announcementIssue: 75,
        range: { startPage: 1, endPage: 101 },
        requestTemplate: template,
        transport,
      }),
    ).rejects.toThrow(/cannot exceed 100 pages/);

    await expect(
      acquireCnipaGazetteCheckpointRange({
        announcementIssue: 75,
        range: { startPage: 1, endPage: 2 },
        requestTemplate: template,
        transport,
      }),
    ).rejects.toThrow(/exceeds discovered sourcePages=1/);
  });
});
