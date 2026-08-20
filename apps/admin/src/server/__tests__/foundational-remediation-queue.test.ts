import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, SqliteSourceRepository } from "@markorbit/persistence";
import { SqliteCollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import { SqliteConnectorRepository } from "@markorbit/persistence/connectors";
import { SqliteSourceCompatibilityObservationRepository } from "@markorbit/persistence/source-compatibility-observations";
import { buildFoundationalRemediationQueueSnapshot } from "../foundational-remediation-queue";

const databases: DatabaseSync[] = [];

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  return db;
}

function registerApiRemediation(db: DatabaseSync): void {
  new SqliteConnectorRepository(db).create({
    connectorId: "api-worker",
    displayName: "Governed HTTPS API Worker",
    version: "1.0.0",
    sourceTypes: ["API"],
    runtime: "NODE",
    capabilities: ["COLLECT", "CHECK_UPDATE"],
    supportedJobTypes: ["API_COLLECTION"],
    configurationSchema: { type: "object" },
    secretSchema: { type: "object" },
    outputArtifactKinds: ["JSON", "XML", "CSV", "TEXT", "MARKDOWN"],
    healthCheck: { mode: "WORKER_PROBE", timeoutSeconds: 30 },
    status: "ACTIVE",
  });
  const source = new SqliteSourceRepository(db).create({
    workspaceId: DEFAULT_WORKSPACE.id,
    name: "USPTO Trademark Search — Structured API Evidence",
    slug: "coverage-api-us-uspto-trademark-search-test",
    sourceType: "API",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en-US"],
    connector: { connectorId: "api-worker", version: "1.0.0" },
    connectorConfig: {
      endpointBinding: "uspto-search",
      resourcePath: "/trademark-search",
      query: {},
      timeoutMs: 30_000,
      maxResponseBytes: 10 * 1024 * 1024,
      acceptedMimeTypes: ["application/json"],
    },
    canonicalUri: "api://uspto-search/test",
    entrypoints: [{ uri: "api://uspto-search/test", label: "USPTO Trademark Search API" }],
    tags: ["official", "source-coverage-api-remediation"],
    extensions: {
      "x-markorbit-source-coverage-remediation-target-id": "us-uspto-trademark-search",
      "x-markorbit-collection-authorization": false,
    },
  });
  new SqliteCollectionPlanRepository(db).create({
    workspaceId: DEFAULT_WORKSPACE.id,
    sourceId: source.id,
    name: "Foundational API Evidence — us-uspto-trademark-search",
    status: "ACTIVE",
    schedule: { mode: "MANUAL" },
    priority: "HIGH",
    policy: {
      includePatterns: [],
      excludePatterns: [],
      maxDepth: 0,
      maxItems: 1,
      renderJavascript: false,
      fetchAttachments: false,
      respectRobots: false,
      rateLimitPerMinute: 12,
      timeoutSeconds: 120,
      retry: { maxAttempts: 1, backoffSeconds: 10 },
    },
    output: { artifactKinds: ["JSON"] },
    extensions: {
      "x-markorbit-source-coverage-remediation-target-id": "us-uspto-trademark-search",
      "x-markorbit-collection-authorization": false,
    },
  });
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe("foundational remediation queue snapshot", () => {
  it("exposes the US foundational queue without authorizing or performing mutation", () => {
    const snapshot = buildFoundationalRemediationQueueSnapshot(
      database(),
      { workspaceId: DEFAULT_WORKSPACE.id, jurisdiction: "us" },
      () => new Date("2026-08-10T00:00:00.000Z"),
    );

    expect(snapshot.protocolVersion).toBe("1.1");
    expect(snapshot.objectType).toBe("FOUNDATIONAL_REMEDIATION_QUEUE_SNAPSHOT");
    expect(snapshot.jurisdiction).toBe("US");
    expect(snapshot.readiness.totalCount).toBe(11);
    expect(snapshot.remediationQueue.totalTargetCount).toBe(11);
    expect(snapshot.remediationQueue.actionableTargetCount).toBe(11);
    expect(snapshot.remediationQueue.items.every((item) => item.stage === "REGISTER")).toBe(true);
    expect(
      snapshot.remediationQueue.items.every(
        (item) =>
          item.actions.length === 1 &&
          item.actions[0].code === "REGISTER_SOURCE" &&
          item.actions[0].automaticExecution === false,
      ),
    ).toBe(true);
    expect(snapshot.executionPolicy).toBe("READ_ONLY");
    expect(snapshot.collectionAuthorization).toBe("NONE");
    expect(snapshot.mutationPerformed).toBe(false);
    expect(snapshot.observedAt).toBe("2026-08-10T00:00:00.000Z");
    expect(snapshot.apiRemediation.requiredCount).toBeGreaterThan(0);
    expect(snapshot.apiRemediation.preparedCount).toBe(0);
  });

  it("reports structured targets as unprepared until a governed API Source and Plan exist", () => {
    const snapshot = buildFoundationalRemediationQueueSnapshot(database(), {
      workspaceId: DEFAULT_WORKSPACE.id,
      jurisdiction: "US",
      targetId: "us-uspto-trademark-search",
    });

    expect(snapshot.apiRemediation).toMatchObject({
      requiredCount: 1,
      preparedCount: 0,
      invalidCount: 0,
    });
    expect(snapshot.apiRemediation.items).toEqual([
      {
        targetId: "us-uspto-trademark-search",
        state: "UNPREPARED",
        requiredArtifactKinds: ["JSON"],
        sourceId: null,
        planId: null,
        endpointBinding: null,
        workerEndpointBindingState: "EXTERNAL_UNVERIFIED",
        collectionAuthorization: "NONE",
        automaticExecution: false,
      },
    ]);
  });

  it("reports a valid remediation Source and Plan as prepared but still awaiting external binding", () => {
    const db = database();
    registerApiRemediation(db);

    const snapshot = buildFoundationalRemediationQueueSnapshot(db, {
      workspaceId: DEFAULT_WORKSPACE.id,
      jurisdiction: "US",
      targetId: "us-uspto-trademark-search",
    });

    expect(snapshot.apiRemediation.requiredCount).toBe(1);
    expect(snapshot.apiRemediation.preparedCount).toBe(1);
    expect(snapshot.apiRemediation.invalidCount).toBe(0);
    expect(snapshot.apiRemediation.items[0]).toMatchObject({
      targetId: "us-uspto-trademark-search",
      state: "PREPARED_AWAITING_WORKER_BINDING",
      requiredArtifactKinds: ["JSON"],
      endpointBinding: "uspto-search",
      workerEndpointBindingState: "EXTERNAL_UNVERIFIED",
      collectionAuthorization: "NONE",
      automaticExecution: false,
    });
    expect(snapshot.apiRemediation.items[0].sourceId).toMatch(/^src_/);
    expect(snapshot.apiRemediation.items[0].planId).toMatch(/^pln_/);
  });

  it("supports WIPO and a single explicit foundational target filter", () => {
    const snapshot = buildFoundationalRemediationQueueSnapshot(database(), {
      workspaceId: DEFAULT_WORKSPACE.id,
      jurisdiction: "wo",
      targetId: "wo-wipo-madrid-system",
      topK: 5,
    });

    expect(snapshot.jurisdiction).toBe("WO");
    expect(snapshot.targetId).toBe("wo-wipo-madrid-system");
    expect(snapshot.topK).toBe(5);
    expect(snapshot.readiness.totalCount).toBe(1);
    expect(snapshot.remediationQueue.items.map((item) => item.targetId)).toEqual([
      "wo-wipo-madrid-system",
    ]);
  });

  it("carries compatibility freshness into foundational readiness without bypassing earlier gates", () => {
    const db = database();
    new SqliteSourceCompatibilityObservationRepository(db).record({
      targetId: "cn-cnipa-trademark-search",
      jurisdiction: "CN",
      state: "BLOCKED",
      observedAt: "2026-08-15T00:00:00.000Z",
      primaryUri: "https://wcjs.sbj.cnipa.gov.cn/txnT01.do",
      renderJavascript: true,
      errorCode: "CANARY_AUTHORITY_BASELINE_FAILED",
      baselineTargetId: "cn-cnipa-trademark-filing-guide",
      baselineState: "FAIL",
    });

    const snapshot = buildFoundationalRemediationQueueSnapshot(
      db,
      {
        workspaceId: DEFAULT_WORKSPACE.id,
        jurisdiction: "CN",
        targetId: "cn-cnipa-trademark-search",
      },
      () => new Date("2026-08-18T00:00:00.000Z"),
    );

    expect(snapshot.readiness.protocolVersion).toBe("1.3");
    expect(snapshot.readiness.targets[0]).toMatchObject({
      targetId: "cn-cnipa-trademark-search",
      stage: "REGISTER",
      compatibilityState: "BLOCKED",
      compatibilityFreshness: "STALE",
      compatibilityObservedAt: "2026-08-15T00:00:00.000Z",
    });
    expect(snapshot.remediationQueue.items[0]?.actions[0]?.code).toBe("REGISTER_SOURCE");
  });

  it("rejects unsupported target coverage and invalid topK", () => {
    expect(() =>
      buildFoundationalRemediationQueueSnapshot(database(), {
        workspaceId: DEFAULT_WORKSPACE.id,
        jurisdiction: "US",
        targetId: "missing-target",
      }),
    ).toThrow(/No ACTIVE FOUNDATIONAL/);

    expect(() =>
      buildFoundationalRemediationQueueSnapshot(database(), {
        workspaceId: DEFAULT_WORKSPACE.id,
        jurisdiction: "US",
        topK: 21,
      }),
    ).toThrow(/topK/);
  });
});
