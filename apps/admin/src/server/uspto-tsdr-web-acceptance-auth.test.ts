import { describe, expect, it } from "vitest";
import {
  USPTO_TSDR_WEB_ACCEPTANCE_AUTHORITY_HEADER,
  USPTO_TSDR_WEB_ACCEPTANCE_INTERNAL_AUTHORIZATION_HEADER,
  authenticateUsptoTsdrWebAcceptanceRequest,
} from "./uspto-tsdr-web-acceptance-auth";
import { createHash } from "node:crypto";

const plan = {
  version: 1,
  operationId: "web-proof-90817045-status",
  workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  authorityMode: "INTERNAL_SERVICE_GO_V1",
  executionMode: "APPLY_DISPATCH_ONCE",
  workerMode: "PROVISION_ONE_SHOT",
  channel: "WEB",
  stage: "STATUS",
  serialNumber: "90817045",
};

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
const go = `GO #842 TSDR-WEB web-proof-90817045-status STATUS ${sha}`;

function request(token = go, internal = "service-secret") {
  return new Request("https://control.example.test/api/internal/uspto-tsdr-web/acceptance", {
    method: "POST",
    headers: {
      [USPTO_TSDR_WEB_ACCEPTANCE_INTERNAL_AUTHORIZATION_HEADER]: internal,
      [USPTO_TSDR_WEB_ACCEPTANCE_AUTHORITY_HEADER]: token,
    },
  });
}

describe("TSDR Web acceptance machine authority", () => {
  it("accepts only exact service secret + frozen GO authority", () => {
    expect(
      authenticateUsptoTsdrWebAcceptanceRequest(
        request(),
        { workspaceId: plan.workspaceId, frozenPlan: plan, planSha256: sha },
        "service-secret",
      ),
    ).toMatchObject({ planSha256: sha });
  });

  it("rejects wrong GO, workspace, or service secret", () => {
    expect(() =>
      authenticateUsptoTsdrWebAcceptanceRequest(
        request("wrong"),
        { workspaceId: plan.workspaceId, frozenPlan: plan, planSha256: sha },
        "service-secret",
      ),
    ).toThrow();
    expect(() =>
      authenticateUsptoTsdrWebAcceptanceRequest(
        request(),
        { workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAA", frozenPlan: plan, planSha256: sha },
        "service-secret",
      ),
    ).toThrow();
    expect(() =>
      authenticateUsptoTsdrWebAcceptanceRequest(
        request(go, "wrong"),
        { workspaceId: plan.workspaceId, frozenPlan: plan, planSha256: sha },
        "service-secret",
      ),
    ).toThrow();
  });

  it("rejects added secretRef or altered frozen plan without a new SHA/GO", () => {
    expect(() =>
      authenticateUsptoTsdrWebAcceptanceRequest(
        request(),
        {
          workspaceId: plan.workspaceId,
          frozenPlan: { ...plan, secretRef: "sec_01ARZ3NDEKTSV4RRFFQ69G5FAV" },
          planSha256: sha,
        },
        "service-secret",
      ),
    ).toThrow();
  });
});
