import { describe, expect, it } from "vitest";
import type { ArtifactUploadDescriptor, ArtifactIngestionReceipt } from "@markorbit/contracts";
import type {
  ArtifactBackedExecutionClient,
  ArtifactBackedExecutionContext,
} from "./artifact-backed-collection-executor";
import {
  acceptCnipaGazetteBrowserSourcePage,
  createCnipaGazetteBrowserStreamSession,
  createCnipaGazetteBrowserStreamState,
  rebindCnipaGazetteBrowserStreamState,
  type CnipaGazetteBrowserLogicalPage,
  type CnipaGazetteBrowserStreamSession,
} from "./cnipa-gazette-browser-stream";
import { buildCnipaGazetteBrowserSourcePageEvidence } from "./cnipa-gazette-browser-stream-artifacts";
import { CnipaGazetteBrowserCheckpointStream } from "./cnipa-gazette-browser-checkpoint-stream";
import { StreamingArtifactWriter } from "./streaming-artifact-writer";

const SOURCE_URL =
  "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg";

function context(): ArtifactBackedExecutionContext {
  return {
    leaseToken: "lease-token",
    job: {
      planSnapshot: {
        output: { artifactKinds: ["JSON"] },
      },
    },
  } as unknown as ArtifactBackedExecutionContext;
}
function browserSession(): CnipaGazetteBrowserStreamSession {
  return createCnipaGazetteBrowserStreamSession({
    sessionId: "gazette-75-checkpoint-stream",
    announcementIssue: 75,
    sourceUrl: SOURCE_URL,
    capturedQuery: {
      anncIssue: "75",
      anncType: "",
      pageIndex: 1,
      pageSize: 30,
    },
    sourceTotal: 650,
    sourcePages: 22,
    announcementDate: "1983-08-15",
    startedAt: "2026-09-20T08:00:00.000Z",
  });
}

function row(index: number) {
  const id = index.toString(16).toUpperCase().padStart(32, "0");
  return {
    id,
    searchId: id,
    anncIssue: "75",
    anncDate: "1983-08-15",
    anncType: "TMZCSQ",
    anncTypeName: "商标初步审定公告",
    regNo: String(300000 + index),
    pageNo: Math.floor(index / 6) + 1,
    fileId: `FILE-${Math.floor(index / 6)}`,
    imgDir: `/group1/page-${Math.floor(index / 6)}.jpg`,
    anncPageNum: 120,
  };
}

function payload(pageIndex: number): Uint8Array {
  const pageSize = 30;
  const total = 650;
  const pages = 22;
  const start = (pageIndex - 1) * pageSize;
  const length = pageIndex < pages ? pageSize : total % pageSize || pageSize;
  return new TextEncoder().encode(
    JSON.stringify({
      code: 0,
      data: {
        pageIndex,
        pageSize,
        total,
        pages,
        list: Array.from({ length }, (_, offset) => row(start + offset)),
      },
    }),
  );
}

function artifactId(index: number): string {
  return `art_${String(index).padStart(26, "0")}`;
}

type DurableIdentity = {
  sha256: string;
  artifactId: string;
};

