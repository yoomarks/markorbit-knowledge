import { AiKnowledgeAcquisitionError } from "./ai-distilled-knowledge-acquirer";
import {
  ManagedAiHttpTransportError,
  fetchManagedAiHttpTransport,
  type ManagedAiHttpTransport,
  type ManagedAiHttpTransportResponse,
} from "./managed-ai-execution-http-client";
import type {
  ManagedAiExecutionClient,
  ManagedAiKnowledgeExecutionInputV1,
  ManagedAiKnowledgeExecutionOutcomeV1,
} from "./managed-ai-knowledge-adapter";

export const CAPABILITY_RUNTIME_V2_ROUTE = "/v1/capability-requests" as const;
export const MANAGED_AI_EXACT_OUTPUT_RESOLUTION_ROUTE =
  "/internal/v1/managed-ai-exact-output-resolutions" as const;
export const CAPABILITY_RUNTIME_CALLER_PRODUCT = "KNOWLEDGE" as const;
export const MANAGED_AI_CAPABILITY_INPUT_SCHEMA_ID = "managed-ai-input.v1" as const;
export const MANAGED_AI_CAPABILITY_OUTPUT_SCHEMA_ID = "managed-ai-output.v1" as const;

const MANAGED_AI_CAPABILITY_ID = "managed-ai-execution";
const MANAGED_AI_CAPABILITY_VERSION = "1.0.0";
const DEFAULT_REQUEST_TIMEOUT_MS = 315_000;
const DEFAULT_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_REQUEST_TIMEOUT_MS = 360_000;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const SERVICE_SESSION_EXPIRY = "9999-12-31T23:59:59.999Z";
const SHA256 = /^[a-f0-9]{64}$/u;

export type CapabilityRuntimeWorkspacePrincipal = {
  workspaceId: string;
  principalId: string;
  membershipId: string;
};

export type CapabilityRuntimeManagedAiHttpClientOptions = {
  baseUrl: string;
  internalServiceSecret: string;
  idempotencyKey: string;
  correlationId: string;
  principal: Readonly<CapabilityRuntimeWorkspacePrincipal>;
  transport?: ManagedAiHttpTransport;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
};

type GovernedErrorBody = {
  code: string;
  message: string;
  retryable: boolean;
};

type JsonRecord = Record<string, unknown>;

export class CapabilityRuntimeManagedAiHttpClientError extends AiKnowledgeAcquisitionError {
  constructor(code: string, message: string, retryable: boolean) {
    super(code, message, retryable);
    this.name = "CapabilityRuntimeManagedAiHttpClientError";
  }
}

function boundedInteger(value: number, field: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${field} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function nonEmpty(value: string, field: string, maxLength: number): string {
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maxLength) {
    throw new TypeError(`${field} must contain 1 to ${maxLength} characters`);
  }
  return cleaned;
}

function endpoints(baseUrl: string): { capability: string; exactOutputResolution: string } {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new TypeError("Capability Runtime baseUrl must be a valid URL");
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password
  ) {
    throw new TypeError(
      "Capability Runtime baseUrl must use http/https and must not contain credentials",
    );
  }
  if (parsed.search || parsed.hash) {
    throw new TypeError("Capability Runtime baseUrl must not contain query or fragment components");
  }
  return {
    capability: new URL(CAPABILITY_RUNTIME_V2_ROUTE, parsed).toString(),
    exactOutputResolution: new URL(MANAGED_AI_EXACT_OUTPUT_RESOLUTION_ROUTE, parsed).toString(),
  };
}

function record(value: unknown, field: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CapabilityRuntimeManagedAiHttpClientError(
      "AI_CAPABILITY_V2_OUTCOME_INVALID",
      `${field} must be an object`,
      false,
    );
  }
  return value as JsonRecord;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CapabilityRuntimeManagedAiHttpClientError(
      "AI_CAPABILITY_V2_OUTCOME_INVALID",
      `${field} must be a non-empty string`,
      false,
    );
  }
  return value;
}

