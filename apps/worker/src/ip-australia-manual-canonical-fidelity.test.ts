import { describe, expect, it } from "vitest";
import { evaluateIpAustraliaCanonicalFidelity } from "./ip-australia-manual-canonical-fidelity";

const uri = "https://manuals.ipaustralia.gov.au/trademark/example";

const substantiveBody = [
  "This substantive practice text must remain available to downstream Knowledge consumers.",
  "The applicant may request an amendment where the legislation and procedure permit the change.",
  "An examiner records the request and checks whether the proposed particulars remain acceptable.",
  "Where additional evidence is required the applicant is notified and given an opportunity to respond.",
  "The decision record must preserve the relevant procedural history and the official source evidence.",
  "Published guidance should remain traceable through conversion without changing its legal meaning.",
  "Further procedural steps depend on the type of amendment and the stage reached by the application.",
].join(" ");

function fixture(body = substantiveBody) {
  return `
    <html><body>
      <main>
        <h1>Amendment after publication</h1>
        <p>Date Published 19 Aug 2026</p>
        <p>Federal Register of Legislation - <a href="https://example.gov/act">Trade Marks Act 1995</a></p>
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
  it("proves generic HTML normalization preserves distributed Manual body evidence", () => {
    const outcome = evaluateIpAustraliaCanonicalFidelity(uri, fixture());
    expect(outcome.ok).toBe(true);
    expect(outcome.titlePreserved).toBe(true);
    expect(outcome.publishedDatePreserved).toBe(true);
    expect(outcome.bodyEvidencePreserved).toBe(true);
    expect(outcome.bodyAnchorCount).toBeGreaterThanOrEqual(3);
    expect(outcome.matchedBodyAnchorCount).toBe(outcome.bodyAnchorCount);
    expect(outcome.amendmentsPreserved).toBe(true);
    expect(outcome.controlledNoticePreserved).toBe(true);
  });

  it("does not let an inserted Markdown link target create a body-fidelity false negative", () => {
    const outcome = evaluateIpAustraliaCanonicalFidelity(uri, fixture());
    expect(outcome.ok).toBe(true);
    expect(outcome.bodyEvidencePreserved).toBe(true);
  });

  it("fails when the source itself does not expose the required amendment evidence", () => {
    const html = fixture().replace(/<h2>Amended Reasons<\/h2>[\s\S]*?<\/table>/, "");
    const outcome = evaluateIpAustraliaCanonicalFidelity(uri, html);
    expect(outcome.ok).toBe(false);
    expect(outcome.amendmentsPreserved).toBe(false);
  });
});
