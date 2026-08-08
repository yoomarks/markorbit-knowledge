import { describe, expect, it } from "vitest";
import { SourceRegistry } from "@markorbit/persistence/source-registry";

describe("Source Registry", () => {
  it("registers and retrieves a canonical source definition", () => {
    const registry = new SourceRegistry();
    const source = registry.register({
      schemaVersion: "1.0",
      objectType: "SOURCE_DEFINITION",
      id: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      name: "Example Source",
      slug: "example-source",
      sourceType: "WEB",
      category: "OFFICIAL_GUIDANCE",
      authorityLevel: "SECONDARY_OFFICIAL",
      status: "ACTIVE",
      jurisdictions: ["GLOBAL"],
      languages: ["en"],
      connector: {
        connectorId: "local-file",
        version: "1.0.0",
      },
      connectorConfig: {},
      entrypoints: [{ uri: "file:///example.txt" }],
      tags: [],
      createdAt: "2026-08-08T00:00:00Z",
      updatedAt: "2026-08-08T00:00:00Z",
    });

    expect(source.objectType).toBe("SOURCE_DEFINITION");
    expect(registry.get(source.id)?.id).toBe(source.id);
  });
});
