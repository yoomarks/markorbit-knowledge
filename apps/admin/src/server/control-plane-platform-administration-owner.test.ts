import { describe, expect, it } from "vitest";
import { getKnowledgePlatformAdministrationOwnerView } from "./control-plane-platform-administration-owner";

const OBSERVED_AT = new Date("2026-09-08T10:00:00.000Z");

describe("getKnowledgePlatformAdministrationOwnerView", () => {
  it("returns a bounded owner limitation instead of synthesized global state", () => {
    const result = getKnowledgePlatformAdministrationOwnerView(OBSERVED_AT);
    expect(result).toEqual({
      schemaVersion: 1,
      objectType: "KNOWLEDGE_PLATFORM_ADMINISTRATION_OWNER_RESULT",
      owner: "KNOWLEDGE",
      access: "READ_ONLY",
      requiredUpstreamAuthority: "control-plane:knowledge:read",
      observedAt: OBSERVED_AT.toISOString(),
      portfolio: {
        availability: "NOT_YET_MODELED",
        reason:
          "Knowledge currently models Evidence Supply Health canonically at Workspace scope; no canonical durable platform-wide administration portfolio is available.",
      },
    });
  });

  it("does not expose Workspace, Admin, mutation or synthetic health fields", () => {
    const result = getKnowledgePlatformAdministrationOwnerView(OBSERVED_AT);
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "workspaceId",
      "adminSession",
      "secret",
      "health",
      "recommendation",
      "legalConclusion",
      "mutationGuidance",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
