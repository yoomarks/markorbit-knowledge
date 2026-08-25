import {
  DeepSeekKnowledgeAdapter,
  type AiKnowledgeProviderAdapter,
} from "@markorbit/worker-runtime/ai-distilled-knowledge-acquirer";
import {
  ManagedAiHttpDeepSeekKnowledgeAdapter,
  type ManagedAiKnowledgeHttpAdapterOptions,
} from "@markorbit/worker-runtime/managed-ai-knowledge-http-adapter";

export const ADK_MANAGED_AI_ENABLED_ENV = "MARKORBIT_ADK_MANAGED_AI_ENABLED" as const;
export const CAPABILITY_ENGINE_URL_ENV = "MARKORBIT_CAPABILITY_ENGINE_URL" as const;
export const INTERNAL_SERVICE_SECRET_ENV = "MO_INTERNAL_SERVICE_SECRET" as const;

export type AdkDeepSeekProviderOptions = Pick<ManagedAiKnowledgeHttpAdapterOptions, "transport">;

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function assertManagedCoreUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${CAPABILITY_ENGINE_URL_ENV} must be a valid URL`);
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password) {
    throw new Error(
      `${CAPABILITY_ENGINE_URL_ENV} must use http/https and must not contain credentials`,
    );
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`${CAPABILITY_ENGINE_URL_ENV} must not contain query or fragment components`);
  }
  return parsed.toString();
}

export function createAdkDeepSeekKnowledgeAdapter(
  environment: NodeJS.ProcessEnv = process.env,
  options: AdkDeepSeekProviderOptions = {},
): AiKnowledgeProviderAdapter {
  const managedFlag = environment[ADK_MANAGED_AI_ENABLED_ENV]?.trim();
  if (!managedFlag || managedFlag === "0") {
    return new DeepSeekKnowledgeAdapter({ environment });
  }
  if (managedFlag !== "1") {
    throw new Error(`${ADK_MANAGED_AI_ENABLED_ENV} must be 0, 1, or unset`);
  }

  const baseUrl = assertManagedCoreUrl(required(environment, CAPABILITY_ENGINE_URL_ENV));
  const internalServiceSecret = required(environment, INTERNAL_SERVICE_SECRET_ENV);
  if (Buffer.byteLength(internalServiceSecret) < 32) {
    throw new Error(`${INTERNAL_SERVICE_SECRET_ENV} must contain at least 32 bytes`);
  }

  return new ManagedAiHttpDeepSeekKnowledgeAdapter({
    baseUrl,
    internalServiceSecret,
    ...(options.transport ? { transport: options.transport } : {}),
  });
}