function artifactClient(
  input: {
    failCanonicalOnce?: string;
  } = {},
) {
  const descriptors = new Map<string, ArtifactUploadDescriptor>();
  const durable = new Map<string, DurableIdentity>();
  const finalizedCanonicals: string[] = [];
  const createCounts = new Map<string, number>();
  let sessionCursor = 0;
  let artifactCursor = 1;
  let failed = false;

  const client = {
    checkArtifactContent: async (
      _context: ArtifactBackedExecutionContext,
      identity: {
        artifactKind: string;
        canonicalUri: string;
        sha256: string;
      },
    ) => {
      const current = durable.get(identity.canonicalUri);
      return {
        unchanged: current?.sha256 === identity.sha256,
        latestArtifactId: current?.sha256 === identity.sha256 ? current.artifactId : null,
        latestSha256: current?.sha256 ?? null,
      };
    },
    createArtifactSession: async (
      _context: ArtifactBackedExecutionContext,
      descriptor: ArtifactUploadDescriptor,
    ) => {
      const canonical = descriptor.canonicalUri ?? "";
      createCounts.set(canonical, (createCounts.get(canonical) ?? 0) + 1);
      if (input.failCanonicalOnce === canonical && failed === false) {
        failed = true;
        throw new Error("simulated checkpoint persistence failure");
      }
      const id = `ing-test-${++sessionCursor}`;
      descriptors.set(id, descriptor);
      return { id } as never;
    },
    uploadArtifactContent: async () => undefined,
    finalizeArtifact: async (_context: ArtifactBackedExecutionContext, sessionId: string) => {
      const descriptor = descriptors.get(sessionId);
      if (!descriptor) throw new Error("unknown artifact session");
      const id = artifactId(artifactCursor++);
      const canonical = descriptor.canonicalUri ?? "";
      durable.set(canonical, {
        sha256: descriptor.expectedSha256,
        artifactId: id,
      });
      finalizedCanonicals.push(canonical);
      return {
        artifactId: id,
        contentSha256: descriptor.expectedSha256,
        sizeBytes: descriptor.expectedSizeBytes,
      } as ArtifactIngestionReceipt;
    },
  } as unknown as ArtifactBackedExecutionClient;

  return {
    client,
    finalizedCanonicals,
    createCounts,
  };
}
async function acceptPage(stream: CnipaGazetteBrowserCheckpointStream, pageIndex: number) {
  return stream.acceptSourcePage({
    requestedPageIndex: pageIndex,
    observedAt: `2026-09-20T08:${String(pageIndex).padStart(2, "0")}:00.000Z`,
    httpStatus: 200,
    rawBody: payload(pageIndex),
  });
}

