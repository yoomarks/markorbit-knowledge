import {
  CONVERSION_RUN_STATUSES,
  CONVERSION_TRIGGERS,
  type ConversionActor,
  type ConversionRunStatus,
  type ConversionTrigger,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import type {
  CancelConversionRunInput,
  ConversionRunListFilters,
  ManualConversionDispatchInput,
} from "@markorbit/persistence/conversion-runs";

const FORBIDDEN =
  /(password|token|apiKey|secret|privateKey|command|shell|script|executable|argv|args)/i;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const TEMPLATE = /^(?!.*\.\.)(?!\/)[A-Za-z0-9_./{}:-]+\.md$/;

function assertRecord(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RegistryValidationError(`${name} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}
function assertKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  name: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new RegistryValidationError(`Unknown ${name} field: ${key}`);
    if (FORBIDDEN.test(key)) throw new RegistryValidationError(`Forbidden ${name} field: ${key}`);
  }
}
function assertNoForbidden(value: unknown, path = "body"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbidden(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (FORBIDDEN.test(key)) throw new RegistryValidationError(`Forbidden field: ${path}.${key}`);
      assertNoForbidden(nested, `${path}.${key}`);
    }
  }
}
function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RegistryValidationError(`${field} is required`);
  }
  return value.trim();
}
function parseActor(value: unknown): ConversionActor | undefined {
  if (value === undefined) return undefined;
  const actor = assertRecord(value, "actor");
  assertKeys(actor, ["type", "id"], "actor");
  const type = actor.type;
  const id = actor.id;
  if (type !== "ADMIN" && type !== "SYSTEM" && type !== "WORKER") {
    throw new RegistryValidationError("actor.type is invalid");
  }
  if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(id)) {
    throw new RegistryValidationError("actor.id is invalid");
  }
  return { type, id };
}
function parseRequestedOutput(value: unknown): ManualConversionDispatchInput["requestedOutput"] {
  const output = assertRecord(value, "requestedOutput");
  assertKeys(output, ["format", "targetPathTemplate"], "requestedOutput");
  if (output.format !== "MARKDOWN")
    throw new RegistryValidationError("requestedOutput.format must be MARKDOWN");
  const targetPathTemplate = requiredString(
    output.targetPathTemplate,
    "requestedOutput.targetPathTemplate",
  );
  if (!TEMPLATE.test(targetPathTemplate)) {
    throw new RegistryValidationError("requestedOutput.targetPathTemplate is invalid");
  }
  return { format: "MARKDOWN", targetPathTemplate };
}

export function parseDispatchRequest(body: Record<string, unknown>): ManualConversionDispatchInput {
  assertKeys(
    body,
    [
      "workspaceId",
      "rawArtifactId",
      "conversionProfileId",
      "requestedOutput",
      "trigger",
      "actor",
      "idempotencyKey",
    ],
    "ConversionRun dispatch",
  );
  assertNoForbidden(body);
  const trigger = body.trigger === undefined ? undefined : body.trigger;
  if (trigger !== undefined && !CONVERSION_TRIGGERS.includes(trigger as ConversionTrigger)) {
    throw new RegistryValidationError("trigger is invalid");
  }
  const idempotencyKey = requiredString(body.idempotencyKey, "idempotencyKey");
  if (!ID.test(idempotencyKey)) throw new RegistryValidationError("idempotencyKey is invalid");
  return {
    workspaceId: requiredString(body.workspaceId, "workspaceId"),
    rawArtifactId: requiredString(body.rawArtifactId, "rawArtifactId"),
    conversionProfileId: requiredString(body.conversionProfileId, "conversionProfileId"),
    requestedOutput: parseRequestedOutput(body.requestedOutput),
    trigger: trigger as ConversionTrigger | undefined,
    actor: parseActor(body.actor),
    idempotencyKey,
  };
}

export function parseCancelRequest(body: Record<string, unknown>): CancelConversionRunInput {
  assertKeys(body, ["workspaceId", "actor", "message"], "ConversionRun cancel");
  assertNoForbidden(body);
  const message = body.message;
  if (message !== undefined && typeof message !== "string") {
    throw new RegistryValidationError("message must be a string");
  }
  return {
    workspaceId: requiredString(body.workspaceId, "workspaceId"),
    actor: parseActor(body.actor),
    ...(message ? { message } : {}),
  };
}

export function parseListFilters(url: URL): ConversionRunListFilters {
  const allowed = new Set([
    "workspaceId",
    "sourceId",
    "rawArtifactId",
    "conversionProfileId",
    "converterId",
    "status",
    "trigger",
    "limit",
    "offset",
  ]);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key))
      throw new RegistryValidationError(`Unknown ConversionRun filter: ${key}`);
    if (FORBIDDEN.test(key)) throw new RegistryValidationError(`Forbidden filter field: ${key}`);
  }
  const enumValue = <T extends readonly string[]>(
    values: T,
    value: string | null,
    field: string,
  ): T[number] | undefined => {
    if (!value) return undefined;
    if (!values.includes(value as T[number]))
      throw new RegistryValidationError(`Unknown ${field} filter`);
    return value as T[number];
  };
  const int = (value: string | null, field: string): number | undefined => {
    if (!value) return undefined;
    const n = Number(value);
    if (!Number.isInteger(n)) throw new RegistryValidationError(`${field} must be an integer`);
    return n;
  };
  return {
    workspaceId: url.searchParams.get("workspaceId") ?? undefined,
    sourceId: url.searchParams.get("sourceId") ?? undefined,
    rawArtifactId: url.searchParams.get("rawArtifactId") ?? undefined,
    conversionProfileId: url.searchParams.get("conversionProfileId") ?? undefined,
    converterId: url.searchParams.get("converterId") ?? undefined,
    status: enumValue(CONVERSION_RUN_STATUSES, url.searchParams.get("status"), "status") as
      ConversionRunStatus | undefined,
    trigger: enumValue(CONVERSION_TRIGGERS, url.searchParams.get("trigger"), "trigger") as
      ConversionTrigger | undefined,
    limit: int(url.searchParams.get("limit"), "limit"),
    offset: int(url.searchParams.get("offset"), "offset"),
  };
}

export function requireWorkspaceQuery(url: URL): string {
  const workspaceId = url.searchParams.get("workspaceId")?.trim();
  if (!workspaceId) throw new RegistryValidationError("workspaceId query parameter is required");
  return workspaceId;
}
