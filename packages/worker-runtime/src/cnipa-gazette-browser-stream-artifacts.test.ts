import { describe, expect, it } from "vitest";
import {
  acceptCnipaGazetteBrowserSourcePage,
  createCnipaGazetteBrowserStreamSession,
  createCnipaGazetteBrowserStreamState,
} from "./cnipa-gazette-browser-stream";
import {
  CNIPA_GAZETTE_BROWSER_LOGICAL_PAGE_EVIDENCE_SCHEMA,
  CNIPA_GAZETTE_BROWSER_SOURCE_PAGE_EVIDENCE_SCHEMA,
  CNIPA_GAZETTE_BROWSER_STREAM_STATE_ARTIFACT_SCHEMA,
  buildCnipaGazetteBrowserCheckpointEvidence,
  buildCnipaGazetteBrowserLogicalPageEvidence,
  buildCnipaGazetteBrowserSourcePageEvidence,
  buildCnipaGazetteBrowserStreamStateArtifact,
} from "./cnipa-gazette-browser-stream-artifacts";
import { CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_SCHEMA } from "./cnipa-gazette-checkpoint-acquirer";

const SOURCE_URL =
  "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg";
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

function currentSession() {
  return createCnipaGazetteBrowserStreamSession({
    sessionId: "gazette-75-evidence",
    announcementIssue: 75,
    sourceUrl: SOURCE_URL,
    capturedQuery: {
      anncIssue: "75",
      anncType: "",
      regNo: "",
      pageIndex: 1,
      pageSize: 30,
    },
    sourceTotal: 250,
    sourcePages: 9,
    announcementDate: "1983-08-15",
    startedAt: "2026-09-20T07:00:00.000Z",
  });
}

function payload(pageIndex: number) {
  const pageSize = 30;
  const total = 250;
  const pages = 9;
  const start = (pageIndex - 1) * pageSize;
  const length = pageIndex < pages ? pageSize : 10;
  return {
    code: 0,
    data: {
      pageIndex,
      pageSize,
      total,
      pages,
      list: Array.from({ length }, (_, offset) => row(start + offset)),
    },
  };
}

function sourceEvidence(pageIndex: number) {
  const rawBody = new TextEncoder().encode(JSON.stringify(payload(pageIndex)));
  return buildCnipaGazetteBrowserSourcePageEvidence({
    session: currentSession(),
    requestedPageIndex: pageIndex,
    observedAt: `2026-09-20T07:${String(pageIndex).padStart(2, "0")}:00.000Z`,
    httpStatus: 200,
    rawBody,
  });
}
function collectLogicalPages() {
  const session = currentSession();
  let state = createCnipaGazetteBrowserStreamState(session);
  const logicalPages = [];

  for (let pageIndex = 1; pageIndex <= 9; pageIndex += 1) {
    const evidence = sourceEvidence(pageIndex);
    const accepted = acceptCnipaGazetteBrowserSourcePage({
      session,
      state,
      page: evidence.page,
    });
    state = accepted.state;
    logicalPages.push(...accepted.logicalPages);
  }

  return { session, state, logicalPages };
}

