import type {
  AiKnowledgeAcquisition,
  AiKnowledgeProviderAdapter,
  AiKnowledgeProviderRequest,
} from "./ai-distilled-knowledge-acquirer";
import { AiKnowledgeAcquisitionError } from "./ai-distilled-knowledge-acquirer";
import {
  ManagedAiDeepSeekKnowledgeAdapter,
  type ManagedAiExecutionClient,
  type ManagedAiKnowledgeExecutionInputV1,
  type ManagedAiKnowledgeExecutionOutcomeV1,
} from "./managed-ai-knowledge-adapter";
import { managedAiKnowledgeHttpExecutionContext } from "./managed-ai-knowledge-http-adapter";
import {
  fetchManagedAiHttpTransport,
  ManagedAiHttpTransportError,
  type ManagedAiHttpTransport,
} from "./managed-ai-execution-http-client";
import {
  CapabilityRuntimeV2ManagedAiExecutionClient,
  type CapabilityRuntimeV2ManagedAiHttpClientOptions,
} from "./capability-runtime-v2-http-client";

export const MANAGED_AI_EXACT_OUTPUT_RESOLUTION_ROUTE =
  "/internal/v1/managed-ai-exact-output-resolutions" as const;

const DEFAULT_REQUEST_TIMEOUT_MS = 315_000;
const DEFAULT_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

export type ManagedAiCapabilityHttpAdapterOptions = Pick<
  CapabilityRuntimeV2ManagedAiHttpClientOptions,
  | "baseUrl"
  | "internalServiceSecret"
  | "workspacePrincipal"
  | "transport"
  | "requestTimeoutMs"
  | "maxResponseBytes"
  | "now"
>;

type DurableExactOutput = Extract<
  NonNullable<ManagedAiKnowledgeExecutionOutcomeV1["exactOutput"]>,
  { kind: "DURABLE_REF" }
>;

type InlineExactOutput = Extract<
  NonNullable<ManagedAiKnowledgeExecutionOutcomeV1["exactOutput"]>,
  { kind: "INLINE_BASE64" }
>;

function resolutionEndpoint(baseUrl: string): string {
  return new URL(MANAGED_AI_EXACT_OUTPUT_RESOLUTION_ROUTE, baseUrl).toString();
}

function parseResolution(raw: Uint8Array): InlineExactOutput {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(raw)) as unknown;
  } catch {
    throw new AiKnowledgeAcquisitionError(
      "AI_MANAGED_AI_DURABLE_OUTPUT_RESOLUTION_INVALID",
      "Core exact-output resolution did not contain valid JSON",
      false,
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AiKnowledgeAcquisitionError(
      "AI_MANAGED_AI_DURABLE_OUTPUT_RESOLUTION_INVALID",
      "Core exact-output resolution must be an object",
      false,
    );
  }
  const record = value as Record<string, unknown>;
  if (
    record.kind !== "INLINE_BASE64" ||
    typeof record.mediaType !== "string" ||
    typeof record.sha256 !== "string" ||
    typeof record.sizeBytes !== "number" ||
    typeof record.dataBase64 !== "string"
  ) {
    throw new AiKnowledgeAcquisitionError(
      "AI_MANAGED_AI_DURABLE_OUTPUT_RESOLUTION_INVALID",
      "Core exact-output resolution did not return the frozen inline output contract",
      false,
    );
  }
  return record as InlineExactOutput;
}

function assertResolutionMatchesReference(
  reference: DurableExactOutput,
  resolved: InlineExactOutput,
): void {
  if (
    resolved.mediaType !== reference.mediaType ||
    resolved.sha256 !== reference.sha256 ||
    resolved.sizeBytes !== reference.sizeBytes
  ) {
    throw new AiKnowledgeAcquisitionError(
      "AI_MANAGED_AI_DURABLE_OUTPUT_RESOLUTION_MISMATCH",
      "Core exact-output resolution metadata does not match the governed durable reference",
      false,
    );
  }
}

class ResolvingCapabilityManagedAiExecutionClient implements ManagedAiExecutionClient {
  private readonly transport: ManagedAiHttpTransport;

  constructor(
    private readonly delegate: ManagedAiExecutionClient,
    private readonly options: ManagedAiCapabilityHttpAdapterOptions,
  ) {
    this.transport = options.transport ?? fetchManagedAiHttpTransport;
  }

  async execute(
    input: Readonly<ManagedAiKnowledgeExecutionInputV1>,
  ): Promise<ManagedAiKnowledgeExecutionOutcomeV1> {
    const outcome = await this.delegate.execute(input);
    const exactOutput = outcome.exactOutput;
    if (!exactOutput || exactOutput.kind !== "DURABLE_REF") return outcome;

    let response;
    try {
      response = await this.transport({
        url: resolutionEndpoint(this.options.baseUrl),
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-markorbit-internal-authorization": this.options.internalServiceSecret,
        },
        body: JSON.stringify({ ref: exactOutput.ref }),
        timeoutMs: this.options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
        maxResponseBytes: this.options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      });
    } catch (error) {
      if (error instanceof ManagedAiHttpTransportError) {
        throw new AiKnowledgeAcquisitionError(
          "AI_MANAGED_AI_DURABLE_OUTPUT_RESOLUTION_FAILED",
          `${error.code}: ${error.message}`,
          error.retryable,
        );
      }
      throw new AiKnowledgeAcquisitionError(
        "AI_MANAGED_AI_DURABLE_OUTPUT_RESOLUTION_FAILED",
        error instanceof Error ? error.message : "Core exact-output resolution transport failed",
        true,
      );
    }

    if (response.status < 200 || response.status >= 300) {
      throw new AiKnowledgeAcquisitionError(
        "AI_MANAGED_AI_DURABLE_OUTPUT_RESOLUTION_FAILED",
        `Core exact-output resolution returned HTTP ${response.status}`,
        response.status >= 500,
      );
    }
    const resolved = parseResolution(response.body);
    assertResolutionMatchesReference(exactOutput, resolved);
    return { ...structuredClone(outcome), exactOutput: structuredClone(resolved) };
  }
}

export class ManagedAiCapabilityHttpDeepSeekKnowledgeAdapter implements AiKnowledgeProviderAdapter {
  readonly provider = "DEEPSEEK" as const;

  constructor(private readonly options: ManagedAiCapabilityHttpAdapterOptions) {}

  async acquire(request: AiKnowledgeProviderRequest): Promise<AiKnowledgeAcquisition> {
    const context = managedAiKnowledgeHttpExecutionContext(request);
    const capabilityClient = new CapabilityRuntimeV2ManagedAiExecutionClient({
      baseUrl: this.options.baseUrl,
      internalServiceSecret: this.options.internalServiceSecret,
      workspacePrincipal: this.options.workspacePrincipal,
      idempotencyKey: context.idempotencyKey,
      correlationId: context.correlationId,
      ...(this.options.transport ? { transport: this.options.transport } : {}),
      ...(this.options.requestTimeoutMs === undefined
        ? {}
        : { requestTimeoutMs: this.options.requestTimeoutMs }),
      ...(this.options.maxResponseBytes === undefined
        ? {}
        : { maxResponseBytes: this.options.maxResponseBytes }),
      ...(this.options.now ? { now: this.options.now } : {}),
    });
    const client = new ResolvingCapabilityManagedAiExecutionClient(capabilityClient, this.options);
    return new ManagedAiDeepSeekKnowledgeAdapter(client).acquire(request);
  }
}