function parseJsonBytes(raw: Uint8Array, context: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(raw)) as unknown;
  } catch {
    throw new CapabilityRuntimeManagedAiHttpClientError(
      "AI_CAPABILITY_V2_HTTP_INVALID_JSON",
      `${context} did not contain valid JSON`,
      false,
    );
  }
}

function parseErrorBody(value: unknown, status: number): GovernedErrorBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as JsonRecord;
  if (
    typeof body.code !== "string" ||
    !body.code.trim() ||
    typeof body.message !== "string" ||
    !body.message.trim()
  ) {
    return null;
  }
  return {
    code: body.code,
    message: body.message,
    retryable: typeof body.retryable === "boolean" ? body.retryable : status >= 500,
  };
}

function noAuthority(value: unknown, field: string): void {
  const authority = record(value, field);
  for (const [key, item] of Object.entries(authority)) {
    if (item !== false) {
      throw new CapabilityRuntimeManagedAiHttpClientError(
        "AI_CAPABILITY_V2_AUTHORITY_ESCALATION",
        `${field}.${key} must remain false`,
        false,
      );
    }
  }
}

function encodedWorkspacePrincipal(
  principal: Readonly<CapabilityRuntimeWorkspacePrincipal>,
): string {
  const workspaceId = nonEmpty(principal.workspaceId, "principal.workspaceId", 300);
  const principalId = nonEmpty(principal.principalId, "principal.principalId", 300);
  const membershipId = nonEmpty(principal.membershipId, "principal.membershipId", 300);
  return Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      principal: {
        kind: "WORKSPACE",
        sessionId: `knowledge-worker:${principalId}`,
        userId: principalId,
        workspaceId,
        membershipId,
        role: "REVIEWER",
        permissions: ["workspace:read"],
        sessionExpiresAt: SERVICE_SESSION_EXPIRY,
      },
    }),
    "utf8",
  ).toString("base64url");
}

function capabilityCommand(
  input: Readonly<ManagedAiKnowledgeExecutionInputV1>,
  principal: Readonly<CapabilityRuntimeWorkspacePrincipal>,
  idempotencyKey: string,
  correlationId: string,
): JsonRecord {
  return {
    schemaVersion: 2,
    capabilityId: MANAGED_AI_CAPABILITY_ID,
    capabilityVersion: MANAGED_AI_CAPABILITY_VERSION,
    caller: {
      workspaceId: principal.workspaceId,
      principalId: principal.principalId,
      callerProduct: CAPABILITY_RUNTIME_CALLER_PRODUCT,
      permissionContextRef: `core-workspace-membership:${principal.membershipId}`,
    },
    purpose: "Acquire one governed Knowledge ADK source result.",
    input,
    inputSchemaId: MANAGED_AI_CAPABILITY_INPUT_SCHEMA_ID,
    outputSchemaId: MANAGED_AI_CAPABILITY_OUTPUT_SCHEMA_ID,
    riskClass: "MODERATE",
    idempotencyKey,
    correlationId,
  };
}

