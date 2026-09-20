import { describe, expect, it } from "vitest";
import {
  acceptCnipaGazetteBrowserSourcePage,
  createCnipaGazetteBrowserStreamSession,
  createCnipaGazetteBrowserStreamState,
  parseCnipaGazetteBrowserSourcePage,
  parseCnipaGazetteBrowserStreamState,
} from "./cnipa-gazette-browser-stream";

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

function sourcePayload(
  pageIndex: number,
  options: {
    pageSize?: number;
    total?: number;
    pages?: number;
    records?: ReturnType<typeof row>[];
    code?: number;
  } = {},
) {
  const pageSize = options.pageSize ?? 10;
  const total = options.total ?? 576;
  const pages = options.pages ?? Math.max(1, Math.ceil(total / pageSize));
  const start = (pageIndex - 1) * pageSize;
  const length = total === 0 ? 0 : pageIndex < pages ? pageSize : total % pageSize || pageSize;
  return {
    code: options.code ?? 0,
    data: {
      pageIndex,
      pageSize,
      total,
      pages,
      list: options.records ?? Array.from({ length }, (_, offset) => row(start + offset)),
    },
  };
}

function session(
  overrides: Partial<Parameters<typeof createCnipaGazetteBrowserStreamSession>[0]> = {},
) {
  return createCnipaGazetteBrowserStreamSession({
    sessionId: "gazette-75-browser-stream",
    announcementIssue: 75,
    sourceUrl: SOURCE_URL,
    capturedQuery: {
      anncIssue: "75",
      anncType: "",
      regNo: "",
      pageIndex: 1,
      pageSize: 10,
    },
    sourceTotal: 576,
    sourcePages: 58,
    announcementDate: "1983-08-15",
    startedAt: "2026-09-20T06:00:00.000Z",
    ...overrides,
  });
}
function sourcePage(
  currentSession: ReturnType<typeof session>,
  pageIndex: number,
  payload = sourcePayload(pageIndex),
) {
  return parseCnipaGazetteBrowserSourcePage({
    session: currentSession,
    requestedPageIndex: pageIndex,
    observedAt: `2026-09-20T06:${String(pageIndex).padStart(2, "0")}:00.000Z`,
    httpStatus: 200,
    payload,
  });
}

