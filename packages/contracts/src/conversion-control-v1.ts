import type { ArtifactKind, JsonValue } from "./schema-v1";
import { ARTIFACT_KINDS } from "./schema-v1";

export const CONVERSION_CONTROL_VERSION = "1.0" as const;
export const CONVERTER_STATUSES = ["ACTIVE", "DEPRECATED", "DISABLED"] as const;
export const CONVERTER_RUNTIMES = ["BUILT_IN", "LOCAL_PROCESS", "REMOTE_SERVICE"] as const;
export const CONVERTER_CAPABILITIES = [
  "CONVERT",
  "EXTRACT_METADATA",
  "PRESERVE_TABLES",
  "PRESERVE_LINKS",
  "EXTRACT_ATTACHMENTS",
] as const;
export const CONVERSION_OUTPUT_FORMATS = ["MARKDOWN"] as const;
export const CONVERSION_PROFILE_STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED"] as const;

export type ConverterStatus = (typeof CONVERTER_STATUSES)[number];
export type ConverterRuntime = (typeof CONVERTER_RUNTIMES)[number];
export type ConverterCapability = (typeof CONVERTER_CAPABILITIES)[number];
export type ConversionOutputFormat = (typeof CONVERSION_OUTPUT_FORMATS)[number];
export type ConversionProfileStatus = (typeof CONVERSION_PROFILE_STATUSES)[number];

export type ConverterInputRule = {
  artifactKinds: ArtifactKind[];
  mimePatterns: string[];
};

export type ConverterManifest = {
  protocolVersion: typeof CONVERSION_CONTROL_VERSION;
  objectType: "CONVERTER_MANIFEST";
  converterId: string;
  displayName: string;
  version: string;
  runtime: ConverterRuntime;
  capabilities: ConverterCapability[];
  inputs: ConverterInputRule;
  outputFormat: ConversionOutputFormat;
  deterministic: boolean;
  configurationSchema: Record<string, JsonValue>;
  resourceHints: {
    maxInputBytes: number;
    timeoutSeconds: number;
  };
  status: ConverterStatus;
};

export type ConversionProfile = {
  protocolVersion: typeof CONVERSION_CONTROL_VERSION;
  objectType: "CONVERSION_PROFILE";
  id: string;
  workspaceId: string;
  sourceId?: string;
  name: string;
  status: ConversionProfileStatus;
  converter: { converterId: string; version: string };
  input: ConverterInputRule;
  outputFormat: ConversionOutputFormat;
  targetPathTemplate: string;
  configuration: Record<string, JsonValue>;
  precedence: number;
  autoConvert: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};

