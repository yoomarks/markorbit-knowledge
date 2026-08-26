import { Buffer } from "node:buffer";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { ExpertQuestionTaskV1 } from "@markorbit/contracts";
import { SqliteExpertSourceRepository } from "@markorbit/persistence/expert-sources";
import { SqliteExpertTaskWorkspaceBindingRepository } from "@markorbit/persistence/expert-task-workspace-bindings";
import {
  CASE_PRODUCER_INTERNAL_AUTHORIZATION_HEADER,
  CASE_PRODUCER_PRINCIPAL_HEADER,
  CaseProducerAccessError,
} from "./case-producer-auth";
import {
  authenticateExpertMutationRequest,
  authenticateExpertReadRequest,
} from "./expert-api-access";

const SECRET = "expert-api-test-secret";

function principalHeader(
  input: { role?: string; permissions?: string[]; workspaceId?: string } = {},
) {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      principal: {
        kind: "WORKSPACE",
        sessionId: "session-001",
        userId: "user-001",
        workspaceId: input.workspaceId ?? "workspace-a",
        membershipId: "membership-001",
        role: input.role ?? "REVIEWER",
        permissions: input.permissions ?? ["matter:read"],
        sessionExpiresAt: "2026-08-27T00:00:00.000Z",
      },
    }),
    "utf8",
  ).toString("base64url");
}

function request(input: { secret?: string; role?: string; permissions?: string[] } = {}) {
  return new Request("http://localhost/api/expert-tasks", {
    headers: {
      [CASE_PRODUCER_INTERNAL_AUTHORIZATION_HEADER]: input.secret ?? SECRET,
      [CASE_PRODUCER_PRINCIPAL_HEADER]: principalHeader(input),
    },
  });
}

function task(taskId: string): ExpertQuestionTaskV1 {
  return {
    protocolVersion: "1.0",
    objectType: "EXPERT_QUESTION_TASK",
    taskId,
    topic: "SECTION_8",
    jurisdiction: "US",
    question: "Which evidence is accepted?",
    expertRef: "expert:us:001",
    requestedBy: "user-001",
    state: "DRAFT",
    createdAt: "2026-08-26T00:00:00.000Z",
    relatedSourceRefs: [],
    relatedCaseRefs: [],
    accessClassification: "CONFIDENTIAL",
  };
}

describe("Expert API access", () => {
  it("reuses the governed Workspace Principal and rejects read-only mutation", () => {
    expect(authenticateExpertReadRequest(request(), SECRET).workspaceId).toBe("workspace-a");
    expect(() => authenticateExpertReadRequest(request({ secret: "wrong" }), SECRET)).toThrow(
      CaseProducerAccessError,
    );
    expect(() =>
      authenticateExpertMutationRequest(request({ role: "READ_ONLY" }), SECRET),
    ).toThrowError(/cannot mutate Expert tasks/u);
  });

  it("durably isolates task bindings by workspace and records the schema migration", () => {
    const database = new DatabaseSync(":memory:");
    const tasks = new SqliteExpertSourceRepository(database);
    tasks.saveTask(task("eqt_bound"));
    tasks.saveTask(task("eqt_unbound"));

    const bindings = new SqliteExpertTaskWorkspaceBindingRepository(database);
    bindings.bind("eqt_bound", "workspace-a");
    bindings.bind("eqt_bound", "workspace-a");

    expect(bindings.listTaskIds("workspace-a")).toEqual(["eqt_bound"]);
    expect(bindings.listTaskIds("workspace-b")).toEqual([]);
    expect(bindings.getWorkspaceId("eqt_bound")).toBe("workspace-a");
    expect(bindings.getWorkspaceId("eqt_unbound")).toBeNull();
    expect(() => bindings.bind("eqt_bound", "workspace-b")).toThrowError(
      /already bound to a different workspace/u,
    );
    expect(
      database
        .prepare("SELECT id FROM schema_migrations WHERE id = ?")
        .get("0022_expert_task_workspace_bindings"),
    ).toBeTruthy();
    database.close();
  });
});
