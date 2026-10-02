import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CROSS_SOURCE_PARENT_ARTIFACT_IDS_EXTENSION } from "@markorbit/contracts";
import { SqliteCoreWorkspaceBindingRepository } from "@markorbit/persistence/core-workspace-bindings";
import {
  getCollectionPlanRepository,
  getConnectorRepository,
  getRegistryDatabase,
  getSourceRepository,
  getWorkspaceRepository,
} from "../../../server/source-registry";
import { POST } from "./route";

const INTERNAL_SECRET = "operator-runs-test-secret-32-bytes";
const CORE_A = "11111111-1111-4111-8111-111111111111";
const CORE_B = "22222222-2222-4222-8222-222222222222";
const USER_ID = "usr_operator_runs_1";
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
let planAId: string;
let planBId: string;
let publisherPlanId: string;
let publisherBatchPlanId: string;
const PUBLISHER_REQUEST_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const PUBLISHER_REQUEST_ID_2 = "art_01ARZ3NDEKTSV4RRFFQ69G5FAW";

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
        sessionId: "ses_operator_runs_1",
        userId: USER_ID,
        workspaceId,
        membershipId: "mem_operator_runs_1",
        role,
        permissions: ["matter:read"],
        sessionExpiresAt: "2099-01-01T00:00:00.000Z",
      },
    }),
    "utf8",
  ).toString("base64url");
}

function dispatchRequest(input: {
  planId: string;
  coreWorkspaceId?: string;
  role?: string;
  idempotencyKey?: string;
  internalAuthorization?: string | null;
  cookie?: string;
  extraBody?: Record<string, unknown>;
}): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (input.internalAuthorization !== null) {
    headers.set(
      "x-markorbit-internal-authorization",
      input.internalAuthorization ?? INTERNAL_SECRET,
    );
  }
  headers.set(
    "x-markorbit-principal",
    principalHeader(input.coreWorkspaceId ?? CORE_A, input.role),
  );
  if (input.idempotencyKey) headers.set("Idempotency-Key", input.idempotencyKey);
  if (input.cookie) headers.set("cookie", input.cookie);
  return new Request("http://knowledge.test/api/operator-runs", {
    method: "POST",
    headers,
    body: JSON.stringify({ planId: input.planId, ...input.extraBody }),
  });
}

async function errorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

