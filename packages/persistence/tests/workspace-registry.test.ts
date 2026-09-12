import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, SqliteSourceRepository } from "../src/index";
import { SqliteWorkspaceRepository } from "../src/workspace-registry";

function clock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 8, 12, 12, 0, tick++));
}

describe("workspace registry", () => {
  it("keeps Global public and creates private workspace overlays", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteWorkspaceRepository(
      database,
      clock(),
      () => "wsp_01H00000000000000000000011",
    );
    expect(repository.getById(DEFAULT_WORKSPACE.id)?.dataDomain).toBe("PUBLIC");
    const created = repository.create({ slug: "agency-a", name: "Agency A" });
    expect(created.dataDomain).toBe("WORKSPACE_PRIVATE");
    expect(created.syncPolicy.allowPublicPromotion).toBe(false);
    expect(repository.list({ dataDomain: "WORKSPACE_PRIVATE" })).toHaveLength(1);
  });

  it("rejects public workspace creation and duplicate slugs", () => {
    const database = new DatabaseSync(":memory:");
    let n = 20;
    const repository = new SqliteWorkspaceRepository(
      database,
      clock(),
      () => `wsp_01H000000000000000000000${n++}`,
    );
    expect(() =>
      repository.create({ slug: "public-copy", name: "Public Copy", dataDomain: "PUBLIC" }),
    ).toThrowError(expect.objectContaining({ code: "REGISTRY_VALIDATION_ERROR" }));
    repository.create({ slug: "agency", name: "Agency" });
    expect(() => repository.create({ slug: "agency", name: "Agency Duplicate" })).toThrowError(
      expect.objectContaining({ code: "WORKSPACE_SLUG_CONFLICT" }),
    );
  });

  it("supports optimistic lifecycle updates but keeps Global active", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteWorkspaceRepository(
      database,
      clock(),
      () => "wsp_01H00000000000000000000031",
    );
    const workspace = repository.create({ slug: "agency-lifecycle", name: "Agency Lifecycle" });
    const suspended = repository.updateStatus(workspace.id, "SUSPENDED", workspace.updatedAt);
    expect(suspended.status).toBe("SUSPENDED");
    const sources = new SqliteSourceRepository(database);
    expect(() =>
      sources.create({
        workspaceId: workspace.id,
        name: "Blocked",
        slug: "blocked",
        sourceType: "WEB",
        category: "USER_PROVIDED",
        authorityLevel: "UNKNOWN",
        status: "ACTIVE",
        jurisdictions: [],
        languages: ["en"],
        connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
        entrypoints: [{ uri: "https://example.com" }],
        tags: [],
      }),
    ).toThrowError(expect.objectContaining({ code: "WORKSPACE_NOT_ACTIVE" }));
    expect(() => repository.updateStatus(workspace.id, "ACTIVE", workspace.updatedAt)).toThrowError(
      expect.objectContaining({ code: "WORKSPACE_VERSION_CONFLICT" }),
    );
    const global = repository.getById(DEFAULT_WORKSPACE.id)!;
    expect(() => repository.updateStatus(global.id, "SUSPENDED", global.updatedAt)).toThrowError(
      expect.objectContaining({ code: "GLOBAL_WORKSPACE_IMMUTABLE" }),
    );
  });
});
