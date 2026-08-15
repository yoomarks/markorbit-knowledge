import { describe, expect, it } from "vitest";
import { parseDiscoveryImport } from "../discovery-import-parser";

function previewFor(urls: string[]) {
  const csv = ["url", ...urls].join("\n");
  return parseDiscoveryImport({ fileName: "sources.csv", content: Buffer.from(csv) });
}

describe("Discovery import website identity", () => {
  it("treats www and apex hosts as the same website without rewriting the displayed origin", () => {
    const preview = previewFor([
      "https://www.example.com/one",
      "https://example.com/two",
    ]);

    expect(preview.rows.map((row) => row.status)).toEqual(["VALID", "DUPLICATE"]);
    expect(preview.rows.map((row) => row.origin)).toEqual([
      "https://www.example.com",
      "https://example.com",
    ]);
  });

  it("does not collapse legitimate non-www subdomains into the apex host", () => {
    const preview = previewFor([
      "https://docs.example.com/guide",
      "https://example.com/guide",
    ]);

    expect(preview.rows.map((row) => row.status)).toEqual(["VALID", "VALID"]);
  });

  it("preserves scheme and port as part of website identity", () => {
    const preview = previewFor([
      "http://www.example.com/path",
      "https://example.com/path",
      "https://www.example.com:8443/path",
      "https://example.com:8443/other",
      "https://example.com:9443/path",
    ]);

    expect(preview.rows.map((row) => row.status)).toEqual([
      "VALID",
      "VALID",
      "VALID",
      "DUPLICATE",
      "VALID",
    ]);
  });
});
