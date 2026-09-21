import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  ArtifactIngestionReceipt,
  ArtifactUploadDescriptor,
  ExecutionAttempt,
  Job,
  JobLease,
} from "@markorbit/contracts";
import type {
  AcquiredCollectionArtifact,
  ArtifactBackedExecutionContext,
} from "./artifact-backed-collection-executor";
import { CNIPA_GAZETTE_BROWSER_STREAM_PLAN_EXTENSION } from "./cnipa-gazette-browser-job";
import { CnipaGazetteBrowserRuntime } from "./cnipa-gazette-browser-runtime";
import {
  buildCnipaGazetteBrowserLogicalPageEvidence,
  buildCnipaGazetteBrowserSourcePageEvidence,
  buildCnipaGazetteBrowserStreamStateArtifact,
} from "./cnipa-gazette-browser-stream-artifacts";
import {
  acceptCnipaGazetteBrowserSourcePage,
  createCnipaGazetteBrowserStreamSession,
  createCnipaGazetteBrowserStreamState,
} from "./cnipa-gazette-browser-stream";
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

const DEEP_TOTAL = 576;
const DEEP_PAGE_SIZE = 10;
const DEEP_PAGES = 58;

function deepRawPage(pageIndex: number): Uint8Array {
  const start = (pageIndex - 1) * DEEP_PAGE_SIZE;
  const length = pageIndex < DEEP_PAGES ? DEEP_PAGE_SIZE : DEEP_TOTAL - start;
  return new TextEncoder().encode(
    JSON.stringify({
      code: 0,
      data: {
        pageIndex,
        pageSize: DEEP_PAGE_SIZE,
        total: DEEP_TOTAL,
        pages: DEEP_PAGES,
        list: Array.from({ length }, (_, offset) => row(start + offset + 1)),
      },
    }),
  );
}

function deepSession(sessionId: string) {
  return createCnipaGazetteBrowserStreamSession({
    sessionId,
    announcementIssue: 75,
    sourceUrl: SOURCE_URL,
    capturedQuery: {
      ...queryTemplate,
      pageIndex: 1,
      pageSize: DEEP_PAGE_SIZE,
    },
    sourceTotal: DEEP_TOTAL,
    sourcePages: DEEP_PAGES,
    announcementDate: "1983-08-15",
    startedAt: "2026-09-20T10:00:00.000Z",
  });
}

function deepEvidence(session: ReturnType<typeof deepSession>, pageIndex: number) {
  return buildCnipaGazetteBrowserSourcePageEvidence({
    session,
    requestedPageIndex: pageIndex,
    observedAt: new Date(Date.parse("2026-09-20T10:00:00.000Z") + pageIndex * 1_000).toISOString(),
    httpStatus: 200,
    rawBody: deepRawPage(pageIndex),
  });
}

function resumeArtifactId(index: number): string {
  return `art_01ARZ3NDEKTSV4RRFFQ69H${String(index).padStart(4, "0")}`;
}

function deepResumeFixture() {
  const session = deepSession("gazette-75-prior");
  let state = createCnipaGazetteBrowserStreamState(session);
  const logicalPages = [];
  const evidenceByPage = new Map<number, ReturnType<typeof deepEvidence>>();

  for (let pageIndex = 1; pageIndex <= 19; pageIndex += 1) {
    const evidence = deepEvidence(session, pageIndex);
    evidenceByPage.set(pageIndex, evidence);
    const accepted = acceptCnipaGazetteBrowserSourcePage({
      session,
      state,
      page: evidence.page,
    });
    state = accepted.state;
    logicalPages.push(...accepted.logicalPages);
  }

  expect(state).toMatchObject({
    nextSourcePageIndex: 20,
    nextLogicalPageIndex: 2,
    rowsSeen: 190,
    completed: false,
  });
  expect(logicalPages).toHaveLength(1);

  const stateArtifact = buildCnipaGazetteBrowserStreamStateArtifact({
    session,
    state,
    observedAt: evidenceByPage.get(19)!.page.observedAt,
  });
  const logicalArtifact = buildCnipaGazetteBrowserLogicalPageEvidence({
    session,
    page: logicalPages[0]!,
  }).projectionArtifact;
  const first = evidenceByPage.get(1)!;
  const tailPageIndices = Array.from({ length: 9 }, (_, offset) => 11 + offset);
  const tailSourceProjectionArtifactIds = tailPageIndices.map((_, offset) =>
    resumeArtifactId(10 + offset),
  );
  const refs = {
    stateArtifactId: resumeArtifactId(1),
    logicalProjectionArtifactIds: [resumeArtifactId(2)],
    firstSourceRawArtifactId: resumeArtifactId(3),
    firstSourceProjectionArtifactId: resumeArtifactId(4),
    previousSourceProjectionArtifactId: tailSourceProjectionArtifactIds.at(-1)!,
    tailSourceProjectionArtifactIds,
  };
  const artifacts = new Map<string, AcquiredCollectionArtifact>([
    [refs.stateArtifactId, stateArtifact],
    [refs.logicalProjectionArtifactIds[0]!, logicalArtifact],
    [refs.firstSourceRawArtifactId, first.rawArtifact],
    [refs.firstSourceProjectionArtifactId, first.projectionArtifact],
  ]);
  tailPageIndices.forEach((pageIndex, offset) => {
    artifacts.set(
      tailSourceProjectionArtifactIds[offset]!,
      evidenceByPage.get(pageIndex)!.projectionArtifact,
    );
  });
  return { refs, artifacts, tailSourceProjectionArtifactIds };
}

