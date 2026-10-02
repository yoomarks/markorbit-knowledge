import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CaseCandidateV1 } from "@markorbit/contracts";
import { SqliteCoreWorkspaceBindingRepository } from "@markorbit/persistence/core-workspace-bindings";
import { getCaseCandidateIntakeRepository } from "../../../server/case-candidate-intake";
import { getRegistryDatabase, getWorkspaceRepository } from "../../../server/source-registry";
import { GET, POST } from "./route";

const INTERNAL_SECRET = "case-candidates-route-test-secret-32-bytes";
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

function resetRegistry(): void {
  const registry = globalThis as GlobalRegistry;
  registry.markorbitRegistries?.database?.close();
  delete registry.markorbitRegistries;
}

function candidate(workspaceId: string, suffix: string): CaseCandidateV1 {
  return {
    protocolVersion: "1.0",
    objectType: "CASE_CANDIDATE",
    candidateId: `case-candidate_route_${suffix}`,
    sourceSystem: "MARKREG",
    sourceMatterId: `formal-matter_route_${suffix}`,
    sourceMatterVersion: 1,
    sourceSnapshotSha256: suffix.repeat(64),
    sourceRetrievalRef: `/v1/formal-matters/formal-matter_route_${suffix}`,
    promotedBy: "user:route-test",
    promotedAt: "2026-10-02T00:00:00.000Z",
    accessScope: { sourceWorkspaceId: workspaceId, classification: "CONFIDENTIAL" },
    idempotencyKey: `case-route-${suffix}-001`,
  };
}

function principalHeader(workspaceId: string, permissions: string[]): string {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      principal: {
        kind: "WORKSPACE",
        sessionId: "ses_case_route_1",
        userId: "usr_case_route_1",
        workspaceId,
        membershipId: "mem_case_route_1",
        role: "WORKSPACE_ADMIN",
        permissions,
        sessionExpiresAt: "2099-01-01T00:00:00.000Z",
      },
    }),
    "utf8",
  ).toString("base64url");
}

function request(
  method: "GET" | "POST",
  workspaceId: string,
  options: { candidateId?: string; candidate?: CaseCandidateV1; promote?: boolean } = {},
): Request {
  const url = new URL("http://knowledge.test/api/case-candidates");
  if (options.candidateId) url.searchParams.set("candidateId", options.candidateId);
  return new Request(url, {
    method,
    headers: {
      "content-type": "application/json",
      "x-markorbit-internal-authorization": INTERNAL_SECRET,
      "x-markorbit-principal": principalHeader(
        workspaceId,
        options.promote ? ["matter:read", "matter:promote-knowledge"] : ["matter:read"],
      ),
    },
    ...(options.candidate ? { body: JSON.stringify(options.candidate) } : {}),
  });
}

async function errorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

beforeAll(() => {
  temporaryRoot = mkdtempSync(join(tmpdir(), "markorbit-case-candidate-route-"));
  process.env.MARKORBIT_KNOWLEDGE_DB_PATH = join(temporaryRoot, "registry.sqlite");
  process.env.MARKORBIT_ARTIFACT_STORE_PATH = join(temporaryRoot, "artifacts");
  process.env.MARKORBIT_STAGING_STORE_PATH = join(temporaryRoot, "staging");
  process.env.MO_INTERNAL_SERVICE_SECRET = INTERNAL_SECRET;
  resetRegistry();

  const workspaces = getWorkspaceRepository();
  const workspaceA = workspaces.create({ slug: "case-route-a", name: "Case Route A" });
  const workspaceB = workspaces.create({ slug: "case-route-b", name: "Case Route B" });
  const bindings = new SqliteCoreWorkspaceBindingRepository(getRegistryDatabase());
  bindings.bind(workspaceA.id, CORE_A);
  bindings.bind(workspaceB.id, CORE_B);

  const repository = getCaseCandidateIntakeRepository();
  repository.acceptCandidate(candidate(CORE_A, "a"), "2026-10-02T00:01:00.000Z");
  repository.acceptCandidate(candidate(CORE_B, "b"), "2026-10-02T00:02:00.000Z");
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

describe.sequential("/api/case-candidates Workspace isolation", () => {
  it("filters pending inventory to the authenticated Core Workspace", async () => {
    const response = await GET(request("GET", CORE_A));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: Array<{ candidate: CaseCandidateV1 }> };
    expect(body.items.map((item) => item.candidate.candidateId)).toEqual([
      "case-candidate_route_a",
    ]);
  });

  it("does not reveal another Workspace candidate by id", async () => {
    const response = await GET(request("GET", CORE_A, { candidateId: "case-candidate_route_b" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ candidate: null, intake: null });
  });

  it("requires explicit promotion authority and leaves storage unchanged on rejection", async () => {
    const repository = getCaseCandidateIntakeRepository();
    const before = repository.listAll().length;
    const value = candidate(CORE_A, "c");
    const response = await POST(request("POST", CORE_A, { candidate: value }));
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("PERMISSION_DENIED");
    expect(repository.listAll()).toHaveLength(before);
  });

  it("rejects a cross-Workspace body before mutation", async () => {
    const repository = getCaseCandidateIntakeRepository();
    const before = repository.listAll().length;
    const response = await POST(
      request("POST", CORE_A, { candidate: candidate(CORE_B, "d"), promote: true }),
    );
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("WORKSPACE_MISMATCH");
    expect(repository.listAll()).toHaveLength(before);
  });

  it("accepts an authorized same-Workspace promotion", async () => {
    const response = await POST(
      request("POST", CORE_A, { candidate: candidate(CORE_A, "e"), promote: true }),
    );
    expect(response.status).toBe(202);
    const body = (await response.json()) as { candidate: CaseCandidateV1 };
    expect(body.candidate.candidateId).toBe("case-candidate_route_e");
  });
});
