import { describe, expect, it } from "vitest";
import { SourceRegistry } from "@markorbit/persistence";

describe("Source Registry", () => {
  it("creates and retrieves a source definition", () => {
    const registry = new SourceRegistry();
    const source = registry.create({
      name: "Example Source",
      slug: "example-source",
      sourceType: "WEB",
      category: "PUBLIC",
      authorityLevel: "OFFICIAL",
      jurisdictions: ["GLOBAL"],
      languages: ["en"],
      connector: {
        connectorId: "local-file",
        version: "1.0.0",
      },
      entrypoints: [{ uri: "file:///example.txt" }],
    });

    expect(source.objectType).toBe("SOURCE_DEFINITION");
    expect(registry.getById(source.id)?.id).toBe(source.id);
  });
});
