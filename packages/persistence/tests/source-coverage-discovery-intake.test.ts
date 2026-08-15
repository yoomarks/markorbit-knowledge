import { describe, expect, it } from "vitest";
import { openRegistryDatabase, SqliteSourceRepository } from "../src/index";
import { SqliteCollectionPlanRepository } from "../src/collection-plan-registry";
import { SqliteExecutionLedgerRepository } from "../src/execution-ledger";
import { SqliteSourceDiscoveryRepository } from "../src/source-discovery-registry";
import { getSourceCoverageTarget } from "../src/source-coverage-catalog";
import { queueSourceCoverageGapForDiscovery } from "../src/source-coverage-discovery-intake";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const targetId = "gb-ukipo-register-trademark";

function environment() {
  const database = openRegistryDatabase(":memory:");
  const clock = () => new Date("2026-08-16T01:00:00Z");
  new SqliteCollectionPlanRepository(database, clock);
  new SqliteExecutionLedgerRepository(database, clock);
  return {
    database,
    sources: new SqliteSourceRepository(database, clock),
    discovery: new SqliteSourceDiscoveryRepository(database, clock),
    clock,
  };
}

describe("Source Coverage → Discovery intake", () => {
  it("queues one curated missing target without creating a Source, plan, run or Job", () => {
    const env = environment();
    const beforeSources = env.sources.list({ workspaceId, limit: 100 }).total;
    const result = queueSourceCoverageGapForDiscovery(
      { workspaceId, targetId },
      { sources: env.sources, discovery: env.discovery, clock: env.clock },
    );

    expect(result.state).toBe("QUEUED");
    expect(result.candidate?.candidate).toMatchObject({
      locator: "https://www.gov.uk/how-to-register-a-trade-mark",
      title: "UKIPO Register a Trade Mark Guide",
      status: "DISCOVERED",
      discoveryMethod: "MANUAL",
      depth: 0,
    });
    expect(result.candidate?.candidate.metadata).toMatchObject({
      coverageIntake: {
        source: "SOURCE_COVERAGE_CATALOG",
        targetId,
        jurisdiction: "GB",
        authorityName: "UK Intellectual Property Office",
        family: "PORTAL",
      },
      operatorIntakeDefaults: {
        category: "OFFICIAL_AUTHORITY",
        authorityLevel: "PRIMARY_OFFICIAL",
        jurisdictions: ["GB"],
        languages: ["en-GB"],
      },
    });
    expect(env.discovery.listCandidates({ status: "DISCOVERED" }).total).toBe(1);
    expect(env.discovery.listBatches()).toHaveLength(1);
    expect(env.discovery.listBatches()[0]).toMatchObject({
      status: "COMPLETED",
      candidateCount: 1,
    });
    expect(env.sources.list({ workspaceId, limit: 100 }).total).toBe(beforeSources);
    expect(env.database.prepare("SELECT COUNT(*) AS count FROM collection_plans").get()).toEqual({
      count: 0,
    });
    expect(env.database.prepare("SELECT COUNT(*) AS count FROM collection_runs").get()).toEqual({
      count: 0,
    });
    expect(env.database.prepare("SELECT COUNT(*) AS count FROM jobs").get()).toEqual({ count: 0 });
    env.database.close();
  });

  it("is idempotent and preserves the existing Discovery review state", () => {
    const env = environment();
    const first = queueSourceCoverageGapForDiscovery(
      { workspaceId, targetId },
      { sources: env.sources, discovery: env.discovery, clock: env.clock },
    );
    env.discovery.reviewCandidate(first.candidate!.candidate.candidateId, {
      decision: "REJECTED",
      reviewer: "coverage-reviewer",
      note: "Needs a different entrypoint",
    });

    const second = queueSourceCoverageGapForDiscovery(
      { workspaceId, targetId },
      { sources: env.sources, discovery: env.discovery, clock: env.clock },
    );

    expect(second.state).toBe("ALREADY_IN_DISCOVERY");
    expect(second.candidate?.candidate.status).toBe("REJECTED");
    expect(second.candidate?.review?.decision).toBe("REJECTED");
    expect(env.discovery.listBatches()).toHaveLength(1);
    expect(env.discovery.listCandidates().total).toBe(1);
    env.database.close();
  });

  it("does not queue a target already covered by a registered Source", () => {
    const env = environment();
    const target = getSourceCoverageTarget(targetId)!;
    const source = env.sources.create({
      workspaceId,
      name: "UKIPO trade mark registration",
      slug: "ukipo-trade-mark-registration",
      sourceType: "WEB",
      category: "OFFICIAL_AUTHORITY",
      authorityLevel: "PRIMARY_OFFICIAL",
      status: "ACTIVE",
      jurisdictions: ["GB"],
      languages: ["en-GB"],
      connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
      connectorConfig: {},
      canonicalUri: target.canonicalUri,
      entrypoints: [{ uri: target.canonicalUri }],
    });

    const result = queueSourceCoverageGapForDiscovery(
      { workspaceId, targetId },
      { sources: env.sources, discovery: env.discovery, clock: env.clock },
    );

    expect(result).toEqual({
      workspaceId,
      targetId,
      state: "ALREADY_COVERED",
      sourceIds: [source.id],
    });
    expect(env.discovery.listBatches()).toHaveLength(0);
    expect(env.discovery.listCandidates().total).toBe(0);
    env.database.close();
  });
});
