import { describe, expect, it } from "vitest";
import {
  acquireCnipaGazettePage,
  acquireCnipaGazettePageWithEvidence,
  CnipaGazetteSourceError,
  type CnipaGazetteJsonTransport,
} from "./cnipa-gazette-page-acquirer";
import { CNIPA_GAZETTE_ENDPOINTS } from "./cnipa-trademark-gazette";

function sourceRow(index: number) {
  const id = `row-${index}`;
  return {
    id,
    searchId: id,
    anncIssue: "75",
    anncDate: "1983-08-15",
    anncType: "TMZCSQ",
    anncTypeName: "商标初步审定公告",
    regNo: String(100000 + index),
    pageNo: 1,
    fileId: "file-1",
    imgDir: "/group/1983/75/page1.jpg",
    anncPageNum: 100,
    registerCnName: "ignored applicant",
    tmName: "ignored trademark",
    intlCls: "3",
    applyDate: "1983-04-13",
  };
}

function successPayload(pageIndex = 1, sourceTotal = 150, sourcePages = 2, count = 100) {
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

class Transport implements CnipaGazetteJsonTransport {
  calls: Array<{ path: string; body: Readonly<Record<string, string | number>> }> = [];

  constructor(
    private readonly response: {
      httpStatus: number;
      payload?: unknown;
      rawBody?: Uint8Array;
      observedAt?: string;
      contentType?: string;
    },
  ) {}

  async postJson(input: { path: string; body: Readonly<Record<string, string | number>> }) {
    this.calls.push(input);
    const rawBody =
      this.response.rawBody ??
      new TextEncoder().encode(JSON.stringify(this.response.payload ?? null));
    return {
      httpStatus: this.response.httpStatus,
      rawBody,
      observedAt: this.response.observedAt ?? "2026-09-19T06:48:37.552Z",
      ...(this.response.contentType ? { contentType: this.response.contentType } : {}),
    };
  }
}

const allTemplate = {
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

describe("CNIPA Gazette page acquirer", () => {
  it("uses canonical LIST endpoint and only applies frozen paging overrides", async () => {
    const transport = new Transport({ httpStatus: 200, payload: successPayload() });

    const result = await acquireCnipaGazettePage({
      announcementIssue: 75,
      pageIndex: 1,
      requestTemplate: allTemplate,
      transport,
    });

    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]!.path).toBe(CNIPA_GAZETTE_ENDPOINTS.list);
    expect(transport.calls[0]!.body).toMatchObject({
      anncIssue: "75",
      anncType: "",
      pageIndex: 1,
      pageSize: 100,
      tmDescType: "0",
    });
    expect(result).toMatchObject({
      pageIndex: 1,
      pageSize: 100,
      sourceTotal: 150,
      sourcePages: 2,
    });
    expect(result.rows).toHaveLength(100);
    expect(result.rows[0]).toMatchObject({
      sourceRowId: "row-0",
      sourceSearchId: "row-0",
      registrationNumber: "100000",
      announcementIssue: 75,
      announcementTypeCode: "TMZCSQ",
      detailFileId: "file-1",
      detailAssetPath: "/group/1983/75/page1.jpg",
      announcementDetailUrl: "",
    });
    expect(result.rows[0]).not.toHaveProperty("registerCnName");
    expect(result.rows[0]).not.toHaveProperty("tmName");
    expect(result.rows[0]).not.toHaveProperty("intlCls");
    expect(result.rows[0]).not.toHaveProperty("applyDate");
  });

  it("preserves exact raw response bytes as immutable parent evidence", async () => {
    const payload = successPayload();
    const rawText = JSON.stringify(payload, null, 2);
    const rawBody = new TextEncoder().encode(rawText);
    const transport = new Transport({
      httpStatus: 200,
      rawBody,
      observedAt: "2026-09-19T06:48:37.552Z",
      contentType: "application/json;charset=UTF-8",
    });

    const result = await acquireCnipaGazettePageWithEvidence({
      announcementIssue: 75,
      pageIndex: 1,
      requestTemplate: allTemplate,
      transport,
    });

    expect(result.rawArtifact.content).toBe(rawBody);
    expect(new TextDecoder().decode(result.rawArtifact.content)).toBe(rawText);
    expect(result.rawArtifact).toMatchObject({
      artifactKind: "JSON",
      sourceUri:
        "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg",
      canonicalUri: "cnipa://trademark-gazette/issue/75/list/page/1/raw",
    });
    expect(result.rawArtifact.sourceUri).not.toContain("FECU");

    expect(result.projectionArtifact.parentCanonicalUris).toEqual([
      "cnipa://trademark-gazette/issue/75/list/page/1/raw",
    ]);
    expect(result.projectionArtifact.canonicalUri).toBe(
      "cnipa://trademark-gazette/issue/75/list/page/1/projection",
    );

    const projection = JSON.parse(
      new TextDecoder().decode(result.projectionArtifact.content),
    ) as Record<string, unknown>;
    expect(projection).toMatchObject({
      schemaVersion: "CNIPA_GAZETTE_PAGE_EVIDENCE_V1",
      sourceOwner: "MARKORBIT_KNOWLEDGE",
      sourceFamily: "CNIPA_TRADEMARK_GAZETTE",
      announcementIssue: 75,
      pageIndex: 1,
      pageSize: 100,
      observedAt: "2026-09-19T06:48:37.552Z",
    });
    const encodedProjection = JSON.stringify(projection);
    expect(encodedProjection).not.toContain("ignored applicant");
    expect(encodedProjection).not.toContain("ignored trademark");
  });

  it("accepts terminal remainder and rejects wrong terminal length", async () => {
    const ok = new Transport({
      httpStatus: 200,
      payload: successPayload(2, 150, 2, 50),
    });

    await expect(
      acquireCnipaGazettePage({
        announcementIssue: 75,
        pageIndex: 2,
        requestTemplate: allTemplate,
        transport: ok,
      }),
    ).resolves.toMatchObject({ sourceTotal: 150, sourcePages: 2 });

    const bad = new Transport({
      httpStatus: 200,
      payload: successPayload(2, 150, 2, 49),
    });
    await expect(
      acquireCnipaGazettePage({
        announcementIssue: 75,
        pageIndex: 2,
        requestTemplate: allTemplate,
        transport: bad,
      }),
    ).rejects.toThrow(/expected 50/);
  });

  it("fails closed when session authentication expires", async () => {
    const transport = new Transport({
      httpStatus: 200,
      payload: { code: 401, msg: "登录已过期" },
    });

    try {
      await acquireCnipaGazettePage({
        announcementIssue: 75,
        pageIndex: 1,
        requestTemplate: allTemplate,
        transport,
      });
      throw new Error("expected auth error");
    } catch (error) {
      expect(error).toBeInstanceOf(CnipaGazetteSourceError);
      expect((error as CnipaGazetteSourceError).code).toBe("CNIPA_GAZETTE_AUTH_EXPIRED");
      expect((error as CnipaGazetteSourceError).retryable).toBe(false);
    }
  });

  it("marks only known transient source/HTTP failures as retryable", async () => {
    const transientSource = new Transport({
      httpStatus: 200,
      payload: { code: -102 },
    });
    await expect(
      acquireCnipaGazettePage({
        announcementIssue: 75,
        pageIndex: 1,
        requestTemplate: allTemplate,
        transport: transientSource,
      }),
    ).rejects.toMatchObject({
      code: "CNIPA_GAZETTE_TRANSIENT_SOURCE_ERROR",
      retryable: true,
    });

    const throttled = new Transport({ httpStatus: 429, payload: null });
    await expect(
      acquireCnipaGazettePage({
        announcementIssue: 75,
        pageIndex: 1,
        requestTemplate: allTemplate,
        transport: throttled,
      }),
    ).rejects.toMatchObject({
      code: "CNIPA_GAZETTE_HTTP_ERROR",
      retryable: true,
    });

    const forbidden = new Transport({ httpStatus: 403, payload: null });
    await expect(
      acquireCnipaGazettePage({
        announcementIssue: 75,
        pageIndex: 1,
        requestTemplate: allTemplate,
        transport: forbidden,
      }),
    ).rejects.toMatchObject({
      code: "CNIPA_GAZETTE_HTTP_ERROR",
      retryable: false,
    });
  });

  it("rejects invalid raw evidence bytes before normalization", async () => {
    await expect(
      acquireCnipaGazettePageWithEvidence({
        announcementIssue: 75,
        pageIndex: 1,
        requestTemplate: allTemplate,
        transport: new Transport({
          httpStatus: 200,
          rawBody: new TextEncoder().encode("{not json"),
        }),
      }),
    ).rejects.toThrow(/not valid JSON/);

    await expect(
      acquireCnipaGazettePageWithEvidence({
        announcementIssue: 75,
        pageIndex: 1,
        requestTemplate: allTemplate,
        transport: new Transport({
          httpStatus: 200,
          rawBody: new Uint8Array(),
        }),
      }),
    ).rejects.toThrow(/non-empty raw response bytes/);
  });

  it("rejects inconsistent announcement dates within one source page", async () => {
    const inconsistent = successPayload();
    inconsistent.data.list[1]!.anncDate = "1983-08-16";

    await expect(
      acquireCnipaGazettePage({
        announcementIssue: 75,
        pageIndex: 1,
        requestTemplate: allTemplate,
        transport: new Transport({ httpStatus: 200, payload: inconsistent }),
      }),
    ).rejects.toThrow(/inconsistent announcement dates/);
  });

  it("rejects missing registration numbers, cross-issue rows and id drift", async () => {
    const missingReg = successPayload();
    missingReg.data.list[0]!.regNo = "";
    await expect(
      acquireCnipaGazettePage({
        announcementIssue: 75,
        pageIndex: 1,
        requestTemplate: allTemplate,
        transport: new Transport({ httpStatus: 200, payload: missingReg }),
      }),
    ).rejects.toThrow(/regNo/);

    const crossIssue = successPayload();
    crossIssue.data.list[0]!.anncIssue = "76";
    await expect(
      acquireCnipaGazettePage({
        announcementIssue: 75,
        pageIndex: 1,
        requestTemplate: allTemplate,
        transport: new Transport({ httpStatus: 200, payload: crossIssue }),
      }),
    ).rejects.toThrow(/expected 75/);

    const idDrift = successPayload();
    idDrift.data.list[0]!.searchId = "different";
    await expect(
      acquireCnipaGazettePage({
        announcementIssue: 75,
        pageIndex: 1,
        requestTemplate: allTemplate,
        transport: new Transport({ httpStatus: 200, payload: idDrift }),
      }),
    ).rejects.toThrow(/does not match id/);
  });

  it("rejects response paging drift and malformed envelopes", async () => {
    const wrongPage = successPayload();
    wrongPage.data.pageIndex = 2;
    await expect(
      acquireCnipaGazettePage({
        announcementIssue: 75,
        pageIndex: 1,
        requestTemplate: allTemplate,
        transport: new Transport({ httpStatus: 200, payload: wrongPage }),
      }),
    ).rejects.toThrow(/does not match requested 1/);

    const wrongSize = successPayload();
    wrongSize.data.pageSize = 10;
    await expect(
      acquireCnipaGazettePage({
        announcementIssue: 75,
        pageIndex: 1,
        requestTemplate: allTemplate,
        transport: new Transport({ httpStatus: 200, payload: wrongSize }),
      }),
    ).rejects.toThrow(/pageSize=10/);

    await expect(
      acquireCnipaGazettePage({
        announcementIssue: 75,
        pageIndex: 1,
        requestTemplate: allTemplate,
        transport: new Transport({
          httpStatus: 200,
          payload: { code: 0, data: { list: null, total: 1, pages: 1 } },
        }),
      }),
    ).rejects.toThrow(/data.list must be an array/);
  });

  it("fails closed if request template is not ALL announcement types", async () => {
    await expect(
      acquireCnipaGazettePage({
        announcementIssue: 75,
        pageIndex: 1,
        requestTemplate: { ...allTemplate, anncType: "TMZCSQ" },
        transport: new Transport({ httpStatus: 200, payload: successPayload() }),
      }),
    ).rejects.toThrow();
  });
});
