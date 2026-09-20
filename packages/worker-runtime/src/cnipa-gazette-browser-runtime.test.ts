import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  ArtifactIngestionReceipt,
  ArtifactUploadDescriptor,
  ExecutionAttempt,
  Job,
  JobLease,
} from "@markorbit/contracts";
import type { ArtifactBackedExecutionContext } from "./artifact-backed-collection-executor";
import { CNIPA_GAZETTE_BROWSER_STREAM_PLAN_EXTENSION } from "./cnipa-gazette-browser-job";
import { CnipaGazetteBrowserRuntime } from "./cnipa-gazette-browser-runtime";
import { CNIPA_GAZETTE_LOOPBACK_SESSION_START_SCHEMA } from "./cnipa-gazette-loopback-server";
import {
  CNIPA_GAZETTE_JOB_CONNECTOR_ID,
  CNIPA_GAZETTE_JOB_CONNECTOR_VERSION,
} from "./cnipa-gazette-job-acquirer";
import type { ControlledCollectionWorkerClient } from "./controlled-collection-worker-runtime";

const JOB_ID = "job_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const LEASE_ID = "lse_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ORIGIN = `chrome-extension://${"a".repeat(32)}`;
const SOURCE_URL =
  "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg";
const queryTemplate = {
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
    regNo: String(200600 + index),
    pageNo: index + 1,
    fileId: `FILE-${index}`,
    imgDir: `/group1/page-${index}.jpg`,
    anncPageNum: 97,
  };
}

function rawPage(): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      code: 0,
      data: {
        pageIndex: 1,
        pageSize: 30,
        total: 30,
        pages: 1,
        list: Array.from({ length: 30 }, (_, index) => row(index + 1)),
      },
    }),
  );
}

