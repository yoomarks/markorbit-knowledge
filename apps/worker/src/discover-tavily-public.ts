import { randomUUID } from "node:crypto";
import type { SourceDiscoveryBatch } from "@markorbit/contracts";
import { SourceDiscoveryRunner, TavilyWebsiteDiscoveryProvider } from "@markorbit/worker-runtime";

const DEFAULT_MAX_CANDIDATES = 5;
const HARD_MAX_CANDIDATES = 20;

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function maxCandidates(env: NodeJS.ProcessEnv): number {
  const raw = env.TAVILY_DISCOVERY_MAX_CANDIDATES?.trim();
  if (!raw) return DEFAULT_MAX_CANDIDATES;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > HARD_MAX_CANDIDATES) {
    throw new Error(
      `TAVILY_DISCOVERY_MAX_CANDIDATES must be an integer between 1 and ${HARD_MAX_CANDIDATES}`,
    );
  }
  return value;
}

export function buildTavilyDiscoveryBatch(
  env: NodeJS.ProcessEnv,
  now: Date = new Date(),
): SourceDiscoveryBatch {
  const locator = required(env, "TAVILY_DISCOVERY_SEED_URL");
  const parsed = new URL(locator);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("TAVILY_DISCOVERY_SEED_URL must use http or https");
  }

  const query = required(env, "TAVILY_DISCOVERY_QUERY");
  const limit = maxCandidates(env);

  return {
    batchId: `tavily-${randomUUID()}`,
    seeds: [
      {
        seedId: "tavily-seed-1",
        locator: parsed.toString(),
        metadata: { discoveryQuery: query },
      },
    ],
    createdAt: now.toISOString(),
    constraints: {
      maxCandidates: limit,
      maxFetches: 1,
      sameHostOnly: true,
    },
  };
}

export async function runTavilyDiscovery(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const apiToken = required(env, "TAVILY_API_KEY");
  const batch = buildTavilyDiscoveryBatch(env);
  const provider = new TavilyWebsiteDiscoveryProvider({ apiToken });
  const candidates = await new SourceDiscoveryRunner(provider).run(batch);

  process.stdout.write(
    `${JSON.stringify(
      {
        batchId: batch.batchId,
        seed: batch.seeds[0]?.locator,
        candidateCount: candidates.length,
        candidates,
        boundaries: {
          provider: "tavily",
          requestsAuthorized: 1,
          internalRetry: false,
          structuralOnly: true,
          autoPromotionApplied: false,
          legalTruthVerified: false,
        },
      },
      null,
      2,
    )}\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runTavilyDiscovery().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Tavily discovery failed: ${message}\n`);
    process.exitCode = 1;
  });
}
