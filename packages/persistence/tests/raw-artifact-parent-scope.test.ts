import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { assertRawArtifactParentScope } from "../src/raw-artifact-repository";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE raw_artifacts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      source_id TEXT NOT NULL
    ) STRICT;
  `);
  db.prepare("INSERT INTO raw_artifacts (id, workspace_id, source_id) VALUES (?, ?, ?)").run(
    "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  );
  return db;
}

describe("raw artifact parent scope integrity", () => {
  it("accepts parents from the same workspace and Source", () => {
    const db = database();
    expect(() =>
      assertRawArtifactParentScope(db, {
        workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        parentArtifactIds: ["art_01ARZ3NDEKTSV4RRFFQ69G5FAV"],
      }),
    ).not.toThrow();
    db.close();
  });

  it("rejects missing parent artifacts", () => {
    const db = database();
    expect(() =>
      assertRawArtifactParentScope(db, {
        workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        parentArtifactIds: ["art_01ARZ3NDEKTSV4RRFFQ69G5FAW"],
      }),
    ).toThrowError(expect.objectContaining({ code: "RAW_ARTIFACT_PARENT_NOT_FOUND" }));
    db.close();
  });

  it("rejects cross-workspace parent artifacts", () => {
    const db = database();
    expect(() =>
      assertRawArtifactParentScope(db, {
        workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAW",
        sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        parentArtifactIds: ["art_01ARZ3NDEKTSV4RRFFQ69G5FAV"],
      }),
    ).toThrowError(expect.objectContaining({ code: "RAW_ARTIFACT_PARENT_WORKSPACE_MISMATCH" }));
    db.close();
  });

  it("rejects cross-Source parent artifacts", () => {
    const db = database();
    expect(() =>
      assertRawArtifactParentScope(db, {
        workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAW",
        parentArtifactIds: ["art_01ARZ3NDEKTSV4RRFFQ69G5FAV"],
      }),
    ).toThrowError(expect.objectContaining({ code: "RAW_ARTIFACT_PARENT_SOURCE_MISMATCH" }));
    db.close();
  });
});
