import { describe, expect, it } from "vitest";
import { materializeCnipaListPage } from "./cnipa-list-materializer";

describe("CNIPA LIST materializer", () => {
  it("materializes registration LIST rows from authenticated v0.8 fields", () => {
    const page = materializeCnipaListPage("REGISTRATION_EXAMINATION", {
      code: 0,
      data: {
        list: [
          {
            adjuId: "2067174869360140288",
            adjuOpenId: "2067174869360140288",
            adjuTitle: "关于第91031815号商标驳回通知书",
            agentInstName: "河南辉衢法律咨询服务有限公司",
            applicantCnName: "吴秀禄",
            applyNo: "91031815",
            citeTmRegNo: null,
            fileContent:
              "　　经审查，根据《商标法》的规定，我局决定驳回上述商标注册申请。\n　　特此通知。",
            openFlag: null,
            regNo: "91031815",
            returnDate: "2026-07-01 00:00:00",
            returnDateStr: "2026-07-01",
            sendBarCode: "B1021TMZC00000091031815BHTZ0100017",
            sendNo: "TMZC20260002402497BHTZ01",
            sendNoStr: "TMZC20260002402497BHTZ01",
            tmName: "优弗迪红颜",
            validFlag: 1,
          },
        ],
      },
    });

    expect(page.recordCount).toBe(1);
    const record = page.records[0]!;
    expect(record.sourceRecordId).toBe("2067174869360140288");
    expect(record.factProjection.sourceFields).toMatchObject({
      applicantCnName: "吴秀禄",
      regNo: "91031815",
      returnDateStr: "2026-07-01",
      tmName: "优弗迪红颜",
    });
    expect(record.factProjection.sourceFields).not.toHaveProperty("fileContent");
    expect(record.documentSeed).toMatchObject({
      sourceRecordId: "2067174869360140288",
      title: "关于第91031815号商标驳回通知书",
      decisionDate: "2026-07-01",
      registrationNumber: "91031815",
      trademarkName: "优弗迪红颜",
      logicalDocumentUri:
        "cnipa://judgment/REGISTRATION_EXAMINATION/2067174869360140288",
    });
    expect(record.documentSeed?.markdownBody).toContain(
      "# 关于第91031815号商标驳回通知书",
    );
    expect(record.documentSeed?.markdownBody).toContain("特此通知");
    expect(record.detailCanonicalUri).toBe(
      "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/pubnotice/portal/tmscJudgment/queryInfo?id=2067174869360140288",
    );
  });

  it("uses opposition adjuOpenId rather than internal adjuId and preserves source roles", () => {
    const page = materializeCnipaListPage("OPPOSITION_DECISION", {
      code: 0,
      data: {
        list: [
          {
            adjuId: "2065338891878191104",
            adjuOpenId: "2089022171466878976",
            adjuTitle: "第84967009号“惠普森米”商标不予注册的决定",
            applyNo: "20250000084750",
            citeTms: null,
            fileContent:
              "　　异议人：石和杰\n　　被异议人：西咸新区沣东新城伯雅百货店\n　　依据《商标法》规定，我局决定不予注册。",
            objenderAgentName: "直接办理",
            objenderCnName: "石和杰",
            objeperAgentName: null,
            objeperCnName: "西咸新区沣东新城伯雅百货店",
            openFlag: null,
            regNo: "84967009",
            returnDate: "2026-07-09 21:01:36",
            returnDateStr: "2026-07-09",
            snedNo: null,
            snedNoStr: null,
            tmName: "惠普森米",
            validFlag: null,
          },
        ],
      },
    });

    const record = page.records[0]!;
    expect(record.sourceRecordId).toBe("2089022171466878976");
    expect(record.factProjection.sourceFields).toMatchObject({
      adjuId: "2065338891878191104",
      adjuOpenId: "2089022171466878976",
      objenderCnName: "石和杰",
      objeperCnName: "西咸新区沣东新城伯雅百货店",
    });
    expect(record.detailCanonicalUri).toContain("id=2089022171466878976");
    expect(record.detailCanonicalUri).not.toContain("2065338891878191104");
  });

  it("materializes review LIST rows using pubId and review-native fields", () => {
    const page = materializeCnipaListPage("REVIEW_ADJUDICATION", {
      code: 0,
      data: {
        list: [
          {
            agentInstName: null,
            applicantName: "广东聚实力科技发展有限公司",
            applyNo: "20240000171869",
            fileContent:
              "　　申请人：广东聚实力科技发展有限公司\n　　申请人对我局驳回申请不服，向我局申请复审。\n　　依照《中华人民共和国商标法》规定，我局决定如下。",
            fileTitle: "关于第78080702号图形商标驳回复审决定书",
            judgeDate: "2026-07-01",
            judgeDateStr: "2026-07-01",
            pubFlag: null,
            pubId: "2072268351827644416",
            regNo: "78080702",
            respondentName: null,
            sendDocNo: "商评字[2026]第0000143755号",
            tmName: "图形",
            validFlag: 1,
          },
        ],
      },
    });

    const record = page.records[0]!;
    expect(record.sourceRecordId).toBe("2072268351827644416");
    expect(record.factProjection.sourceFields).toMatchObject({
      applicantName: "广东聚实力科技发展有限公司",
      pubId: "2072268351827644416",
      sendDocNo: "商评字[2026]第0000143755号",
      regNo: "78080702",
    });
    expect(record.documentSeed).toMatchObject({
      title: "关于第78080702号图形商标驳回复审决定书",
      decisionDate: "2026-07-01",
      registrationNumber: "78080702",
      trademarkName: "图形",
    });
    expect(record.detailCanonicalUri).toBe(
      "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/pubnotice/portal/tmpsJudgment/queryInfo?id=2072268351827644416",
    );
  });

  it("keeps fact projection usable when a rare LIST row has no document body", () => {
    const page = materializeCnipaListPage("REVIEW_ADJUDICATION", {
      code: 0,
      data: {
        list: [
          {
            pubId: "review-no-body",
            fileTitle: "Document without body",
            regNo: "12345678",
            fileContent: null,
          },
        ],
      },
    });

    const record = page.records[0]!;
    expect(record.factProjection.sourceRecordId).toBe("review-no-body");
    expect(record.documentSeed).toBeNull();
    expect(record.warnings).toEqual(["FILE_CONTENT_MISSING"]);
  });

  it("does not project unknown source fields or document bodies into the fact candidate", () => {
    const page = materializeCnipaListPage("REGISTRATION_EXAMINATION", {
      code: 0,
      data: {
        list: [
          {
            adjuOpenId: "known-1",
            adjuTitle: "Known",
            fileContent: "正文",
            regNo: "100",
            unexpectedFutureField: "not-admitted-yet",
          },
        ],
      },
    });

    expect(page.records[0]!.factProjection.sourceFields).not.toHaveProperty("fileContent");
    expect(page.records[0]!.factProjection.sourceFields).not.toHaveProperty(
      "unexpectedFutureField",
    );
  });

  it("hashes the same source row identically regardless of JSON key order", () => {
    const left = materializeCnipaListPage("REGISTRATION_EXAMINATION", {
      code: 0,
      data: {
        list: [
          {
            adjuOpenId: "stable-1",
            adjuTitle: "Stable",
            fileContent: "正文",
            regNo: "100",
            tmName: "示例",
          },
        ],
      },
    });
    const right = materializeCnipaListPage("REGISTRATION_EXAMINATION", {
      code: 0,
      data: {
        list: [
          {
            tmName: "示例",
            regNo: "100",
            fileContent: "正文",
            adjuTitle: "Stable",
            adjuOpenId: "stable-1",
          },
        ],
      },
    });

    expect(left.records[0]!.factProjection.sourceRowSha256).toBe(
      right.records[0]!.factProjection.sourceRowSha256,
    );
  });

  it("fails closed when the canonical LIST identity is missing", () => {
    expect(() =>
      materializeCnipaListPage("OPPOSITION_DECISION", {
        code: 0,
        data: {
          list: [
            {
              adjuId: "internal-only",
              adjuOpenId: null,
              fileContent: "正文",
            },
          ],
        },
      }),
    ).toThrowError(/adjuOpenId must be a non-empty string/i);
  });

  it("fails closed on a non-success business response", () => {
    expect(() =>
      materializeCnipaListPage("REVIEW_ADJUDICATION", {
        code: -107,
        message: "divide selector missing",
        data: null,
      }),
    ).toThrowError(/response code must be 0/i);
  });
});
