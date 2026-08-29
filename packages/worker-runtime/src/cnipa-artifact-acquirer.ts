import { createHash } from "node:crypto";
import type { ExecutionExecutor } from "@markorbit/contracts";
import {
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
  CollectionAcquisitionError,
  type CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";
import {
  CnipaConfigurableResponseDecoder,
  parseCnipaResponseSchemaConfig,
} from "./cnipa-configurable-response-decoder";
import { CnipaSourceAdapter } from "./cnipa-source-adapter";
import {
  CnipaAcquisitionError,
  parseCnipaTrademarkJudgmentQuery,
  type CnipaAuthenticatedSessionExecutor,
  type CnipaResponseEvidence,
  type CnipaTrademarkJudgmentQuery,
} from "./cnipa-trademark-judgment";

export const CNIPA_CONNECTOR_ID = "cnipa-authenticated-worker";
export const CNIPA_CONNECTOR_VERSION = "0.2.0";
export const CNIPA_EXECUTOR: ExecutionExecutor = {
  executorId: CNIPA_CONNECTOR_ID,
  version: CNIPA_CONNECTOR_VERSION,
  mode: "PRODUCTION",
};

export interface CnipaClosableAuthenticatedSessionExecutor extends CnipaAuthenticatedSessionExecutor {
  close(): Promise<void>;
}

export interface CnipaAuthenticatedSessionExecutorFactory {
  create(): Promise<CnipaClosableAuthenticatedSessionExecutor>;
}

type CnipaSourceConfig = {
  query: CnipaTrademarkJudgmentQuery;
  responseSchema: ReturnType<typeof parseCnipaResponseSchemaConfig>;
  pageSize: number;
  maxPagesPerLibrary: number;
  maxDetailRequestsPerRun: number;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new CollectionAcquisitionError(
      "CNIPA_CONFIG_INVALID",
      `${label} must be an integer between ${minimum} and ${maximum}`,
      false,
    );
  }
  return value as number;
}

function sourceConfig(context: ArtifactBackedExecutionContext): CnipaSourceConfig {
  const config = record(context.job.sourceSnapshot.connectorConfig);
  if (!config) {
    throw new CollectionAcquisitionError(
      "CNIPA_CONFIG_INVALID",
      "CNIPA source requires connectorConfig",
      false,
    );
  }
  const query = parseCnipaTrademarkJudgmentQuery(config.query);
  if (query.mode !== "REGISTRATION_NUMBER") {
    throw new CollectionAcquisitionError(
      "CNIPA_SCHEMA_UNVERIFIED",
      `${query.mode} collection remains disabled until Phase 3 verifies its request parameters`,
      false,
    );
  }
  const limits = record(config.limits) ?? {};
  return {
    query,
    responseSchema: parseCnipaResponseSchemaConfig(config.responseSchema),
    pageSize: boundedInteger(limits.pageSize, 10, 1, 100, "connectorConfig.limits.pageSize"),
    maxPagesPerLibrary: boundedInteger(
      limits.maxPagesPerLibrary,
      10,
      1,
      50,
      "connectorConfig.limits.maxPagesPerLibrary",
    ),
    maxDetailRequestsPerRun: boundedInteger(
      limits.maxDetailRequestsPerRun,
      30,
      1,
      100,
      "connectorConfig.limits.maxDetailRequestsPerRun",
    ),
  };
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function queryIdentity(query: CnipaTrademarkJudgmentQuery): string {
  return digest(JSON.stringify(query)).slice(0, 16);
}

function canonicalUri(
  evidence: CnipaResponseEvidence,
  queryId: string,
  listPage: number | undefined,
): string {
  const url = new URL(evidence.sourceUri);
  if (evidence.evidenceKind === "LIST_JSON") {
    url.hash = `markorbit-cnipa-query=${queryId}&page=${listPage ?? 1}`;
  }
  return url.toString();
}

function originalName(
  evidence: CnipaResponseEvidence,
  queryId: string,
  listPage: number | undefined,
): string {
  const kind = evidence.documentKind.toLowerCase().replaceAll("_", "-");
  if (evidence.evidenceKind === "LIST_JSON") {
    return `cnipa-${kind}-list-${queryId}-p${listPage ?? 1}.json`;
  }
  const recordId = digest(evidence.sourceRecordId ?? "unknown").slice(0, 16);
  return `cnipa-${kind}-detail-${recordId}.json`;
}

function acquisitionFailure(error: unknown): CollectionAcquisitionError {
  if (error instanceof CollectionAcquisitionError) return error;
  if (error instanceof CnipaAcquisitionError) {
    return new CollectionAcquisitionError(error.code, error.message, error.retryable);
  }
  return new CollectionAcquisitionError(
    "CNIPA_RUNTIME_FAILED",
    error instanceof Error ? error.message : "CNIPA authenticated runtime failed",
    false,
  );
}

export class CnipaJudgmentArtifactAcquirer implements CollectionArtifactAcquirer {
  readonly executor = CNIPA_EXECUTOR;

  constructor(private readonly sessionFactory: CnipaAuthenticatedSessionExecutorFactory) {}

  async acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    const config = sourceConfig(context);
    let session: CnipaClosableAuthenticatedSessionExecutor | undefined;
    try {
      session = await this.sessionFactory.create();
      const adapter = new CnipaSourceAdapter(
        session,
        new CnipaConfigurableResponseDecoder(config.responseSchema),
        {
          pageSize: config.pageSize,
          maxPagesPerLibrary: config.maxPagesPerLibrary,
          maxDetailRequestsPerRun: config.maxDetailRequestsPerRun,
        },
      );
      const collection = await adapter.collect(config.query);
      const queryId = queryIdentity(collection.query);
      const listPages = new Map<string, number>();
      return collection.evidence.map((evidence) => {
        let listPage: number | undefined;
        if (evidence.evidenceKind === "LIST_JSON") {
          const next = (listPages.get(evidence.documentKind) ?? 0) + 1;
          listPages.set(evidence.documentKind, next);
          listPage = next;
        }
        return {
          artifactKind: "JSON",
          mimeType: evidence.mediaType,
          originalName: originalName(evidence, queryId, listPage),
          sourceUri: evidence.sourceUri,
          canonicalUri: canonicalUri(evidence, queryId, listPage),
          content: evidence.content,
        };
      });
    } catch (error) {
      throw acquisitionFailure(error);
    } finally {
      if (session) {
        try {
          await session.close();
        } catch {
          // Evidence acquisition has already reached a deterministic outcome.
          // Browser cleanup must not rewrite that outcome or trigger replay.
        }
      }
    }
  }
}
