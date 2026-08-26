import { describe, expect, it } from "vitest";
import { DeepSeekKnowledgeAdapter } from "@markorbit/worker-runtime/ai-distilled-knowledge-acquirer";
import { ManagedAiHttpDeepSeekKnowledgeAdapter } from "@markorbit/worker-runtime/managed-ai-knowledge-http-adapter";
import { ManagedAiCapabilityHttpDeepSeekKnowledgeAdapter } from "@markorbit/worker-runtime/managed-ai-capability-http-adapter";
import { encodeCapabilityRuntimeWorkspacePrincipal } from "@markorbit/worker-runtime/capability-runtime-v2-http-client";
import {
  ADK_CAPABILITY_PRINCIPAL_ENV,
  ADK_CAPABILITY_V2_ENABLED_ENV,
  ADK_MANAGED_AI_ENABLED_ENV,
  CAPABILITY_ENGINE_URL_ENV,
  INTERNAL_SERVICE_SECRET_ENV,
  createAdkDeepSeekKnowledgeAdapter,
} from "./adk-deepseek-provider";

const secret = "knowledge-core-internal-secret-1234567890";
const principal = encodeCapabilityRuntimeWorkspacePrincipal({
  kind: "WORKSPACE",
  sessionId: "session_adk_capability_v2",
  userId: "user_adk_capability_v2",
  workspaceId: "workspace_adk_capability_v2",
  membershipId: "membership_adk_capability_v2",
  role: "WORKSPACE_ADMIN",
  permissions: ["workspace:read"],
  sessionExpiresAt: "2030-01-01T00:00:00.000Z",
});

describe("createAdkDeepSeekKnowledgeAdapter", () => {
  it("keeps the legacy direct DeepSeek adapter as the default", () => {
    const adapter = createAdkDeepSeekKnowledgeAdapter({
      DEEPSEEK_API_KEY: "legacy-runtime-secret",
    });

    expect(adapter).toBeInstanceOf(DeepSeekKnowledgeAdapter);
  });

  it("does not enable Managed AI merely because Core configuration or provider credentials exist", () => {
    const adapter = createAdkDeepSeekKnowledgeAdapter({
      DEEPSEEK_API_KEY: "legacy-runtime-secret",
      [CAPABILITY_ENGINE_URL_ENV]: "http://127.0.0.1:4105",
      [INTERNAL_SERVICE_SECRET_ENV]: secret,
    });

    expect(adapter).toBeInstanceOf(DeepSeekKnowledgeAdapter);
  });

  it("selects the direct Managed AI bridge behind the existing runtime gate", () => {
    const adapter = createAdkDeepSeekKnowledgeAdapter({
      [ADK_MANAGED_AI_ENABLED_ENV]: "1",
      [CAPABILITY_ENGINE_URL_ENV]: "http://127.0.0.1:4105",
      [INTERNAL_SERVICE_SECRET_ENV]: secret,
    });

    expect(adapter).toBeInstanceOf(ManagedAiHttpDeepSeekKnowledgeAdapter);
  });

  it("selects governed Capability V2 only behind the nested strangler gate and trusted principal", () => {
    const adapter = createAdkDeepSeekKnowledgeAdapter({
      [ADK_MANAGED_AI_ENABLED_ENV]: "1",
      [ADK_CAPABILITY_V2_ENABLED_ENV]: "1",
      [ADK_CAPABILITY_PRINCIPAL_ENV]: principal,
      [CAPABILITY_ENGINE_URL_ENV]: "http://127.0.0.1:4105",
      [INTERNAL_SERVICE_SECRET_ENV]: secret,
    });

    expect(adapter).toBeInstanceOf(ManagedAiCapabilityHttpDeepSeekKnowledgeAdapter);
  });

  it("fails startup closed when Managed AI is enabled without its Core endpoint or internal secret", () => {
    expect(() =>
      createAdkDeepSeekKnowledgeAdapter({
        [ADK_MANAGED_AI_ENABLED_ENV]: "1",
        [INTERNAL_SERVICE_SECRET_ENV]: secret,
      }),
    ).toThrow(`Missing required environment variable ${CAPABILITY_ENGINE_URL_ENV}`);

    expect(() =>
      createAdkDeepSeekKnowledgeAdapter({
        [ADK_MANAGED_AI_ENABLED_ENV]: "1",
        [CAPABILITY_ENGINE_URL_ENV]: "http://127.0.0.1:4105",
      }),
    ).toThrow(`Missing required environment variable ${INTERNAL_SERVICE_SECRET_ENV}`);
  });

  it("fails startup closed when Capability V2 lacks Managed AI or a trusted Workspace Principal", () => {
    expect(() =>
      createAdkDeepSeekKnowledgeAdapter({
        [ADK_CAPABILITY_V2_ENABLED_ENV]: "1",
      }),
    ).toThrow(`${ADK_CAPABILITY_V2_ENABLED_ENV}=1 requires ${ADK_MANAGED_AI_ENABLED_ENV}=1`);

    expect(() =>
      createAdkDeepSeekKnowledgeAdapter({
        [ADK_MANAGED_AI_ENABLED_ENV]: "1",
        [ADK_CAPABILITY_V2_ENABLED_ENV]: "1",
        [CAPABILITY_ENGINE_URL_ENV]: "http://127.0.0.1:4105",
        [INTERNAL_SERVICE_SECRET_ENV]: secret,
      }),
    ).toThrow(`Missing required environment variable ${ADK_CAPABILITY_PRINCIPAL_ENV}`);
  });

  it("rejects ambiguous enablement values and weak internal secrets", () => {
    expect(() =>
      createAdkDeepSeekKnowledgeAdapter({
        [ADK_MANAGED_AI_ENABLED_ENV]: "true",
      }),
    ).toThrow(`${ADK_MANAGED_AI_ENABLED_ENV} must be 0, 1, or unset`);

    expect(() =>
      createAdkDeepSeekKnowledgeAdapter({
        [ADK_CAPABILITY_V2_ENABLED_ENV]: "true",
      }),
    ).toThrow(`${ADK_CAPABILITY_V2_ENABLED_ENV} must be 0, 1, or unset`);

    expect(() =>
      createAdkDeepSeekKnowledgeAdapter({
        [ADK_MANAGED_AI_ENABLED_ENV]: "1",
        [CAPABILITY_ENGINE_URL_ENV]: "http://127.0.0.1:4105",
        [INTERNAL_SERVICE_SECRET_ENV]: "too-short",
      }),
    ).toThrow(`${INTERNAL_SERVICE_SECRET_ENV} must contain at least 32 bytes`);
  });
});
