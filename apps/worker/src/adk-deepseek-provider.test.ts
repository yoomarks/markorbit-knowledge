import { describe, expect, it } from "vitest";
import { DeepSeekKnowledgeAdapter } from "@markorbit/worker-runtime/ai-distilled-knowledge-acquirer";
import { ManagedAiCapabilityHttpDeepSeekKnowledgeAdapter } from "@markorbit/worker-runtime/managed-ai-capability-http-adapter";
import { ManagedAiHttpDeepSeekKnowledgeAdapter } from "@markorbit/worker-runtime/managed-ai-knowledge-http-adapter";
import {
  ADK_CAPABILITY_MEMBERSHIP_ID_ENV,
  ADK_CAPABILITY_PRINCIPAL_ID_ENV,
  ADK_CAPABILITY_WORKSPACE_ID_ENV,
  ADK_MANAGED_AI_ENABLED_ENV,
  ADK_MANAGED_AI_ROUTE_ENV,
  CAPABILITY_ENGINE_URL_ENV,
  INTERNAL_SERVICE_SECRET_ENV,
  createAdkDeepSeekKnowledgeAdapter,
} from "./adk-deepseek-provider";

const secret = "knowledge-core-internal-secret-1234567890";
const capabilityContext = {
  [ADK_CAPABILITY_WORKSPACE_ID_ENV]: "workspace_knowledge",
  [ADK_CAPABILITY_PRINCIPAL_ID_ENV]: "principal_knowledge_worker",
  [ADK_CAPABILITY_MEMBERSHIP_ID_ENV]: "membership_knowledge_worker",
};

describe("createAdkDeepSeekKnowledgeAdapter", () => {
  it("keeps the legacy direct provider SDK as the default when Managed AI is disabled", () => {
    const adapter = createAdkDeepSeekKnowledgeAdapter({
      DEEPSEEK_API_KEY: "legacy-runtime-secret",
    });
    expect(adapter).toBeInstanceOf(DeepSeekKnowledgeAdapter);
  });

  it("does not enable Managed AI merely because Core configuration exists", () => {
    const adapter = createAdkDeepSeekKnowledgeAdapter({
      DEEPSEEK_API_KEY: "legacy-runtime-secret",
      [CAPABILITY_ENGINE_URL_ENV]: "http://127.0.0.1:4105",
      [INTERNAL_SERVICE_SECRET_ENV]: secret,
      ...capabilityContext,
    });
    expect(adapter).toBeInstanceOf(DeepSeekKnowledgeAdapter);
  });

  it("routes the managed workload through Capability Runtime V2 by default", () => {
    const adapter = createAdkDeepSeekKnowledgeAdapter({
      [ADK_MANAGED_AI_ENABLED_ENV]: "1",
      [CAPABILITY_ENGINE_URL_ENV]: "http://127.0.0.1:4105",
      [INTERNAL_SERVICE_SECRET_ENV]: secret,
      ...capabilityContext,
    });
    expect(adapter).toBeInstanceOf(ManagedAiCapabilityHttpDeepSeekKnowledgeAdapter);
  });

  it("preserves the direct Managed AI V1 path as an explicit rollback", () => {
    const adapter = createAdkDeepSeekKnowledgeAdapter({
      [ADK_MANAGED_AI_ENABLED_ENV]: "1",
      [ADK_MANAGED_AI_ROUTE_ENV]: "DIRECT_V1",
      [CAPABILITY_ENGINE_URL_ENV]: "http://127.0.0.1:4105",
      [INTERNAL_SERVICE_SECRET_ENV]: secret,
    });
    expect(adapter).toBeInstanceOf(ManagedAiHttpDeepSeekKnowledgeAdapter);
  });

  it("fails startup closed when Capability V2 lacks trusted Workspace Principal context", () => {
    const common = {
      [ADK_MANAGED_AI_ENABLED_ENV]: "1",
      [CAPABILITY_ENGINE_URL_ENV]: "http://127.0.0.1:4105",
      [INTERNAL_SERVICE_SECRET_ENV]: secret,
    };
    expect(() => createAdkDeepSeekKnowledgeAdapter(common)).toThrow(
      `Missing required environment variable ${ADK_CAPABILITY_WORKSPACE_ID_ENV}`,
    );
    expect(() =>
      createAdkDeepSeekKnowledgeAdapter({
        ...common,
        [ADK_CAPABILITY_WORKSPACE_ID_ENV]: "workspace_knowledge",
      }),
    ).toThrow(`Missing required environment variable ${ADK_CAPABILITY_PRINCIPAL_ID_ENV}`);
    expect(() =>
      createAdkDeepSeekKnowledgeAdapter({
        ...common,
        [ADK_CAPABILITY_WORKSPACE_ID_ENV]: "workspace_knowledge",
        [ADK_CAPABILITY_PRINCIPAL_ID_ENV]: "principal_knowledge_worker",
      }),
    ).toThrow(`Missing required environment variable ${ADK_CAPABILITY_MEMBERSHIP_ID_ENV}`);
  });

  it("rejects ambiguous enablement/route values and weak internal secrets", () => {
    expect(() =>
      createAdkDeepSeekKnowledgeAdapter({ [ADK_MANAGED_AI_ENABLED_ENV]: "true" }),
    ).toThrow(`${ADK_MANAGED_AI_ENABLED_ENV} must be 0, 1, or unset`);

    expect(() =>
      createAdkDeepSeekKnowledgeAdapter({
        [ADK_MANAGED_AI_ENABLED_ENV]: "1",
        [ADK_MANAGED_AI_ROUTE_ENV]: "provider",
        [CAPABILITY_ENGINE_URL_ENV]: "http://127.0.0.1:4105",
        [INTERNAL_SERVICE_SECRET_ENV]: secret,
      }),
    ).toThrow(`${ADK_MANAGED_AI_ROUTE_ENV} must be CAPABILITY_V2, DIRECT_V1, or unset`);

    expect(() =>
      createAdkDeepSeekKnowledgeAdapter({
        [ADK_MANAGED_AI_ENABLED_ENV]: "1",
        [CAPABILITY_ENGINE_URL_ENV]: "http://127.0.0.1:4105",
        [INTERNAL_SERVICE_SECRET_ENV]: "too-short",
        ...capabilityContext,
      }),
    ).toThrow(`${INTERNAL_SERVICE_SECRET_ENV} must contain at least 32 bytes`);
  });
});
