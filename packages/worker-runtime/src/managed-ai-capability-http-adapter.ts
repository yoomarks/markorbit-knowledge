import { createHash } from "node:crypto";
import {
  AiKnowledgeAcquisitionError,
  type AiKnowledgeAcquisition,
  type AiKnowledgeProviderAdapter,
  type AiKnowledgeProviderRequest,
} from "./ai-distilled-knowledge-acquirer";
import {
  CapabilityRuntimeManagedAiHttpClient,
  type CapabilityRuntimeWorkspacePrincipal,
} from "./capability-runtime-managed-ai-http-client";
import type { ManagedAiHttpTransport } from "./managed-ai-execution-http-client";
import { ManagedAiDeepSeekKnowledgeAdapter } from "./managed-ai-knowledge-adapter";

export type ManagedAiCapabilityHttpAdapterOptions = {
  baseUrl: string;
  internalServiceSecret: string;
  principal: Readonly<CapabilityRuntimeWorkspacePrincipal>;
  transport?: ManagedAiHttpTransport;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
};

export type ManagedAiCapabilityHttpExecutionContext = {
  idempotencyKey: string;
  correlationId: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function managedAiCapabilityHttpExecutionContext(
  request: Readonly<AiKnowledgeProviderRequest>,
): ManagedAiCapabilityHttpExecutionContext {
  const executionKey = request.executionKey?.trim();
  if (!executionKey || executionKey.length > 512) {
    throw new AiKnowledgeAcquisitionError(
      "AI_MANAGED_AI_EXECUTION_IDENTITY_REQUIRED",
      "Managed AI Capability HTTP acquisition requires a durable executionKey containing 1 to 512 characters",
      false,
    );
  }
  // Only the durable Knowledge execution identity crosses this adapter; provider/profile selection stays in Core.
  const identity = sha256(["markorbit-knowledge-capability-v2", executionKey].join("\u001f"));
  return {
    idempotencyKey: `knowledge-capability:${identity}`,
    correlationId: `knowledge-capability:${identity.slice(0, 32)}`,
  };
}

export class ManagedAiCapabilityHttpDeepSeekKnowledgeAdapter implements AiKnowledgeProviderAdapter {
  readonly provider = "DEEPSEEK" as const;

  constructor(private readonly options: ManagedAiCapabilityHttpAdapterOptions) {}

  async acquire(request: AiKnowledgeProviderRequest): Promise<AiKnowledgeAcquisition> {
    const context = managedAiCapabilityHttpExecutionContext(request);
    const client = new CapabilityRuntimeManagedAiHttpClient({
      baseUrl: this.options.baseUrl,
      internalServiceSecret: this.options.internalServiceSecret,
      principal: this.options.principal,
      idempotencyKey: context.idempotencyKey,
      correlationId: context.correlationId,
      ...(this.options.transport ? { transport: this.options.transport } : {}),
      ...(this.options.requestTimeoutMs === undefined
        ? {}
        : { requestTimeoutMs: this.options.requestTimeoutMs }),
      ...(this.options.maxResponseBytes === undefined
        ? {}
        : { maxResponseBytes: this.options.maxResponseBytes }),
    });
    return new ManagedAiDeepSeekKnowledgeAdapter(client).acquire(request);
  }
}
