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
import { executeApprovedFoundationalCollectionIntent } from "./foundational-action-executions";
import { listFoundationalCollectionOutcomes } from "./foundational-collection-outcomes";

const workspaceId = DEFAULT_WORKSPACE.id;
const targetId = "us-uspto-trademarks-root";

function sourceInput(): CreateSourceInput {
  return {
    workspaceId,
    name: "USPTO Trademarks M26",
    slug: "uspto-trademarks-m26-admin",
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

function approvedIntent(database: DatabaseSync, clock: () => Date, idempotencyKey: string) {
  const intent = createFoundationalActionIntent(
    database,
    {
      workspaceId,
      jurisdiction: "US",
      targetId,
      actionCode: "DISPATCH_GOVERNED_COLLECTION",
      requestedByActorId: "operator:mile",
      idempotencyKey,
    },
    clock,
  );
  return approveFoundationalActionIntent(database, intent.intentId, "reviewer:alice", clock);
}

describe("foundational collection outcome feedback", () => {
  it("projects the exact CollectionRun state and blocks a second active dispatch", () => {
    const database = new DatabaseSync(":memory:");
    let tick = 0;
    const clock = () => new Date(`2026-08-10T05:00:${String(tick++).padStart(2, "0")}.000Z`);
    const source = new SqliteSourceRepository(database, clock).create(sourceInput());
    new SqliteCollectionPlanRepository(database, clock).create(planInput(source.id));

    const firstIntent = approvedIntent(database, clock, "m26-first-intent");
    const firstExecution = executeApprovedFoundationalCollectionIntent(
      database,
      {
        intentId: firstIntent.intentId,
        executedByActorId: "operator:mile",
        idempotencyKey: "m26-first-execution",
        execute: true,
      },
      clock,
    );

    const outcomes = listFoundationalCollectionOutcomes(
      database,
      { workspaceId, jurisdiction: "us", targetId },
      clock,
    );
    expect(outcomes.objectType).toBe("FOUNDATIONAL_COLLECTION_OUTCOME_LIST");
    expect(outcomes.automaticRetry).toBe(false);
    expect(outcomes.items).toHaveLength(1);
    expect(outcomes.items[0]).toMatchObject({
      executionId: firstExecution.executionId,
      runId: firstExecution.runId,
      runStatus: "PENDING",
      state: "ACTIVE",
      currentCollectionActionRequired: true,
      retryDisposition: "BLOCKED_ACTIVE_RUN",
      requiresNewIntent: false,
      automaticRetry: false,
    });

    const secondIntent = approvedIntent(database, clock, "m26-second-intent");
    expect(() =>
      executeApprovedFoundationalCollectionIntent(
        database,
        {
          intentId: secondIntent.intentId,
          executedByActorId: "operator:mile",
          idempotencyKey: "m26-second-execution",
          execute: true,
        },
        clock,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "FOUNDATIONAL_COLLECTION_ALREADY_ACTIVE",
      }),
    );

    expect(
      Number(
        (
          database.prepare("SELECT COUNT(*) AS count FROM collection_runs").get() as {
            count: number;
          }
        ).count,
      ),
    ).toBe(1);
    database.close();
  });
});
