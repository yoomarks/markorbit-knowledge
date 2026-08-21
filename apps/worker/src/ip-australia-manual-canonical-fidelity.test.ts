import { describe, expect, it } from "vitest";
import { evaluateIpAustraliaCanonicalFidelity } from "./ip-australia-manual-canonical-fidelity";

const uri = "https://manuals.ipaustralia.gov.au/trademark/example";

function fixture(body = "This substantive practice text must remain available to downstream Knowledge consumers.") {
  return `
    <html><body>
      <main>
        <h1>Amendment after publication</h1>
        <p>Date Published 19 Aug 2026</p>
        <p>${body}</p>
        <h2>Amended Reasons</h2>
        <table>
          <tr><th>Amended Reason</th><th>Date Amended</th></tr>
          <tr><td>Clarified filing practice</td><td>19 Aug 2026</td></tr>
        </table>
      </main>
      <footer>This document is controlled</footer>
    </body></html>
  `;
}

describe("IP Australia Manual canonical fidelity", () => {
  it("proves generic HTML normalization preserves observed Manual evidence fields", () => {
    const outcome = evaluateIpAustraliaCanonicalFidelity(uri, fixture());
    expect(outcome.ok).toBe(true);
    expect(outcome.titlePreserved).toBe(true);
    expect(outcome.publishedDatePreserved).toBe(true);
    expect(outcome.bodyEvidencePreserved).toBe(true);
    expect(outcome.amendmentsPreserved).toBe(true);
    expect(outcome.controlledNoticePreserved).toBe(true);
  });

  it("fails when the source itself does not expose the required amendment evidence", () => {
    const html = fixture().replace(/<h2>Amended Reasons<\/h2>[\s\S]*?<\/table>/, "");
    const outcome = evaluateIpAustraliaCanonicalFidelity(uri, html);
    expect(outcome.ok).toBe(false);
    expect(outcome.amendmentsPreserved).toBe(false);
  });
});