describe("CNIPA Gazette normal-browser stream contract", () => {
  it("normalizes a captured 10-row source stream into 100-row logical pages", () => {
    const currentSession = session();
    let state = createCnipaGazetteBrowserStreamState(currentSession);
    const logicalPages = [];

    for (let pageIndex = 1; pageIndex <= 58; pageIndex += 1) {
      const accepted = acceptCnipaGazetteBrowserSourcePage({
        session: currentSession,
        state,
        page: sourcePage(currentSession, pageIndex),
      });
      state = accepted.state;
      logicalPages.push(...accepted.logicalPages);
      if (pageIndex === 9) {
        expect(state.tailRows).toHaveLength(90);
        expect(logicalPages).toHaveLength(0);
      }
      if (pageIndex === 10) {
        expect(state.tailRows).toHaveLength(0);
        expect(logicalPages[0]?.rows).toHaveLength(100);
      }
    }

    expect(logicalPages.map((page) => page.rows.length)).toEqual([100, 100, 100, 100, 100, 76]);
    expect(logicalPages.map((page) => page.pageIndex)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(logicalPages.every((page) => page.pageSize === 100)).toBe(true);
    expect(logicalPages.every((page) => page.sourcePages === 6)).toBe(true);
    expect(state).toMatchObject({
      nextSourcePageIndex: 59,
      nextLogicalPageIndex: 7,
      rowsSeen: 576,
      completed: true,
    });
    expect(state.tailRows).toHaveLength(0);
    expect(logicalPages.flatMap((page) => page.rows).map((item) => item.sourceRowId)).toHaveLength(
      576,
    );
  });

  it("round-trips a bounded resume snapshot without retaining whole-issue rows", () => {
    const currentSession = session();
    let state = createCnipaGazetteBrowserStreamState(currentSession);

    for (let pageIndex = 1; pageIndex <= 9; pageIndex += 1) {
      state = acceptCnipaGazetteBrowserSourcePage({
        session: currentSession,
        state,
        page: sourcePage(currentSession, pageIndex),
      }).state;
    }

    const resumed = parseCnipaGazetteBrowserStreamState(
      JSON.parse(JSON.stringify(state)),
      currentSession,
    );
    expect(resumed.tailRows).toHaveLength(90);
    expect(resumed.previousSourceRowIds).toHaveLength(10);
    expect(resumed.rowsSeen).toBe(90);
    expect(() =>
      parseCnipaGazetteBrowserStreamState({ ...resumed, rowsSeen: 91 }, currentSession),
    ).toThrow(/internally inconsistent/);

    const accepted = acceptCnipaGazetteBrowserSourcePage({
      session: currentSession,
      state: resumed,
      page: sourcePage(currentSession, 10),
    });
    expect(accepted.logicalPages).toHaveLength(1);
    expect(accepted.logicalPages[0]?.rows).toHaveLength(100);
    expect(accepted.state.tailRows).toHaveLength(0);
  });
  it("rejects FECU/query-string evidence instead of persisting browser session material", () => {
    expect(() =>
      session({
        sourceUrl: `${SOURCE_URL}?FECU=expired`,
      }),
    ).toThrow(/without query\/hash/);

    expect(() =>
      session({
        capturedQuery: {
          anncIssue: "75",
          anncType: "",
          pageIndex: 1,
          pageSize: 10,
          FECU: "must-not-persist",
        },
      }),
    ).toThrow(/forbidden in durable browser-stream evidence/);
    expect(() =>
      session({
        capturedQuery: {
          anncIssue: "75",
          anncType: "",
          pageIndex: 1,
          pageSize: 10,
          accessToken: "must-not-persist",
        },
      }),
    ).toThrow(/forbidden in durable browser-stream evidence/);

    const safeSession = session();
    const safeState = createCnipaGazetteBrowserStreamState(safeSession);
    const durableJson = JSON.stringify({ safeSession, safeState }).toLowerCase();
    expect(durableJson).not.toContain("fecu");
    expect(durableJson).not.toContain("cookie");
    expect(durableJson).not.toContain("headers");
  });

  it("fails closed on source total, source pageSize and sequence drift", () => {
    const currentSession = session();
    expect(() =>
      sourcePage(currentSession, 1, sourcePayload(1, { total: 575, pages: 58 })),
    ).toThrow(/total\/pages drifted/);
    expect(() =>
      sourcePage(currentSession, 1, sourcePayload(1, { pageSize: 20, pages: 29 })),
    ).toThrow(/pageSize drifted/);

    const initial = createCnipaGazetteBrowserStreamState(currentSession);
    expect(() =>
      acceptCnipaGazetteBrowserSourcePage({
        session: currentSession,
        state: initial,
        page: sourcePage(currentSession, 2),
      }),
    ).toThrow(/source page sequence mismatch/);
  });
  it("detects an immediately repeated/overlapping source page", () => {
    const currentSession = session();
    const first = acceptCnipaGazetteBrowserSourcePage({
      session: currentSession,
      state: createCnipaGazetteBrowserStreamState(currentSession),
      page: sourcePage(currentSession, 1),
    });
    const repeatedRecords = Array.from({ length: 10 }, (_, index) => row(index));
    const repeated = sourcePage(currentSession, 2, sourcePayload(2, { records: repeatedRecords }));
    expect(() =>
      acceptCnipaGazetteBrowserSourcePage({
        session: currentSession,
        state: first.state,
        page: repeated,
      }),
    ).toThrow(/overlaps the prior source page|repeats the prior source page/);
  });

  it("preserves transient source semantics for the future loopback bridge", () => {
    const currentSession = session();
    let error: unknown;
    try {
      sourcePage(currentSession, 1, sourcePayload(1, { code: -102 }));
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      code: "CNIPA_GAZETTE_TRANSIENT_SOURCE_ERROR",
      retryable: true,
    });
  });
});
