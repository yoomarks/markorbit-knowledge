import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CNIPA_GAZETTE_CAPTURE_IMPORT_PAGE_SCHEMA,
  importCnipaGazetteSmallCompleteCapture,
} from "./cnipa-gazette-capture-import-job-acquirer";

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map((entry) => rm(entry, { recursive: true, force: true })),
  );
});

function sourceRow(index: number) {
  const id = index.toString(16).padStart(32, "0");
  return {
    id,
    searchId: id,
    anncIssue: "75",
    anncDate: "1983-08-15",
    anncType: "TMZCSQ",
    anncTypeName: "商标注册申请",
    regNo: String(100000 + index),
    pageNo: Math.floor((index - 1) / 10) + 1,
    anncPageNum: 58,
    fileId: `file-${Math.floor((index - 1) / 10) + 1}`,
    imgDir: `/gazette/75/page-${Math.floor((index - 1) / 10) + 1}.jpg`,
  };
}

function capture() {
  const records = Array.from({ length: 576 }, (_, index) => sourceRow(index + 1));
  return {
    exportedSchema: "mo-cnipa-gazette-small-complete-v1",
    tool: "MO CNIPA Network Capture",
    version: "0.9.4",
    kind: "gazette_small_issue_complete",
    exportedAt: "2026-09-20T00:30:00.000Z",
    announcementIssue: "75",
    query: {
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
    },
    sourceUrl:
      "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg?FECU=discard-me",
    sourceTotal: 576,
    sourcePages: 6,
    pageSize: 100,
    collectedCount: 576,
    uniqueOfficialRowIds: 576,
    expectedLastPageLength: 76,
    observedLastPageLength: 76,
    completeness: "COMPLETE",
    records,
  };
}

async function fixture() {
  const root = path.join(tmpdir(), `gazette-capture-import-${Date.now()}-${Math.random()}`);
  temporary.push(root);
  await mkdir(root, { recursive: true });
  const filePath = path.join(root, "MO_CNIPA_GAZETTE_75_SMALL_COMPLETE.json");
  const bytes = Buffer.from(JSON.stringify(capture(), null, 2), "utf8");
  await writeFile(filePath, bytes);
  return {
    filePath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes,
  };
}

describe("CNIPA Gazette browser capture import", () => {
  it("turns the exact v0.9.4 issue-75 capture into durable production lineage", async () => {
    const input = await fixture();
    const artifacts = await importCnipaGazetteSmallCompleteCapture({
      announcementIssue: 75,
      announcementDate: "1983-08-15",
      captureFilePath: input.filePath,
      captureSha256: input.sha256,
      captureToolVersion: "0.9.4",
    });

    expect(artifacts).toHaveLength(16);
    const captureArtifact = artifacts.find((item) => item.originalName.includes("browser-capture"));
    expect(captureArtifact?.content).toEqual(new Uint8Array(input.bytes));
    expect(captureArtifact?.canonicalUri).toBe(
      `cnipa://trademark-gazette/issue/75/browser-capture/${input.sha256}`,
    );

    const rawPages = artifacts.filter((item) => item.originalName.includes("capture-page-"));
    expect(rawPages).toHaveLength(6);
    expect(
      rawPages.every((item) => item.parentCanonicalUris?.[0] === captureArtifact?.canonicalUri),
    ).toBe(true);
    const finalRaw = rawPages.find((item) => item.originalName.endsWith("capture-page-6.json"));
    const finalRawJson = JSON.parse(new TextDecoder().decode(finalRaw!.content)) as {
      schemaVersion: string;
      records: unknown[];
    };
    expect(finalRawJson.schemaVersion).toBe(CNIPA_GAZETTE_CAPTURE_IMPORT_PAGE_SCHEMA);
    expect(finalRawJson.records).toHaveLength(76);

    const request = artifacts.find((item) =>
      item.originalName.endsWith("fact-admission-request.json"),
    );
    expect(request).toBeDefined();
    const requestJson = JSON.parse(new TextDecoder().decode(request!.content)) as {
      operation: string;
      payload: {
        source_record_count: number;
        source_page_count: number;
        page_row_counts: Array<{ page_index: number; row_count: number }>;
        chunk_row_count: number;
        records: unknown[];
      };
    };
    expect(requestJson.operation).toBe("CHUNK");
    expect(requestJson.payload.source_record_count).toBe(576);
    expect(requestJson.payload.source_page_count).toBe(6);
    expect(requestJson.payload.chunk_row_count).toBe(576);
    expect(requestJson.payload.page_row_counts.map((item) => item.row_count)).toEqual([
      100, 100, 100, 100, 100, 76,
    ]);
    expect(requestJson.payload.records).toHaveLength(576);
  });

  it("fails closed on capture byte drift", async () => {
    const input = await fixture();
    await expect(
      importCnipaGazetteSmallCompleteCapture({
        announcementIssue: 75,
        announcementDate: "1983-08-15",
        captureFilePath: input.filePath,
        captureSha256: "0".repeat(64),
        captureToolVersion: "0.9.4",
      }),
    ).rejects.toThrow(/SHA-256/);
  });

  it("fails closed when the capture is incomplete or belongs to another issue", async () => {
    const root = path.join(tmpdir(), `gazette-capture-import-invalid-${Date.now()}`);
    temporary.push(root);
    await mkdir(root, { recursive: true });
    const bad = { ...capture(), completeness: "INCOMPLETE" };
    const filePath = path.join(root, "bad.json");
    const bytes = Buffer.from(JSON.stringify(bad), "utf8");
    await writeFile(filePath, bytes);
    await expect(
      importCnipaGazetteSmallCompleteCapture({
        announcementIssue: 75,
        announcementDate: "1983-08-15",
        captureFilePath: filePath,
        captureSha256: createHash("sha256").update(bytes).digest("hex"),
        captureToolVersion: "0.9.4",
      }),
    ).rejects.toThrow(/COMPLETE/);
  });
});
