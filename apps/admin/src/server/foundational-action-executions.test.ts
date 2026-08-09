import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE,
  SqliteSourceRepository,
  type CreateSourceInput,
} from "@markorbit/persistence";
import {
  SqliteCollectionPlanRepository,
  type CreateCollectionPlanInput,
} from "@markorbit/persistence/collection-plans";
import {
  approveFoundationalActionIntent,
  createFoundationalActionIntent,
} from "./foundational-action-intents";
import {
  executeApprovedFoundationalCollectionIntent,
  getFoundationalActionExecutionByIntent,
  listFoundationalActionExecutions,
} from "./foundational-action-executions";

const workspaceId = DEFAULT_WORKSPACE.id;
const targetId = "us-uspto-trademarks-root";

function sourceInput(): CreateSourceInput {
  return {
    workspaceId,
    name: "USPTO Trademarks",
    slug: "uspto-trademarks-m24-admin",
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en-US"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    connectorConfig: {},
    canonicalUri: "https://www.uspto.gov/trademarks",
    entrypoints: [{ uri: "https://www.uspto.gov/trademarks", label: "Trademarks home" }],
    tags: ["foundational"],
  };
}

function planInput(sourceId: string): CreateCollectionPlanInput {
  return {
    workspaceId,
    sourceId,
    name: `Foundational Supply — ${targetId}`,
    status: "ACTIVE",
    schedule: { mode: "MANUAL" },
    priority: "HIGH",
    policy: {
      includePatterns: ["https://www.uspto.gov/trademarks*"],
      excludePatterns: [],
      maxDepth: 1,
      maxItems: 40,
      renderJavascript: false,
      fetchAttachments: false,
      respectRobots: true,
      rateLimitPerMinute: 12,
      timeoutSeconds: 90,
      retry: { maxAttempts: 1, backoffSeconds: 10 },
      locale: "en-US",
    },
    output: { artifactKinds: ["HTML", "MARKDOWN"] },
    extensions: {
      "x-markorbit-source-coverage-target-id": targetId,
      "x-markorbit-purpose": "foundational-source-supply",
      "x-markorbit-acquisition-mode": "WEB_CRAWL",
      "x-markorbit-collection-authorization": false,
    },
  };
}