describe("CNIPA Gazette browser checkpoint stream", () => {
  it("durably prepares three aligned checkpoint CHUNK requests without publishing them", async () => {
    const fixture = artifactClient();
    const writer = new StreamingArtifactWriter(context(), fixture.client);
    const stream = new CnipaGazetteBrowserCheckpointStream(browserSession(), writer, {
      targetLogicalPagesPerCheckpoint: 3,
    });

    expect(stream.checkpointPlans()).toEqual([
      {
        logicalRange: { startPage: 1, endPage: 3 },
        sourceRange: { startPage: 1, endPage: 10 },
        terminal: false,
      },
      {
        logicalRange: { startPage: 4, endPage: 6 },
        sourceRange: { startPage: 11, endPage: 20 },
        terminal: false,
      },
      {
        logicalRange: { startPage: 7, endPage: 7 },
        sourceRange: { startPage: 21, endPage: 22 },
        terminal: true,
      },
    ]);

    let firstCommit = null;
    for (let pageIndex = 1; pageIndex <= 10; pageIndex += 1) {
      const result = await acceptPage(stream, pageIndex);
      firstCommit = result.checkpoint ?? firstCommit;
    }
    expect(firstCommit).toMatchObject({
      rangePlan: {
        logicalRange: { startPage: 1, endPage: 3 },
        sourceRange: { startPage: 1, endPage: 10 },
      },
      rowCount: 300,
    });

    const firstFinalizeOrder = [...fixture.finalizedCanonicals];
    const source10Raw =
      "cnipa://trademark-gazette/issue/75/browser-source/page-size/30/page/10/raw";
    const source10Projection =
      "cnipa://trademark-gazette/issue/75/browser-source/page-size/30/page/10/projection";
    const stateCanonical = firstFinalizeOrder.find(
      (value) => value.includes("/browser-stream/") && value.endsWith("/state"),
    )!;
    const logical3 = "cnipa://trademark-gazette/issue/75/list/page/3/projection";
    const checkpoint = "cnipa://trademark-gazette/issue/75/checkpoint/1-3";
    const datasetCanonical = firstCommit!.datasetIdentityArtifact.canonicalUri;
    const chunkRequest = `${datasetCanonical}/fact-admission/chunk/1-3/request`;

    const lastStateBeforeCheckpoint = firstFinalizeOrder.lastIndexOf(stateCanonical);
    expect(firstFinalizeOrder.indexOf(source10Raw)).toBeLessThan(
      firstFinalizeOrder.indexOf(source10Projection),
    );
    expect(firstFinalizeOrder.indexOf(source10Projection)).toBeLessThan(lastStateBeforeCheckpoint);
    expect(lastStateBeforeCheckpoint).toBeLessThan(firstFinalizeOrder.indexOf(logical3));
    expect(firstFinalizeOrder.indexOf(logical3)).toBeLessThan(
      firstFinalizeOrder.indexOf(checkpoint),
    );
    expect(firstFinalizeOrder.indexOf(checkpoint)).toBeLessThan(
      firstFinalizeOrder.indexOf(datasetCanonical),
    );
    expect(firstFinalizeOrder.indexOf(datasetCanonical)).toBeLessThan(
      firstFinalizeOrder.indexOf(chunkRequest),
    );

    const commits = [firstCommit!];
    for (let pageIndex = 11; pageIndex <= 22; pageIndex += 1) {
      const result = await acceptPage(stream, pageIndex);
      if (result.checkpoint) commits.push(result.checkpoint);
    }

    expect(commits.map((item) => item.rowCount)).toEqual([300, 300, 50]);
    expect(new Set(commits.map((item) => item.sourceDatasetSha256)).size).toBe(1);
    expect(commits.map((item) => item.rangePlan.logicalRange)).toEqual([
      { startPage: 1, endPage: 3 },
      { startPage: 4, endPage: 6 },
      { startPage: 7, endPage: 7 },
    ]);
    expect(stream.snapshot()).toMatchObject({
      nextSourcePageIndex: 23,
      nextLogicalPageIndex: 8,
      rowsSeen: 650,
      completed: true,
    });
  });

  it("does not advance memory state when checkpoint persistence fails and safely replays the page", async () => {
    const checkpointCanonical = "cnipa://trademark-gazette/issue/75/checkpoint/1-3";
    const fixture = artifactClient({
      failCanonicalOnce: checkpointCanonical,
    });
    const writer = new StreamingArtifactWriter(context(), fixture.client);
    const stream = new CnipaGazetteBrowserCheckpointStream(browserSession(), writer, {
      targetLogicalPagesPerCheckpoint: 3,
    });

    for (let pageIndex = 1; pageIndex <= 9; pageIndex += 1) {
      await acceptPage(stream, pageIndex);
    }
    expect(stream.snapshot().nextSourcePageIndex).toBe(10);
    await expect(acceptPage(stream, 10)).rejects.toThrow(
      /simulated checkpoint persistence failure/,
    );
    expect(stream.snapshot()).toMatchObject({
      nextSourcePageIndex: 10,
      nextLogicalPageIndex: 3,
      rowsSeen: 270,
      completed: false,
    });

    const rawCanonical =
      "cnipa://trademark-gazette/issue/75/browser-source/page-size/30/page/10/raw";
    const projectionCanonical =
      "cnipa://trademark-gazette/issue/75/browser-source/page-size/30/page/10/projection";
    expect(fixture.createCounts.get(rawCanonical)).toBe(1);
    expect(fixture.createCounts.get(projectionCanonical)).toBe(1);

    const replay = await acceptPage(stream, 10);
    expect(replay.checkpoint).not.toBeNull();
    expect(stream.snapshot()).toMatchObject({
      nextSourcePageIndex: 11,
      nextLogicalPageIndex: 4,
      rowsSeen: 300,
      completed: false,
    });
    expect(fixture.createCounts.get(rawCanonical)).toBe(1);
    expect(fixture.createCounts.get(projectionCanonical)).toBe(1);
    expect(fixture.createCounts.get(checkpointCanonical)).toBe(2);
  });

  it("rejects an out-of-order page before creating durable evidence", async () => {
    const fixture = artifactClient();
    const writer = new StreamingArtifactWriter(context(), fixture.client);
    const stream = new CnipaGazetteBrowserCheckpointStream(browserSession(), writer, {
      targetLogicalPagesPerCheckpoint: 3,
    });

    await expect(acceptPage(stream, 2)).rejects.toThrow(/source page sequence mismatch/);
    expect(fixture.finalizedCanonicals).toHaveLength(0);
    expect(stream.snapshot()).toMatchObject({
      nextSourcePageIndex: 1,
      rowsSeen: 0,
    });
  });
});

function resumeBrowserSession(sessionId: string): CnipaGazetteBrowserStreamSession {
  return createCnipaGazetteBrowserStreamSession({
    sessionId,
    announcementIssue: 75,
    sourceUrl: SOURCE_URL,
    capturedQuery: {
      anncIssue: "75",
      anncType: "",
      pageIndex: 1,
      pageSize: 10,
    },
    sourceTotal: 576,
    sourcePages: 58,
    announcementDate: "1983-08-15",
    startedAt: "2026-09-20T14:23:59.900Z",
  });
}