function job(resumeFrom?: Record<string, unknown>): Job {
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
      connectorConfig: { acquisitionMode: "NORMAL_BROWSER_BRIDGE_V1" },
      canonicalUri: "https://pub.sbj.cnipa.gov.cn",
    },
    planSnapshot: {
      output: { artifactKinds: ["JSON"] },
      extensions: {
        [CNIPA_GAZETTE_BROWSER_STREAM_PLAN_EXTENSION]: {
          announcementIssue: 75,
          queryTemplate,
          targetLogicalPagesPerCheckpoint: resumeFrom ? 6 : 1,
          maxRuntimeSeconds: 60,
          ...(resumeFrom ? { resumeFrom } : {}),
        },
      },
    },
  } as unknown as Job;
}
function fixtureClient(claimedJob = job()) {
  const lease = { id: LEASE_ID } as unknown as JobLease;
  const events: string[] = [];
  const descriptors = new Map<string, ArtifactUploadDescriptor>();
  const contents = new Map<string, Uint8Array>();
  let sessionCursor = 0;
  let artifactCursor = 0;
  let completedReceipt: unknown = null;
  let failed: unknown = null;
  const artifactId = () => `art_01ARZ3NDEKTSV4RRFFQ69G${String(++artifactCursor).padStart(4, "0")}`;
  const receiptId = () => `air_01ARZ3NDEKTSV4RRFFQ69G${String(artifactCursor).padStart(4, "0")}`;

  const client: ControlledCollectionWorkerClient = {
    workerId: "wrk_fixture",
    async heartbeat(_runtimeVersion, activeLeaseIds = []) {
      events.push(`heartbeat:${activeLeaseIds.length}`);
    },
    async claim(requestedJobId) {
      events.push(`claim:${requestedJobId}`);
      return { job: claimedJob, lease, leaseToken: "lease-token" };
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
      const artifactIdValue = artifactId();
      const receipt = {
        id: receiptId(),
        artifactId: artifactIdValue,
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
  return {
    client,
    events,
    descriptors,
    completed: () => completedReceipt,
    failed: () => failed,
  };
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

  it("resumes a deep durable tail at source page 20 and preserves all tail lineage", async () => {
    const resume = deepResumeFixture();
    const fixture = fixtureClient(job(resume.refs));
    const runtime = new CnipaGazetteBrowserRuntime(fixture.client, {
      extensionOrigin: ORIGIN,
      bridgeToken: "b".repeat(48),
      durableArtifactReader: {
        async read(artifactId) {
          const artifact = resume.artifacts.get(artifactId);
          if (!artifact) throw new Error(`missing resume artifact ${artifactId}`);
          return artifact;
        },
      },
      onListening: async (listening) => {
        const sessionId = "gazette-runtime-75-resume";
        const sessionResponse = await fetch(`${listening.baseUrl}/v1/cnipa-gazette/sessions`, {
          method: "POST",
          headers: {
            Origin: ORIGIN,
            Authorization: `Bearer ${listening.bridgeToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            schemaVersion: CNIPA_GAZETTE_LOOPBACK_SESSION_START_SCHEMA,
            sessionId,
            announcementIssue: 75,
            sourceUrl: SOURCE_URL,
            capturedQuery: {
              ...queryTemplate,
              pageIndex: 1,
              pageSize: DEEP_PAGE_SIZE,
            },
            sourceTotal: DEEP_TOTAL,
            sourcePages: DEEP_PAGES,
            announcementDate: "1983-08-15",
            startedAt: "2026-09-20T11:00:00.000Z",
          }),
        });
        expect(sessionResponse.status).toBe(201);
        const sessionAck = (await sessionResponse.json()) as Record<string, unknown>;
        expect(sessionAck).toMatchObject({
          nextSourcePageIndex: 20,
          sourcePages: DEEP_PAGES,
        });
        const fingerprint = String(sessionAck.sessionFingerprintSha256);

        for (let pageIndex = 20; pageIndex <= DEEP_PAGES; pageIndex += 1) {
          const pageResponse = await fetch(
            `${listening.baseUrl}/v1/cnipa-gazette/sessions/${sessionId}/pages/${pageIndex}`,
            {
              method: "POST",
              headers: {
                Origin: ORIGIN,
                Authorization: `Bearer ${listening.bridgeToken}`,
                "Content-Type": "application/octet-stream",
                "X-MO-Session-Fingerprint": fingerprint,
                "X-MO-Observed-At": new Date(
                  Date.parse("2026-09-20T11:00:00.000Z") + pageIndex * 1_000,
                ).toISOString(),
                "X-MO-Source-HTTP-Status": "200",
                "X-MO-Source-Content-Type": "application/json;charset=UTF-8",
              },
              body: deepRawPage(pageIndex) as unknown as BodyInit,
            },
          );
          expect(pageResponse.status).toBe(200);
          const ack = (await pageResponse.json()) as Record<string, unknown>;
          expect(ack.sourcePageIndex).toBe(pageIndex);
          expect(ack.nextSourcePageIndex).toBe(pageIndex + 1);
          if (pageIndex === DEEP_PAGES) expect(ack.completed).toBe(true);
        }
      },
    });

    const result = await runtime.run(JOB_ID);
    expect(result.receipt).toMatchObject({
      metadataOnly: false,
      itemsObserved: DEEP_TOTAL,
    });
    expect(fixture.failed()).toBeNull();

    const logicalPage2 = [...fixture.descriptors.values()].find(
      (descriptor) =>
        descriptor.canonicalUri === "cnipa://trademark-gazette/issue/75/list/page/2/projection",
    );
    expect(logicalPage2).toBeDefined();
    expect(logicalPage2!.parentArtifactIds).toEqual(
      expect.arrayContaining(resume.tailSourceProjectionArtifactIds),
    );
  });

  it("fails closed when a multi-page durable tail omits frozen tail projection refs", async () => {
    const resume = deepResumeFixture();
    const { tailSourceProjectionArtifactIds: omitted, ...withoutTail } = resume.refs;
    void omitted;
    const fixture = fixtureClient(job(withoutTail));
    const runtime = new CnipaGazetteBrowserRuntime(fixture.client, {
      extensionOrigin: ORIGIN,
      bridgeToken: "b".repeat(48),
      durableArtifactReader: {
        async read(artifactId) {
          const artifact = resume.artifacts.get(artifactId);
          if (!artifact) throw new Error(`missing resume artifact ${artifactId}`);
          return artifact;
        },
      },
    });

    await expect(runtime.run(JOB_ID)).rejects.toThrow(
      /multi-page durable tail requires tailSourceProjectionArtifactIds/,
    );
  });

  it("fails closed when a frozen tail projection canonical URI does not match durable provenance", async () => {
    const resume = deepResumeFixture();
    const firstTailId = resume.tailSourceProjectionArtifactIds[0]!;
    const firstTail = resume.artifacts.get(firstTailId)!;
    resume.artifacts.set(firstTailId, {
      ...firstTail,
      canonicalUri:
        "cnipa://trademark-gazette/issue/75/browser-source/page-size/10/page/99/projection",
    });
    const fixture = fixtureClient(job(resume.refs));
    const runtime = new CnipaGazetteBrowserRuntime(fixture.client, {
      extensionOrigin: ORIGIN,
      bridgeToken: "b".repeat(48),
      durableArtifactReader: {
        async read(artifactId) {
          const artifact = resume.artifacts.get(artifactId);
          if (!artifact) throw new Error(`missing resume artifact ${artifactId}`);
          return artifact;
        },
      },
    });

    await expect(runtime.run(JOB_ID)).rejects.toThrow(
      /tail source projection canonicalUri does not match durable tail provenance/,
    );
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
