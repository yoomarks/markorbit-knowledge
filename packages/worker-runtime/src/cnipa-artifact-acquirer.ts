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
import { resolveCnipaExecutionQuery } from "./cnipa-execution-query";
import { buildCnipaDateRangeCoverageManifest } from "./cnipa-collection-coverage";
import {
  CNIPA_LIST_FACT_PROJECTION_VERSION,
  materializeCnipaListPageBytes,
} from "./cnipa-list-materializer";
import { CnipaSourceAdapter } from "./cnipa-source-adapter";
import {
  CnipaAcquisitionError,
  type CnipaAuthenticatedHttpSessionExecutor,
  type CnipaAuthenticatedSessionExecutor,
  type CnipaResponseEvidence,
  type CnipaTrademarkJudgmentQuery,
} from "./cnipa-trademark-judgment";

export const CNIPA_CONNECTOR_ID = "cnipa-authenticated-worker";
export const CNIPA_CONNECTOR_VERSION = "0.6.0";
export const CNIPA_EXECUTOR: ExecutionExecutor = {
  executorId: CNIPA_CONNECTOR_ID,
  version: CNIPA_CONNECTOR_VERSION,
  mode: "PRODUCTION",
};

export interface CnipaClosableAuthenticatedSessionExecutor extends CnipaAuthenticatedSessionExecutor {
  close(): Promise<void>;
}

export interface CnipaClosableAuthenticatedHttpSessionExecutor extends CnipaAuthenticatedHttpSessionExecutor {
  close(): Promise<void>;
}

export interface CnipaAuthenticatedSessionExecutorFactory {
  create(): Promise<CnipaClosableAuthenticatedSessionExecutor>;
}