const CONVERTER_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const PROFILE_ID = /^cvp_[0-9A-HJKMNP-TV-Z]{26}$/;
const WORKSPACE_ID = /^wsp_[0-9A-HJKMNP-TV-Z]{26}$/;
const SOURCE_ID = /^src_[0-9A-HJKMNP-TV-Z]{26}$/;
const MIME_PATTERN = /^(?:\*|[a-z0-9!#$&^_.+-]+)\/(?:\*|[a-z0-9!#$&^_.+-]+)$/i;
const FORBIDDEN_KEY =
  /(secret|password|passwd|token|api[-_]?key|command|cmd|shell|script|executable|argv|args)/i;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function only(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function required(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function enumValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function rfc3339(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function jsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(jsonValue);
  return record(value) && Object.values(value).every(jsonValue);
}

export function hasForbiddenConversionConfiguration(
  value: unknown,
  path = "configuration",
): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = hasForbiddenConversionConfiguration(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!record(value)) return null;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) return `${path}.${key}`;
    const found = hasForbiddenConversionConfiguration(nested, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

export function isConverterInputRule(value: unknown): value is ConverterInputRule {
  if (
    !record(value) ||
    !required(value, ["artifactKinds", "mimePatterns"]) ||
    !only(value, ["artifactKinds", "mimePatterns"])
  )
    return false;
  return (
    Array.isArray(value.artifactKinds) &&
    value.artifactKinds.length > 0 &&
    value.artifactKinds.every((item) => enumValue(ARTIFACT_KINDS, item)) &&
    new Set(value.artifactKinds).size === value.artifactKinds.length &&
    Array.isArray(value.mimePatterns) &&
    value.mimePatterns.length > 0 &&
    value.mimePatterns.every((item) => typeof item === "string" && MIME_PATTERN.test(item)) &&
    new Set(value.mimePatterns).size === value.mimePatterns.length
  );
}

export function isConverterManifest(value: unknown): value is ConverterManifest {
  if (!record(value)) return false;
  const keys = [
    "protocolVersion",
    "objectType",
    "converterId",
    "displayName",
    "version",
    "runtime",
    "capabilities",
    "inputs",
    "outputFormat",
    "deterministic",
    "configurationSchema",
    "resourceHints",
    "status",
  ];
  if (!required(value, keys) || !only(value, keys) || !record(value.resourceHints)) return false;
  return (
    value.protocolVersion === CONVERSION_CONTROL_VERSION &&
    value.objectType === "CONVERTER_MANIFEST" &&
    typeof value.converterId === "string" &&
    CONVERTER_ID.test(value.converterId) &&
    typeof value.displayName === "string" &&
    value.displayName.trim().length > 0 &&
    value.displayName.length <= 120 &&
    typeof value.version === "string" &&
    SEMVER.test(value.version) &&
    enumValue(CONVERTER_RUNTIMES, value.runtime) &&
    Array.isArray(value.capabilities) &&
    value.capabilities.includes("CONVERT") &&
    value.capabilities.every((item) => enumValue(CONVERTER_CAPABILITIES, item)) &&
    new Set(value.capabilities).size === value.capabilities.length &&
    isConverterInputRule(value.inputs) &&
    enumValue(CONVERSION_OUTPUT_FORMATS, value.outputFormat) &&
    typeof value.deterministic === "boolean" &&
    record(value.configurationSchema) &&
    jsonValue(value.configurationSchema) &&
    hasForbiddenConversionConfiguration(value.configurationSchema, "configurationSchema") ===
      null &&
    only(value.resourceHints, ["maxInputBytes", "timeoutSeconds"]) &&
    Number.isSafeInteger(value.resourceHints.maxInputBytes) &&
    Number(value.resourceHints.maxInputBytes) > 0 &&
    Number.isInteger(value.resourceHints.timeoutSeconds) &&
    Number(value.resourceHints.timeoutSeconds) > 0 &&
    Number(value.resourceHints.timeoutSeconds) <= 3600 &&
    enumValue(CONVERTER_STATUSES, value.status)
  );
}

export function isConversionProfile(value: unknown): value is ConversionProfile {
  if (!record(value)) return false;
  const requiredKeys = [
    "protocolVersion",
    "objectType",
    "id",
    "workspaceId",
    "name",
    "status",
    "converter",
    "input",
    "outputFormat",
    "targetPathTemplate",
    "configuration",
    "precedence",
    "autoConvert",
    "createdAt",
    "updatedAt",
  ];
  if (
    !required(value, requiredKeys) ||
    !only(value, [...requiredKeys, "sourceId", "archivedAt"]) ||
    !record(value.converter) ||
    !record(value.configuration)
  )
    return false;
  const lifecycleValid =
    (value.status === "ARCHIVED" && rfc3339(value.archivedAt)) ||
    (value.status !== "ARCHIVED" && value.archivedAt === undefined);
  return (
    value.protocolVersion === CONVERSION_CONTROL_VERSION &&
    value.objectType === "CONVERSION_PROFILE" &&
    typeof value.id === "string" &&
    PROFILE_ID.test(value.id) &&
    typeof value.workspaceId === "string" &&
    WORKSPACE_ID.test(value.workspaceId) &&
    (value.sourceId === undefined ||
      (typeof value.sourceId === "string" && SOURCE_ID.test(value.sourceId))) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    value.name.length <= 120 &&
    enumValue(CONVERSION_PROFILE_STATUSES, value.status) &&
    only(value.converter, ["converterId", "version"]) &&
    typeof value.converter.converterId === "string" &&
    CONVERTER_ID.test(value.converter.converterId) &&
    typeof value.converter.version === "string" &&
    SEMVER.test(value.converter.version) &&
    isConverterInputRule(value.input) &&
    enumValue(CONVERSION_OUTPUT_FORMATS, value.outputFormat) &&
    typeof value.targetPathTemplate === "string" &&
    value.targetPathTemplate.length > 0 &&
    value.targetPathTemplate.length <= 300 &&
    !value.targetPathTemplate.includes("..") &&
    !value.targetPathTemplate.startsWith("/") &&
    !value.targetPathTemplate.includes("\\") &&
    Object.values(value.configuration).every(jsonValue) &&
    hasForbiddenConversionConfiguration(value.configuration) === null &&
    Number.isInteger(value.precedence) &&
    Number(value.precedence) >= 0 &&
    Number(value.precedence) <= 10000 &&
    typeof value.autoConvert === "boolean" &&
    rfc3339(value.createdAt) &&
    rfc3339(value.updatedAt) &&
    lifecycleValid
  );
}

export function mimePatternMatches(pattern: string, mimeType: string): boolean {
  if (!MIME_PATTERN.test(pattern) || !MIME_PATTERN.test(mimeType)) return false;
  const [patternType, patternSubtype] = pattern.toLowerCase().split("/");
  const [actualType, actualSubtype] = mimeType.toLowerCase().split("/");
  return (
    (patternType === "*" || patternType === actualType) &&
    (patternSubtype === "*" || patternSubtype === actualSubtype)
  );
}

export function converterAccepts(
  manifest: ConverterManifest,
  artifactKind: ArtifactKind,
  mimeType: string,
): boolean {
  return (
    manifest.inputs.artifactKinds.includes(artifactKind) &&
    manifest.inputs.mimePatterns.some((pattern) => mimePatternMatches(pattern, mimeType))
  );
}

export function assertConverterManifest(value: unknown): asserts value is ConverterManifest {
  if (!isConverterManifest(value)) throw new TypeError("Invalid ConverterManifest");
}

export function assertConversionProfile(value: unknown): asserts value is ConversionProfile {
  if (!isConversionProfile(value)) throw new TypeError("Invalid ConversionProfile");
}
