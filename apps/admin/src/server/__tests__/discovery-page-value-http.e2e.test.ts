import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type {
  PageValueScreeningRequestV1,
  PageValueScreeningResponseV1,
  SourceCandidate,
  SourceDiscoveryBatch,
} from "@markorbit/contracts";
import { openRegistryDatabase, SqliteSourceRepository } from "@markorbit/persistence";
import { SqliteCollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import { SqliteConnectorRepository } from "@markorbit/persistence/connectors";
import { SqlitePageValueCapabilityRepository } from "@markorbit/persistence/page-value-capability";
import { SqliteSourceDiscoveryRepository } from "@markorbit/persistence/source-discovery";
import { SqliteSourceGraphRepository } from "@markorbit/persistence/source-graph";
import { SharedCapabilityDiscoveryPageValueRanker } from "../discovery-page-value-ranker";
import { DiscoveryWorkflowService } from "../discovery-service";

const previousBaseUrl = process.env.MARKORBIT_CAPABILITY_BASE_URL;
const previousApiKey = process.env.MARKORBIT_CAPABILITY_API_KEY;
const servers: Server[] = [];

afterEach(async () => {
  if (previousBaseUrl === undefined) delete process.env.MARKORBIT_CAPABILITY_BASE_URL;
  else process.env.MARKORBIT_CAPABILITY_BASE_URL = previousBaseUrl;
  if (previousApiKey === undefined) delete process.env.MARKORBIT_CAPABILITY_API_KEY;
  else process.env.MARKORBIT_CAPABILITY_API_KEY = previousApiKey;
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  );
});

function candidate(index: number): SourceCandidate {
  return {
    candidateId: `cand_http_${index}`,
    locator: `https://example.com/page-${index}`,
    title: `Page ${index}`,
    discoveredAt: "2026-08-19T01:00:00.000Z",
    status: "DISCOVERED",
    discoveredFrom: "https://example.com/",
    discoveryMethod: "HTML_LINK",
    depth: 1,
    metadata: {
      kind: "PAGE",
      relevanceScore: index,
      reasonCodes: ["HTML_LINK"],
    },
  };
}

function capabilityResponse(candidateIds: string[]): PageValueScreeningResponseV1 {
  return {
    version: "1.0",
    capability: "page-value-screening",
    provider: {
      providerId: "shared-capability-e2e",
      model: "page-value-e2e",
      executionId: "exec-page-value-http-e2e",
    },
    generatedAt: "2026-08-19T01:01:00.000Z",
    items: candidateIds.map((candidateId, index) => ({
      candidateId,
      title: candidateId,
      summary: "Durable official reference candidate",
      pageType: "guidance",
      valuePoints: ["official reference material"],
      score: 99 - index,
      priority: "HIGH",
    })),
  };
}

async function startCapabilityServer(
  onRequest: (input: {
    path: string;
    authorization: string | undefined;
    body: PageValueScreeningRequestV1;
  }) => PageValueScreeningResponseV1,
): Promise<string> {
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as PageValueScreeningRequestV1;
    const payload = onRequest({
      path: request.url ?? "",
      authorization: request.headers.authorization,
      body,
    });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(payload));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("Discovery page-value production HTTP boundary", () => {
  it("oversamples 3x, retains late high-value Top N, and persists capability provenance", async () => {
    const providerCandidates = Array.from({ length: 6 }, (_, index) => candidate(index + 1));
    let providerBudget: number | undefined;
    let observedRequest: PageValueScreeningRequestV1 | undefined;
    let observedPath = "";
    let observedAuthorization: string | undefined;
    const baseUrl = await startCapabilityServer(({ path, authorization, body }) => {
      observedPath = path;
      observedAuthorization = authorization;
      observedRequest = body;
      return capabilityResponse(["cand_http_6", "cand_http_5"]);
    });
    process.env.MARKORBIT_CAPABILITY_BASE_URL = baseUrl;
    process.env.MARKORBIT_CAPABILITY_API_KEY = "page-value-e2e-key";

    const database = openRegistryDatabase(":memory:");
    const discovery = new SqliteSourceDiscoveryRepository(database);
    const pageValues = new SqlitePageValueCapabilityRepository(
      database,
      () => new Date("2026-08-19T01:02:00.000Z"),
    );
    const service = new DiscoveryWorkflowService({
      discovery,
      graph: new SqliteSourceGraphRepository(database),
      sources: new SqliteSourceRepository(database),
      plans: new SqliteCollectionPlanRepository(database),
      connectors: new SqliteConnectorRepository(database),
      provider: {
        async discover(batch: SourceDiscoveryBatch) {
          providerBudget = batch.constraints?.maxCandidates;
          return providerCandidates;
        },
      },
      pageValueRanker: new SharedCapabilityDiscoveryPageValueRanker(pageValues),
      pageValueTimeoutMs: 2_000,
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

    const result = await service.start({
      locator: "https://example.com/",
      maxCandidates: 2,
      maxFetches: 10,
    });

    expect(providerBudget).toBe(6);
    expect(observedPath).toBe("/v1/capabilities/page-value-screening");
    expect(observedAuthorization).toBe("Bearer page-value-e2e-key");
    expect(observedRequest?.capability).toBe("page-value-screening");
    expect(observedRequest?.maxResults).toBe(2);
    expect(observedRequest?.candidates).toHaveLength(6);
    expect(observedRequest?.candidates.at(-1)?.candidateId).toBe("cand_http_6");
    expect(result.candidates.map((item) => item.candidateId)).toEqual([
      "cand_http_6",
      "cand_http_5",
    ]);
    expect(discovery.listCandidates({ limit: 100 }).total).toBe(2);
    expect(discovery.getCandidate("cand_http_1")).toBeNull();

    const persisted = pageValues.latestScreening(["cand_http_6", "cand_http_5"]);
    expect(Object.keys(persisted).sort()).toEqual(["cand_http_5", "cand_http_6"]);
    expect(persisted.cand_http_6?.provider).toEqual({
      providerId: "shared-capability-e2e",
      model: "page-value-e2e",
      executionId: "exec-page-value-http-e2e",
    });
    expect(persisted.cand_http_6?.item.score).toBe(99);

    database.close();
  });
});
