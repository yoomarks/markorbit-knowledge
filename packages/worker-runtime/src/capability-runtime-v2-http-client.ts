import { AiKnowledgeAcquisitionError } from "./ai-distilled-knowledge-acquirer";
import type {
  ManagedAiExecutionClient,
  ManagedAiKnowledgeExecutionInputV1,
  ManagedAiKnowledgeExecutionOutcomeV1,
} from "./managed-ai-knowledge-adapter";
import {
  fetchManagedAiHttpTransport,
  ManagedAiHttpTransportError,
  type ManagedAiHttpTransport,
  type ManagedAiHttpTransportResponse,
} from "./managed-ai-execution-http-client";

export const CAPABILITY_RUNTIME_V2_ROUTE = "/v1/capability-requests" as const;
export const KNOWLEDGE_CAPABILITY_CALLER_PRODUCT = "KNOWLEDGE" as const;
export const MANAGED_AI_CAPABILITY_INPUT_SCHEMA_ID = "managed-ai-input.v1" as const;
export const MANAGED_AI_CAPABILITY_OUTPUT_SCHEMA_ID = "managed-ai-output.v1" as const;

const DEFAULT_REQUEST_TIMEOUT_MS = 315_000;
const DEFAULT_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_REQUEST_TIMEOUT_MS = 360_000;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

const WORKSPACE_ROLES = new Set(["WORKSPACE_ADMIN", "MATTER_MANAGER", "REVIEWER", "READ_ONLY"]);
const CAPABILITY_NO_AUTHORITY_KEYS = [
  "canonicalTruthCreated",
  "capabilityCanonMutated",
  "professionalDecisionCreated",
  "providerSelectionAuthorityGrantedToCaller",
  "paymentCreated",
  "filingSubmitted",
  "externalMessageSent",
  "externalProfessionalActionExecuted",
] as const;

export type CapabilityRuntimeWorkspacePrincipalV1 = {
  kind: "WORKSPACE";
  sessionId: string;
  userId: string;
  workspaceId: string;
  membershipId: string;
  role: string;
  permissions: readonly string[];
  sessionExpiresAt: string;
};

export type CapabilityRuntimeV2ManagedAiHttpClientOptions = {
  baseUrl: string;
  internalServiceSecret: string;
  workspacePrincipal: string;
  idempotencyKey: string;
  correlationId: string;
  transport?: ManagedAiHttpTransport;
  requestTimeoutMs?: number;
  maxResponseBytes?: number;
  now?: () => Date;
};

export class CapabilityRuntimeV2HttpClientError extends AiKnowledgeAcquisitionError {
  constructor(code: string, message: string, retryable: boolean) {
    super(code, message, retryable);
    this.name = "CapabilityRuntimeV2HttpClientError";
  }
}

function boundedInteger(value: number, field: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${field} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function nonEmpty(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new TypeError(`${field} must be a string`);
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maxLength) {
    throw new TypeError(`${field} must contain 1 to ${maxLength} characters`);
  }
  return cleaned;
}

function capabilityEndpoint(baseUrl: string): string {
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
  return new URL(CAPABILITY_RUNTIME_V2_ROUTE, parsed).toString();
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CapabilityRuntimeV2HttpClientError(
      "AI_MANAGED_AI_CAPABILITY_RESPONSE_INVALID",
      `${field} must be an object`,
      false,
    );
  }
  return value as Record<string, unknown>;
}

function parseJsonBytes(raw: Uint8Array, context: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(raw)) as unknown;
  } catch {
    throw new CapabilityRuntimeV2HttpClientError(
      "AI_MANAGED_AI_CAPABILITY_INVALID_JSON",
      `${context} did not contain valid JSON`,
      false,
    );
  }
}

export function encodeCapabilityRuntimeWorkspacePrincipal(
  principal: CapabilityRuntimeWorkspacePrincipalV1,
): string {
  return Buffer.from(JSON.stringify({ schemaVersion: 1, principal }), "utf8").toString("base64url");
}

