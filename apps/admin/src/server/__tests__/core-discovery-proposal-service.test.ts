import { describe, expect, it } from "vitest";
import { CORE_DISCOVERY_PROPOSAL_VERSION, CORE_DISCOVERY_PROPOSER } from "@markorbit/contracts";
import { openRegistryDatabase, SqliteSourceRepository } from "@markorbit/persistence";
import { SqliteCollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import { SqliteConnectorRepository } from "@markorbit/persistence/connectors";
import { SqliteSourceDiscoveryRepository } from "@markorbit/persistence/source-discovery";
import { SqliteSourceGraphRepository } from "@markorbit/persistence/source-graph";
import { SqliteSourceRegistryV2Repository } from "@markorbit/persistence/source-registry-v2";
import { CoreDiscoveryProposalService } from "../core-discovery-proposal-service";
import { DiscoveryWorkflowService } from "../discovery-service";

describe("CoreDiscoveryProposalService", () => {
  it("queues Core proposals without fetching and reuses normal reviewed source promotion", () => {
    const database = openRegistryDatabase(":memory:");
    const sources = new SqliteSourceRepository(database);
    const plans = new SqliteCollectionPlanRepository(database);
    const connectors = new SqliteConnectorRepository(database);
    const discovery = new SqliteSourceDiscoveryRepository(database);
    const graph = new SqliteSourceGraphRepository(database);
    const registryV2 = new SqliteSourceRegistryV2Repository(database);
    const proposals = new CoreDiscoveryProposalService({ discovery });
    let providerCalls = 0;
    const workflow = new DiscoveryWorkflowService({
      discovery,
      graph,
      sources,
      plans,
      connectors,
      provider: {
        async discover() {
          providerCalls += 1;
          throw new Error("Core proposals must not invoke website discovery before review");
        },
      },
      transaction(operation) {
        database.exec("BEGIN IMMEDIATE;");
        try {
          const result = operation();
          database.exec("COMMIT;");
          return result;
        } catch (error) {
          database.exec("ROLLBACK;");
          throw error;
        }
      },
    });

    const input = {
      version: CORE_DISCOVERY_PROPOSAL_VERSION,
      proposalId: "core-proposal-001",
      proposedBy: CORE_DISCOVERY_PROPOSER,
      proposedAt: "2026-08-12T17:00:00.000Z",
      locator: "https://Peer.Example/blog/?utm_source=core#fragment",
      evidenceUrl: "https://core.example/evidence/123",
      opaqueContextRef: "core://discovery/context/123",
    } as const;

    const submitted = proposals.submit(input);
    expect(providerCalls).toBe(0);
    expect(sources.list({ sourceType: "WEB", limit: 100 }).total).toBe(0);
    expect(submitted.proposal.locator).toBe("https://peer.example/blog");
    expect(submitted.batch.batch.constraints?.maxFetches).toBe(0);
    expect(submitted.candidate.candidate.status).toBe("DISCOVERED");
    expect(submitted.candidate.candidate.discoveryMethod).toBe("CORE_PROPOSAL");
    expect(submitted.candidate.candidate.metadata).toMatchObject({
      proposalId: "core-proposal-001",
      proposedBy: "MARKORBIT_CORE",
      fetchEligibleBeforeReview: false,
      opaqueContextRef: "core://discovery/context/123",
    });
    expect(submitted.receipt).toMatchObject({
      proposalId: "core-proposal-001",
      candidateStatus: "DISCOVERED",
      fetchedBeforeReview: false,
    });

    const replay = proposals.submit(input);
    expect(replay.receipt.batchId).toBe(submitted.receipt.batchId);
    expect(replay.receipt.candidateId).toBe(submitted.receipt.candidateId);
    expect(discovery.listBatches(20)).toHaveLength(1);
    expect(discovery.listCandidates({ limit: 100 }).total).toBe(1);
    expect(providerCalls).toBe(0);

    expect(() =>
      proposals.submit({
        ...input,
        locator: "https://different.example/source",
      }),
    ).toThrow(/already used for a different locator/);

    const accepted = workflow.review(submitted.receipt.candidateId, {
      decision: "ACCEPTED",
      reviewer: "operator-test",
    });
    expect(providerCalls).toBe(0);
    expect(accepted.source?.canonicalUri).toBe("https://peer.example/");
    expect(accepted.source?.entrypoints[0]?.uri).toBe("https://peer.example/blog");
    expect(accepted.plan?.status).toBe("PAUSED");
    expect(accepted.candidate.candidate.status).toBe("ACCEPTED");

    const provenance = accepted.source ? registryV2.get(accepted.source.id) : null;
    expect(provenance?.discoveryProvenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          origin: "CORE_PROPOSAL",
          discoveredAt: "2026-08-12T17:00:00.000Z",
          discoveredFromUrl: "https://core.example/evidence/123",
          evidenceUrl: "https://core.example/evidence/123",
        }),
      ]),
    );

    database.close();
  });

  it("rejects local/private proposal targets before they enter the candidate ledger", () => {
    const database = openRegistryDatabase(":memory:");
    const discovery = new SqliteSourceDiscoveryRepository(database);
    const proposals = new CoreDiscoveryProposalService({ discovery });

    expect(() =>
      proposals.submit({
        version: CORE_DISCOVERY_PROPOSAL_VERSION,
        proposalId: "core-proposal-private",
        proposedBy: CORE_DISCOVERY_PROPOSER,
        proposedAt: "2026-08-12T17:00:00.000Z",
        locator: "http://127.0.0.1/private",
      }),
    ).toThrow(/cannot target a local or private host/);
    expect(discovery.listCandidates({ limit: 100 }).total).toBe(0);

    database.close();
  });
});
