import { describe, expect, it } from "vitest";
import { openRegistryDatabase, SqliteSourceRepository } from "@markorbit/persistence";
import { SqliteCollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import { SqliteExecutionLedgerRepository } from "@markorbit/persistence/execution-ledger";
import { SqliteSourceDiscoveryRepository } from "@markorbit/persistence/source-discovery";
import { DiscoveryCollectionService } from "../discovery-collection-service";

describe("DiscoveryCollectionService", () => {
  it("authorizes one initial collection per Source/default plan across accepted candidates", () => {
    const database = openRegistryDatabase(":memory:");
    const sources = new SqliteSourceRepository(database);
    const plans = new SqliteCollectionPlanRepository(database);
    const discovery = new SqliteSourceDiscoveryRepository(database);
    const runs = new SqliteExecutionLedgerRepository(database);

    const seed = discovery.createSeed({ locator: "https://example.com/" });
    discovery.createBatch({
      batchId: "disc_authorize_test",
      seeds: [{ seedId: seed.seedId, locator: seed.locator }],
      createdAt: "2026-08-08T01:00:00.000Z",
      constraints: { maxDepth: 1, maxCandidates: 10, sameHostOnly: true },
    });
    discovery.completeBatch("disc_authorize_test", [
      {
        candidateId: "cand_authorize_test",
        locator: "https://example.com/trademarks",
        discoveredAt: "2026-08-08T01:00:30.000Z",
        status: "DISCOVERED",
        discoveredFrom: "https://example.com/",
        discoveryMethod: "HTML_LINK",
        depth: 1,
      },
      {
        candidateId: "cand_authorize_same_source",
        locator: "https://example.com/trademarks/fees",
        discoveredAt: "2026-08-08T01:00:31.000Z",
        status: "DISCOVERED",
        discoveredFrom: "https://example.com/trademarks",
        discoveryMethod: "HTML_LINK",
        depth: 1,
      },
    ]);

    const source = sources.create({
      name: "Example trademarks",
      slug: "example-trademarks",
      sourceType: "WEB",
      category: "OTHER",
      authorityLevel: "UNKNOWN",
      status: "ACTIVE",
      jurisdictions: ["GLOBAL"],
      languages: ["und"],
      connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
      canonicalUri: "https://example.com/trademarks",
      entrypoints: [{ uri: "https://example.com/trademarks" }],
    });
    const planRecord = plans.create({
      sourceId: source.id,
      name: "Collect Example trademarks",
      status: "PAUSED",
      schedule: { mode: "MANUAL" },
      priority: "NORMAL",
      policy: {
        includePatterns: [],
        excludePatterns: [],
        maxDepth: 1,
        maxItems: 100,
        renderJavascript: false,
        fetchAttachments: false,
        respectRobots: true,
        rateLimitPerMinute: 30,
        timeoutSeconds: 30,
        retry: { maxAttempts: 3, backoffSeconds: 5 },
      },
      output: { artifactKinds: ["HTML", "MARKDOWN", "JSON"] },
    });
    const sourceWithPlan = plans.setSourceDefaultPlan(
      source.id,
      planRecord.plan.id,
      source.updatedAt,
    );
    for (const candidateId of ["cand_authorize_test", "cand_authorize_same_source"]) {
      discovery.reviewCandidate(candidateId, {
        decision: "ACCEPTED",
        reviewer: "operator-test",
        acceptedSourceId: source.id,
        collectionPlanId: planRecord.plan.id,
      });
    }

    expect(plans.getById(planRecord.plan.id)?.plan.status).toBe("PAUSED");
    expect(runs.listForPlan(planRecord.plan.id)).toHaveLength(0);

    const service = new DiscoveryCollectionService({ discovery, sources, plans, runs });
    const authorized = service.authorizeAndDispatch("cand_authorize_test", {
      requestedBy: "operator-test",
    });

    expect(authorized.source.id).toBe(sourceWithPlan.id);
    expect(authorized.plan.status).toBe("ACTIVE");
    expect(authorized.run.status).toBe("PENDING");
    expect(authorized.run.trigger.requestedBy).toEqual({
      actorType: "LOCAL_ADMIN",
      actorId: "operator-test",
    });
    expect(authorized.run.trigger.idempotencyKey).toBe(`discovery-initial-${planRecord.plan.id}`);
    expect(authorized.jobs).toHaveLength(1);
    expect(authorized.jobs[0]?.status).toBe("PENDING");
    expect(authorized.replayed).toBe(false);

    const sameCandidateReplay = service.authorizeAndDispatch("cand_authorize_test", {
      requestedBy: "operator-test",
    });
    expect(sameCandidateReplay.replayed).toBe(true);
    expect(sameCandidateReplay.run.id).toBe(authorized.run.id);

    const sameSourceReplay = service.authorizeAndDispatch("cand_authorize_same_source", {
      requestedBy: "operator-test",
    });
    expect(sameSourceReplay.replayed).toBe(true);
    expect(sameSourceReplay.run.id).toBe(authorized.run.id);
    expect(runs.listForPlan(planRecord.plan.id)).toHaveLength(1);

    database.close();
  });

  it("reuses existing collection history instead of starting a second initial run", () => {
    const database = openRegistryDatabase(":memory:");
    const sources = new SqliteSourceRepository(database);
    const plans = new SqliteCollectionPlanRepository(database);
    const discovery = new SqliteSourceDiscoveryRepository(database);
    const runs = new SqliteExecutionLedgerRepository(database);

    const seed = discovery.createSeed({ locator: "https://example.org/" });
    discovery.createBatch({
      batchId: "disc_existing_history_test",
      seeds: [{ seedId: seed.seedId, locator: seed.locator }],
      createdAt: "2026-08-08T02:00:00.000Z",
      constraints: { maxDepth: 1, maxCandidates: 10, sameHostOnly: true },
    });
    discovery.completeBatch("disc_existing_history_test", [
      {
        candidateId: "cand_existing_history_test",
        locator: "https://example.org/trademarks",
        discoveredAt: "2026-08-08T02:00:30.000Z",
        status: "DISCOVERED",
        discoveredFrom: "https://example.org/",
        discoveryMethod: "HTML_LINK",
        depth: 1,
      },
    ]);

    const source = sources.create({
      name: "Example existing source",
      slug: "example-existing-source",
      sourceType: "WEB",
      category: "OTHER",
      authorityLevel: "UNKNOWN",
      status: "ACTIVE",
      jurisdictions: ["GLOBAL"],
      languages: ["und"],
      connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
      canonicalUri: "https://example.org/trademarks",
      entrypoints: [{ uri: "https://example.org/trademarks" }],
    });
    const planRecord = plans.create({
      sourceId: source.id,
      name: "Collect existing source",
      status: "ACTIVE",
      schedule: { mode: "MANUAL" },
      priority: "NORMAL",
      policy: {
        includePatterns: [],
        excludePatterns: [],
        maxDepth: 1,
        maxItems: 100,
        renderJavascript: false,
        fetchAttachments: false,
        respectRobots: true,
        rateLimitPerMinute: 30,
        timeoutSeconds: 30,
        retry: { maxAttempts: 3, backoffSeconds: 5 },
      },
      output: { artifactKinds: ["HTML", "MARKDOWN", "JSON"] },
    });
    plans.setSourceDefaultPlan(source.id, planRecord.plan.id, source.updatedAt);
    const prior = runs.dispatchManual({
      planId: planRecord.plan.id,
      requestedBy: { actorType: "LOCAL_ADMIN", actorId: "prior-operator" },
      idempotencyKey: "existing-collection-history",
    });
    discovery.reviewCandidate("cand_existing_history_test", {
      decision: "ACCEPTED",
      reviewer: "operator-test",
      acceptedSourceId: source.id,
      collectionPlanId: planRecord.plan.id,
    });

    const service = new DiscoveryCollectionService({ discovery, sources, plans, runs });
    const authorized = service.authorizeAndDispatch("cand_existing_history_test", {
      requestedBy: "operator-test",
    });

    expect(authorized.replayed).toBe(true);
    expect(authorized.run.id).toBe(prior.record.run.id);
    expect(runs.listForPlan(planRecord.plan.id)).toHaveLength(1);

    database.close();
  });
});