function embeddedManagedAiOutcome(value: unknown): ManagedAiKnowledgeExecutionOutcomeV1 {
  const execution = record(value, "Capability execution");
  if (typeof execution.replayed !== "boolean") {
    throw new CapabilityRuntimeManagedAiHttpClientError(
      "AI_CAPABILITY_V2_OUTCOME_INVALID",
      "Capability execution.replayed must be boolean",
      false,
    );
  }

  const binding = record(execution.binding, "Capability execution.binding");
  const runtimeCapability = record(
    binding.runtimeCapability,
    "Capability execution.binding.runtimeCapability",
  );
  if (
    text(
      runtimeCapability.capabilityId,
      "Capability execution.binding.runtimeCapability.capabilityId",
    ) !== MANAGED_AI_CAPABILITY_ID ||
    text(
      runtimeCapability.capabilityVersion,
      "Capability execution.binding.runtimeCapability.capabilityVersion",
    ) !== MANAGED_AI_CAPABILITY_VERSION
  ) {
    throw new CapabilityRuntimeManagedAiHttpClientError(
      "AI_CAPABILITY_V2_BINDING_DRIFT",
      "Capability runtime binding drifted from the governed Managed AI capability",
      false,
    );
  }
  const implementation = record(
    binding.implementation,
    "Capability execution.binding.implementation",
  );
  if (
    text(implementation.kind, "Capability execution.binding.implementation.kind") !==
    "AI_ASSISTED_SERVICE"
  ) {
    throw new CapabilityRuntimeManagedAiHttpClientError(
      "AI_CAPABILITY_V2_BINDING_DRIFT",
      "Capability runtime selected a non-AI-assisted implementation",
      false,
    );
  }
  const implementationKey = text(
    implementation.implementationKey,
    "Capability execution.binding.implementation.implementationKey",
  );

  const outcome = record(execution.outcome, "Capability execution.outcome");
  noAuthority(outcome.authority, "Capability execution.outcome.authority");
  const returnValue = record(execution.returnValue, "Capability execution.returnValue");
  noAuthority(returnValue.authority, "Capability execution.returnValue.authority");
  const receipt = record(execution.receipt, "Capability execution.receipt");
  noAuthority(receipt.authority, "Capability execution.receipt.authority");

  const status = text(outcome.status, "Capability execution.outcome.status");
  if (status !== "SUCCEEDED" && status !== "REQUIRES_REVIEW" && status !== "FAILED") {
    throw new CapabilityRuntimeManagedAiHttpClientError(
      "AI_CAPABILITY_V2_OUTCOME_INVALID",
      `Unsupported Capability outcome status ${status}`,
      false,
    );
  }
  if (status === "FAILED" && outcome.output === undefined) {
    const error = record(outcome.error, "Capability execution.outcome.error");
    throw new CapabilityRuntimeManagedAiHttpClientError(
      `AI_CAPABILITY_V2_${text(error.code, "Capability execution.outcome.error.code")}`,
      text(error.message, "Capability execution.outcome.error.message"),
      false,
    );
  }

  const embedded = record(outcome.output, "Capability execution.outcome.output");
  noAuthority(embedded.authority, "Managed AI outcome.authority");
  const embeddedStatus = text(embedded.status, "Managed AI outcome.status");
  if (
    (status === "SUCCEEDED" && embeddedStatus !== "COMPLETED") ||
    (status === "REQUIRES_REVIEW" && embeddedStatus !== "REQUIRES_RECONCILIATION") ||
    (status === "FAILED" && embeddedStatus !== "FAILED" && embeddedStatus !== "BLOCKED")
  ) {
    throw new CapabilityRuntimeManagedAiHttpClientError(
      "AI_CAPABILITY_V2_STATUS_DRIFT",
      `Capability outcome ${status} is inconsistent with Managed AI outcome ${embeddedStatus}`,
      false,
    );
  }
  const provenance = embedded.provenance;
  if (provenance !== undefined) {
    const provenanceRecord = record(provenance, "Managed AI outcome.provenance");
    if (
      text(
        provenanceRecord.implementationKey,
        "Managed AI outcome.provenance.implementationKey",
      ) !== implementationKey
    ) {
      throw new CapabilityRuntimeManagedAiHttpClientError(
        "AI_CAPABILITY_V2_BINDING_DRIFT",
        "Managed AI provenance drifted from the governed Capability implementation binding",
        false,
      );
    }
  }
  if (status === "REQUIRES_REVIEW" && embedded.status !== "REQUIRES_RECONCILIATION") {
    throw new CapabilityRuntimeManagedAiHttpClientError(
      "AI_CAPABILITY_V2_RECONCILIATION_DRIFT",
      "Capability review-required outcome must contain Managed AI reconciliation state",
      false,
    );
  }
  return embedded as ManagedAiKnowledgeExecutionOutcomeV1;
}