describe("CNIPA Gazette browser-stream durable evidence builders", () => {
  it("preserves exact source bytes and emits a safe source projection", () => {
    const session = currentSession();
    const rawBody = new TextEncoder().encode(JSON.stringify(payload(1)));
    const evidence = buildCnipaGazetteBrowserSourcePageEvidence({
      session,
      requestedPageIndex: 1,
      observedAt: "2026-09-20T07:01:00.000Z",
      httpStatus: 200,
      rawBody,
    });

    expect(Array.from(evidence.rawArtifact.content)).toEqual(Array.from(rawBody));
    expect(evidence.rawArtifact.canonicalUri).toBe(
      "cnipa://trademark-gazette/issue/75/browser-source/page-size/30/page/1/raw",
    );
    expect(evidence.projectionArtifact.parentCanonicalUris).toEqual([
      evidence.rawArtifact.canonicalUri,
    ]);
    const projection = JSON.parse(new TextDecoder().decode(evidence.projectionArtifact.content));
    expect(projection).toMatchObject({
      schemaVersion: CNIPA_GAZETTE_BROWSER_SOURCE_PAGE_EVIDENCE_SCHEMA,
      acquisitionMode: "NORMAL_BROWSER_STREAM",
      announcementIssue: 75,
      request: {
        method: "POST",
        body: {
          anncIssue: "75",
          anncType: "",
          pageIndex: 1,
          pageSize: 30,
        },
      },
      sourcePage: {
        sourcePageIndex: 1,
        sourcePageSize: 30,
        sourceTotal: 250,
      },
    });
  });
  it("emits bounded resumable state parented to the last source projection", () => {
    const session = currentSession();
    const first = sourceEvidence(1);
    const accepted = acceptCnipaGazetteBrowserSourcePage({
      session,
      state: createCnipaGazetteBrowserStreamState(session),
      page: first.page,
    });
    const artifact = buildCnipaGazetteBrowserStreamStateArtifact({
      session,
      state: accepted.state,
      observedAt: first.page.observedAt,
    });

    expect(artifact.parentCanonicalUris).toEqual([first.projectionArtifact.canonicalUri]);
    const parsed = JSON.parse(new TextDecoder().decode(artifact.content));
    expect(parsed).toMatchObject({
      schemaVersion: CNIPA_GAZETTE_BROWSER_STREAM_STATE_ARTIFACT_SCHEMA,
      acquisitionMode: "NORMAL_BROWSER_STREAM",
      state: {
        nextSourcePageIndex: 2,
        rowsSeen: 30,
        completed: false,
      },
    });
    expect(parsed.state.tailRows).toHaveLength(30);
    expect(parsed.state.tailSourcePageIndices).toHaveLength(30);
    expect(parsed.session).toMatchObject({
      announcementIssue: 75,
      sourcePageSize: 30,
      sourceTotal: 250,
    });
  });

  it("parents logical 100-row evidence to every contributing source page", () => {
    const session = currentSession();
    let state = createCnipaGazetteBrowserStreamState(session);
    let logicalPage = null;

    for (let pageIndex = 1; pageIndex <= 4; pageIndex += 1) {
      const accepted = acceptCnipaGazetteBrowserSourcePage({
        session,
        state,
        page: sourceEvidence(pageIndex).page,
      });
      state = accepted.state;
      logicalPage = accepted.logicalPages[0] ?? logicalPage;
    }

    expect(logicalPage).not.toBeNull();
    const evidence = buildCnipaGazetteBrowserLogicalPageEvidence({
      session,
      page: logicalPage!,
    });
    expect(evidence.projectionArtifact.canonicalUri).toBe(
      "cnipa://trademark-gazette/issue/75/list/page/1/projection",
    );
    expect(evidence.projectionArtifact.parentCanonicalUris).toEqual([
      "cnipa://trademark-gazette/issue/75/browser-source/page-size/30/page/1/projection",
      "cnipa://trademark-gazette/issue/75/browser-source/page-size/30/page/2/projection",
      "cnipa://trademark-gazette/issue/75/browser-source/page-size/30/page/3/projection",
      "cnipa://trademark-gazette/issue/75/browser-source/page-size/30/page/4/projection",
    ]);
    const parsed = JSON.parse(new TextDecoder().decode(evidence.projectionArtifact.content));
    expect(parsed).toMatchObject({
      schemaVersion: CNIPA_GAZETTE_BROWSER_LOGICAL_PAGE_EVIDENCE_SCHEMA,
      acquisitionMode: "NORMAL_BROWSER_STREAM",
      sourcePageIndices: [1, 2, 3, 4],
      page: {
        pageIndex: 1,
        pageSize: 100,
        sourceTotal: 250,
        sourcePages: 3,
      },
    });
    expect(parsed).not.toHaveProperty("request");
  });

  it("builds the existing checkpoint contract from normalized logical pages", () => {
    const { session, logicalPages } = collectLogicalPages();
    const evidence = buildCnipaGazetteBrowserCheckpointEvidence({
      session,
      range: { startPage: 1, endPage: 3 },
      logicalPages,
    });

    expect(evidence.checkpoint.pages.map((page) => page.rows.length)).toEqual([100, 100, 50]);
    expect(evidence.checkpointArtifact.canonicalUri).toBe(
      "cnipa://trademark-gazette/issue/75/checkpoint/1-3",
    );
    expect(evidence.checkpointArtifact.parentCanonicalUris).toEqual([
      "cnipa://trademark-gazette/issue/75/list/page/1/projection",
      "cnipa://trademark-gazette/issue/75/list/page/2/projection",
      "cnipa://trademark-gazette/issue/75/list/page/3/projection",
    ]);
    const checkpoint = JSON.parse(new TextDecoder().decode(evidence.checkpointArtifact.content));
    expect(checkpoint).toMatchObject({
      schemaVersion: CNIPA_GAZETTE_CHECKPOINT_ARTIFACT_SCHEMA,
      acquisitionMode: "NORMAL_BROWSER_STREAM",
      browserStream: { sourcePageSize: 30 },
      sourceTotal: 250,
      sourcePages: 3,
      pageSize: 100,
      range: { startPage: 1, endPage: 3 },
      checkpoint: {
        rowCount: 250,
        uniqueOfficialRowIds: 250,
        completeness: "RANGE_COMPLETE",
      },
    });
    expect(evidence.plannedRanges).toEqual([{ startPage: 1, endPage: 3 }]);
  });

  it("fails closed when logical provenance points outside the source session", () => {
    const { session, logicalPages } = collectLogicalPages();
    expect(() =>
      buildCnipaGazetteBrowserLogicalPageEvidence({
        session,
        page: {
          ...logicalPages[0]!,
          sourcePageIndices: [1, 10],
        },
      }),
    ).toThrow(/invalid source page/);
  });
});
