import { createHash } from "node:crypto";
import type {
  AiKnowledgeAcquisition,
  AiKnowledgeProviderAdapter,
  AiKnowledgeProviderRequest,
} from "./ai-distilled-knowledge-acquirer";
import {
  ManagedAiDeepSeekKnowledgeAdapter,
  type ManagedAiKnowledgeExecutionInputV1,
} from "./managed-ai-knowledge-adapter";
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
  const assignment = request.assignment;
  const promptSha256 = sha256(assignment.prompt);
  const executionSeed = [
    assignment.assignmentId,
    assignment.instructionSetId,
    String(assignment.instructionSetRevision),
    promptSha256,
  ].join("\n");
  return {
    idempotencyKey: `knowledge-adk:${sha256(executionSeed)}`,
    correlationId: `knowledge-adk:${sha256(assignment.assignmentId).slice(0, 32)}`,
  };
}

class BoundManagedAiExecutionClient extends ManagedAiExecutionHttpClient {
  async execute(
    input: Readonly<ManagedAiKnowledgeExecutionInputV1>,
  ) {
    return super.execute(input);
  }
}

export class ManagedAiHttpDeepSeekKnowledgeAdapter implements AiKnowledgeProviderAdapter {
  readonly provider = "DEEPSEEK" as const;

  constructor(private readonly options: ManagedAiKnowledgeHttpAdapterOptions) {}

  async acquire(request: AiKnowledgeProviderRequest): Promise<AiKnowledgeAcquisition> {
    const context = managedAiKnowledgeHttpExecutionContext(request);
    const client = new BoundManagedAiExecutionClient({
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
