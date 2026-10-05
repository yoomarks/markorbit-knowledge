import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CollectionAcquisitionError } from "./artifact-backed-collection-executor";
import {
  LAOS_LIST_URL,
  LAOS_ORIGIN,
  LAOS_SOURCE_ID,
  LaosHttpSession,
  LaosWopublishSourceAdapter,
  laosSha256,
  parseLaosDetail,
  parseLaosList,
  redactLaosResponse,
  type LaosHttpRequest,
  type LaosHttpResponse,
  type LaosHttpTransport,
} from "./laos-wopublish-source-adapter";

const encoder = new TextEncoder();
const text = (s: string) => encoder.encode(s);
const observedAt = "2026-09-24T00:00:00.000Z";
const ids = (start: number) => Array.from({ length: 50 }, (_, i) => "LA" + String(start + i));
const links = (values: string[]) =>
  values
    .map((id) => '<tr><td><a href="./detail/trademarks?id=' + id + '">' + id + "</a></td></tr>")
    .join("");
const firstIds = ids(54000);
const secondIds = ids(54100);
const next =
  "./trademarks;jsessionid=SECRETSESSION?0-1.IBehaviorListener.0-body-searchResultPanel-resultWrapper-dataTable-topToolbars-toolbars-1-span-navigator-next";
const first =
  '<html><script>Wicket.Ajax.baseUrl="public/trademarks?0";' +
  'Wicket.Ajax.ajax({"u":"' +
  next +
  '","e":"click","c":"id14"});</script>' +
  '<li class="navigatorLabel results-display-text"><div>1 to 50 of 73531</div></li>' +
  "<table>" +
  links(firstIds) +
  "</table></html>";
const second =
  '<?xml version="1.0"?><ajax-response><component id="table"><![CDATA[' +
  links(secondIds) +
  "]]></component></ajax-response>";
const withRange = (xml: string, start: number, end: number, total: number) =>
  xml.replace(
    '<component id="table"><![CDATA[',
    '<component id="table"><![CDATA[<li class="navigatorLabel results-display-text"><div>' +
      `${start} to ${end} of ${total}` +
      "</div></li>",
  );
const field = (label: string, value: string) =>
  '<div class="row"><div class="product-form-label">' +
  label +
  '</div><div class="product-form-details"><div>' +
  value +
  "</div></div></div>";
const detail =
  '<html><span class="application-number">ຄໍາຮ້ອງ : LA 55159</span>' +
  field("ເຄື່ອງໝາຍ:", "GF") +
  field("ສະຖານະ:", "Filed") +
  field("ມື້ຍື່ນຄຳຮ້ອງ:", "10.09.2026") +
  field("ຜູ້ຍື່ນຄຳຮ້ອງ:", "Lao Applicant Ltd.") +
  field("ການຈັດໝວດ Nice:", "30 rice") +
  field("ເລກທີການຈົດທະບຽນ:", "") +
  '<img class="detail-img" src="' +
  LAOS_ORIGIN +
  '/wopublish-search/service/trademarks/application/LA55159/logo?noLogo=true"></html>';
