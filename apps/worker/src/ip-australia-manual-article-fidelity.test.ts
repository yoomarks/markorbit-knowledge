import { describe, expect, it } from "vitest";
import {
  auditIpAustraliaManualFidelity,
  parseIpAustraliaManualArticle,
} from "./ip-australia-manual-article-fidelity";

const SAMPLE = `
<main>
  <h1>Part 9.3. Amendment before particulars are published</h1>
  <p>Date Published 19 Aug 2026</p>
  <p>Federal Register of Legislation - Trade Marks Act 1995</p>
  <p>This is substantive practice guidance with enough body content to prove the parser keeps the article evidence rather than only the navigation shell. It contains procedure, timing, amendment and filing information for the controlled manual page.</p>
  <h2>Amended Reasons</h2>
  <table>
    <tr><th>Amended Reason</th><th>Date Amended</th></tr>
    <tr><td>Minor updates to timing and procedure.</td><td>19 Aug 2026</td></tr>
    <tr><td>Removed reference to &#039;comments&#039; and added option to be heard.</td><td>22 Oct 2025</td></tr>
  </table>
</main>
<footer>
  <p>This document is controlled. Its accuracy can only be guaranteed when viewed electronically.</p>
</footer>`;

describe("IP Australia manual article fidelity", () => {
  it("extracts title, publish date, body, amendment history and page-level controlled notice", () => {
    const article = parseIpAustraliaManualArticle(
      SAMPLE,
      "https://manuals.ipaustralia.gov.au/trademark/example",
    );
    expect(article.title).toContain("Part 9.3");
    expect(article.datePublished).toBe("19 Aug 2026");
    expect(article.bodyText).toContain("substantive practice guidance");
    expect(article.amendments).toEqual([
      { reason: "Minor updates to timing and procedure.", dateAmended: "19 Aug 2026" },
      {
        reason: "Removed reference to 'comments' and added option to be heard.",
        dateAmended: "22 Oct 2025",
      },
    ]);
    expect(article.controlledDocumentNotice).toBe(true);
  });

  it("fails fidelity when required source fields disappear", async () => {
    const fetcher: typeof fetch = async () =>
      new Response("<main><h1>Title only</h1><p>short</p></main>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    const outcomes = await auditIpAustraliaManualFidelity(fetcher, [
      "https://manuals.ipaustralia.gov.au/trademark/title-only",
    ]);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].ok).toBe(false);
    expect(outcomes[0].error).toBe("Required manual fidelity fields were incomplete");
  });
});
