import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
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
  constructor(private readonly responses: LaosHttpResponse[]) {}
  async get(request: LaosHttpRequest): Promise<LaosHttpResponse> {
    this.requests.push(request);
    const nextResponse = this.responses.shift();
    if (!nextResponse) throw Error("Unexpected extra request");
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
    expect(result.nextUrl).toContain("navigator-next");
    expect(result.nextUrl).toContain("jsessionid");
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
  it("bounds transient retries and honors a capped Retry-After", async () => {
    const waits: number[] = [];
    const r = response("", "text/html", 429);
    r.headers = { "retry-after": "2" };
    const { subject, session } = adapter([r, response(first, "text/html")], waits);
    await subject.fetch({ sourceId: LAOS_SOURCE_ID, params: { mode: "PAGE" } });
    expect(session.requests).toHaveLength(2);
    expect(waits).toEqual([2000]);
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
