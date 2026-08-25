import { describe, expect, it } from "vitest";
import { DeepSeekKnowledgeAdapter } from "@markorbit/worker-runtime/ai-distilled-knowledge-acquirer";
import { ManagedAiHttpDeepSeekKnowledgeAdapter } from "@markorbit/worker-runtime/managed-ai-knowledge-http-adapter";
import {
  ADK_MANAGED_AI_ENABLED_ENV,
  CAPABILITY_ENGINE_URL_ENV,
  INTERNAL_SERVICE_SECRET_ENV,
  createAdkDeepSeekKnowledgeAdapter,
} from "./adk-deepseek-provider";

const secret = "knowledge-core-internal-secret-1234567890";

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

  it("selects the Managed AI bridge only behind the explicit Knowledge runtime gate", () => {
    const adapter = createAdkDeepSeekKnowledgeAdapter({
      [ADK_MANAGED_AI_ENABLED_ENV]: "1",
      [CAPABILITY_ENGINE_URL_ENV]: "http://127.0.0.1:4105",
      [INTERNAL_SERVICE_SECRET_ENV]: secret,
    });

    expect(adapter).toBeInstanceOf(ManagedAiHttpDeepSeekKnowledgeAdapter);
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

  it("rejects ambiguous enablement values and weak internal secrets", () => {
    expect(() =>
      createAdkDeepSeekKnowledgeAdapter({
        [ADK_MANAGED_AI_ENABLED_ENV]: "true",
      }),
    ).toThrow(`${ADK_MANAGED_AI_ENABLED_ENV} must be 0, 1, or unset`);

    expect(() =>
      createAdkDeepSeekKnowledgeAdapter({
        [ADK_MANAGED_AI_ENABLED_ENV]: "1",
        [CAPABILITY_ENGINE_URL_ENV]: "http://127.0.0.1:4105",
        [INTERNAL_SERVICE_SECRET_ENV]: "too-short",
      }),
    ).toThrow(`${INTERNAL_SERVICE_SECRET_ENV} must contain at least 32 bytes`);
  });
});