function resolvedInlineExactOutput(
  value: unknown,
  durable: Extract<
    NonNullable<ManagedAiKnowledgeExecutionOutcomeV1["exactOutput"]>,
    { kind: "DURABLE_REF" }
  >,
): Extract<
  NonNullable<ManagedAiKnowledgeExecutionOutcomeV1["exactOutput"]>,
  { kind: "INLINE_BASE64" }
> {
  const exact = record(value, "Managed AI exact-output resolution");
  if (
    exact.kind !== "INLINE_BASE64" ||
    typeof exact.mediaType !== "string" ||
    exact.mediaType !== durable.mediaType ||
    typeof exact.sha256 !== "string" ||
    exact.sha256 !== durable.sha256 ||
    !SHA256.test(exact.sha256) ||
    typeof exact.sizeBytes !== "number" ||
    exact.sizeBytes !== durable.sizeBytes ||
    !Number.isSafeInteger(exact.sizeBytes) ||
    exact.sizeBytes < 0 ||
    typeof exact.dataBase64 !== "string"
  ) {
    throw new CapabilityRuntimeManagedAiHttpClientError(
      "AI_CAPABILITY_V2_EXACT_OUTPUT_RESOLUTION_MISMATCH",
      "Resolved Managed AI exact output does not match the durable governed reference",
      false,
    );
  }
  return exact as Extract<
    NonNullable<ManagedAiKnowledgeExecutionOutcomeV1["exactOutput"]>,
    { kind: "INLINE_BASE64" }
  >;
}

export class CapabilityRuntimeManagedAiHttpClient implements ManagedAiExecutionClient {
  private readonly url: string;
  private readonly exactOutputResolutionUrl: string;
  private readonly internalServiceSecret: string;
  private readonly idempotencyKey: string;
  private readonly correlationId: string;
  private readonly principal: CapabilityRuntimeWorkspacePrincipal;
  private readonly encodedPrincipal: string;
  private readonly transport: ManagedAiHttpTransport;
  private readonly requestTimeoutMs: number;
  private readonly maxResponseBytes: number;

  constructor(options: CapabilityRuntimeManagedAiHttpClientOptions) {
    const routes = endpoints(options.baseUrl);
    this.url = routes.capability;
    this.exactOutputResolutionUrl = routes.exactOutputResolution;
    this.internalServiceSecret = nonEmpty(
      options.internalServiceSecret,
      "internalServiceSecret",
      4_096,
    );
    if (Buffer.byteLength(this.internalServiceSecret) < 32) {
      throw new TypeError("internalServiceSecret must contain at least 32 bytes");
    }
    this.idempotencyKey = nonEmpty(options.idempotencyKey, "idempotencyKey", 500);
    this.correlationId = nonEmpty(options.correlationId, "correlationId", 300);
    this.principal = {
      workspaceId: nonEmpty(options.principal.workspaceId, "principal.workspaceId", 300),
      principalId: nonEmpty(options.principal.principalId, "principal.principalId", 300),
      membershipId: nonEmpty(options.principal.membershipId, "principal.membershipId", 300),
    };
    this.encodedPrincipal = encodedWorkspacePrincipal(this.principal);
    this.transport = options.transport ?? fetchManagedAiHttpTransport;
    this.requestTimeoutMs = boundedInteger(
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      "requestTimeoutMs",
      1_000,
      MAX_REQUEST_TIMEOUT_MS,
    );
    this.maxResponseBytes = boundedInteger(
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      "maxResponseBytes",
      1,
      MAX_RESPONSE_BYTES,
    );
  }

