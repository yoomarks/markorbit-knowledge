import {
  CROSS_SOURCE_PARENT_ARTIFACT_IDS_EXTENSION,
  type Extensions,
  type SourceDefinition,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_ID,
  GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
  GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_SOURCE,
} from "@markorbit/worker-runtime";

const ARTIFACT_ID = /^art_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function invalid(message: string): never {
  throw new RegistryValidationError(message);
}

function isPublisherConnector(source: SourceDefinition): boolean {
  return source.connector.connectorId === GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_ID;
}

export function deriveGlobalTrademarkPublisherRunExtensions(input: {
  source: SourceDefinition;
  rawExtensions: unknown;
}): Extensions | null {
  const { source } = input;
  if (!isPublisherConnector(source)) return null;

  if (
    source.connector.version !== GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_VERSION ||
    source.sourceType !== "DATABASE" ||
    source.canonicalUri !== GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_SOURCE
  ) {
    return invalid("Global trademark publisher Source boundary is invalid");
  }
  if (input.rawExtensions !== undefined) {
    return invalid("Global trademark publisher Run extensions are derived from the frozen Source");
  }

  const config = record(source.connectorConfig);
  if (
    !config ||
    config.intent !== "PUBLISH_DURABLE_REQUEST" ||
    Object.keys(config).some((key) => !["intent", "requestArtifactRef"].includes(key))
  ) {
    return invalid("Global trademark publisher connectorConfig is invalid");
  }

  const ref = record(config.requestArtifactRef);
  if (
    !ref ||
    Object.keys(ref).some(
      (key) => !["artifactId", "canonicalUri", "sha256", "sizeBytes"].includes(key),
    ) ||
    typeof ref.artifactId !== "string" ||
    !ARTIFACT_ID.test(ref.artifactId) ||
    typeof ref.canonicalUri !== "string" ||
    !ref.canonicalUri.endsWith("/fact-admission-request") ||
    typeof ref.sha256 !== "string" ||
    !SHA256.test(ref.sha256) ||
    !Number.isSafeInteger(ref.sizeBytes) ||
    (ref.sizeBytes as number) < 1
  ) {
    return invalid("Global trademark publisher requestArtifactRef is invalid");
  }

  return {
    [CROSS_SOURCE_PARENT_ARTIFACT_IDS_EXTENSION]: [ref.artifactId],
  };
}
