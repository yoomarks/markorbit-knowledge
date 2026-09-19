import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  authenticateUsptoTsdrAcceptanceRequest,
  USPTO_TSDR_ACCEPTANCE_AUTHORITY_HEADER,
  USPTO_TSDR_ACCEPTANCE_INTERNAL_AUTHORIZATION_HEADER,
} from "./uspto-tsdr-acceptance-auth";

const internalSecret = "test-internal-service-secret";
const plan = {
  version: 1,
  operationId: "oa-proof-90817045-index",
  workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  authorityMode: "INTERNAL_SERVICE_GO_V1",
  stage: "INDEX",
  serialNumber: "90817045",
  secretRef: "sec_01ARZ3NDEKTSV4RRFFQ69G5FAV",
} as const;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

const sha = createHash("sha256")
  .update(JSON.stringify(canonicalize(plan)))
  .digest("hex");
const token = `GO #741 TSDR ${plan.operationId} ${plan.stage} ${sha}`;

function request(authority = token, secret = internalSecret) {
  return new Request("http://knowledge.internal/api/internal/uspto-tsdr/acceptance", {
    method: "POST",
    headers: {
      [USPTO_TSDR_ACCEPTANCE_INTERNAL_AUTHORIZATION_HEADER]: secret,
      [USPTO_TSDR_ACCEPTANCE_AUTHORITY_HEADER]: authority,
    },
  });
}

describe("USPTO TSDR acceptance machine authority", () => {
  it("admits exact service secret + GO + frozen plan and derives API client actor", () => {
    const result = authenticateUsptoTsdrAcceptanceRequest(
      request(),
      { workspaceId: plan.workspaceId, frozenPlan: plan, planSha256: sha },
      internalSecret,
    );
    expect(result.planSha256).toBe(sha);
    expect(result.actorId).toMatch(/^tsdr-acceptance:[a-f0-9]{32}$/);
  });

  it("rejects a GO token for a different plan", () => {
    expect(() =>
      authenticateUsptoTsdrAcceptanceRequest(
        request(token.replace(sha, "0".repeat(64))),
        { workspaceId: plan.workspaceId, frozenPlan: plan, planSha256: sha },
        internalSecret,
      ),
    ).toThrow(/authority does not match/);
  });

  it("rejects workspace replay even when service secret and GO are valid", () => {
    expect(() =>
      authenticateUsptoTsdrAcceptanceRequest(
        request(),
        {
          workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FB0",
          frozenPlan: plan,
          planSha256: sha,
        },
        internalSecret,
      ),
    ).toThrow(/workspace does not match/);
  });

  it("rejects frozen-plan hash drift", () => {
    expect(() =>
      authenticateUsptoTsdrAcceptanceRequest(
        request(),
        { workspaceId: plan.workspaceId, frozenPlan: plan, planSha256: "0".repeat(64) },
        internalSecret,
      ),
    ).toThrow(/authority is invalid/);
  });

  it("rejects missing machine authority mode", () => {
    const { authorityMode: _authorityMode, ...legacyPlan } = plan;
    expect(() =>
      authenticateUsptoTsdrAcceptanceRequest(
        request(),
        { workspaceId: plan.workspaceId, frozenPlan: legacyPlan, planSha256: sha },
        internalSecret,
      ),
    ).toThrow(/authority is invalid/);
  });
});