beforeAll(() => {
  temporaryRoot = mkdtempSync(join(tmpdir(), "markorbit-operator-runs-"));
  process.env.MARKORBIT_KNOWLEDGE_DB_PATH = join(temporaryRoot, "registry.sqlite");
  process.env.MARKORBIT_ARTIFACT_STORE_PATH = join(temporaryRoot, "artifacts");
  process.env.MARKORBIT_STAGING_STORE_PATH = join(temporaryRoot, "staging");
  process.env.MO_INTERNAL_SERVICE_SECRET = INTERNAL_SECRET;
  resetRegistry();

  const workspaces = getWorkspaceRepository();
  const workspaceA = workspaces.create({ slug: "operator-runs-a", name: "Operator Runs A" });
  const workspaceB = workspaces.create({ slug: "operator-runs-b", name: "Operator Runs B" });
  const bindings = new SqliteCoreWorkspaceBindingRepository(getRegistryDatabase());
  bindings.bind(workspaceA.id, CORE_A);
  bindings.bind(workspaceB.id, CORE_B);

  const sources = getSourceRepository();
  const plans = getCollectionPlanRepository();
  const createPlan = (workspaceId: string, suffix: string) => {
    const source = sources.create({
      workspaceId,
      name: `Operator source ${suffix}`,
      slug: `operator-source-${suffix}`,
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
    return plans.create({
      workspaceId,
      sourceId: source.id,
      name: `Operator plan ${suffix}`,
      status: "ACTIVE",
      schedule: { mode: "MANUAL" },
      priority: "NORMAL",
      policy: {
        includePatterns: [],
        excludePatterns: [],
        maxDepth: 1,
        maxItems: 50,
        renderJavascript: false,
        fetchAttachments: false,
        respectRobots: true,
        rateLimitPerMinute: 10,
        timeoutSeconds: 60,
        retry: { maxAttempts: 3, backoffSeconds: 10 },
        locale: "zh-CN",
      },
      output: { artifactKinds: ["HTML"] },
      extensions: {
        "x-markorbit.cnipa-traffic-class": "FAST_LIST",
        "x-markorbit.cnipa-document-kind": "REGISTRATION_EXAMINATION",
      },
    }).plan.id;
  };

  planAId = createPlan(workspaceA.id, "a");
  planBId = createPlan(workspaceB.id, "b");

  getConnectorRepository().create({
    connectorId: "global-trademark-fact-admission-publisher",
    displayName: "Global Trademark Fact Admission Publisher",
    version: "1.0.0",
    sourceTypes: ["DATABASE"],
    runtime: "NODE",
    capabilities: ["COLLECT"],
    supportedJobTypes: ["API_COLLECTION"],
    configurationSchema: { type: "object", properties: {} },
    secretSchema: { type: "object", properties: {} },
    outputArtifactKinds: ["JSON"],
    healthCheck: { mode: "NONE", timeoutSeconds: 30 },
    status: "ACTIVE",
  });
  const publisherSource = sources.create({
    workspaceId: workspaceA.id,
    name: "Operator global trademark publisher",
    slug: "operator-global-trademark-publisher",
    sourceType: "DATABASE",
    category: "INTERNAL",
    authorityLevel: "INTERNAL",
    status: "ACTIVE",
    jurisdictions: ["LA"],
    languages: ["en-US"],
    connector: { connectorId: "global-trademark-fact-admission-publisher", version: "1.0.0" },
    connectorConfig: {
      intent: "PUBLISH_DURABLE_REQUEST",
      requestArtifactRef: {
        artifactId: PUBLISHER_REQUEST_ID,
        canonicalUri: "la-dipo://wopublish/trademarks/list/page/1/fact-admission-request",
        sha256: "a".repeat(64),
        sizeBytes: 100,
      },
    },
    canonicalUri: "markorbit://knowledge/global-trademark/fact-admission-requests",
    entrypoints: [{ uri: "markorbit://knowledge/global-trademark/fact-admission-requests" }],
  });
  publisherPlanId = plans.create({
    workspaceId: workspaceA.id,
    sourceId: publisherSource.id,
    name: "Operator publisher plan",
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
      respectRobots: true,
      rateLimitPerMinute: 10,
      timeoutSeconds: 60,
      retry: { maxAttempts: 2, backoffSeconds: 10 },
      locale: "en-US",
    },
    output: { artifactKinds: ["JSON"] },
  }).plan.id;
  const publisherBatchSource = sources.create({
    workspaceId: workspaceA.id,
    name: "Operator global trademark batch publisher",
    slug: "operator-global-trademark-batch-publisher",
    sourceType: "DATABASE",
    category: "INTERNAL",
    authorityLevel: "INTERNAL",
    status: "ACTIVE",
    jurisdictions: ["LA"],
    languages: ["en-US"],
    connector: { connectorId: "global-trademark-fact-admission-publisher", version: "1.0.0" },
    connectorConfig: {
      intent: "PUBLISH_DURABLE_REQUEST_BATCH",
      requestArtifactRefs: [PUBLISHER_REQUEST_ID, PUBLISHER_REQUEST_ID_2].map(
        (artifactId, index) => ({
          artifactId,
          canonicalUri: `la-dipo://wopublish/trademarks/list/page/${index + 1}/fact-admission-request`,
          sha256: String(index + 1).repeat(64),
          sizeBytes: 100,
        }),
      ),
    },
    canonicalUri: "markorbit://knowledge/global-trademark/fact-admission-requests",
    entrypoints: [{ uri: "markorbit://knowledge/global-trademark/fact-admission-requests" }],
  });
  publisherBatchPlanId = plans.create({
    workspaceId: workspaceA.id,
    sourceId: publisherBatchSource.id,
    name: "Operator publisher batch plan",
    status: "ACTIVE",
    schedule: { mode: "MANUAL" },
    priority: "HIGH",
    policy: {
      includePatterns: [],
      excludePatterns: [],
      maxDepth: 0,
      maxItems: 500,
      renderJavascript: false,
      fetchAttachments: false,
      respectRobots: true,
      rateLimitPerMinute: 10,
      timeoutSeconds: 60,
      retry: { maxAttempts: 2, backoffSeconds: 10 },
      locale: "en-US",
    },
    output: { artifactKinds: ["JSON"] },
  }).plan.id;
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

describe.sequential("POST /api/operator-runs", () => {
  it("dispatches as the API client and replays the same idempotency key", async () => {
    const extensions = {
      "x-markorbit.cnipa-query": {
        mode: "DATE_RANGE",
        fromDate: "2026-09-01",
        toDate: "2026-09-02",
        documentKinds: ["REGISTRATION_EXAMINATION"],
      },
    };
    const first = await POST(
      dispatchRequest({
        planId: planAId,
        idempotencyKey: "operator-run-001",
        extraBody: { extensions },
      }),
    );
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as {
      replayed: boolean;
      record: {
        run: {
          id: string;
          trigger: { requestedBy: { actorType: string; actorId: string } };
          extensions?: unknown;
        };
      };
    };
    expect(firstBody.replayed).toBe(false);
    expect(firstBody.record.run.trigger.requestedBy).toEqual({
      actorType: "API_CLIENT",
      actorId: USER_ID,
    });
    expect(firstBody.record.run.extensions).toEqual(extensions);

    const replay = await POST(
      dispatchRequest({
        planId: planAId,
        idempotencyKey: "operator-run-001",
        extraBody: { extensions },
      }),
    );
    expect(replay.status).toBe(200);
    const replayBody = (await replay.json()) as typeof firstBody;
    expect(replayBody.replayed).toBe(true);
    expect(replayBody.record.run.id).toBe(firstBody.record.run.id);
  });

  it("rejects READ_ONLY principals", async () => {
    const response = await POST(dispatchRequest({ planId: planAId, role: "READ_ONLY" }));
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("PERMISSION_DENIED");
  });

  it("freezes the publisher durable request as the cross-Source parent grant", async () => {
    const response = await POST(
      dispatchRequest({
        planId: publisherPlanId,
        idempotencyKey: "operator-publisher-001",
      }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      record: {
        run: { extensions?: Record<string, unknown> };
        jobs: Array<{ extensions?: unknown }>;
      };
    };
    const expected = { [CROSS_SOURCE_PARENT_ARTIFACT_IDS_EXTENSION]: [PUBLISHER_REQUEST_ID] };
    expect(body.record.run.extensions).toEqual(expected);
    expect(body.record.jobs[0]?.extensions).toEqual(expected);

    const replay = await POST(
      dispatchRequest({
        planId: publisherPlanId,
        idempotencyKey: "operator-publisher-001",
      }),
    );
    expect(replay.status).toBe(200);
  });

  it("freezes every bounded publisher batch request as a cross-Source parent grant", async () => {
    const response = await POST(
      dispatchRequest({
        planId: publisherBatchPlanId,
        idempotencyKey: "operator-publisher-batch-001",
      }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      record: {
        run: { extensions?: Record<string, unknown> };
        jobs: Array<{ extensions?: unknown }>;
      };
    };
    const expected = {
      [CROSS_SOURCE_PARENT_ARTIFACT_IDS_EXTENSION]: [PUBLISHER_REQUEST_ID, PUBLISHER_REQUEST_ID_2],
    };
    expect(body.record.run.extensions).toEqual(expected);
    expect(body.record.jobs[0]?.extensions).toEqual(expected);
  });

  it("derives workspace authority from the persisted Plan", async () => {
    const response = await POST(dispatchRequest({ planId: planBId, coreWorkspaceId: CORE_A }));
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("WORKSPACE_MISMATCH");

    const clientWorkspace = await POST(
      dispatchRequest({ planId: planAId, extraBody: { workspaceId: CORE_B } }),
    );
    expect(clientWorkspace.status).toBe(400);
  });

  it("rejects missing or incorrect internal authorization", async () => {
    const missing = await POST(dispatchRequest({ planId: planAId, internalAuthorization: null }));
    expect(missing.status).toBe(401);
    expect(await errorCode(missing)).toBe("INTERNAL_SERVICE_UNAUTHORIZED");

    const incorrect = await POST(
      dispatchRequest({ planId: planAId, internalAuthorization: "wrong-secret" }),
    );
    expect(incorrect.status).toBe(401);
    expect(await errorCode(incorrect)).toBe("INTERNAL_SERVICE_UNAUTHORIZED");
  });

  it("fails closed when internal authorization is not configured", async () => {
    delete process.env.MO_INTERNAL_SERVICE_SECRET;
    try {
      const response = await POST(
        dispatchRequest({ planId: planAId, internalAuthorization: null }),
      );
      expect(response.status).toBe(503);
      expect(await errorCode(response)).toBe("CASE_PRODUCER_AUTH_NOT_CONFIGURED");
    } finally {
      process.env.MO_INTERNAL_SERVICE_SECRET = INTERNAL_SECRET;
    }
  });

  it("does not accept an Admin browser Cookie as authorization", async () => {
    const response = await POST(
      dispatchRequest({
        planId: planAId,
        internalAuthorization: null,
        cookie: "mo_session=browser-session-token",
      }),
    );
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("INTERNAL_SERVICE_UNAUTHORIZED");
  });
});