  async execute(
    input: Readonly<ManagedAiKnowledgeExecutionInputV1>,
  ): Promise<ManagedAiKnowledgeExecutionOutcomeV1> {
    let response: ManagedAiHttpTransportResponse;
    try {
      response = await this.transport({
        url: this.url,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-markorbit-internal-authorization": this.internalServiceSecret,
          "x-markorbit-principal": this.encodedPrincipal,
          "x-markorbit-workspace-id": this.principal.workspaceId,
          "x-markorbit-caller-product": CAPABILITY_RUNTIME_CALLER_PRODUCT,
          "idempotency-key": this.idempotencyKey,
          "x-correlation-id": this.correlationId,
        },
        body: JSON.stringify(
          capabilityCommand(input, this.principal, this.idempotencyKey, this.correlationId),
        ),
        timeoutMs: this.requestTimeoutMs,
        maxResponseBytes: this.maxResponseBytes,
      });
    } catch (error) {
      throw this.deliveryUncertain(error);
    }

    const parsed = parseJsonBytes(response.body, "Capability Runtime response");
    if (response.status < 200 || response.status >= 300) {
      throw this.httpFailure(parsed, response.status, "Capability Runtime");
    }
    if (response.status !== 200 && response.status !== 201) {
      throw new CapabilityRuntimeManagedAiHttpClientError(
        "AI_CAPABILITY_V2_HTTP_STATUS_INVALID",
        `Capability Runtime returned unexpected success status ${response.status}`,
        false,
      );
    }

    const outcome = embeddedManagedAiOutcome(parsed);
    if (outcome.exactOutput?.kind !== "DURABLE_REF") return outcome;
    return this.resolveExactOutput(outcome);
  }

  private async resolveExactOutput(
    outcome: ManagedAiKnowledgeExecutionOutcomeV1,
  ): Promise<ManagedAiKnowledgeExecutionOutcomeV1> {
    const durable = outcome.exactOutput;
    if (!durable || durable.kind !== "DURABLE_REF") return outcome;

    let response: ManagedAiHttpTransportResponse;
    try {
      response = await this.transport({
        url: this.exactOutputResolutionUrl,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-markorbit-internal-authorization": this.internalServiceSecret,
        },
        body: JSON.stringify({ ref: durable.ref }),
        timeoutMs: this.requestTimeoutMs,
        maxResponseBytes: this.maxResponseBytes,
      });
    } catch (error) {
      throw this.deliveryUncertain(error);
    }

    const parsed = parseJsonBytes(response.body, "Managed AI exact-output resolution response");
    if (response.status < 200 || response.status >= 300) {
      throw this.httpFailure(parsed, response.status, "Managed AI exact-output resolution");
    }
    if (response.status !== 200) {
      throw new CapabilityRuntimeManagedAiHttpClientError(
        "AI_CAPABILITY_V2_EXACT_OUTPUT_RESOLUTION_STATUS_INVALID",
        `Managed AI exact-output resolution returned unexpected success status ${response.status}`,
        false,
      );
    }
    return {
      ...outcome,
      exactOutput: resolvedInlineExactOutput(parsed, durable),
    };
  }

  private deliveryUncertain(error: unknown): CapabilityRuntimeManagedAiHttpClientError {
    const message =
      error instanceof ManagedAiHttpTransportError || error instanceof Error
        ? error.message
        : "transport failed";
    return new CapabilityRuntimeManagedAiHttpClientError(
      "AI_PROVIDER_NETWORK_ERROR",
      `Capability Runtime delivery is uncertain: ${message}`,
      false,
    );
  }

  private httpFailure(value: unknown, status: number, service: string): Error {
    const error = parseErrorBody(value, status);
    if (!error) {
      return new CapabilityRuntimeManagedAiHttpClientError(
        "AI_CAPABILITY_V2_HTTP_ERROR_RESPONSE_INVALID",
        `${service} returned HTTP ${status} with an invalid governed error body`,
        false,
      );
    }
    return new CapabilityRuntimeManagedAiHttpClientError(
      `AI_CAPABILITY_V2_${error.code}`,
      error.message,
      error.retryable,
    );
  }
}