function resumePayload(pageIndex: number): Uint8Array {
  const pageSize = 10;
  const total = 576;
  const pages = 58;
  const start = (pageIndex - 1) * pageSize;
  const length = pageIndex < pages ? pageSize : total % pageSize || pageSize;
  return new TextEncoder().encode(
    JSON.stringify({
      code: 0,
      data: {
        pageIndex,
        pageSize,
        total,
        pages,
        list: Array.from({ length }, (_, offset) => row(start + offset)),
      },
    }),
  );
}

describe("CNIPA Gazette browser mid-checkpoint resume", () => {
  it("resumes durable issue-75 progress from source page 12 and completes 576 rows", async () => {
    const priorSession = resumeBrowserSession("gazette-75-prior");
    let priorState = createCnipaGazetteBrowserStreamState(priorSession);
    const durableLogicalPages: CnipaGazetteBrowserLogicalPage[] = [];
    let priorFirstSourceEvidence:
      ReturnType<typeof buildCnipaGazetteBrowserSourcePageEvidence> | undefined;

    for (let pageIndex = 1; pageIndex <= 11; pageIndex += 1) {
      const evidence = buildCnipaGazetteBrowserSourcePageEvidence({
        session: priorSession,
        requestedPageIndex: pageIndex,
        observedAt: `2026-09-20T14:24:${String(pageIndex).padStart(2, "0")}.000Z`,
        httpStatus: 200,
        rawBody: resumePayload(pageIndex),
      });
      priorFirstSourceEvidence ??= evidence;
      const accepted = acceptCnipaGazetteBrowserSourcePage({
        session: priorSession,
        state: priorState,
        page: evidence.page,
      });
      priorState = accepted.state;
      durableLogicalPages.push(...accepted.logicalPages);
    }

    expect(priorState).toMatchObject({
      nextSourcePageIndex: 12,
      nextLogicalPageIndex: 2,
      rowsSeen: 110,
      completed: false,
    });
    expect(durableLogicalPages.map((page) => page.pageIndex)).toEqual([1]);

    const resumedSession = resumeBrowserSession("gazette-75-resumed");
    const rebound = rebindCnipaGazetteBrowserStreamState({
      priorSession,
      priorState,
      session: resumedSession,
    });
    const resumedFirstSourceEvidence = buildCnipaGazetteBrowserSourcePageEvidence({
      session: resumedSession,
      requestedPageIndex: 1,
      observedAt: priorFirstSourceEvidence!.page.observedAt,
      httpStatus: 200,
      rawBody: resumePayload(1),
    });

    const fixture = artifactClient();
    const writer = new StreamingArtifactWriter(context(), fixture.client);
    writer.remember(
      resumedFirstSourceEvidence.rawArtifact.canonicalUri!,
      "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    );
    writer.remember(
      "cnipa://trademark-gazette/issue/75/list/page/1/projection",
      "art_01ARZ3NDEKTSV4RRFFQ69G5FAW",
    );
    writer.remember(
      "cnipa://trademark-gazette/issue/75/browser-source/page-size/10/page/11/projection",
      "art_01ARZ3NDEKTSV4RRFFQ69G5FAZ",
    );
    const stream = new CnipaGazetteBrowserCheckpointStream(resumedSession, writer, {
      targetLogicalPagesPerCheckpoint: 6,
      resume: {
        state: rebound,
        logicalPages: durableLogicalPages,
        firstSourcePageEvidence: resumedFirstSourceEvidence,
      },
    });

    expect(stream.snapshot()).toMatchObject({
      nextSourcePageIndex: 12,
      nextLogicalPageIndex: 2,
      rowsSeen: 110,
    });

    let terminalCheckpoint = null;
    for (let pageIndex = 12; pageIndex <= 58; pageIndex += 1) {
      const result = await stream.acceptSourcePage({
        requestedPageIndex: pageIndex,
        observedAt: `2026-09-20T14:25:${String(pageIndex % 60).padStart(2, "0")}.000Z`,
        httpStatus: 200,
        rawBody: resumePayload(pageIndex),
      });
      terminalCheckpoint = result.checkpoint ?? terminalCheckpoint;
    }

    expect(terminalCheckpoint).toMatchObject({
      rangePlan: {
        logicalRange: { startPage: 1, endPage: 6 },
        sourceRange: { startPage: 1, endPage: 58 },
        terminal: true,
      },
      rowCount: 576,
    });
    expect(stream.snapshot()).toMatchObject({
      nextSourcePageIndex: 59,
      nextLogicalPageIndex: 7,
      rowsSeen: 576,
      completed: true,
    });
  });
});
