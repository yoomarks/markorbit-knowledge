import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  AcquiredCollectionArtifact,
  ArtifactBackedExecutionContext,
} from "./artifact-backed-collection-executor";
import {
  CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_ID,
  CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_VERSION,
  CNIPA_GAZETTE_FINALIZE_JOB_SOURCE,
  CnipaGazetteFinalizeJobAcquirer,
  cnipaGazetteFinalizeJobRuntimeDescriptor,
} from "./cnipa-gazette-finalize-job-acquirer";
import {
  buildCnipaGazetteFactAdmissionReceiptArtifact,
  parseCnipaGazetteFactAdmissionRequestArtifact,
} from "./cnipa-gazette-fact-admission-artifacts";
import {
  CNIPA_GAZETTE_JOB_CONNECTOR_ID,
  CNIPA_GAZETTE_JOB_CONNECTOR_VERSION,
  CnipaGazetteJobArtifactAcquirer,
} from "./cnipa-gazette-job-acquirer";
import type {
  CnipaGazetteJsonTransport,
  CnipaGazetteJsonTransportResponse,
} from "./cnipa-gazette-page-acquirer";
import type { CnipaGazetteDurableArtifactReference } from "./cnipa-gazette-fact-admission-job-acquirer";

const IDENTITY_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const RECEIPT_1_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const RECEIPT_2_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAX";
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
  return {
    id: `row-${index}`,
    searchId: `row-${index}`,
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
  constructor(private readonly pages: Map<number, unknown>) {}

  async postJson(input: {
    path: string;
    body: Readonly<Record<string, string | number>>;
  }): Promise<CnipaGazetteJsonTransportResponse> {
    const pageIndex = Number(input.body.pageIndex);
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
function acquisitionContext(
  connectorConfig: Record<string, unknown>,
): ArtifactBackedExecutionContext {
  return {
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
        policy: { retry: { maxAttempts: 1, backoffSeconds: 0 } },
        output: { artifactKinds: ["JSON"] },
      },
    },
  } as unknown as ArtifactBackedExecutionContext;
}

function artifactBySuffix(artifacts: readonly AcquiredCollectionArtifact[], suffix: string) {
  const artifact = artifacts.find((item) => item.originalName.endsWith(suffix));
  if (!artifact) throw new Error(`missing ${suffix}`);
  return artifact;
}
function ref(
  artifactId: string,
  artifact: AcquiredCollectionArtifact,
): CnipaGazetteDurableArtifactReference {
  return {
    artifactId,
    canonicalUri: artifact.canonicalUri!,
    sha256: createHash("sha256").update(artifact.content).digest("hex"),
    sizeBytes: artifact.content.byteLength,
  };
}

function finalizeContext(
  datasetIdentityRef: CnipaGazetteDurableArtifactReference,
  chunkReceiptRefs: CnipaGazetteDurableArtifactReference[],
): ArtifactBackedExecutionContext {
  return {
    job: {
      connector: {
        connectorId: CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_ID,
        version: CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_VERSION,
      },
      sourceSnapshot: {
        sourceType: "DATABASE",
        connector: {
          connectorId: CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_ID,
          version: CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_VERSION,
        },
        connectorConfig: {
          intent: "BUILD_FINALIZE_REQUEST",
          datasetIdentityRef,
          chunkReceiptRefs,
        },
        canonicalUri: CNIPA_GAZETTE_FINALIZE_JOB_SOURCE,
      },
      planSnapshot: { output: { artifactKinds: ["JSON"] } },
    },
  } as unknown as ArtifactBackedExecutionContext;
}
async function durableFixture() {
  const firstAcquirer = new CnipaGazetteJobArtifactAcquirer({
    transport: new ScriptedTransport(new Map([[1, payload(1, 100)]])),
  });
  const first = await firstAcquirer.acquire(
    acquisitionContext({
      intent: "CHECKPOINT",
      announcementIssue: 75,
      range: { startPage: 1, endPage: 1 },
      requestTemplate: template,
      pagesPerCheckpoint: 1,
    }),
  );
  const identity = artifactBySuffix(first, "dataset-identity.json");
  const chunk1 = artifactBySuffix(first, "fact-admission-request.json");
  const snapshot = JSON.parse(new TextDecoder().decode(identity.content)) as Record<
    string,
    unknown
  >;

  const secondAcquirer = new CnipaGazetteJobArtifactAcquirer({
    transport: new ScriptedTransport(new Map([[2, payload(2, 50)]])),
  });
  const second = await secondAcquirer.acquire(
    acquisitionContext({
      intent: "CHECKPOINT",
      announcementIssue: 75,
      range: { startPage: 2, endPage: 2 },
      requestTemplate: template,
      pagesPerCheckpoint: 1,
      datasetIdentityRef: {
        artifactId: IDENTITY_ID,
        canonicalUri: identity.canonicalUri,
        snapshot,
      },
    }),
  );
  const chunk2 = artifactBySuffix(second, "fact-admission-request.json");
  const receipt1 = buildCnipaGazetteFactAdmissionReceiptArtifact({
    requestArtifact: chunk1,
    receipt: {
      outcome: "CHUNK_ADMITTED",
      announcement_issue: 75,
      source_dataset_sha256: snapshot.sourceDatasetSha256 as string,
      range_start_page: 1,
      range_end_page: 1,
    },
    observedAt: "2026-09-19T08:03:00.000Z",
  });
  const receipt2 = buildCnipaGazetteFactAdmissionReceiptArtifact({
    requestArtifact: chunk2,
    receipt: {
      outcome: "CHUNK_ADMITTED",
      announcement_issue: 75,
      source_dataset_sha256: snapshot.sourceDatasetSha256 as string,
      range_start_page: 2,
      range_end_page: 2,
    },
    observedAt: "2026-09-19T08:04:00.000Z",
  });
  return { identity, receipt1, receipt2 };
}

