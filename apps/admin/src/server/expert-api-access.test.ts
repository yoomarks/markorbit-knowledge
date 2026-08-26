import { createHmac } from "node:crypto";
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
  resolveExpertMutationPrincipal,
  resolveExpertReadPrincipal,
} from "./expert-api-access";

const SECRET = "expert-api-test-secret";
const CORE_SECRET = "0123456789abcdef0123456789abcdef";
const CSRF_SECRET = "abcdef0123456789abcdef0123456789";
const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";

type PrincipalInput = {
  role?: string;
  permissions?: string[];
  workspaceId?: string;
  sessionExpiresAt?: string;
};

function principalHeader(input: PrincipalInput = {}) {
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
        sessionExpiresAt: input.sessionExpiresAt ?? "2099-08-27T00:00:00.000Z",
      },
    }),
    "utf8",
  ).toString("base64url");
}

function request(input: PrincipalInput & { secret?: string } = {}) {
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

function browserOptions(role: "REVIEWER" | "READ_ONLY") {
  const fetchImpl: typeof fetch = async () =>
    Response.json({
      kind: "WORKSPACE",
      sessionId: "session-browser",
      userId: "user-browser",
      workspaceId: WORKSPACE_A,
      membershipId: "membership-browser",
      role,
      permissions: ["workspace:read", "matter:read", "review:read"],
      sessionExpiresAt: "2099-08-27T00:00:00.000Z",
    });
  return {
    coreAuthUrl: "http://core.test:4101",
    internalSecret: CORE_SECRET,
    csrfSecret: CSRF_SECRET,
    allowedOrigins: ["http://knowledge.test"],
    fetchImpl,
    now: new Date("2026-08-26T00:00:00.000Z"),
  };
}

function browserRequest(extra: HeadersInit = {}) {
  const csrfToken = createHmac("sha256", CSRF_SECRET)
    .update("knowledge-admin-expert:session-browser", "utf8")
    .digest("base64url");
  return new Request("http://knowledge.test/api/expert-tasks", {
    method: "POST",
    headers: {
      cookie: "mo_session=browser-token",
      origin: "http://knowledge.test",
      "x-markorbit-workspace-id": WORKSPACE_A,
      "x-markorbit-csrf-token": csrfToken,
      ...Object.fromEntries(new Headers(extra)),
    },
  });
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

  it("rejects expired Workspace Principals on the Expert surface", () => {
    expect(() =>
      authenticateExpertReadRequest(
        request({ sessionExpiresAt: "2000-01-01T00:00:00.000Z" }),
        SECRET,
      ),
    ).toThrowError(/session has expired/u);
  });

  it("resolves the browser workspace through Core and rejects READ_ONLY mutation", async () => {
    await expect(
      resolveExpertReadPrincipal(browserRequest(), browserOptions("REVIEWER")),
    ).resolves.toMatchObject({
      userId: "user-browser",
      workspaceId: WORKSPACE_A,
      role: "REVIEWER",
    });
    await expect(
      resolveExpertMutationPrincipal(browserRequest(), browserOptions("READ_ONLY")),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED", httpStatus: 403 });
  });

  it("does not let a browser-supplied Principal header fall back to browser session auth", async () => {
    await expect(
      resolveExpertReadPrincipal(
        browserRequest({ [CASE_PRODUCER_PRINCIPAL_HEADER]: principalHeader() }),
        browserOptions("REVIEWER"),
      ),
    ).rejects.toBeInstanceOf(CaseProducerAccessError);
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