export function decodeCapabilityRuntimeWorkspacePrincipal(
  value: string,
  now = new Date(),
): CapabilityRuntimeWorkspacePrincipalV1 {
  const encoded = nonEmpty(value, "workspacePrincipal", 16_384);
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new TypeError("workspacePrincipal must be a valid encoded Workspace Principal envelope");
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new TypeError("workspacePrincipal must be a valid encoded Workspace Principal envelope");
  }
  const envelope = decoded as Record<string, unknown>;
  const raw = envelope.principal;
  if (envelope.schemaVersion !== 1 || !raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError(
      "workspacePrincipal must be a schemaVersion 1 Workspace Principal envelope",
    );
  }
  const principal = raw as Record<string, unknown>;
  const permissions = principal.permissions;
  if (
    principal.kind !== "WORKSPACE" ||
    !WORKSPACE_ROLES.has(String(principal.role)) ||
    !Array.isArray(permissions) ||
    permissions.some((permission) => typeof permission !== "string" || !permission.trim()) ||
    !permissions.includes("workspace:read")
  ) {
    throw new TypeError("workspacePrincipal must be a Workspace Principal with workspace:read");
  }
  const parsed: CapabilityRuntimeWorkspacePrincipalV1 = {
    kind: "WORKSPACE",
    sessionId: nonEmpty(principal.sessionId, "workspacePrincipal.sessionId", 500),
    userId: nonEmpty(principal.userId, "workspacePrincipal.userId", 500),
    workspaceId: nonEmpty(principal.workspaceId, "workspacePrincipal.workspaceId", 500),
    membershipId: nonEmpty(principal.membershipId, "workspacePrincipal.membershipId", 500),
    role: nonEmpty(principal.role, "workspacePrincipal.role", 100),
    permissions: [...permissions] as string[],
    sessionExpiresAt: nonEmpty(
      principal.sessionExpiresAt,
      "workspacePrincipal.sessionExpiresAt",
      100,
    ),
  };
  const expiry = Date.parse(parsed.sessionExpiresAt);
  if (Number.isNaN(expiry) || expiry <= now.getTime()) {
    throw new TypeError("workspacePrincipal must contain an unexpired sessionExpiresAt");
  }
  return parsed;
}

function noAuthorityEscalation(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const authority = value as Record<string, unknown>;
  const keys = Object.keys(authority);
  return (
    keys.length === CAPABILITY_NO_AUTHORITY_KEYS.length &&
    keys.every((key) => (CAPABILITY_NO_AUTHORITY_KEYS as readonly string[]).includes(key)) &&
    CAPABILITY_NO_AUTHORITY_KEYS.every((key) => authority[key] === false)
  );
}

function parseCoreError(value: unknown): { code: string; message: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.code !== "string" ||
    !record.code.trim() ||
    typeof record.message !== "string" ||
    !record.message.trim()
  ) {
    return null;
  }
  return { code: record.code, message: record.message };
}

function expectedCapabilityStatuses(managedStatus: unknown): {
  outcome: "SUCCEEDED" | "FAILED" | "REQUIRES_REVIEW";
  returned: "COMPLETED" | "FAILED" | "REVIEW_REQUIRED";
} | null {
  if (managedStatus === "COMPLETED") return { outcome: "SUCCEEDED", returned: "COMPLETED" };
  if (managedStatus === "REQUIRES_RECONCILIATION") {
    return { outcome: "REQUIRES_REVIEW", returned: "REVIEW_REQUIRED" };
  }
  if (managedStatus === "FAILED" || managedStatus === "BLOCKED") {
    return { outcome: "FAILED", returned: "FAILED" };
  }
  return null;
}

export class CapabilityRuntimeV2ManagedAiExecutionClient implements ManagedAiExecutionClient {
  private readonly url: string;
  private readonly internalServiceSecret: string;
  private readonly encodedPrincipal: string;
  private readonly principal: CapabilityRuntimeWorkspacePrincipalV1;
  private readonly idempotencyKey: string;
  private readonly correlationId: string;
  private readonly transport: ManagedAiHttpTransport;
  private readonly requestTimeoutMs: number;
  private readonly maxResponseBytes: number;

