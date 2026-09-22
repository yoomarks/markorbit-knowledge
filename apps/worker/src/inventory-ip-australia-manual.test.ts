import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseInventoryOutputPath,
  serializeIpAustraliaManualInventory,
} from "./inventory-ip-australia-manual";

const report = {
  rootUri: "https://manuals.ipaustralia.gov.au/trademark",
  highestUpdateHistoryPage: 1,
  updateHistoryPageCount: 2,
  successfulUpdateHistoryPageCount: 2,
  failedUpdateHistoryPageCount: 0,
  currentNavigationPageCount: 2,
  updateHistoryOnlyPageCount: 1,
  totalUniqueManualPageCount: 3,
  duplicateUpdateReferenceCount: 0,
  outcomes: [],
  pages: [],
  acceptanceBoundary: "test",
};

describe("IP Australia manual inventory CLI", () => {
  it("serializes exactly one JSON document with trailing newline only", () => {
    const value = serializeIpAustraliaManualInventory(report);
    expect(value.endsWith("\n")).toBe(true);
    expect(JSON.parse(value)).toMatchObject({
      event: "ip_australia.trademark.manual.inventory",
      totalUniqueManualPageCount: 3,
    });
    expect(value.trimEnd().lastIndexOf("}")).toBe(value.trimEnd().length - 1);
  });

  it("parses an explicit machine-readable output path", () => {
    expect(parseInventoryOutputPath(["--output", "./report.json"])).toBe(
      path.resolve("./report.json"),
    );
    expect(parseInventoryOutputPath([])).toBeNull();
    expect(() => parseInventoryOutputPath(["--output"])).toThrow(/requires a file path/);
  });
});
