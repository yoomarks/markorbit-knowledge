import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ArtifactBackedExecutionContext } from "./artifact-backed-collection-executor";
import {
  CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_ID,
  CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_VERSION,
  CNIPA_GAZETTE_CAPTURE_IMPORT_SOURCE,
  CnipaGazetteCaptureImportJobArtifactAcquirer,
} from "./cnipa-gazette-capture-import-job-acquirer";

const requestTemplate = {
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
  pageSize: 100,
};

function row(index: number) {
  const id = index.toString(16).toUpperCase().padStart(32, "0");
  return {
    id,
    searchId: id,
    anncIssue: "75",
    anncDate: "1983-08-15",
    anncType: "TMZCSQ",
    anncTypeName: "商标初步审定公告",
    regNo: String(200000 + index),
    pageNo: Math.floor(index / 6) + 1,
    fileId: `FILE-${Math.floor(index / 6)}`,
    imgDir: `/group1/page-${Math.floor(index / 6)}.jpg`,
    anncPageNum: 97,
  };
}

function captureBytes() {
  const value = {
    exportedSchema: "mo-cnipa-gazette-small-complete-v1",
    tool: "MO CNIPA Network Capture",
    version: "0.9.4",
    kind: "gazette_small_issue_complete",
    exportedAt: "2026-09-19T14:06:48.000Z",
    announcementIssue: "75",
    query: { ...requestTemplate, pageSize: 10 },
    sourceUrl:
      "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg",
    sourceTotal: 576,
    sourcePages: 58,
    pageSize: 10,
    collectedCount: 576,
    uniqueOfficialRowIds: 576,
    expectedLastPageLength: 6,
    observedLastPageLength: 6,
    completeness: "COMPLETE",
    records: Array.from({ length: 576 }, (_, index) => row(index)),
  };
  return new TextEncoder().encode(JSON.stringify(value));
}

function context(bytes: Uint8Array, overrides: Record<string, unknown> = {}) {
  return {
    workerId: "wrk_fixture",
    leaseToken: "lease-token",
    lease: { id: "lse_fixture" },
    job: {
      connector: {
        connectorId: CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_ID,
        version: CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_VERSION,
      },
      sourceSnapshot: {
        sourceType: "DATABASE",
        connector: {
          connectorId: CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_ID,
          version: CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_VERSION,
        },
        connectorConfig: {
          intent: "IMPORT_V094_SMALL_COMPLETE",
          captureSha256: createHash("sha256").update(bytes).digest("hex"),
          captureSizeBytes: bytes.byteLength,
          captureOriginalName: "MO_CNIPA_GAZETTE_75_SMALL_COMPLETE.json",
          announcementIssue: 75,
          range: { startPage: 1, endPage: 6 },
          requestTemplate,
          pagesPerCheckpoint: 6,
          ...overrides,
        },
        canonicalUri: CNIPA_GAZETTE_CAPTURE_IMPORT_SOURCE,
      },
      planSnapshot: {
        policy: { retry: { maxAttempts: 1, backoffSeconds: 0 } },
        output: { artifactKinds: ["JSON"] },
      },
    },
  } as unknown as ArtifactBackedExecutionContext;
}

function byName(
  artifacts: Awaited<ReturnType<CnipaGazetteCaptureImportJobArtifactAcquirer["acquire"]>>,
  name: string,
) {
  const found = artifacts.find((artifact) => artifact.originalName === name);
  if (!found) throw new Error(`missing artifact ${name}`);
  return found;
}

describe("CnipaGazetteCaptureImportJobArtifactAcquirer", () => {
  it("imports v0.9.4 evidence into the existing durable Gazette chain without network", async () => {
    const bytes = captureBytes();
    const artifacts = await new CnipaGazetteCaptureImportJobArtifactAcquirer({
      captureBytes: bytes,
    }).acquire(context(bytes));
    expect(artifacts).toHaveLength(16);
    const root = byName(artifacts, "MO_CNIPA_GAZETTE_75_SMALL_COMPLETE.json");
    expect(root.canonicalUri).toMatch(
      /^cnipa:\/\/trademark-gazette\/issue\/75\/capture\/mo-cnipa-network-capture-v0\.9\.4\/[a-f0-9]{64}$/u,
    );
    for (let page = 1; page <= 6; page += 1) {
      const raw = byName(artifacts, `cnipa-gazette-issue-75-list-p${page}.json`);
      expect(raw.parentCanonicalUris).toEqual([root.canonicalUri]);
    }

    const identity = byName(artifacts, "cnipa-gazette-issue-75-dataset-identity.json");
    const identityJson = JSON.parse(new TextDecoder().decode(identity.content));
    expect(identityJson.identity).toMatchObject({
      announcementIssue: 75,
      announcementDate: "1983-08-15",
      sourceRecordCount: 576,
      sourcePageCount: 6,
      pageSize: 100,
    });

    const request = byName(
      artifacts,
      "cnipa-gazette-issue-75-chunk-1-6-fact-admission-request.json",
    );
    const requestJson = JSON.parse(new TextDecoder().decode(request.content));
    expect(requestJson.payload).toMatchObject({
      source_record_count: 576,
      source_page_count: 6,
      page_size: 100,
      range_start_page: 1,
      range_end_page: 6,
      chunk_row_count: 576,
    });
    expect(requestJson.payload.page_row_counts).toEqual([
      { page_index: 1, row_count: 100 },
      { page_index: 2, row_count: 100 },
      { page_index: 3, row_count: 100 },
      { page_index: 4, row_count: 100 },
      { page_index: 5, row_count: 100 },
      { page_index: 6, row_count: 76 },
    ]);
  });

  it("fails closed when runtime bytes do not match immutable SHA/size", async () => {
    const bytes = captureBytes();
    await expect(
      new CnipaGazetteCaptureImportJobArtifactAcquirer({
        captureBytes: new Uint8Array([...bytes, 0x20]),
      }).acquire(context(bytes)),
    ).rejects.toMatchObject({ code: "CNIPA_GAZETTE_CAPTURE_IMPORT_INVALID" });
  });

  it("fails closed when the immutable captured query drifts", async () => {
    const bytes = captureBytes();
    await expect(
      new CnipaGazetteCaptureImportJobArtifactAcquirer({ captureBytes: bytes }).acquire(
        context(bytes, {
          requestTemplate: { ...requestTemplate, tmName: "drift" },
        }),
      ),
    ).rejects.toMatchObject({ code: "CNIPA_GAZETTE_CAPTURE_IMPORT_INVALID" });
  });
});
