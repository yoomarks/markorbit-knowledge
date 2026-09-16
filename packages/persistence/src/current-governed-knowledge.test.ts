import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE } from "./index";
import { projectCurrentGovernedKnowledge } from "./current-governed-knowledge";

const PRIVATE_A = "wsp_private_a";
const PRIVATE_B = "wsp_private_b";
const SOURCE = "src_current";
const STAGING = "std_current";
const PACKAGE = "rdp_current";

function database(workspaceId = PRIVATE_A): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE staging_documents (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, source_id TEXT NOT NULL
    );
    CREATE TABLE retrieval_documents (
      staging_document_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL,
      source_id TEXT NOT NULL, is_current INTEGER NOT NULL, ready_package_id TEXT
    );
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, document_json TEXT NOT NULL);
    CREATE TABLE source_definitions (
      id TEXT NOT NULL, workspace_id TEXT NOT NULL, document_json TEXT NOT NULL,
      PRIMARY KEY (id, workspace_id)
    );
    CREATE TABLE ready_packages (
      id TEXT NOT NULL, workspace_id TEXT NOT NULL, document_json TEXT NOT NULL,
      PRIMARY KEY (id, workspace_id)
    );
  `);
  db.prepare("INSERT INTO workspaces (id, document_json) VALUES (?, ?)").run(
    workspaceId,
    JSON.stringify({ status: "ACTIVE" }),
  );
  db.prepare(
    "INSERT INTO source_definitions (id, workspace_id, document_json) VALUES (?, ?, ?)",
  ).run(SOURCE, workspaceId, JSON.stringify({ status: "ACTIVE" }));
  db.prepare("INSERT INTO staging_documents (id, workspace_id, source_id) VALUES (?, ?, ?)").run(
    STAGING,
    workspaceId,
    SOURCE,
  );
  db.prepare(
    `INSERT INTO retrieval_documents
     (staging_document_id, workspace_id, source_id, is_current, ready_package_id)
     VALUES (?, ?, ?, 1, ?)`,
  ).run(STAGING, workspaceId, SOURCE, PACKAGE);
  db.prepare("INSERT INTO ready_packages (id, workspace_id, document_json) VALUES (?, ?, ?)").run(
    PACKAGE,
    workspaceId,
    JSON.stringify({
      id: PACKAGE,
      workspaceId,
      status: "VERIFIED",
      evidence: { verificationOutcome: "PASS" },
    }),
  );
  return db;
}

function project(db: DatabaseSync, workspaceId = PRIVATE_A, viewerWorkspaceId = workspaceId) {
  return projectCurrentGovernedKnowledge(db, {
    workspaceId,
    stagingDocumentId: STAGING,
    viewerWorkspaceId,
  });
}
describe("current governed Knowledge projection", () => {
  it("keeps CURRENT, VERIFIED, CONSUMER_ADMISSIBLE and DELIVERED independent", () => {
    const db = database();
    expect(project(db)).toMatchObject({
      states: { current: true, verified: true, consumerAdmissible: true, delivered: false },
      reasonCodes: [],
    });

    db.prepare("UPDATE retrieval_documents SET is_current = 0 WHERE staging_document_id = ?").run(
      STAGING,
    );
    db.prepare("UPDATE ready_packages SET document_json = ? WHERE id = ?").run(
      JSON.stringify({
        id: PACKAGE,
        workspaceId: PRIVATE_A,
        status: "HANDED_OFF",
        evidence: { verificationOutcome: "PASS" },
      }),
      PACKAGE,
    );
    expect(project(db)).toMatchObject({
      states: { current: false, verified: true, consumerAdmissible: false, delivered: true },
      reasonCodes: ["CONTENT_NOT_CURRENT"],
    });
  });

  it("fails closed on inactive Workspace, archived source and missing verification", () => {
    const db = database();
    db.prepare("UPDATE workspaces SET document_json = ? WHERE id = ?").run(
      JSON.stringify({ status: "ARCHIVED" }),
      PRIVATE_A,
    );
    db.prepare(
      "UPDATE source_definitions SET document_json = ? WHERE id = ? AND workspace_id = ?",
    ).run(JSON.stringify({ status: "ARCHIVED" }), SOURCE, PRIVATE_A);
    db.prepare("DELETE FROM ready_packages WHERE id = ? AND workspace_id = ?").run(
      PACKAGE,
      PRIVATE_A,
    );

    expect(project(db)).toMatchObject({
      states: { current: true, verified: false, consumerAdmissible: false, delivered: false },
      reasonCodes: ["WORKSPACE_INACTIVE", "SOURCE_ARCHIVED", "VERIFICATION_MISSING"],
    });
  });

  it("distinguishes lexical Global overlay from graph/vector exact-workspace limits", () => {
    const db = database(DEFAULT_WORKSPACE.id);
    const lexical = projectCurrentGovernedKnowledge(db, {
      workspaceId: DEFAULT_WORKSPACE.id,
      stagingDocumentId: STAGING,
      viewerWorkspaceId: PRIVATE_A,
      channel: "LEXICAL",
    });
    expect(lexical.states.consumerAdmissible).toBe(true);
    const graph = projectCurrentGovernedKnowledge(db, {
      workspaceId: DEFAULT_WORKSPACE.id,
      stagingDocumentId: STAGING,
      viewerWorkspaceId: PRIVATE_A,
      channel: "GRAPH",
    });
    expect(graph.states.consumerAdmissible).toBe(false);
    expect(graph.reasonCodes).toEqual(["CHANNEL_GLOBAL_OVERLAY_UNSUPPORTED"]);
  });

  it("rejects another private Workspace without changing Knowledge currentness", () => {
    const db = database();
    const result = project(db, PRIVATE_A, PRIVATE_B);
    expect(result.states).toEqual({
      current: true,
      verified: true,
      consumerAdmissible: false,
      delivered: false,
    });
    expect(result.reasonCodes).toEqual(["CORPUS_NOT_VISIBLE"]);
  });
});
