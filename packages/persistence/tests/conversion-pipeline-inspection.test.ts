import { describe, expect, it } from "vitest";
import { openRegistryDatabase } from "../src/index";
import { SqliteConversionPipelineInspectionRepository } from "../src/conversion-pipeline-inspection";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";

describe("Conversion Pipeline Inspection Projection", () => {
  it("returns an empty Workspace-scoped projection when no runs exist", () => {
    const database = openRegistryDatabase(":memory:");
    const repository = new SqliteConversionPipelineInspectionRepository(database);

    expect(repository.list({ workspaceId })).toEqual({
      items: [],
      total: 0,
      limit: 25,
      offset: 0,
    });
    expect(repository.getByRun(workspaceId, "cvr_01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBeNull();
    database.close();
  });

  it("bounds pagination and rejects invalid offsets", () => {
    const database = openRegistryDatabase(":memory:");
    const repository = new SqliteConversionPipelineInspectionRepository(database);

    expect(repository.list({ workspaceId, limit: 1_000 }).limit).toBe(100);
    expect(() => repository.list({ workspaceId, limit: 0 })).toThrow(
      "limit must be a positive integer",
    );
    expect(() => repository.list({ workspaceId, offset: -1 })).toThrow(
      "offset must be a non-negative integer",
    );
    database.close();
  });

  it("fails closed when persisted run JSON is not protocol-valid", () => {
    const database = openRegistryDatabase(":memory:");
    const repository = new SqliteConversionPipelineInspectionRepository(database);
    database.exec("PRAGMA foreign_keys = OFF;");
    database
      .prepare(
        `INSERT INTO conversion_runs
         (id, workspace_id, source_id, raw_artifact_id, conversion_profile_id,
          converter_id, converter_version, status, trigger_type, idempotency_key,
          dispatch_intent_digest, document_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "cvr_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        workspaceId,
        "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        "cvp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        "builtin-text-markdown",
        "1.0.0",
        "PENDING",
        "MANUAL",
        "inspect-invalid",
        "a".repeat(64),
        "{}",
        "2026-07-19T00:00:00.000Z",
        "2026-07-19T00:00:00.000Z",
      );

    expect(() => repository.getByRun(workspaceId, "cvr_01ARZ3NDEKTSV4RRFFQ69G5FAV")).toThrow(
      "Persisted ConversionRun is invalid",
    );
    database.close();
  });
});
