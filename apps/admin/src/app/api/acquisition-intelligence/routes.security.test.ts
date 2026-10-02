import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SqliteCoreWorkspaceBindingRepository } from "@markorbit/persistence/core-workspace-bindings";
import {
  getCollectionPlanRepository,
  getExecutionLedgerRepository,
  getRegistryDatabase,
  getSourceRepository,
  getWorkspaceRepository,
} from "../../../server/source-registry";
import { GET as getReevaluations } from "./reevaluations/route";
import { GET as getRun } from "./runs/[runId]/route";
import { GET as getSource } from "./sources/[sourceId]/route";
import { POST as selectStrategy } from "./sources/[sourceId]/strategy-selection/route";
import { GET as getStrategyCandidates } from "./strategy-candidates/route";
import { POST as transitionStrategyCandidate } from "./strategy-candidates/[id]/transition/route";

const INTERNAL_SECRET = "acquisition-route-security-test-secret";
const CORE_A = "11111111-1111-4111-8111-111111111111";
const CORE_B = "22222222-2222-4222-8222-222222222222";
const originalEnvironment = {
  dbPath: process.env.MARKORBIT_KNOWLEDGE_DB_PATH,
  artifactPath: process.env.MARKORBIT_ARTIFACT_STORE_PATH,
  stagingPath: process.env.MARKORBIT_STAGING_STORE_PATH,
  internalSecret: process.env.MO_INTERNAL_SERVICE_SECRET,
};

type GlobalRegistry = typeof globalThis & {
  markorbitRegistries?: { database?: { close(): void } };
};

let temporaryRoot: string;
let sourceAId: string;
let sourceBId: string;
let runAId: string;
let runBId: string;

function resetRegistry(): void {
  const registry = globalThis as GlobalRegistry;
  registry.markorbitRegistries?.database?.close();
  delete registry.markorbitRegistries;
}

function principalHeader(workspaceId: string, role = "WORKSPACE_ADMIN"): string {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      principal: {
        kind: "WORKSPACE",
        sessionId: "ses_acquisition_security_1",
        userId: "usr_acquisition_security_1",
        workspaceId,
        membershipId: "mem_acquisition_security_1",
        role,
        permissions: ["matter:read"],
        sessionExpiresAt: "2099-01-01T00:00:00.000Z",
      },
    }),
    "utf8",
  ).toString("base64url");
}

