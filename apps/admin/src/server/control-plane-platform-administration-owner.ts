import { CONTROL_PLANE_KNOWLEDGE_READ_AUTHORITY } from "@markorbit/contracts";

export type KnowledgePlatformAdministrationOwnerResultV1 = {
  schemaVersion: 1;
  objectType: "KNOWLEDGE_PLATFORM_ADMINISTRATION_OWNER_RESULT";
  owner: "KNOWLEDGE";
  access: "READ_ONLY";
  requiredUpstreamAuthority: typeof CONTROL_PLANE_KNOWLEDGE_READ_AUTHORITY;
  observedAt: string;
  portfolio: {
    availability: "NOT_YET_MODELED";
    reason: string;
  };
};

const NOT_YET_MODELED_REASON =
  "Knowledge currently models Evidence Supply Health canonically at Workspace scope; no canonical durable platform-wide administration portfolio is available.";

export function getKnowledgePlatformAdministrationOwnerView(
  observedAt = new Date(),
): KnowledgePlatformAdministrationOwnerResultV1 {
  return {
    schemaVersion: 1,
    objectType: "KNOWLEDGE_PLATFORM_ADMINISTRATION_OWNER_RESULT",
    owner: "KNOWLEDGE",
    access: "READ_ONLY",
    requiredUpstreamAuthority: CONTROL_PLANE_KNOWLEDGE_READ_AUTHORITY,
    observedAt: observedAt.toISOString(),
    portfolio: {
      availability: "NOT_YET_MODELED",
      reason: NOT_YET_MODELED_REASON,
    },
  };
}
