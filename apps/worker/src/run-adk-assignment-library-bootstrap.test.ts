import { describe, expect, it } from "vitest";
import { loadAdkAssignmentLibraryBootstrapConfig } from "./run-adk-assignment-library-bootstrap";

describe("ADK assignment library bootstrap config", () => {
  it("defaults to the US library for backward compatibility", () => {
    const config = loadAdkAssignmentLibraryBootstrapConfig({
      MARKORBIT_ADK_LIBRARY_DB_PATH: "./knowledge.sqlite",
    });
    expect(config.jurisdiction).toBe("US");
    expect(config.databasePath.endsWith("knowledge.sqlite")).toBe(true);
  });

  it.each(["US", "AU", "CA", "ALL"] as const)("accepts %s as a bootstrap scope", (scope) => {
    expect(
      loadAdkAssignmentLibraryBootstrapConfig({
        MARKORBIT_ADK_LIBRARY_DB_PATH: "./knowledge.sqlite",
        MARKORBIT_ADK_LIBRARY_JURISDICTION: scope,
      }).jurisdiction,
    ).toBe(scope);
  });

  it("normalizes lowercase jurisdiction input", () => {
    expect(
      loadAdkAssignmentLibraryBootstrapConfig({
        MARKORBIT_ADK_LIBRARY_DB_PATH: "./knowledge.sqlite",
        MARKORBIT_ADK_LIBRARY_JURISDICTION: " au ",
      }).jurisdiction,
    ).toBe("AU");
  });

  it("fails closed for unsupported jurisdictions", () => {
    expect(() =>
      loadAdkAssignmentLibraryBootstrapConfig({
        MARKORBIT_ADK_LIBRARY_DB_PATH: "./knowledge.sqlite",
        MARKORBIT_ADK_LIBRARY_JURISDICTION: "GB",
      }),
    ).toThrowError(/expected US,AU,CA,ALL/u);
  });
});