function request(input: {
  path: string;
  method?: "GET" | "POST";
  coreWorkspaceId?: string;
  role?: string;
  authenticated?: boolean;
  body?: unknown;
}): Request {
  const headers = new Headers();
  if (input.authenticated !== false) {
    headers.set("x-markorbit-internal-authorization", INTERNAL_SECRET);
    headers.set(
      "x-markorbit-principal",
      principalHeader(input.coreWorkspaceId ?? CORE_A, input.role),
    );
  }
  if (input.body !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://knowledge.test${input.path}`, {
    method: input.method ?? "GET",
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
}

async function errorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

beforeAll(() => {
  temporaryRoot = mkdtempSync(join(tmpdir(), "markorbit-acquisition-route-security-"));
  process.env.MARKORBIT_KNOWLEDGE_DB_PATH = join(temporaryRoot, "registry.sqlite");
  process.env.MARKORBIT_ARTIFACT_STORE_PATH = join(temporaryRoot, "artifacts");
  process.env.MARKORBIT_STAGING_STORE_PATH = join(temporaryRoot, "staging");
  process.env.MO_INTERNAL_SERVICE_SECRET = INTERNAL_SECRET;
  resetRegistry();

  const workspaces = getWorkspaceRepository();
  const workspaceA = workspaces.create({ slug: "acquisition-security-a", name: "Acquisition A" });
  const workspaceB = workspaces.create({ slug: "acquisition-security-b", name: "Acquisition B" });
  const bindings = new SqliteCoreWorkspaceBindingRepository(getRegistryDatabase());
  bindings.bind(workspaceA.id, CORE_A);
  bindings.bind(workspaceB.id, CORE_B);

  const sources = getSourceRepository();
  const plans = getCollectionPlanRepository();
  const createSourceAndRun = (workspaceId: string, suffix: string) => {
    const source = sources.create({
      workspaceId,
      name: `Acquisition source ${suffix}`,
      slug: `acquisition-source-${suffix}`,
      sourceType: "WEB",
      category: "OFFICIAL_AUTHORITY",
      authorityLevel: "PRIMARY_OFFICIAL",
      status: "ACTIVE",
      jurisdictions: ["CN"],
      languages: ["zh-CN"],
      connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
      connectorConfig: {},
      canonicalUri: `https://example.test/${suffix}`,
      entrypoints: [{ uri: `https://example.test/${suffix}` }],
    });
    const plan = plans.create({
      workspaceId,
      sourceId: source.id,
      name: `Acquisition plan ${suffix}`,
      status: "ACTIVE",
      schedule: { mode: "MANUAL" },
      priority: "NORMAL",
      policy: {
        includePatterns: [],
        excludePatterns: [],
        maxDepth: 1,
        maxItems: 10,
        renderJavascript: false,
        fetchAttachments: false,
        respectRobots: true,
        rateLimitPerMinute: 10,
        timeoutSeconds: 60,
        retry: { maxAttempts: 2, backoffSeconds: 10 },
        locale: "zh-CN",
      },
      output: { artifactKinds: ["HTML"] },
    }).plan;
    const run = getExecutionLedgerRepository().dispatchManual({ planId: plan.id }).record.run;
    return { sourceId: source.id, runId: run.id };
  };

  const recordA = createSourceAndRun(workspaceA.id, "a");
  const recordB = createSourceAndRun(workspaceB.id, "b");
  sourceAId = recordA.sourceId;
  sourceBId = recordB.sourceId;
  runAId = recordA.runId;
  runBId = recordB.runId;
});

afterAll(() => {
  resetRegistry();
  if (originalEnvironment.dbPath === undefined) delete process.env.MARKORBIT_KNOWLEDGE_DB_PATH;
  else process.env.MARKORBIT_KNOWLEDGE_DB_PATH = originalEnvironment.dbPath;
  if (originalEnvironment.artifactPath === undefined)
    delete process.env.MARKORBIT_ARTIFACT_STORE_PATH;
  else process.env.MARKORBIT_ARTIFACT_STORE_PATH = originalEnvironment.artifactPath;
  if (originalEnvironment.stagingPath === undefined)
    delete process.env.MARKORBIT_STAGING_STORE_PATH;
  else process.env.MARKORBIT_STAGING_STORE_PATH = originalEnvironment.stagingPath;
  if (originalEnvironment.internalSecret === undefined)
    delete process.env.MO_INTERNAL_SERVICE_SECRET;
  else process.env.MO_INTERNAL_SERVICE_SECRET = originalEnvironment.internalSecret;
  rmSync(temporaryRoot, { recursive: true, force: true });
});

describe.sequential("acquisition intelligence route workspace security", () => {
  it("returns same-workspace Source and Run learning views", async () => {
    const sourceResponse = await getSource(request({ path: `/source/${sourceAId}` }), {
      params: Promise.resolve({ sourceId: sourceAId }),
    });
    expect(sourceResponse.status).toBe(200);
    expect((await sourceResponse.json()).sourceId).toBe(sourceAId);

    const runResponse = await getRun(request({ path: `/run/${runAId}` }), {
      params: Promise.resolve({ runId: runAId }),
    });
    expect(runResponse.status).toBe(200);
    expect((await runResponse.json()).runId).toBe(runAId);
  });

  it("privacy-safely rejects cross-workspace and nonexistent Source and Run IDs", async () => {
    for (const sourceId of [sourceBId, "src_00000000000000000000000000"]) {
      const response = await getSource(request({ path: `/source/${sourceId}` }), {
        params: Promise.resolve({ sourceId }),
      });
      expect(response.status).toBe(404);
      expect(await errorCode(response)).toBe("SOURCE_NOT_FOUND");
    }

    for (const runId of [runBId, "run_00000000000000000000000000"]) {
      const response = await getRun(request({ path: `/run/${runId}` }), {
        params: Promise.resolve({ runId }),
      });
      expect(response.status).toBe(404);
      expect(await errorCode(response)).toBe("EXECUTION_RUN_NOT_FOUND");
    }
  });

  it("fails closed for tenant reads of global governance evidence", async () => {
    for (const response of [
      await getStrategyCandidates(request({ path: "/strategy-candidates" })),
      await getReevaluations(request({ path: "/reevaluations" })),
    ]) {
      expect(response.status).toBe(403);
      expect(await errorCode(response)).toBe("ACQUISITION_GOVERNANCE_PERMISSION_REQUIRED");
    }
  });

  it.each(["WORKSPACE_ADMIN", "REVIEWER", "READ_ONLY"])(
    "rejects %s tenant acquisition governance mutations without durable changes",
    async (role) => {
      const database = getRegistryDatabase();
      const transitionsBefore = Number(
        (
          database
            .prepare("SELECT COUNT(*) AS count FROM acquisition_strategy_candidate_transitions")
            .get() as { count: number }
        ).count,
      );
      const selectionsBefore = Number(
        (
          database
            .prepare("SELECT COUNT(*) AS count FROM acquisition_strategy_selections")
            .get() as { count: number }
        ).count,
      );

      const transitionResponse = await transitionStrategyCandidate(
        request({
          path: "/strategy-candidates/asc_test/transition",
          method: "POST",
          role,
          body: { toStage: "CANDIDATE", rationale: "Not authorized" },
        }),
        { params: Promise.resolve({ id: "asc_test" }) },
      );
      const selectionResponse = await selectStrategy(
        request({
          path: `/sources/${sourceAId}/strategy-selection`,
          method: "POST",
          role,
        }),
        { params: Promise.resolve({ sourceId: sourceAId }) },
      );

      expect(transitionResponse.status).toBe(403);
      expect(await errorCode(transitionResponse)).toBe(
        "ACQUISITION_GOVERNANCE_PERMISSION_REQUIRED",
      );
      expect(selectionResponse.status).toBe(403);
      expect(await errorCode(selectionResponse)).toBe("ACQUISITION_GOVERNANCE_PERMISSION_REQUIRED");
      expect(
        Number(
          (
            database
              .prepare("SELECT COUNT(*) AS count FROM acquisition_strategy_candidate_transitions")
              .get() as { count: number }
          ).count,
        ),
      ).toBe(transitionsBefore);
      expect(
        Number(
          (
            database
              .prepare("SELECT COUNT(*) AS count FROM acquisition_strategy_selections")
              .get() as { count: number }
          ).count,
        ),
      ).toBe(selectionsBefore);
    },
  );

  it("requires authentication on all six routes", async () => {
    const unauthenticated = { authenticated: false as const };
    const responses = [
      await getSource(request({ path: `/source/${sourceAId}`, ...unauthenticated }), {
        params: Promise.resolve({ sourceId: sourceAId }),
      }),
      await getRun(request({ path: `/run/${runAId}`, ...unauthenticated }), {
        params: Promise.resolve({ runId: runAId }),
      }),
      await getStrategyCandidates(request({ path: "/strategy-candidates", ...unauthenticated })),
      await getReevaluations(request({ path: "/reevaluations", ...unauthenticated })),
      await transitionStrategyCandidate(
        request({
          path: "/strategy-candidates/asc_test/transition",
          method: "POST",
          body: { toStage: "CANDIDATE", rationale: "No auth" },
          ...unauthenticated,
        }),
        { params: Promise.resolve({ id: "asc_test" }) },
      ),
      await selectStrategy(
        request({
          path: `/sources/${sourceAId}/strategy-selection`,
          method: "POST",
          ...unauthenticated,
        }),
        { params: Promise.resolve({ sourceId: sourceAId }) },
      ),
    ];

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(await errorCode(response)).toBe("INTERNAL_SERVICE_UNAUTHORIZED");
    }
  });
});
