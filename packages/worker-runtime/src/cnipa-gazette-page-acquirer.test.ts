import { describe, expect, it } from "vitest";
import {
  acquireCnipaGazettePage,
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
    anncType: "TMZCSQ",
    anncTypeName: "商标注册申请初步审定公告",
    regNo: String(100000 + index),
    pageNo: 1,
    fileId: "file-1",
    imgDir: "/group/1983/75/page1.jpg",
    anncPageNum: 100,
    registerCnName: null,
    tmName: null,
    intlCls: null,
    applyDate: null,
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
      payload: unknown;
    },
  ) {}

  async postJson(input: { path: string; body: Readonly<Record<string, string | number>> }) {
    this.calls.push(input);
    return this.response;
  }
}

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
  tmDescType: "",
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
      requestTemplate: template,
      transport,
    });

    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]!.path).toBe(CNIPA_GAZETTE_ENDPOINTS.list);
    expect(transport.calls[0]!.body).toMatchObject({
      anncIssue: "75",
      anncType: "",
      pageIndex: 1,
      pageSize: 100,
      tmDescType: "",
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
  });

  it("accepts the terminal remainder and rejects the wrong terminal length", async () => {
    const ok = new Transport({
      httpStatus: 200,
      payload: successPayload(2, 150, 2, 50),
    });

    await expect(
      acquireCnipaGazettePage({
        announcementIssue: 75,
        pageIndex: 2,
        requestTemplate: template,
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
        requestTemplate: template,
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
        requestTemplate: template,
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
        requestTemplate: template,
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
        requestTemplate: template,
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
        requestTemplate: template,
        transport: forbidden,
      }),
    ).rejects.toMatchObject({
      code: "CNIPA_GAZETTE_HTTP_ERROR",
      retryable: false,
    });
  });

  it("rejects missing registration numbers, cross-issue rows and id drift", async () => {
    const missingReg = successPayload();
    missingReg.data.list[0]!.regNo = "";
    await expect(
      acquireCnipaGazettePage({
        announcementIssue: 75,
        pageIndex: 1,
        requestTemplate: template,
        transport: new Transport({ httpStatus: 200, payload: missingReg }),
      }),
    ).rejects.toThrow(/regNo/);

    const crossIssue = successPayload();
    crossIssue.data.list[0]!.anncIssue = "76";
    await expect(
      acquireCnipaGazettePage({
        announcementIssue: 75,
        pageIndex: 1,
        requestTemplate: template,
        transport: new Transport({ httpStatus: 200, payload: crossIssue }),
      }),
    ).rejects.toThrow(/expected 75/);

    const idDrift = successPayload();
    idDrift.data.list[0]!.searchId = "different";
    await expect(
      acquireCnipaGazettePage({
        announcementIssue: 75,
        pageIndex: 1,
        requestTemplate: template,
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
        requestTemplate: template,
        transport: new Transport({ httpStatus: 200, payload: wrongPage }),
      }),
    ).rejects.toThrow(/does not match requested 1/);

    const wrongSize = successPayload();
    wrongSize.data.pageSize = 10;
    await expect(
      acquireCnipaGazettePage({
        announcementIssue: 75,
        pageIndex: 1,
        requestTemplate: template,
        transport: new Transport({ httpStatus: 200, payload: wrongSize }),
      }),
    ).rejects.toThrow(/pageSize=10/);

    await expect(
      acquireCnipaGazettePage({
        announcementIssue: 75,
        pageIndex: 1,
        requestTemplate: template,
        transport: new Transport({
          httpStatus: 200,
          payload: { code: 0, data: { list: null, total: 1, pages: 1 } },
        }),
      }),
    ).rejects.toThrow(/data.list must be an array/);
  });
});
