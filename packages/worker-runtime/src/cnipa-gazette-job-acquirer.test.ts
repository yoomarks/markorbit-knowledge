import { describe, expect, it } from "vitest";
import type { ArtifactBackedExecutionContext } from "./artifact-backed-collection-executor";
import {
  CNIPA_GAZETTE_JOB_CONNECTOR_ID,
  CNIPA_GAZETTE_JOB_CONNECTOR_VERSION,
  CnipaGazetteJobArtifactAcquirer,
  cnipaGazetteJobRuntimeDescriptor,
} from "./cnipa-gazette-job-acquirer";
import type {
  CnipaGazetteJsonTransport,
  CnipaGazetteJsonTransportResponse,
} from "./cnipa-gazette-page-acquirer";

const DATASET_ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";

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
    pageNo: index + 1,
    fileId: `file-${Math.floor(index / 5)}`,
    imgDir: `/group/page-${Math.floor(index / 5)}.jpg`,
    anncPageNum: 97,
  };
}

function payload(pageIndex: number, count: number) {
  return {
    code: 0,
    data: {
      list: Array.from({ length: count }, (_, index) => sourceRow((pageIndex - 1) * 100 + index)),
      total: 150,
      pages: 2,
      pageIndex,
      pageSize: 100,
    },
  };
}
class ScriptedTransport implements CnipaGazetteJsonTransport {
  readonly calls: Array<{ pageIndex: number; pageSize: number; anncType: unknown }> = [];

  constructor(private readonly pages: Map<number, unknown>) {}

  async postJson(input: {
    path: string;
    body: Readonly<Record<string, string | number>>;
  }): Promise<CnipaGazetteJsonTransportResponse> {
    const pageIndex = Number(input.body.pageIndex);
    this.calls.push({
      pageIndex,
      pageSize: Number(input.body.pageSize),
      anncType: input.body.anncType,
    });
    const page = this.pages.get(pageIndex);
    if (!page) throw new Error(`missing page ${pageIndex}`);
    return {
      httpStatus: 200,
      rawBody: new TextEncoder().encode(JSON.stringify(page)),
      observedAt: pageIndex === 1 ? "2026-09-19T08:00:00.000Z" : "2026-09-19T08:01:00.000Z",
      contentType: "application/json;charset=UTF-8",
    };
  }
}
function context(connectorConfig: Record<string, unknown>): ArtifactBackedExecutionContext {
  return {
    workerId: "wrk_fixture",
    leaseToken: "lease-token",
    lease: { id: "lse_fixture" },
    job: {
      connector: {
        connectorId: CNIPA_GAZETTE_JOB_CONNECTOR_ID,
        version: CNIPA_GAZETTE_JOB_CONNECTOR_VERSION,
      },
      sourceSnapshot: {
        sourceType: "API",
        connector: {
          connectorId: CNIPA_GAZETTE_JOB_CONNECTOR_ID,
          version: CNIPA_GAZETTE_JOB_CONNECTOR_VERSION,
        },
        connectorConfig,
        canonicalUri: "https://pub.sbj.cnipa.gov.cn",
      },
      planSnapshot: {
        policy: {
          retry: { maxAttempts: 3, backoffSeconds: 0 },
        },
        output: { artifactKinds: ["JSON"] },
      },
    },
  } as unknown as ArtifactBackedExecutionContext;
}

function firstConfig() {
  return {
    intent: "CHECKPOINT",
    announcementIssue: 75,
    range: { startPage: 1, endPage: 1 },
    requestTemplate: template,
    pagesPerCheckpoint: 1,
  };
}
function findArtifact(
  artifacts: Awaited<ReturnType<CnipaGazetteJobArtifactAcquirer["acquire"]>>,
  suffix: string,
) {
  const artifact = artifacts.find((item) => item.originalName.endsWith(suffix));
  if (!artifact) throw new Error(`missing artifact ending ${suffix}`);
  return artifact;
}