describe("controlled foundational collection dispatch", () => {
  it("requires approved intent plus execute=true, revalidates COLLECT, and dispatches exactly one run", () => {
    const database = new DatabaseSync(":memory:");
    let tick = 0;
    const clock = () => new Date(`2026-08-10T02:00:${String(tick++).padStart(2, "0")}.000Z`);
    const source = new SqliteSourceRepository(database, clock).create(sourceInput());
    new SqliteCollectionPlanRepository(database, clock).create(planInput(source.id));

    const intent = createFoundationalActionIntent(
      database,
      {
        workspaceId,
        jurisdiction: "US",
        targetId,
        actionCode: "DISPATCH_GOVERNED_COLLECTION",
        requestedByActorId: "operator:mile",
        idempotencyKey: "m24-admin-intent",
      },
      clock,
    );
    expect(intent.readinessStage).toBe("COLLECT");
    expect(intent.executionAuthorization).toBe("NONE");

    expect(() =>
      executeApprovedFoundationalCollectionIntent(
        database,
        {
          intentId: intent.intentId,
          executedByActorId: "operator:mile",
          idempotencyKey: "m24-admin-execution",
          execute: false,
        },
        clock,
      ),
    ).toThrowError(expect.objectContaining({ code: "FOUNDATIONAL_EXPLICIT_EXECUTION_REQUIRED" }));

    expect(() =>
      executeApprovedFoundationalCollectionIntent(
        database,
        {
          intentId: intent.intentId,
          executedByActorId: "operator:mile",
          idempotencyKey: "m24-admin-execution",
          execute: true,
        },
        clock,
      ),
    ).toThrowError(expect.objectContaining({ code: "FOUNDATIONAL_ACTION_INTENT_NOT_APPROVED" }));

    const approved = approveFoundationalActionIntent(
      database,
      intent.intentId,
      "reviewer:alice",
      clock,
    );
    expect(approved.executionAuthorization).toBe("NONE");

    const execution = executeApprovedFoundationalCollectionIntent(
      database,
      {
        intentId: intent.intentId,
        executedByActorId: "operator:mile",
        idempotencyKey: "m24-admin-execution",
        execute: true,
      },
      clock,
    );
    expect(execution.status).toBe("DISPATCHED");
    expect(execution.collectionAuthorization).toBe("EXPLICIT_SINGLE_TARGET_MANUAL_DISPATCH");
    expect(execution.runStatusAtDispatch).toBe("PENDING");
    expect(execution.jobIds).toHaveLength(1);
    expect(execution.replayed).toBe(false);
    expect(
      Number((database.prepare("SELECT COUNT(*) AS count FROM collection_runs").get() as { count: number }).count),
    ).toBe(1);
    expect(Number((database.prepare("SELECT COUNT(*) AS count FROM jobs").get() as { count: number }).count)).toBe(1);

    const replay = executeApprovedFoundationalCollectionIntent(
      database,
      {
        intentId: intent.intentId,
        executedByActorId: "operator:mile",
        idempotencyKey: "m24-admin-execution",
        execute: true,
      },
      clock,
    );
    expect(replay.executionId).toBe(execution.executionId);
    expect(replay.runId).toBe(execution.runId);
    expect(replay.replayed).toBe(true);
    expect(
      Number((database.prepare("SELECT COUNT(*) AS count FROM collection_runs").get() as { count: number }).count),
    ).toBe(1);

    expect(getFoundationalActionExecutionByIntent(database, intent.intentId)?.runId).toBe(
      execution.runId,
    );
    expect(listFoundationalActionExecutions(database, { workspaceId, jurisdiction: "us" })).toHaveLength(
      1,
    );
    database.close();
  });

  it("rejects an approved non-COLLECT intent and a COLLECT intent without a prepared plan", () => {
    const database = new DatabaseSync(":memory:");
    let tick = 0;
    const clock = () => new Date(`2026-08-10T03:00:${String(tick++).padStart(2, "0")}.000Z`);

    const registerIntent = createFoundationalActionIntent(
      database,
      {
        workspaceId,
        jurisdiction: "US",
        targetId: "us-uspto-tmep-current",
        actionCode: "REGISTER_SOURCE",
        requestedByActorId: "operator:mile",
        idempotencyKey: "m24-register-intent",
      },
      clock,
    );
    approveFoundationalActionIntent(database, registerIntent.intentId, "reviewer:alice", clock);
    expect(() =>
      executeApprovedFoundationalCollectionIntent(
        database,
        {
          intentId: registerIntent.intentId,
          executedByActorId: "operator:mile",
          idempotencyKey: "m24-register-execution",
          execute: true,
        },
        clock,
      ),
    ).toThrowError(expect.objectContaining({ code: "FOUNDATIONAL_ACTION_EXECUTION_UNSUPPORTED" }));

    const source = new SqliteSourceRepository(database, clock).create(sourceInput());
    expect(source.id).toBeTruthy();
    const collectIntent = createFoundationalActionIntent(
      database,
      {
        workspaceId,
        jurisdiction: "US",
        targetId,
        actionCode: "DISPATCH_GOVERNED_COLLECTION",
        requestedByActorId: "operator:mile",
        idempotencyKey: "m24-no-plan-intent",
      },
      clock,
    );
    approveFoundationalActionIntent(database, collectIntent.intentId, "reviewer:alice", clock);
    expect(() =>
      executeApprovedFoundationalCollectionIntent(
        database,
        {
          intentId: collectIntent.intentId,
          executedByActorId: "operator:mile",
          idempotencyKey: "m24-no-plan-execution",
          execute: true,
        },
        clock,
      ),
    ).toThrowError(expect.objectContaining({ code: "FOUNDATIONAL_COLLECTION_PLAN_NOT_PREPARED" }));
    database.close();
  });
});