function response(body: string, mime: string, status = 200): LaosHttpResponse {
  return { status, body: text(body), contentType: mime, observedAt };
}
class Scripted implements LaosHttpTransport {
  readonly requests: LaosHttpRequest[] = [];
  constructor(private readonly responses: Array<LaosHttpResponse | Error>) {}
  async get(request: LaosHttpRequest): Promise<LaosHttpResponse> {
    this.requests.push(request);
    const nextResponse = this.responses.shift();
    if (!nextResponse) throw Error("Unexpected extra request");
    if (nextResponse instanceof Error) throw nextResponse;
    return nextResponse;
  }
}
function adapter(responses: LaosHttpResponse[], sleeps: number[] = []) {
  const session = new Scripted(responses);
  return {
    session,
    subject: new LaosWopublishSourceAdapter({
      transportFactory: () => session,
      intervalMs: 0,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    }),
  };
}
describe("Laos WoPublish bounded SourceAdapter", () => {
  it("extracts exactly 50 true source IDs, official total, and dynamic Wicket next callback", () => {
    const result = parseLaosList(text(first));
    expect(result.ids).toEqual(firstIds);
    expect(result.total).toBe(73531);
    expect(result.rangeStart).toBe(1);
    expect(result.rangeEnd).toBe(50);
    expect(result.nextUrl).toContain("navigator-next");
    expect(result.nextUrl).toContain("jsessionid");
  });
  it("accepts official Lao Madrid source identities without broadening the route", () => {
    const madridList = first.replaceAll("LA54000", "LAM1764514");
    const parsed = parseLaosList(text(madridList));
    expect(parsed.ids).toHaveLength(50);
    expect(parsed.ids).toContain("LAM1764514");
    const madridDetail = detail.replaceAll("55159", "M1764514");
    expect(parseLaosDetail(text(madridDetail), "LAM1764514").id).toBe("LAM1764514");
  });
  it("reparses redacted session paths from persisted list evidence without reintroducing credentials", () => {
    const sessionHtml = first.replaceAll(
      "./detail/trademarks?id=",
      "./detail/trademarks;jsessionid=TRANSIENTSESSION?id=",
    );
    const evidence = redactLaosResponse(text(sessionHtml));
    const rendered = new TextDecoder().decode(evidence);
    expect(rendered).not.toContain("TRANSIENTSESSION");
    expect(rendered).not.toContain("SECRETSESSION");
    expect(rendered).toContain("jsessionid=[REDACTED]");
    expect(parseLaosList(evidence).ids).toEqual(firstIds);
    expect(parseLaosList(evidence).total).toBe(73531);
    const invalid = sessionHtml.replaceAll(
      ";jsessionid=TRANSIENTSESSION",
      ";jsessionid=[UNEXPECTED]",
    );
    expect(parseLaosList(text(invalid)).ids).toEqual([]);
  });
  it("rejects invented page numbers rather than enumerating presumed sequential IDs", async () => {
    const { subject, session } = adapter([]);
    await expect(
      subject.fetch({ sourceId: LAOS_SOURCE_ID, cursor: "3", params: { mode: "PAGE" } }),
    ).rejects.toMatchObject({ code: "LA_PILOT_BOUND_EXCEEDED" });
    expect(session.requests).toHaveLength(0);
  });
  it("emits redacted first-page source evidence and a resumable ID digest", async () => {
    const { subject } = adapter([response(first, "text/html;charset=UTF-8")]);
    const result = await subject.fetch({ sourceId: LAOS_SOURCE_ID, params: { mode: "PAGE" } });
    expect(result.nextCursor).toBe("2");
    const page = result.items[0];
    expect(page?.kind).toBe("PAGE");
    if (page?.kind !== "PAGE") throw Error("Expected page");
    expect(page.ids).toEqual(firstIds);
    expect(page.firstPageIdsSha256).toBe(laosSha256(text(firstIds.join("\n"))));
    expect(new TextDecoder().decode(page.redactedBody)).not.toContain("SECRETSESSION");
    expect(page.rawSha256).toBe(laosSha256(text(first)));
  });
  it("replays a fresh first page to resume the second without persisting the session", async () => {
    const { subject, session } = adapter([
      response(first, "text/html"),
      response(second, "text/xml"),
    ]);
    const result = await subject.fetch({
      sourceId: LAOS_SOURCE_ID,
      cursor: "2",
      params: {
        mode: "PAGE",
        expectedFirstPageIdsSha256: laosSha256(text(firstIds.join("\n"))),
        expectedSourceTotal: "73531",
      },
    });
    expect(result.nextCursor).toBeUndefined();
    expect(session.requests).toHaveLength(2);
    expect(session.requests[1]?.url).toContain("navigator-next");
    expect(session.requests[1]?.headers["wicket-ajax"]).toBe("true");
    expect(result.items[0]).toMatchObject({ kind: "PAGE", page: 2, ids: secondIds, total: 73531 });
  });
  it("fails closed when a prior-page checkpoint hash no longer matches", async () => {
    const { subject, session } = adapter([response(first, "text/html")]);
    await expect(
      subject.fetch({
        sourceId: LAOS_SOURCE_ID,
        cursor: "2",
        params: {
          mode: "PAGE",
          expectedFirstPageIdsSha256: "a".repeat(64),
          expectedSourceTotal: "73531",
        },
      }),
    ).rejects.toMatchObject({ code: "LA_RESUME_DRIFT" });
    expect(session.requests).toHaveLength(1);
  });
  it("does not accept overlapping or partial Wicket pages as a complete pilot", async () => {
    const overlap =
      '<?xml version="1.0"?><ajax-response><![CDATA[' + links(firstIds) + "]]></ajax-response>";
    const { subject } = adapter([response(first, "text/html"), response(overlap, "text/xml")]);
    await expect(
      subject.fetch({
        sourceId: LAOS_SOURCE_ID,
        cursor: "2",
        params: {
          mode: "PAGE",
          expectedFirstPageIdsSha256: laosSha256(text(firstIds.join("\n"))),
          expectedSourceTotal: "73531",
        },
      }),
    ).rejects.toMatchObject({ code: "LA_PAGE_SCHEMA_DRIFT" });
  });
  it("recovers a rejected session once, but not an access challenge", async () => {
    const firstSession = new Scripted([response("", "text/html", 302)]);
    const recovered = new Scripted([response(first, "text/html")]);
    const sessions = [firstSession, recovered];
    const subject = new LaosWopublishSourceAdapter({
      transportFactory: () => sessions.shift()!,
      intervalMs: 0,
      sleep: async () => {},
    });
    expect(
      (await subject.fetch({ sourceId: LAOS_SOURCE_ID, params: { mode: "PAGE" } })).items,
    ).toHaveLength(1);
    const challenged = adapter([response("", "text/html", 403)]);
    await expect(
      challenged.subject.fetch({ sourceId: LAOS_SOURCE_ID, params: { mode: "PAGE" } }),
    ).rejects.toMatchObject({ code: "LA_ACCESS_CHALLENGE" });
  });
  it("follows only the bounded official TLS-normalized session bootstrap", async () => {
    const firstRedirect = response("", "text/html", 302);
    firstRedirect.headers = {
      location: "http://online.dip.gov.la/wopublish-search/public/trademarks",
    };
    const sessionRedirect = response("", "text/html", 302);
    sessionRedirect.headers = {
      location:
        "http://online.dip.gov.la/wopublish-search/public/trademarks;jsessionid=TRANSIENTSESSION?0",
    };
    const { subject, session } = adapter([
      firstRedirect,
      sessionRedirect,
      response(first, "text/html"),
    ]);
    const result = await subject.fetch({ sourceId: LAOS_SOURCE_ID, params: { mode: "PAGE" } });
    expect(result.items).toHaveLength(1);
    expect(session.requests.map((request) => request.url)).toEqual([
      LAOS_LIST_URL,
      "https://online.dip.gov.la/wopublish-search/public/trademarks",
      "https://online.dip.gov.la/wopublish-search/public/trademarks;jsessionid=TRANSIENTSESSION?0",
    ]);

    const external = response("", "text/html", 302);
    external.headers = { location: "https://example.com/wopublish-search/public/trademarks?0" };
    await expect(
      adapter([external, external]).subject.fetch({
        sourceId: LAOS_SOURCE_ID,
        params: { mode: "PAGE" },
      }),
    ).rejects.toMatchObject({ code: "LA_SESSION_EXPIRED" });
  });
  it("bounds transient retries and honors a capped Retry-After", async () => {
    const waits: number[] = [];
    const r = response("", "text/html", 429);
    r.headers = { "retry-after": "2" };
    const { subject, session } = adapter([r, response(first, "text/html")], waits);
    await subject.fetch({ sourceId: LAOS_SOURCE_ID, params: { mode: "PAGE" } });
    expect(session.requests).toHaveLength(2);
    expect(waits).toEqual([2000]);
  });
  it("streams all true index IDs through one Wicket session without guessing IDs", async () => {
    const tinyFirst = first.replace("73531", "125");
    const next3 =
      "./trademarks?0-2.IBehaviorListener.0-body-searchResultPanel-resultWrapper-dataTable-topToolbars-toolbars-1-span-navigator-next";
    const secondWithNext = withRange(second, 51, 100, 125).replace(
      "</ajax-response>",
      '<evaluate><![CDATA[Wicket.Ajax.ajax({"u":"' +
        next3 +
        '","e":"click","c":"id15"});]]></evaluate></ajax-response>',
    );
    const finalIds = ids(54200).slice(0, 25);
    const finalXml =
      '<?xml version="1.0"?><ajax-response><component><![CDATA[' +
      '<li class="navigatorLabel results-display-text"><div>101 to 125 of 125</div></li>' +
      links(finalIds) +
      "]]></component></ajax-response>";
    const { subject, session } = adapter([
      response(tinyFirst, "text/html"),
      response(secondWithNext, "text/xml"),
      response(finalXml, "text/xml"),
    ]);
    const pages: number[] = [];
    const collected: string[] = [];
    for await (const page of subject.streamFullIndex({ maxPages: 3 })) {
      pages.push(page.page);
      collected.push(...page.ids);
      expect(page.sourceRecordIdsSha256).toBe(laosSha256(text(page.ids.join("\n"))));
      expect(new TextDecoder().decode(page.redactedBody)).not.toContain("SECRETSESSION");
    }
    expect(pages).toEqual([1, 2, 3]);
    expect(collected).toHaveLength(125);
    expect(new Set(collected).size).toBe(125);
    expect(session.requests).toHaveLength(3);
    expect(session.requests.slice(1).every((r) => r.headers["wicket-ajax"] === "true")).toBe(true);
  });
  it("re-fetches one transiently incomplete non-final index page before committing it", async () => {
    const tinyFirst = first.replace("73531", "150");
    const next3 =
      "./trademarks?0-2.IBehaviorListener.0-body-searchResultPanel-resultWrapper-dataTable-topToolbars-toolbars-1-span-navigator-next";
    const secondWithNext = withRange(second, 51, 100, 150).replace(
      "</ajax-response>",
      '<evaluate><![CDATA[Wicket.Ajax.ajax({"u":"' +
        next3 +
        '","e":"click","c":"id15"});]]></evaluate></ajax-response>',
    );
    const incompleteSecond = withRange(second, 51, 100, 150).replace(
      links(secondIds),
      links(secondIds.slice(0, 38)),
    );
    const finalIds = ids(54200);
    const finalXml =
      '<?xml version="1.0"?><ajax-response><component><![CDATA[' +
      '<li class="navigatorLabel results-display-text"><div>101 to 150 of 150</div></li>' +
      links(finalIds) +
      "]]></component></ajax-response>";
    const { subject, session } = adapter([
      response(tinyFirst, "text/html"),
      response(incompleteSecond, "text/xml"),
      response(secondWithNext, "text/xml"),
      response(finalXml, "text/xml"),
    ]);
    const collected: string[] = [];
    for await (const page of subject.streamFullIndex({ maxPages: 3 })) collected.push(...page.ids);
    expect(collected).toHaveLength(150);
    expect(new Set(collected).size).toBe(150);
    expect(session.requests).toHaveLength(4);
    expect(session.requests[1]?.url).toBe(session.requests[2]?.url);
    expect(session.requests[1]?.headers).toEqual(session.requests[2]?.headers);
  });
  it("re-fetches one exact-range page containing a previously seen ID before committing it", async () => {
    const tinyFirst = first.replace("73531", "150");
    const next3 =
      "./trademarks?0-2.IBehaviorListener.0-body-searchResultPanel-resultWrapper-dataTable-topToolbars-toolbars-1-span-navigator-next";
    const secondWithNext = withRange(second, 51, 100, 150).replace(
      "</ajax-response>",
      '<evaluate><![CDATA[Wicket.Ajax.ajax({"u":"' +
        next3 +
        '","e":"click","c":"id15"});]]></evaluate></ajax-response>',
    );
    const duplicateSecond = withRange(second, 51, 100, 150).replace(secondIds[0]!, firstIds[0]!);
    const finalIds = ids(54200);
    const finalXml =
      '<?xml version="1.0"?><ajax-response><component><![CDATA[' +
      '<li class="navigatorLabel results-display-text"><div>101 to 150 of 150</div></li>' +
      links(finalIds) +
      "]]></component></ajax-response>";
    const { subject, session } = adapter([
      response(tinyFirst, "text/html"),
      response(duplicateSecond, "text/xml"),
      response(secondWithNext, "text/xml"),
      response(finalXml, "text/xml"),
    ]);
    const collected: string[] = [];
    for await (const page of subject.streamFullIndex({ maxPages: 3 })) collected.push(...page.ids);
    expect(collected).toHaveLength(150);
    expect(new Set(collected).size).toBe(150);
    expect(session.requests).toHaveLength(4);
    expect(session.requests[1]?.url).toBe(session.requests[2]?.url);
    expect(session.requests[1]?.headers).toEqual(session.requests[2]?.headers);
  });
  it("rejects a replayed Wicket callback that advances to a different official range", async () => {
    const tinyFirst = first.replace("73531", "150");
    const incompleteSecond = withRange(second, 51, 100, 150).replace(
      links(secondIds),
      links(secondIds.slice(0, 38)),
    );
    const advanced = withRange(second.replace(links(secondIds), links(ids(54200))), 101, 150, 150);
    const { subject, session } = adapter([
      response(tinyFirst, "text/html"),
      response(incompleteSecond, "text/xml"),
      response(advanced, "text/xml"),
    ]);
    await expect(async () => {
      for await (const page of subject.streamFullIndex({ maxPages: 3 })) {
        expect(page.page).toBe(1);
      }
    }).rejects.toMatchObject({ code: "LA_INDEX_PAGE_DRIFT" });
    expect(session.requests).toHaveLength(3);
  });
  it("fails closed after bounded incomplete-page retries or inconsistent totals", async () => {
    const tinyFirst = first.replace("73531", "150");
    const incompleteSecond = withRange(second, 51, 100, 150).replace(
      links(secondIds),
      links(secondIds.slice(0, 38)),
    );
    const persistent = adapter([
      response(tinyFirst, "text/html"),
      response(incompleteSecond, "text/xml"),
      response(incompleteSecond, "text/xml"),
      response(incompleteSecond, "text/xml"),
    ]);
    await expect(async () => {
      for await (const page of persistent.subject.streamFullIndex({ maxPages: 3 })) {
        expect(page.page).toBe(1);
      }
    }).rejects.toMatchObject({ code: "LA_INDEX_PAGE_DRIFT" });
    expect(persistent.session.requests).toHaveLength(4);
    expect(new Set(persistent.session.requests.slice(1).map((request) => request.url))).toEqual(
      new Set([persistent.session.requests[1]!.url]),
    );

    const inconsistentSecond = withRange(
      second.replace(links(secondIds), links(secondIds.slice(0, 38))),
      51,
      88,
      149,
    );
    const inconsistent = adapter([
      response(tinyFirst, "text/html"),
      response(inconsistentSecond, "text/xml"),
    ]);
    await expect(async () => {
      for await (const page of inconsistent.subject.streamFullIndex({ maxPages: 3 })) {
        expect(page.page).toBe(1);
      }
    }).rejects.toMatchObject({ code: "LA_INDEX_PAGE_DRIFT" });
    expect(inconsistent.session.requests).toHaveLength(2);
  });
  it("fails closed after bounded exact-range duplicate-page retries", async () => {
    const tinyFirst = first.replace("73531", "150");
    const duplicateSecond = withRange(second, 51, 100, 150).replace(secondIds[0]!, firstIds[0]!);
    const { subject, session } = adapter([
      response(tinyFirst, "text/html"),
      response(duplicateSecond, "text/xml"),
      response(duplicateSecond, "text/xml"),
      response(duplicateSecond, "text/xml"),
    ]);
    await expect(async () => {
      for await (const page of subject.streamFullIndex({ maxPages: 3 })) {
        expect(page.page).toBe(1);
      }
    }).rejects.toMatchObject({ code: "LA_INDEX_PAGE_DRIFT" });
    expect(session.requests).toHaveLength(4);
    expect(new Set(session.requests.slice(1).map((request) => request.url))).toEqual(
      new Set([session.requests[1]!.url]),
    );
  });
  it("replays every committed page digest before resuming after a failure", async () => {
    const tinyFirst = first.replace("73531", "100");
    const firstDigest = laosSha256(text(firstIds.join("\n")));
    const secondDigest = laosSha256(text(secondIds.join("\n")));
    const { subject, session } = adapter([
      response(tinyFirst, "text/html"),
      response(withRange(second, 51, 100, 100), "text/xml"),
    ]);
    const emitted = [];
    for await (const page of subject.streamFullIndex({
      maxPages: 2,
      resume: { sourceTotal: 100, committedPageIdsSha256: [firstDigest] },
    }))
      emitted.push(page.page);
    expect(emitted).toEqual([2]);
    expect(session.requests).toHaveLength(2);
    const drift = adapter([response(tinyFirst, "text/html")]);
    await expect(async () => {
      for await (const page of drift.subject.streamFullIndex({
        maxPages: 2,
        resume: { sourceTotal: 100, committedPageIdsSha256: [secondDigest] },
      })) {
        throw Error("Unexpectedly emitted mismatched page " + page.page);
      }
    }).rejects.toMatchObject({ code: "LA_INDEX_RESUME_DRIFT" });
    expect(drift.session.requests).toHaveLength(1);
  });
  it("resumes one browser timeout only through a fresh session and durable digest replay", async () => {
    const tinyFirst = first.replace("73531", "100");
    const timeout = new CollectionAcquisitionError(
      "LA_BROWSER_RESPONSE_TIMEOUT",
      "Official WoPublish AJAX response outcome is uncertain after timeout",
      false,
    );
    const firstSession = new Scripted([response(tinyFirst, "text/html"), timeout]);
    const resumedSession = new Scripted([
      response(tinyFirst, "text/html"),
      response(withRange(second, 51, 100, 100), "text/xml"),
    ]);
    const sessions = [firstSession, resumedSession];
    const subject = new LaosWopublishSourceAdapter({
      transportFactory: () => sessions.shift()!,
      intervalMs: 0,
    });
    const emitted: number[] = [];
    for await (const page of subject.streamFullIndex({ maxPages: 2 })) emitted.push(page.page);
    expect(emitted).toEqual([1, 2]);
    expect(firstSession.requests).toHaveLength(2);
    expect(resumedSession.requests).toHaveLength(2);
  });
  it("fails closed after one fresh-session timeout resume", async () => {
    const tinyFirst = first.replace("73531", "100");
    const timeout = () =>
      new CollectionAcquisitionError(
        "LA_BROWSER_RESPONSE_TIMEOUT",
        "Official WoPublish AJAX response outcome is uncertain after timeout",
        false,
      );
    const firstSession = new Scripted([response(tinyFirst, "text/html"), timeout()]);
    const resumedSession = new Scripted([response(tinyFirst, "text/html"), timeout()]);
    const sessions = [firstSession, resumedSession];
    const subject = new LaosWopublishSourceAdapter({
      transportFactory: () => sessions.shift()!,
      intervalMs: 0,
    });
    await expect(async () => {
      for await (const page of subject.streamFullIndex({ maxPages: 2 })) {
        expect(page.page).toBe(1);
      }
    }).rejects.toMatchObject({ code: "LA_BROWSER_RESPONSE_TIMEOUT" });
    expect(firstSession.requests).toHaveLength(2);
    expect(resumedSession.requests).toHaveLength(2);
    expect(sessions).toHaveLength(0);
  });
  it("stops the full index before unapproved page budget or duplicate IDs", async () => {
    const over = adapter([response(first, "text/html")]);
    await expect(async () => {
      for await (const page of over.subject.streamFullIndex({ maxPages: 1 })) {
        throw Error("Unapproved page " + page.page + " was emitted");
      }
    }).rejects.toMatchObject({ code: "LA_INDEX_TOTAL_DRIFT" });
    expect(over.session.requests).toHaveLength(1);
    const repeated = adapter([
      response(first.replace("73531", "100"), "text/html"),
      response(withRange(second.replaceAll("LA541", "LA540"), 51, 100, 100), "text/xml"),
    ]);
    await expect(async () => {
      for await (const page of repeated.subject.streamFullIndex({ maxPages: 2 })) {
        expect(page.page).toBe(1);
      }
    }).rejects.toMatchObject({ code: "LA_INDEX_PAGE_DRIFT" });
    expect(repeated.session.requests).toHaveLength(2);
  });
  it("parses the independent detail ID, status, filing date, applicant, Nice class and official logo URL", async () => {
    const parsed = parseLaosDetail(text(detail), "LA55159");
    expect(parsed).toMatchObject({
      id: "LA55159",
      status: "Filed",
      filingDate: "10.09.2026",
      applicant: "Lao Applicant Ltd.",
      niceClasses: [30],
      registrationNumber: null,
    });
    const logo = response("fake-image-bytes", "image/png");
    const { subject, session } = adapter([response(detail, "text/html"), logo]);
    const value = (
      await subject.fetch({
        sourceId: LAOS_SOURCE_ID,
        params: {
          mode: "DETAIL",
          sourceRecordId: "LA55159",
        },
      })
    ).items[0];
    expect(value).toMatchObject({ kind: "DETAIL", logoMime: "image/png" });
    expect(session.requests[1]?.url).toContain("/LA55159/logo");
  });
  it("streams one exact bounded frozen-ID detail batch through the source session", async () => {
    const secondDetail = detail.replaceAll("55159", "55160");
    const { subject, session } = adapter([
      response(detail, "text/html"),
      response("logo-1", "image/png"),
      response(secondDetail, "text/html"),
      response("logo-2", "image/png"),
    ]);
    const emitted = [];
    for await (const item of subject.streamFullDetails({
      sourceRecordIds: ["LA55159", "LA55160"],
    })) {
      emitted.push(item.id);
    }
    expect(emitted).toEqual(["LA55159", "LA55160"]);
    expect(session.requests.map((request) => request.url)).toEqual([
      LAOS_ORIGIN + "/wopublish-search/public/detail/trademarks?id=LA55159",
      LAOS_ORIGIN + "/wopublish-search/service/trademarks/application/LA55159/logo?noLogo=true",
      LAOS_ORIGIN + "/wopublish-search/public/detail/trademarks?id=LA55160",
      LAOS_ORIGIN + "/wopublish-search/service/trademarks/application/LA55160/logo?noLogo=true",
    ]);
    await expect(async () => {
      for await (const item of subject.streamFullDetails({
        sourceRecordIds: ["LA55159", "LA55159"],
      })) {
        throw Error("Unexpected duplicate detail " + item.id);
      }
    }).rejects.toMatchObject({ code: "LA_DETAIL_BATCH_INVALID" });
  });
  it("does not invent a legal registration number from the WoPublish record ID", () => {
    expect(parseLaosDetail(text(detail), "LA55159").registrationNumber).toBeNull();
    expect(() => parseLaosDetail(text(detail), "LA55160")).toThrowError(
      /Detail does not match source record ID/,
    );
  });
  it("redacts inline Wicket session identifiers before persistence", () => {
    const cleaned = new TextDecoder().decode(
      redactLaosResponse(
        text('<a href="trademarks;jsessionid=SESSION123?0">next</a>?psusr=OTHERVALUE'),
      ),
    );
    expect(cleaned).not.toContain("SESSION123");
    expect(cleaned).not.toContain("OTHERVALUE");
    expect(cleaned).toContain("[REDACTED]");
  });
  it("prevents an untrusted network target or private DNS resolution", async () => {
    const neverTransport = async () => {
      throw Error("No network permitted");
    };
    const session = new LaosHttpSession(
      async () => [{ address: "127.0.0.1", family: 4 }],
      neverTransport,
    );
    await expect(
      session.get({ url: LAOS_LIST_URL, headers: {}, maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: "LA_NETWORK_TARGET_REJECTED" });
    await expect(
      session.get({ url: "https://evil.example/page", headers: {}, maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: "LA_NETWORK_TARGET_REJECTED" });
  });
});
const sanitizedPilotDir = process.env.MARKORBIT_LA_SANITIZED_PILOT_DIR;
if (sanitizedPilotDir) {
  describe("operator-only sanitized official Wicket continuation evidence", () => {
    it("proves the second-page AJAX response exposes a real next-page callback", () => {
      const firstPage = parseLaosList(
        readFileSync(resolve(sanitizedPilotDir, "la-wopublish-page-1-redacted.html")),
      );
      const secondPage = parseLaosList(
        readFileSync(resolve(sanitizedPilotDir, "la-wopublish-page-2-redacted.xml")),
      );
      expect(firstPage.ids).toHaveLength(50);
      expect(secondPage.ids).toHaveLength(50);
      expect(secondPage.ids.some((id) => firstPage.ids.includes(id))).toBe(false);
      expect(secondPage.nextUrl).toContain("navigator-next");
    });
  });
}
const localDir = process.env.LAOS_OFFLINE_SAMPLE_DIR;
if (localDir) {
  describe("operator-only official HTML sample (never committed to fixtures)", () => {
    it("validates the saved two source parsers without printing session values", () => {
      const firstSample = readFileSync(resolve(localDir, "list-initial.html"));
      const detailSample = readFileSync(resolve(localDir, "detail-LA55159.html"));
      const page = parseLaosList(firstSample);
      expect(page.ids).toHaveLength(50);
      expect(page.total).toBeGreaterThan(70_000);
      const item = parseLaosDetail(detailSample, "LA55159");
      expect(item.filingDate).toBe("10.09.2026");
      expect(item.status).toBe("Filed");
      expect(item.niceClasses).toContain(30);
      expect(item.logoUrl).toContain("/LA55159/logo");
    });
  });
}