describe("CnipaGazetteJobArtifactAcquirer", () => {
  it("materializes first-checkpoint evidence through the durable CHUNK request boundary", async () => {
    const transport = new ScriptedTransport(new Map([[1, payload(1, 100)]]));
    const acquirer = new CnipaGazetteJobArtifactAcquirer({ transport });

    const artifacts = await acquirer.acquire(context(firstConfig()));

    expect(transport.calls).toEqual([{ pageIndex: 1, pageSize: 100, anncType: "" }]);
    expect(artifacts).toHaveLength(5);
    const raw = findArtifact(artifacts, "list-p1.json");
    const projection = findArtifact(artifacts, "projection-p1.json");
    const checkpoint = findArtifact(artifacts, "checkpoint-1-1.json");
    const identity = findArtifact(artifacts, "dataset-identity.json");
    const request = findArtifact(artifacts, "fact-admission-request.json");

    expect(projection.parentCanonicalUris).toEqual([raw.canonicalUri]);
    expect(checkpoint.parentCanonicalUris).toEqual([projection.canonicalUri]);
    expect(identity.parentCanonicalUris).toEqual([raw.canonicalUri, checkpoint.canonicalUri]);
    expect(request.parentCanonicalUris).toEqual(
      [identity.canonicalUri, checkpoint.canonicalUri].sort(),
    );
    expect(request.parentArtifactIds).toBeUndefined();
  });
  it("binds a later checkpoint request to the durable dataset RawArtifact id", async () => {
    const first = new CnipaGazetteJobArtifactAcquirer({
      transport: new ScriptedTransport(new Map([[1, payload(1, 100)]])),
    });
    const firstArtifacts = await first.acquire(context(firstConfig()));
    const identity = findArtifact(firstArtifacts, "dataset-identity.json");
    const snapshot = JSON.parse(new TextDecoder().decode(identity.content)) as Record<
      string,
      unknown
    >;

    const transport = new ScriptedTransport(new Map([[2, payload(2, 50)]]));
    const acquirer = new CnipaGazetteJobArtifactAcquirer({ transport });
    const artifacts = await acquirer.acquire(
      context({
        intent: "CHECKPOINT",
        announcementIssue: 75,
        range: { startPage: 2, endPage: 2 },
        requestTemplate: template,
        pagesPerCheckpoint: 1,
        datasetIdentityRef: {
          artifactId: DATASET_ARTIFACT_ID,
          canonicalUri: identity.canonicalUri,
          snapshot,
        },
      }),
    );

    expect(artifacts).toHaveLength(4);
    expect(artifacts.some((item) => item.originalName.endsWith("dataset-identity.json"))).toBe(
      false,
    );
    const checkpoint = findArtifact(artifacts, "checkpoint-2-2.json");
    const request = findArtifact(artifacts, "fact-admission-request.json");
    expect(request.parentCanonicalUris).toEqual([checkpoint.canonicalUri]);
    expect(request.parentArtifactIds).toEqual([DATASET_ARTIFACT_ID]);
  });
  it("rejects any non-ALL captured request template before transport", async () => {
    const transport = new ScriptedTransport(new Map());
    const acquirer = new CnipaGazetteJobArtifactAcquirer({ transport });

    await expect(
      acquirer.acquire(
        context({
          ...firstConfig(),
          requestTemplate: { ...template, anncType: "TMZCSQ" },
        }),
      ),
    ).rejects.toMatchObject({ code: "CNIPA_GAZETTE_JOB_CONFIG_INVALID" });
    expect(transport.calls).toEqual([]);
  });

  it("rejects a dataset snapshot whose canonical hash was altered", async () => {
    const first = new CnipaGazetteJobArtifactAcquirer({
      transport: new ScriptedTransport(new Map([[1, payload(1, 100)]])),
    });
    const firstArtifacts = await first.acquire(context(firstConfig()));
    const identity = findArtifact(firstArtifacts, "dataset-identity.json");
    const snapshot = JSON.parse(new TextDecoder().decode(identity.content)) as Record<
      string,
      unknown
    >;

    const acquirer = new CnipaGazetteJobArtifactAcquirer({
      transport: new ScriptedTransport(new Map()),
    });
    await expect(
      acquirer.acquire(
        context({
          intent: "CHECKPOINT",
          announcementIssue: 75,
          range: { startPage: 2, endPage: 2 },
          requestTemplate: template,
          datasetIdentityRef: {
            artifactId: DATASET_ARTIFACT_ID,
            canonicalUri: identity.canonicalUri,
            snapshot: { ...snapshot, sourceDatasetSha256: "a".repeat(64) },
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "CNIPA_GAZETTE_JOB_CONFIG_INVALID" });
  });

  it("rejects a source outside the governed CNIPA Gazette authority boundary", async () => {
    const input = context(firstConfig());
    input.job.sourceSnapshot.canonicalUri = "https://example.test";
    const acquirer = new CnipaGazetteJobArtifactAcquirer({
      transport: new ScriptedTransport(new Map()),
    });

    await expect(acquirer.acquire(input)).rejects.toMatchObject({
      code: "CNIPA_GAZETTE_SOURCE_BOUNDARY_INVALID",
    });
  });

  it("publishes a descriptor that keeps historical replay disabled", () => {
    expect(cnipaGazetteJobRuntimeDescriptor()).toMatchObject({
      connectorId: "cnipa-trademark-gazette",
      officialOrigin: "https://pub.sbj.cnipa.gov.cn",
      announcementTypeSelection: "ALL",
      pageSize: 100,
      requestDerivedFromImmutableJobSnapshot: true,
      rawSessionMaterialForbiddenInJobSnapshot: true,
      artifactBackedIngestionRequired: true,
      historicalReplayActivated: false,
    });
  });
});