export interface CnipaAuthenticatedHttpSessionExecutorFactory {
  create(): Promise<CnipaClosableAuthenticatedHttpSessionExecutor>;
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
  const query = resolveCnipaExecutionQuery(context.job, config.query);
  const verifiedBulkDateRange =
    query.mode === "DATE_RANGE" &&
    query.documentKinds?.length === 1 &&
    (query.documentKinds[0] === "REGISTRATION_EXAMINATION" ||
      query.documentKinds[0] === "OPPOSITION_DECISION" ||
      query.documentKinds[0] === "REVIEW_ADJUDICATION");
  if (query.mode !== "REGISTRATION_NUMBER" && !verifiedBulkDateRange) {
    throw new CollectionAcquisitionError(
      "CNIPA_SCHEMA_UNVERIFIED",
      `${query.mode} collection remains disabled for this document-kind selection until authenticated raw evidence verifies its request parameters`,
      false,
    );
  }
  const limits = record(config.limits) ?? {};
  const bulkDateRange = query.mode === "DATE_RANGE";
  return {
    query,
    responseSchema: parseCnipaResponseSchemaConfig(config.responseSchema),
    pageSize: boundedInteger(
      limits.pageSize,
      bulkDateRange ? 100 : 10,
      1,
      100,
      "connectorConfig.limits.pageSize",
    ),
    maxPagesPerLibrary: boundedInteger(
      limits.maxPagesPerLibrary,
      bulkDateRange ? 50 : 10,
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

function kindSlug(documentKind: CnipaResponseEvidence["documentKind"]): string {
  return documentKind.toLowerCase().replaceAll("_", "-");
}

function rowSourceUri(sourceUri: string, sourceRecordId: string): string {
  const url = new URL(sourceUri);
  url.hash = `markorbit-cnipa-record=${encodeURIComponent(sourceRecordId)}`;
  return url.toString();
}

function projectionArtifact(
  evidence: CnipaResponseEvidence,
  rawArtifact: AcquiredCollectionArtifact,
  query: CnipaTrademarkJudgmentQuery,
  queryId: string,
  listPage: number,
): AcquiredCollectionArtifact[] {
  const materialized = materializeCnipaListPageBytes(evidence.documentKind, evidence.content);
  const parentCanonicalUri = rawArtifact.canonicalUri;
  if (!parentCanonicalUri) {
    throw new CollectionAcquisitionError(
      "CNIPA_MATERIALIZATION_FAILED",
      "CNIPA raw LIST artifact requires canonicalUri before materialization",
      false,
    );
  }

  const projection = {
    schemaVersion: `${CNIPA_LIST_FACT_PROJECTION_VERSION}-page`,
    sourceOwner: "MARKORBIT_KNOWLEDGE",
    documentKind: evidence.documentKind,
    query,
    observedAt: evidence.observedAt,
    sourceListCanonicalUri: parentCanonicalUri,
    recordCount: materialized.recordCount,
    records: materialized.records.map((record) => record.factProjection),
  };
  const slug = kindSlug(evidence.documentKind);
  const artifacts: AcquiredCollectionArtifact[] = [
    {
      artifactKind: "JSON",
      mimeType: "application/json;charset=UTF-8",
      originalName: `cnipa-${slug}-facts-${queryId}-p${listPage}.json`,
      sourceUri: evidence.sourceUri,
      canonicalUri: `cnipa://fact-projection/${evidence.documentKind}/${queryId}/page/${listPage}`,
      parentCanonicalUris: [parentCanonicalUri],
      content: new TextEncoder().encode(JSON.stringify(projection)),
    },
  ];

  for (const record of materialized.records) {
    const seed = record.documentSeed;
    if (!seed) continue;
    artifacts.push({
      artifactKind: "MARKDOWN",
      mimeType: "text/markdown;charset=UTF-8",
      originalName: `cnipa-${slug}-document-${digest(record.sourceRecordId).slice(0, 16)}.md`,
      sourceUri: rowSourceUri(evidence.sourceUri, record.sourceRecordId),
      canonicalUri: seed.logicalDocumentUri,
      parentCanonicalUris: [parentCanonicalUri],
      content: new TextEncoder().encode(seed.markdownBody),
    });
  }

  return artifacts;
}

function coverageArtifact(
  collection: Awaited<ReturnType<CnipaSourceAdapter["collect"]>>,
  queryId: string,
  pageSize: number,
  maxPagesPerLibrary: number,
  rawListCanonicalUris: readonly string[],
): AcquiredCollectionArtifact {
  const manifest = buildCnipaDateRangeCoverageManifest({
    collection,
    pageSize,
    maxPagesPerLibrary,
  });
  const slug = kindSlug(manifest.documentKind);
  const canonicalCoverageUri = `cnipa://collection-coverage/${manifest.documentKind}/${queryId}`;
  const listEvidence = collection.evidence.find(
    (evidence) =>
      evidence.documentKind === manifest.documentKind && evidence.evidenceKind === "LIST_JSON",
  );

  return {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName: `cnipa-${slug}-coverage-${queryId}.json`,
    sourceUri: listEvidence?.sourceUri ?? canonicalCoverageUri,
    canonicalUri: canonicalCoverageUri,
    parentCanonicalUris: [...rawListCanonicalUris],
    content: new TextEncoder().encode(JSON.stringify(manifest)),
  };
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
    let session: CnipaClosableAuthenticatedSessionExecutor | undefined;
    try {
      const config = sourceConfig(context);
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

      const completedSession = session;
      session = undefined;
      try {
        await completedSession.close();
      } catch {
        // The source bytes are already collected. Browser cleanup must not rewrite
        // the deterministic acquisition result or trigger source replay.
      }

      const queryId = queryIdentity(collection.query);
      const listPages = new Map<string, number>();
      const artifacts: AcquiredCollectionArtifact[] = [];
      const rawListCanonicalUris: string[] = [];

      for (const evidence of collection.evidence) {
        let listPage: number | undefined;
        if (evidence.evidenceKind === "LIST_JSON") {
          const next = (listPages.get(evidence.documentKind) ?? 0) + 1;
          listPages.set(evidence.documentKind, next);
          listPage = next;
        }

        const rawArtifact: AcquiredCollectionArtifact = {
          artifactKind: "JSON",
          mimeType: evidence.mediaType,
          originalName: originalName(evidence, queryId, listPage),
          sourceUri: evidence.sourceUri,
          canonicalUri: canonicalUri(evidence, queryId, listPage),
          content: evidence.content,
        };
        artifacts.push(rawArtifact);
        if (evidence.evidenceKind === "LIST_JSON" && rawArtifact.canonicalUri) {
          rawListCanonicalUris.push(rawArtifact.canonicalUri);
        }

        if (
          collection.query.mode === "DATE_RANGE" &&
          evidence.evidenceKind === "LIST_JSON" &&
          listPage !== undefined
        ) {
          artifacts.push(
            ...projectionArtifact(evidence, rawArtifact, collection.query, queryId, listPage),
          );
        }
      }

      if (collection.query.mode === "DATE_RANGE") {
        artifacts.push(
          coverageArtifact(
            collection,
            queryId,
            config.pageSize,
            config.maxPagesPerLibrary,
            rawListCanonicalUris,
          ),
        );
      }

      return artifacts;
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