  constructor(options: CapabilityRuntimeV2ManagedAiHttpClientOptions) {
    this.url = capabilityEndpoint(options.baseUrl);
    this.internalServiceSecret = nonEmpty(
      options.internalServiceSecret,
      "internalServiceSecret",
      4_096,
    );
    if (Buffer.byteLength(this.internalServiceSecret) < 32) {
      throw new TypeError("internalServiceSecret must contain at least 32 bytes");
    }
    this.encodedPrincipal = nonEmpty(options.workspacePrincipal, "workspacePrincipal", 16_384);
    this.principal = decodeCapabilityRuntimeWorkspacePrincipal(
      this.encodedPrincipal,
      (options.now ?? (() => new Date()))(),
    );
    this.idempotencyKey = nonEmpty(options.idempotencyKey, "idempotencyKey", 500);
    this.correlationId = nonEmpty(options.correlationId, "correlationId", 300);
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
    const caller = {
      workspaceId: this.principal.workspaceId,
      principalId: this.principal.userId,
      callerProduct: KNOWLEDGE_CAPABILITY_CALLER_PRODUCT,
      permissionContextRef: `core-workspace-membership:${this.principal.membershipId}`,
    } as const;
    const command = {
      schemaVersion: 2 as const,
      capabilityId: "managed-ai-execution",
      capabilityVersion: "1.0.0",
      caller,
      purpose: "Acquire a sourced Knowledge artifact through governed Managed AI execution.",
      input,
      inputSchemaId: MANAGED_AI_CAPABILITY_INPUT_SCHEMA_ID,
      outputSchemaId: MANAGED_AI_CAPABILITY_OUTPUT_SCHEMA_ID,
      riskClass: "MODERATE" as const,
      idempotencyKey: this.idempotencyKey,
      correlationId: this.correlationId,
    };

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
          "x-markorbit-caller-product": KNOWLEDGE_CAPABILITY_CALLER_PRODUCT,
          "idempotency-key": this.idempotencyKey,
          "x-correlation-id": this.correlationId,
        },
        body: JSON.stringify(command),
        timeoutMs: this.requestTimeoutMs,
        maxResponseBytes: this.maxResponseBytes,
      });
    } catch (error) {
      if (error instanceof ManagedAiHttpTransportError) {
        throw new CapabilityRuntimeV2HttpClientError(
          "AI_PROVIDER_NETWORK_ERROR",
          `${error.code}: ${error.message}`,
          false,
        );
      }
      throw new CapabilityRuntimeV2HttpClientError(
        "AI_PROVIDER_NETWORK_ERROR",
        error instanceof Error ? error.message : "Capability Runtime transport failed",
        false,
      );
    }

    const parsed = parseJsonBytes(response.body, "Capability Runtime response");
    if (response.status < 200 || response.status >= 300) {
      const coreError = parseCoreError(parsed);
      if (response.status >= 500) {
        throw new CapabilityRuntimeV2HttpClientError(
          "AI_PROVIDER_NETWORK_ERROR",
          coreError
            ? `${coreError.code}: ${coreError.message}`
            : `Capability Runtime HTTP ${response.status}`,
          false,
        );
      }
      throw new CapabilityRuntimeV2HttpClientError(
        `AI_MANAGED_AI_CAPABILITY_${coreError?.code ?? "HTTP_ERROR"}`,
        coreError?.message ?? `Capability Runtime returned HTTP ${response.status}`,
        false,
      );
    }

    const execution = object(parsed, "Capability Runtime execution");
    const request = object(execution.request, "Capability Runtime execution.request");
    const responseCaller = object(request.caller, "Capability Runtime execution.request.caller");
    const binding = object(execution.binding, "Capability Runtime execution.binding");
    const runtimeCapability = object(
      binding.runtimeCapability,
      "Capability Runtime execution.binding.runtimeCapability",
    );
    const implementation = object(
      binding.implementation,
      "Capability Runtime execution.binding.implementation",
    );
    const capabilityOutcome = object(execution.outcome, "Capability Runtime execution.outcome");
    const returnValue = object(execution.returnValue, "Capability Runtime execution.returnValue");
    const receipt = object(execution.receipt, "Capability Runtime execution.receipt");

    if (
      request.capabilityId !== command.capabilityId ||
      request.capabilityVersion !== command.capabilityVersion ||
      request.inputSchemaId !== command.inputSchemaId ||
      request.outputSchemaId !== command.outputSchemaId ||
      request.idempotencyKey !== command.idempotencyKey ||
      request.correlationId !== command.correlationId ||
      responseCaller.workspaceId !== caller.workspaceId ||
      responseCaller.principalId !== caller.principalId ||
      responseCaller.callerProduct !== caller.callerProduct ||
      responseCaller.permissionContextRef !== caller.permissionContextRef ||
      runtimeCapability.capabilityId !== command.capabilityId ||
      runtimeCapability.capabilityVersion !== command.capabilityVersion ||
      implementation.kind !== "AI_ASSISTED_SERVICE" ||
      capabilityOutcome.outputSchemaId !== command.outputSchemaId ||
      returnValue.outputSchemaId !== command.outputSchemaId ||
      receipt.workspaceId !== caller.workspaceId ||
      receipt.principalId !== caller.principalId ||
      receipt.callerProduct !== caller.callerProduct ||
      receipt.correlationId !== command.correlationId ||
      typeof execution.replayed !== "boolean" ||
      !noAuthorityEscalation(capabilityOutcome.authority) ||
      !noAuthorityEscalation(returnValue.authority) ||
      !noAuthorityEscalation(receipt.authority)
    ) {
      throw new CapabilityRuntimeV2HttpClientError(
        "AI_MANAGED_AI_CAPABILITY_ENVELOPE_MISMATCH",
        "Capability Runtime response does not match the trusted Knowledge invocation envelope",
        false,
      );
    }

    if (
      !returnValue.output ||
      typeof returnValue.output !== "object" ||
      Array.isArray(returnValue.output)
    ) {
      throw new CapabilityRuntimeV2HttpClientError(
        "AI_MANAGED_AI_CAPABILITY_OUTPUT_MISSING",
        "Capability Runtime did not preserve the Managed AI execution outcome",
        false,
      );
    }
    const managedOutput = returnValue.output as Record<string, unknown>;
    const expectedStatuses = expectedCapabilityStatuses(managedOutput.status);
    if (
      !expectedStatuses ||
      capabilityOutcome.status !== expectedStatuses.outcome ||
      returnValue.status !== expectedStatuses.returned
    ) {
      throw new CapabilityRuntimeV2HttpClientError(
        "AI_MANAGED_AI_CAPABILITY_STATUS_MISMATCH",
        "Capability Runtime outer status does not preserve the frozen Managed AI status mapping",
        false,
      );
    }
    return structuredClone(managedOutput) as ManagedAiKnowledgeExecutionOutcomeV1;
  }
}
