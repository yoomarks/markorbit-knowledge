import { describe, expect, it } from "vitest";
import {
  assertTmclassRobotsAllowsPublicEc2,
  parseTmclassDetailLinks,
  parseTmclassOfficeCodes,
  parseTmclassSearchResult,
  tmclassHar,
  tmclassSearchUrl,
} from "./tmclass-live-corpus.js";

describe("TMclass live corpus helpers", () => {
  it("extracts and deduplicates the offices exposed for a language", () => {
    expect(
      parseTmclassOfficeCodes(`
        <input value="EM" name="officeList" type="checkbox" />
        <input name='officeList' value='US' type='checkbox' />
        <input name="officeList" value="EM" type="checkbox" />
        <input name="harmonised" value="true" type="checkbox" />
      `),
    ).toEqual(["EM", "US"]);
  });

  it("parses result totals, cap state and term identifiers", () => {
    expect(
      parseTmclassSearchResult(`
        <input value="201" name="totalResults" type="hidden" />
        <a href="/ec2/term/9">Nine</a>
        <a href="https://euipo.europa.eu/ec2/term/10">Ten</a>
        <a href="/ec2/term/9">Duplicate</a>
        <a href="?elasticMaxResults=true">last</a>
      `),
    ).toEqual({
      totalResults: 201,
      totalPages: 3,
      termIds: ["10", "9"],
      elasticMaxResults: true,
    });
  });

  it("computes pagination for a verified larger result page", () => {
    expect(
      parseTmclassSearchResult('<input value="7819" name="totalResults" type="hidden" />', 1_000)
        .totalPages,
    ).toBe(8);
  });

  it("discovers the detail closure without treating variants as aliases", () => {
    expect(
      parseTmclassDetailLinks(`
        <a href="/ec2/term/262">master</a>
        <a href="/ec2/term/263">variant</a>
        <a href="/ec2/concept/19896306">concept</a>
        <a href="/ec2/concept/19896306/en">English membership</a>
      `),
    ).toEqual({
      termIds: ["262", "263"],
      conceptIds: ["19896306"],
      conceptLanguageRoutes: ["/ec2/concept/19896306/en"],
    });
  });

  it("constructs a deterministic all-class search including HDB and offices", () => {
    const url = new URL(
      tmclassSearchUrl({
        language: "en",
        officeCodes: ["US", "EM"],
        page: 2,
        pageSize: 1_000,
      }),
    );
    expect(url.pathname).toBe("/ec2/search/ajaxSearch");
    expect(url.searchParams.get("niceClass")).toBe("1-45");
    expect(url.searchParams.get("harmonised")).toBe("true");
    expect(url.searchParams.get("size")).toBe("1000");
    expect(url.searchParams.getAll("officeList")).toEqual(["EM", "US"]);
  });

  it("writes detail pages in the HAR shape accepted by offline admission", () => {
    expect(
      tmclassHar([
        {
          sourceUri: "https://euipo.europa.eu/ec2/term/262",
          observedAt: "2026-10-10T00:00:00.000Z",
          html: "<html>term</html>",
        },
      ]),
    ).toMatchObject({
      log: {
        version: "1.2",
        entries: [
          {
            request: { method: "GET", url: "https://euipo.europa.eu/ec2/term/262" },
            response: { status: 200, content: { text: "<html>term</html>" } },
          },
        ],
      },
    });
  });

  it("fails closed only when the public ec2 path becomes disallowed", () => {
    expect(() =>
      assertTmclassRobotsAllowsPublicEc2("User-agent: *\nDisallow: /login\n"),
    ).not.toThrow();
    expect(() => assertTmclassRobotsAllowsPublicEc2("User-agent: *\nDisallow: /ec2/\n")).toThrow(
      "TMCLASS_ROBOTS_DISALLOWS_PUBLIC_EC2",
    );
  });
});
