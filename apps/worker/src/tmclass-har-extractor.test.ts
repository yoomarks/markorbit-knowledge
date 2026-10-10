import { describe, expect, it, vi } from "vitest";
import type { TmclassDomProjection } from "@markorbit/worker-runtime";
import { extractTmclassHarPages, tmclassHtmlEntriesFromHar } from "./tmclass-har-extractor.js";

const sourceUri = "https://euipo.europa.eu/ec2/concept/11452493";
const html = "<html><body>captured concept</body></html>";

function entry(url: string, body = html, encoding?: "base64"): Record<string, unknown> {
  return {
    startedDateTime: "2026-10-09T12:00:00.000Z",
    request: { method: "GET", url },
    response: {
      status: 200,
      content: {
        mimeType: "text/html;charset=UTF-8",
        text: encoding === "base64" ? Buffer.from(body).toString("base64") : body,
        ...(encoding ? { encoding } : {}),
      },
    },
  };
}

const har = (...entries: Record<string, unknown>[]) => ({ log: { entries } });

const overviewProjection: TmclassDomProjection = {
  heading: "Concept overview",
  title: "Abrasives (Auxiliary fluids for use with -)",
  status: "Published",
  details: {
    Class: "1",
    Source: "ILPO Supplement",
    "common.date": "",
    "Reference ID": "0024010",
    Scope: "",
  },
  scopeTitle: "Accepted",
  taxonomyText: "Class 1 >",
  acceptedOfficeTexts: [],
  tables: [
    {
      headers: ["Language", "Master term", "No. of variants", "No. of total terms", ""],
      rows: [
        {
          className: "",
          cells: [
            { text: "en", links: [], marker: false },
            {
              text: "Abrasives (Auxiliary fluids for use with -)",
              links: [
                {
                  text: "Abrasives (Auxiliary fluids for use with -)",
                  href: "https://euipo.europa.eu/ec2/term/262",
                },
              ],
              marker: false,
            },
            { text: "1", links: [], marker: false },
            { text: "2", links: [], marker: false },
            { text: "", links: [], marker: false },
          ],
        },
      ],
    },
  ],
  footerText: "No. of masters: 1 | No. of variants: 1",
};

describe("TMclass HAR extraction", () => {
  it("selects bounded official detail responses, decodes base64, and removes exact duplicates", () => {
    const selected = tmclassHtmlEntriesFromHar(
      har(
        entry(sourceUri, html, "base64"),
        entry(sourceUri, html, "base64"),
        entry("https://example.com/ec2/concept/11452493", "ignored"),
      ),
    );

    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ sourceUri, observedAt: "2026-10-09T12:00:00.000Z", html });
    expect(selected[0].responseSha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("normalizes every selected response through the verified DOM projection", async () => {
    const setContent = vi.fn().mockResolvedValue(undefined);
    const project = vi.fn().mockResolvedValue(overviewProjection);

    const captures = await extractTmclassHarPages(har(entry(sourceUri)), {
      setContent,
      project,
    });

    expect(setContent).toHaveBeenCalledWith(html, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    expect(captures).toHaveLength(1);
    expect(captures[0].page).toMatchObject({
      pageKind: "CONCEPT_OVERVIEW",
      conceptId: "11452493",
      sourceName: "ILPO Supplement",
      referenceId: "0024010",
      languages: [{ masterTermId: "262", variantCount: 1, totalTermCount: 2 }],
    });
  });

  it("fails closed when one captured detail response exceeds the configured bound", () => {
    expect(() =>
      tmclassHtmlEntriesFromHar(har(entry(sourceUri, "12345")), { maxResponseBytes: 4 }),
    ).toThrow("TMCLASS_HAR_RESPONSE_TOO_LARGE");
  });
});