function job(): Job {
  return {
    id: JOB_ID,
    jobType: "API_COLLECTION",
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
      connectorConfig: {},
      canonicalUri: "https://pub.sbj.cnipa.gov.cn",
    },
    planSnapshot: {
      output: { artifactKinds: ["JSON"] },
      extensions: {
        [CNIPA_GAZETTE_BROWSER_STREAM_PLAN_EXTENSION]: {
          announcementIssue: 75,
          queryTemplate,
          targetLogicalPagesPerCheckpoint: 1,
          maxRuntimeSeconds: 60,
        },
      },
    },
  } as unknown as Job;
}
function fixtureClient() {
  const lease = { id: LEASE_ID } as unknown as JobLease;
  const events: string[] = [];
  const descriptors = new Map<string, ArtifactUploadDescriptor>();
  const contents = new Map<string, Uint8Array>();
  let sessionCursor = 0;
  let artifactCursor = 0;
  let completedReceipt: unknown = null;
  let failed: unknown = null;
  const suffixes = "ABCDEFGHJKMNPQRSTVWXYZ".split("");

  const client: ControlledCollectionWorkerClient = {
    workerId: "wrk_fixture",
    async heartbeat(_runtimeVersion, activeLeaseIds = []) {
      events.push(`heartbeat:${activeLeaseIds.length}`);
    },
    async claim(requestedJobId) {
      events.push(`claim:${requestedJobId}`);
      return { job: job(), lease, leaseToken: "lease-token" };
    },
    async renewLease() {
      events.push("renew");
      return lease;
    },
    async start(_context, _executor, idempotencyKey) {
      events.push(`start:${idempotencyKey}`);
      return {} as ExecutionAttempt;
    },
    async checkArtifactContent() {
      return { unchanged: false, latestArtifactId: null, latestSha256: null };
    },
    async uploading(_context, idempotencyKey) {
      events.push(`uploading:${idempotencyKey}`);
    },
    async createArtifactSession(
      _context: ArtifactBackedExecutionContext,
      descriptor: ArtifactUploadDescriptor,
    ) {
      const id = `ing-test-${++sessionCursor}`;
      descriptors.set(id, descriptor);
      events.push(`artifact-session:${descriptor.canonicalUri}`);
      return { id } as never;
    },
    async uploadArtifactContent(_context, sessionId, content) {
      contents.set(sessionId, new Uint8Array(content));
    },
    async finalizeArtifact(_context, sessionId) {
      const descriptor = descriptors.get(sessionId)!;
      const content = contents.get(sessionId)!;
      expect(createHash("sha256").update(content).digest("hex")).toBe(descriptor.expectedSha256);
      const suffix = suffixes[artifactCursor++]!;
      const receipt = {
        id: `air_01ARZ3NDEKTSV4RRFFQ69G5FA${suffix}`,
        artifactId: `art_01ARZ3NDEKTSV4RRFFQ69G5FA${suffix}`,
        contentSha256: descriptor.expectedSha256,
        sizeBytes: descriptor.expectedSizeBytes,
      } as unknown as ArtifactIngestionReceipt;
      events.push(`artifact-finalize:${descriptor.canonicalUri}`);
      return receipt;
    },
    async verifying(_context, idempotencyKey) {
      events.push(`verifying:${idempotencyKey}`);
    },
    async complete(_context, receipt, idempotencyKey) {
      completedReceipt = receipt;
      events.push(`complete:${idempotencyKey}`);
    },
    async fail(_context, failure, idempotencyKey) {
      failed = failure;
      events.push(`fail:${idempotencyKey}`);
    },
  };
  return { client, events, completed: () => completedReceipt, failed: () => failed };
}
describe("CnipaGazetteBrowserRuntime", () => {
  it("claims one governed Job, streams real loopback HTTP, and completes after durable evidence", async () => {
    const fixture = fixtureClient();
    const runtime = new CnipaGazetteBrowserRuntime(fixture.client, {
      extensionOrigin: ORIGIN,
      bridgeToken: "b".repeat(48),
      onListening: async (listening) => {
        const sessionResponse = await fetch(`${listening.baseUrl}/v1/cnipa-gazette/sessions`, {
          method: "POST",
          headers: {
            Origin: ORIGIN,
            Authorization: `Bearer ${listening.bridgeToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            schemaVersion: CNIPA_GAZETTE_LOOPBACK_SESSION_START_SCHEMA,
            sessionId: "gazette-runtime-75",
            announcementIssue: 75,
            sourceUrl: SOURCE_URL,
            capturedQuery: { ...queryTemplate, pageIndex: 1, pageSize: 30 },
            sourceTotal: 30,
            sourcePages: 1,
            announcementDate: "1983-08-15",
            startedAt: "2026-09-20T10:00:00.000Z",
          }),
        });
        expect(sessionResponse.status).toBe(201);
        const sessionAck = (await sessionResponse.json()) as Record<string, unknown>;
        const fingerprint = String(sessionAck.sessionFingerprintSha256);

        const pageResponse = await fetch(
          `${listening.baseUrl}/v1/cnipa-gazette/sessions/gazette-runtime-75/pages/1`,
          {
            method: "POST",
            headers: {
              Origin: ORIGIN,
              Authorization: `Bearer ${listening.bridgeToken}`,
              "Content-Type": "application/octet-stream",
              "X-MO-Session-Fingerprint": fingerprint,
              "X-MO-Observed-At": "2026-09-20T10:00:01.000Z",
              "X-MO-Source-HTTP-Status": "200",
              "X-MO-Source-Content-Type": "application/json;charset=UTF-8",
            },
            body: rawPage() as unknown as BodyInit,
          },
        );
        expect(pageResponse.status).toBe(200);
        expect(await pageResponse.json()).toMatchObject({
          sourcePageIndex: 1,
          nextSourcePageIndex: 2,
          completed: true,
        });
      },
    });

    const result = await runtime.run(JOB_ID);
    expect(result.receipt).toMatchObject({
      metadataOnly: false,
      itemsObserved: 30,
      outputKinds: ["JSON"],
    });
    expect(result.receipt.metadataOnly).toBe(false);
    if (!result.receipt.metadataOnly) {
      expect(result.receipt.artifactReceiptIds).toHaveLength(7);
      expect(result.receipt.bytesPrepared).toBeGreaterThan(0);
    }
    expect(fixture.failed()).toBeNull();
    expect(fixture.completed()).toEqual(result.receipt);
    const started = fixture.events.findIndex((value) => value.startsWith("start:"));
    const uploading = fixture.events.findIndex((value) => value.startsWith("uploading:"));
    const firstArtifact = fixture.events.findIndex((value) =>
      value.startsWith("artifact-session:"),
    );
    const verifying = fixture.events.findIndex((value) => value.startsWith("verifying:"));
    const completed = fixture.events.findIndex((value) => value.startsWith("complete:"));
    expect(started).toBeGreaterThanOrEqual(0);
    expect(started).toBeLessThan(uploading);
    expect(uploading).toBeLessThan(firstArtifact);
    expect(firstArtifact).toBeLessThan(verifying);
    expect(verifying).toBeLessThan(completed);
  });

  it("fails the claimed Job cleanly when the operator aborts", async () => {
    const fixture = fixtureClient();
    const controller = new AbortController();
    const runtime = new CnipaGazetteBrowserRuntime(fixture.client, {
      extensionOrigin: ORIGIN,
      bridgeToken: "b".repeat(48),
      signal: controller.signal,
      onListening: () => {
        controller.abort();
      },
    });

    await expect(runtime.run(JOB_ID)).rejects.toMatchObject({
      code: "CNIPA_GAZETTE_BROWSER_STREAM_ABORTED",
      retryable: true,
    });
    expect(fixture.completed()).toBeNull();
    expect(fixture.failed()).toMatchObject({
      code: "CNIPA_GAZETTE_BROWSER_STREAM_ABORTED",
      retryable: true,
    });
    expect(fixture.events.some((value) => value.startsWith("fail:"))).toBe(true);
    expect(fixture.events.at(-1)).toBe("heartbeat:0");
  });
});