function readerFrom(entries: Array<[string, AcquiredCollectionArtifact]>) {
  const artifacts = new Map(entries);
  return {
    async read(artifactId: string) {
      const artifact = artifacts.get(artifactId);
      if (!artifact) throw new Error(`missing durable artifact ${artifactId}`);
      return artifact;
    },
  };
}
describe("CnipaGazetteFinalizeJobAcquirer", () => {
  it("builds FINALIZE only after durable CHUNK receipts cover every source page", async () => {
    const { identity, receipt1, receipt2 } = await durableFixture();
    const identityRef = ref(IDENTITY_ID, identity);
    const receipt1Ref = ref(RECEIPT_1_ID, receipt1);
    const receipt2Ref = ref(RECEIPT_2_ID, receipt2);
    const acquirer = new CnipaGazetteFinalizeJobAcquirer({
      reader: readerFrom([
        [IDENTITY_ID, identity],
        [RECEIPT_1_ID, receipt1],
        [RECEIPT_2_ID, receipt2],
      ]),
    });

    const artifacts = await acquirer.acquire(
      finalizeContext(identityRef, [receipt2Ref, receipt1Ref]),
    );

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.parentCanonicalUris).toBeUndefined();
    expect(artifacts[0]?.parentArtifactIds).toEqual(
      [IDENTITY_ID, RECEIPT_1_ID, RECEIPT_2_ID].sort(),
    );
    expect(parseCnipaGazetteFactAdmissionRequestArtifact(artifacts[0]!)).toMatchObject({
      operation: "FINALIZE",
      announcementIssue: 75,
      pageCount: 2,
    });
  });
  it("fails closed when committed receipt coverage stops before the source page count", async () => {
    const { identity, receipt1 } = await durableFixture();
    const acquirer = new CnipaGazetteFinalizeJobAcquirer({
      reader: readerFrom([
        [IDENTITY_ID, identity],
        [RECEIPT_1_ID, receipt1],
      ]),
    });

    await expect(
      acquirer.acquire(finalizeContext(ref(IDENTITY_ID, identity), [ref(RECEIPT_1_ID, receipt1)])),
    ).rejects.toMatchObject({
      code: "CNIPA_GAZETTE_FINALIZE_READINESS_INVALID",
      retryable: false,
    });
  });

  it("fails before readiness evaluation when a durable receipt no longer matches its SHA", async () => {
    const { identity, receipt1, receipt2 } = await durableFixture();
    const receipt2Ref = ref(RECEIPT_2_ID, receipt2);
    const altered = {
      ...receipt2,
      content: new TextEncoder().encode(
        new TextDecoder().decode(receipt2.content).replace('"observedAt":', '"changedAt":'),
      ),
    };
    const acquirer = new CnipaGazetteFinalizeJobAcquirer({
      reader: readerFrom([
        [IDENTITY_ID, identity],
        [RECEIPT_1_ID, receipt1],
        [RECEIPT_2_ID, altered],
      ]),
    });
    await expect(
      acquirer.acquire(
        finalizeContext(ref(IDENTITY_ID, identity), [ref(RECEIPT_1_ID, receipt1), receipt2Ref]),
      ),
    ).rejects.toMatchObject({
      code: "CNIPA_GAZETTE_FINALIZE_DURABLE_ARTIFACT_MISMATCH",
      retryable: false,
    });
  });

  it("rejects duplicate RawArtifact references in the readiness set", async () => {
    const { identity, receipt1 } = await durableFixture();
    const receipt = ref(RECEIPT_1_ID, receipt1);
    const acquirer = new CnipaGazetteFinalizeJobAcquirer({
      reader: readerFrom([]),
    });

    await expect(
      acquirer.acquire(finalizeContext(ref(IDENTITY_ID, identity), [receipt, { ...receipt }])),
    ).rejects.toMatchObject({
      code: "CNIPA_GAZETTE_FINALIZE_JOB_CONFIG_INVALID",
    });
  });
  it("declares finalize construction as a Knowledge-only readiness step", () => {
    expect(cnipaGazetteFinalizeJobRuntimeDescriptor()).toMatchObject({
      sourceType: "DATABASE",
      inputMustBeDurableRawArtifacts: true,
      durableReceiptReadConcurrency: 8,
      contiguousChunkCoverageRequired: true,
      dataEngineWritePerformed: false,
      cnipaNetworkAccessRequired: false,
      artifactBackedFinalizeRequestRequired: true,
      historicalReplayActivated: false,
    });
  });
});
