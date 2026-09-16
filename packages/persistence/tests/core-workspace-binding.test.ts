import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SqliteCoreWorkspaceBindingRepository } from "../src/core-workspace-binding";
import { SqliteWorkspaceRepository } from "../src/workspace-registry";

const CORE_A = "11111111-1111-4111-8111-111111111111";
const CORE_B = "22222222-2222-4222-8222-222222222222";
const WORKSPACE_A = "wsp_01H00000000000000000000041";
const WORKSPACE_B = "wsp_01H00000000000000000000042";

function fixture() {
  const database = new DatabaseSync(":memory:");
  const ids = [WORKSPACE_A, WORKSPACE_B];
  const workspaces = new SqliteWorkspaceRepository(
    database,
    () => new Date("2026-09-16T00:00:00.000Z"),
    () => ids.shift()!,
  );
  workspaces.create({ slug: "agency-a", name: "Agency A" });
  workspaces.create({ slug: "agency-b", name: "Agency B" });
  const bindings = new SqliteCoreWorkspaceBindingRepository(
    database,
    () => new Date("2026-09-16T00:01:00.000Z"),
  );
  return { database, bindings };
}
describe("Core workspace binding", () => {
  it("resolves a Core UUID to the durable Knowledge workspace namespace", () => {
    const { bindings } = fixture();
    const binding = bindings.bind(WORKSPACE_A, CORE_A.toUpperCase());
    expect(binding).toMatchObject({
      knowledgeWorkspaceId: WORKSPACE_A,
      coreWorkspaceId: CORE_A,
    });
    expect(bindings.getByKnowledgeWorkspaceId(WORKSPACE_A)).toEqual(binding);
    expect(bindings.getByCoreWorkspaceId(CORE_A)).toEqual(binding);
  });

  it("prevents a Core workspace from being rebound to another Knowledge workspace", () => {
    const { bindings } = fixture();
    bindings.bind(WORKSPACE_A, CORE_A);
    expect(() => bindings.bind(WORKSPACE_B, CORE_A)).toThrowError(
      expect.objectContaining({ code: "CORE_WORKSPACE_BINDING_CONFLICT" }),
    );
  });

  it("prevents a Knowledge workspace from being rebound to another Core workspace", () => {
    const { bindings } = fixture();
    bindings.bind(WORKSPACE_A, CORE_A);
    expect(() => bindings.bind(WORKSPACE_A, CORE_B)).toThrowError(
      expect.objectContaining({ code: "CORE_WORKSPACE_BINDING_CONFLICT" }),
    );
  });

  it("fails closed when legacy data contains ambiguous Core bindings", () => {
    const { database, bindings } = fixture();
    bindings.bind(WORKSPACE_A, CORE_A);
    database
      .prepare(
        `INSERT INTO core_workspace_bindings
         (knowledge_workspace_id, core_workspace_id, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(WORKSPACE_B, CORE_A, "2026-09-16T00:02:00.000Z", "2026-09-16T00:02:00.000Z");
    expect(() => bindings.getByCoreWorkspaceId(CORE_A)).toThrowError(
      expect.objectContaining({ code: "CORE_WORKSPACE_BINDING_AMBIGUOUS" }),
    );
  });
  it("never binds Global Public Knowledge to a Core workspace", () => {
    const { bindings } = fixture();
    expect(() => bindings.bind("wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV", CORE_A)).toThrowError(
      expect.objectContaining({ code: "GLOBAL_WORKSPACE_CORE_BINDING_FORBIDDEN" }),
    );
  });
});
