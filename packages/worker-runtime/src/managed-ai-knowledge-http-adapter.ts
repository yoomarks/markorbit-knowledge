import { createHash } from "node:crypto";
import {
  AiKnowledgeAcquisitionError,
  type AiKnowledgeAcquisition,
  type AiKnowledgeProviderAdapter,
  type AiKnowledgeProviderRequest,
} from "./ai-distilled-knowledge-acquirer";
import { ManagedAiDeepSeekKnowledgeAdapter } from "./managed-ai-knowledge-adapter";
import {
  ManagedAiExecutionHttpClient,
  type ManagedAiHttpTransport,
} from "./managed-ai-execution-http-client";

export type ManagedAiKnowledgeHttpAdapterOptions = {
  baseUrl: string;
  internalServiceSecret: string;
  transport?: ManagedAiHttpTransport;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
};

export type ManagedAiKnowledgeHttpExecutionContext = {
  idempotencyKey: string;
  correlationId: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function managedAiKnowledgeHttpExecutionContext(
  request: Readonly<AiKnowledgeProviderRequest>,
): ManagedAiKnowledgeHttpExecutionContext {
  const executionKey = request.executionKey?.trim();
  if (!executionKey || executionKey.length > 512) {
    throw new AiKnowledgeAcquisitionError(
      "AI_MANAGED_AI_EXECUTION_IDENTITY_REQUIRED",
      "Managed AI HTTP acquisition requires a durable executionKey containing 1 to 512 characters",
      false,
    );
  }
  const identity = sha256(
    ["markorbit-knowledge-managed-ai-http-v1", executionKey].join("\u001f"),
  );
  return {
    idempotencyKey: `knowledge-adk:${identity}`,
    correlationId: `knowledge-adk:${identity.slice(0, 32)}`,
  };
}

export class ManagedAiHttpDeepSeekKnowledgeAdapter implements AiKnowledgeProviderAdapter {
  readonly provider = "DEEPSEEK" as const;

  constructor(private readonly options: ManagedAiKnowledgeHttpAdapterOptions) {}

  async acquire(request: AiKnowledgeProviderRequest): Promise<AiKnowledgeAcquisition> {
    const context = managedAiKnowledgeHttpExecutionContext(request);
    const client = new ManagedAiExecutionHttpClient({
      baseUrl: this.options.baseUrl,
      internalServiceSecret: this.options.internalServiceSecret,
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
