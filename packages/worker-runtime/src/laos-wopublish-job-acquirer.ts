import type { ExecutionExecutor } from "@markorbit/contracts";
import {
  CollectionAcquisitionError,
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
  type CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";
import {
  LAOS_CONNECTOR_ID,
  LAOS_CONNECTOR_VERSION,
  LAOS_LIST_URL,
  LAOS_SOURCE_ID,
  LaosWopublishSourceAdapter,
  laosSha256,
  type LaosObservation,
} from "./laos-wopublish-source-adapter";
import type { SourceAdapterResponse } from "./source-adapter-port";
import type { SourceAdapterRegistry } from "./source-adapter-registry";
import { buildLaosDataEngineAdmissionRequest } from "./laos-wopublish-data-engine-handoff";
import {
  buildLaosBaselineIndexPageCommit,
  type LaosBaselineIndexCheckpoint,
} from "./laos-baseline-index-stream";
import { buildLaosFullDetailArtifacts } from "./laos-wopublish-full-detail-artifacts";

export const LAOS_JOB_EXECUTOR: ExecutionExecutor = {
  executorId: LAOS_CONNECTOR_ID,
  version: LAOS_CONNECTOR_VERSION,
  mode: "PRODUCTION",
};
const encoder = new TextEncoder();
const shaPattern = /^[a-f0-9]{64}$/;
const sourceIdPattern = /^LA(?:M)?\d{3,10}$/;
const failure = (message: string) =>
  new CollectionAcquisitionError("LA_JOB_CONFIG_INVALID", message, false);

type PilotConfig = {
  mode: "PILOT_PAGE";
  page: 1 | 2;
  expectedFirstPageIdsSha256?: string;
  expectedSourceTotal?: number;
};
type DetailConfig = { mode: "DETAIL_REFRESH"; sourceRecordId: string };
type FullIndexConfig = { mode: "FULL_INDEX_BASELINE"; maxPages: number };
type FullDetailBatchConfig = {
  mode: "FULL_DETAIL_BATCH";
  batchIndex: number;
  sourceRecordIds: string[];
  sourceRecordIdsSha256: string;
};
export type LaosJobConfig = PilotConfig | DetailConfig | FullIndexConfig | FullDetailBatchConfig;
function jobConfig(context: ArtifactBackedExecutionContext): LaosJobConfig {
  const source = context.job.sourceSnapshot;
  if (
    context.job.jobType !== "WEB_CRAWL" ||
    source.sourceType !== "WEB" ||
    source.canonicalUri !== LAOS_LIST_URL ||
    source.connector.connectorId !== LAOS_CONNECTOR_ID ||
    source.connector.version !== LAOS_CONNECTOR_VERSION ||
    context.job.connector.connectorId !== LAOS_CONNECTOR_ID ||
    context.job.connector.version !== LAOS_CONNECTOR_VERSION ||
    context.job.planSnapshot.schedule?.mode !== "MANUAL"
  ) {
    throw failure("Only an explicitly manual, governed WoPublish WEB_CRAWL job is authorized");
  }
  const config = source.connectorConfig;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw failure("Source connectorConfig must be an object");
  }
  const input = config as Record<string, unknown>;
  if (input.mode === "PILOT_PAGE") {
    if (
      Object.keys(input).some(
        (key) =>
          !["mode", "page", "expectedFirstPageIdsSha256", "expectedSourceTotal"].includes(key),
      )
    ) {
      throw failure("Pilot contains unsupported configuration keys");
    }
    if (input.page !== 1 && input.page !== 2) {
      throw failure("Only pilot pages 1 and 2 are authorized");
    }
    if (input.page === 1) {
      if (
        input.expectedFirstPageIdsSha256 !== undefined ||
        input.expectedSourceTotal !== undefined
      ) {
        throw failure("Page 1 must not have a resume checkpoint");
      }
      return { mode: "PILOT_PAGE", page: 1 };
    }
    if (
      typeof input.expectedFirstPageIdsSha256 !== "string" ||
      !shaPattern.test(input.expectedFirstPageIdsSha256) ||
      !Number.isSafeInteger(input.expectedSourceTotal) ||
      (input.expectedSourceTotal as number) < 51
    ) {
      throw failure("Page 2 requires the exact page 1 checkpoint digest and total");
    }
    return {
      mode: "PILOT_PAGE",
      page: 2,
      expectedFirstPageIdsSha256: input.expectedFirstPageIdsSha256,
      expectedSourceTotal: input.expectedSourceTotal as number,
    };
  }
  if (input.mode === "DETAIL_REFRESH") {
    if (
      Object.keys(input).some((key) => !["mode", "sourceRecordId"].includes(key)) ||
      typeof input.sourceRecordId !== "string" ||
      !sourceIdPattern.test(input.sourceRecordId)
    ) {
      throw failure("Detail refresh requires exactly one WoPublish source record ID");
    }
    return { mode: "DETAIL_REFRESH", sourceRecordId: input.sourceRecordId };
  }
  if (input.mode === "FULL_INDEX_BASELINE") {
    const plan = context.job.planSnapshot;
    if (
      Object.keys(input).some((key) => !["mode", "maxPages"].includes(key)) ||
      !Number.isSafeInteger(input.maxPages) ||
      (input.maxPages as number) < 3 ||
      (input.maxPages as number) > 2_000 ||
      plan.policy?.respectRobots !== true ||
      !Number.isSafeInteger(plan.policy?.rateLimitPerMinute) ||
      plan.policy.rateLimitPerMinute < 1 ||
      plan.policy.rateLimitPerMinute > 24
    ) {
      throw failure(
        "Full index requires an explicit manual page budget and <=24/min governed policy",
      );
    }
    return { mode: "FULL_INDEX_BASELINE", maxPages: input.maxPages as number };
  }
  if (input.mode === "FULL_DETAIL_BATCH") {
    const plan = context.job.planSnapshot;
    const ids = input.sourceRecordIds;
    const digest = input.sourceRecordIdsSha256;
    if (
      Object.keys(input).some(
        (key) => !["mode", "batchIndex", "sourceRecordIds", "sourceRecordIdsSha256"].includes(key),
      ) ||
      !Number.isSafeInteger(input.batchIndex) ||
      (input.batchIndex as number) < 1 ||
      (input.batchIndex as number) > 10_000 ||
      !Array.isArray(ids) ||
      ids.length < 1 ||
      ids.length > 500 ||
      ids.some((id) => typeof id !== "string" || !sourceIdPattern.test(id)) ||
      new Set(ids).size !== ids.length ||
      typeof digest !== "string" ||
      !shaPattern.test(digest) ||
      digest !== laosSha256(encoder.encode(ids.join("\n"))) ||
      plan.policy?.respectRobots !== true ||
      !Number.isSafeInteger(plan.policy?.rateLimitPerMinute) ||
      plan.policy.rateLimitPerMinute < 1 ||
      plan.policy.rateLimitPerMinute > 24
    ) {
      throw failure(
        "Full detail batch requires 1..500 frozen IDs, their exact digest, and <=24/min policy",
      );
    }
    return {
      mode: "FULL_DETAIL_BATCH",
      batchIndex: input.batchIndex as number,
      sourceRecordIds: [...(ids as string[])],
      sourceRecordIdsSha256: digest,
    };
  }
  throw failure("Scheduled and unreviewed bulk collection modes are not admitted");
}
function requireOutput(context: ArtifactBackedExecutionContext, kinds: string[]): void {
  if (
    kinds.some((kind) => !context.job.planSnapshot.output.artifactKinds.includes(kind as never))
  ) {
    throw failure("CollectionPlan does not authorize required RawArtifact kinds");
  }
}
function jsonArtifact(
  name: string,
  canonicalUri: string,
  sourceUri: string,
  parentCanonicalUris: string[],
  value: unknown,
): AcquiredCollectionArtifact {
  return {
    artifactKind: "JSON",
    mimeType: "application/json;charset=UTF-8",
    originalName: name,
    canonicalUri,
    sourceUri,
    parentCanonicalUris,
    content: encoder.encode(JSON.stringify(value)),
  };
}
function artifactsFor(observation: LaosObservation): AcquiredCollectionArtifact[] {
  if (observation.kind === "PAGE") {
    const base = "la-dipo://wopublish/trademarks/list/page/" + observation.page;
    const rawUri = base + "/redacted-response";
    const projectionUri = base + "/source-id-projection";
    const receiptUri = base + "/resume-checkpoint";
    const raw: AcquiredCollectionArtifact = {
      artifactKind: observation.page === 1 ? "HTML" : "XML",
      mimeType: observation.mime,
      originalName:
        "la-wopublish-page-" + observation.page + (observation.page === 1 ? ".html" : ".xml"),
      sourceUri: observation.sourceUri,
      canonicalUri: rawUri,
      content: observation.redactedBody,
    };
    const projection = jsonArtifact(
      "la-wopublish-page-" + observation.page + "-ids.json",
      projectionUri,
      observation.sourceUri,
      [rawUri],
      {
        schemaVersion: "LA_WOPUBLISH_PAGE_PROJECTION_V1",
        sourceOwner: "MARKORBIT_KNOWLEDGE",
        sourceId: LAOS_SOURCE_ID,
        evidenceStatus: "UNVERIFIED_OFFICIAL_SOURCE_OBSERVATION",
        page: observation.page,
        pageSize: 50,
        sourceTotal: observation.total,
        sourceRecordIdKind: "WOPUBLISH_RECORD_ID_NOT_LEGAL_REGISTRATION_NUMBER",
        sourceRecordIds: observation.ids,
        sourceRecordIdsSha256: laosSha256(encoder.encode(observation.ids.join("\n"))),
        firstPageIdsSha256: observation.firstPageIdsSha256,
        sourceResponseSha256: observation.rawSha256,
        redactedResponseSha256: laosSha256(observation.redactedBody),
        redaction: "TRANSIENT_SESSION_VALUES_REMOVED_FROM_RAW_ARTIFACT",
        observedAt: observation.observedAt,
      },
    );
    const checkpoint = jsonArtifact(
      "la-wopublish-page-" + observation.page + "-checkpoint.json",
      receiptUri,
      observation.sourceUri,
      [projectionUri],
      {
        schemaVersion: "LA_WOPUBLISH_BOUNDED_CHECKPOINT_V1",
        sourceId: LAOS_SOURCE_ID,
        completedPage: observation.page,
        lastSourceRecordId: observation.ids.at(-1),
        firstPageIdsSha256: observation.firstPageIdsSha256,
        expectedSourceTotal: observation.total,
        nextCursor: observation.page === 1 ? "2" : null,
        sourceResponseSha256: observation.rawSha256,
        observedAt: observation.observedAt,
        fullCollectionAuthorized: false,
      },
    );
    return [
      raw,
      projection,
      checkpoint,
      buildLaosDataEngineAdmissionRequest({
        observation,
        evidenceCanonicalUri: rawUri,
        projectionCanonicalUri: projectionUri,
      }),
    ];
  }
  const base = "la-dipo://wopublish/trademarks/detail/" + observation.id;
  const rawUri = base + "/redacted-response";
  const raw: AcquiredCollectionArtifact = {
    artifactKind: "HTML",
    mimeType: observation.mime,
    originalName: "la-wopublish-" + observation.id + ".html",
    sourceUri: observation.sourceUri,
    canonicalUri: rawUri,
    content: observation.redactedBody,
  };
  const projection = jsonArtifact(
    "la-wopublish-" + observation.id + "-detail.json",
    base + "/source-projection",
    observation.sourceUri,
    [rawUri],
    {
      schemaVersion: "LA_WOPUBLISH_DETAIL_PROJECTION_V1",
      sourceOwner: "MARKORBIT_KNOWLEDGE",
      sourceId: LAOS_SOURCE_ID,
      sourceRecordId: observation.id,
      sourceRecordIdKind: "WOPUBLISH_RECORD_ID_NOT_LEGAL_REGISTRATION_NUMBER",
      evidenceStatus: "UNVERIFIED_OFFICIAL_SOURCE_OBSERVATION",
      markText: observation.markText,
      status: observation.status,
      filingDate: observation.filingDate,
      applicant: observation.applicant,
      niceClasses: observation.niceClasses,
      registrationNumber: observation.registrationNumber,
      logoUrl: observation.logoUrl,
      logoEvidence: observation.logoBytes ? "SOURCE_IMAGE_BYTES_CAPTURED" : "NO_IMAGE_CAPTURED",
      sourceResponseSha256: observation.rawSha256,
      redactedResponseSha256: laosSha256(observation.redactedBody),
      observedAt: observation.observedAt,
    },
  );
  const artifacts: AcquiredCollectionArtifact[] = [raw, projection];
  if (observation.logoBytes && observation.logoMime && observation.logoUrl) {
    artifacts.push({
      artifactKind: "IMAGE",
      mimeType: observation.logoMime,
      originalName: "la-wopublish-" + observation.id + "-logo",
      sourceUri: observation.logoUrl,
      canonicalUri: base + "/logo",
      parentCanonicalUris: [rawUri],
      content: observation.logoBytes,
    });
  }
  artifacts.push(
    buildLaosDataEngineAdmissionRequest({
      observation,
      evidenceCanonicalUri: rawUri,
      projectionCanonicalUri: base + "/source-projection",
    }),
  );
  return artifacts;
}
export type LaosWopublishAcquirerOptions = {
  /** Separately approved source-work activation, independent of the publisher and DE flags. */
  fullIndexEnabled?: boolean;
  /** Separately approved frozen-ID detail work; default false. */
  fullDetailEnabled?: boolean;
  streamAdapter?: LaosWopublishSourceAdapter;
};

/** No second acquisition store. The existing artifact-backed executor persists these artifacts. */
export class LaosWopublishJobArtifactAcquirer implements CollectionArtifactAcquirer {
  readonly executor = LAOS_JOB_EXECUTOR;
  constructor(
    private readonly registry: SourceAdapterRegistry,
    private readonly options: LaosWopublishAcquirerOptions = {},
  ) {}
  isStreamingJob(context: ArtifactBackedExecutionContext): boolean {
    const config = context.job.sourceSnapshot.connectorConfig;
    const mode =
      config !== null && typeof config === "object" && !Array.isArray(config)
        ? (config as Record<string, unknown>).mode
        : undefined;
    return (
      Boolean(this.options.streamAdapter) &&
      ((mode === "FULL_INDEX_BASELINE" && this.options.fullIndexEnabled === true) ||
        (mode === "FULL_DETAIL_BATCH" && this.options.fullDetailEnabled === true))
    );
  }
  async acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    const config = jobConfig(context);
    if (config.mode === "FULL_INDEX_BASELINE" || config.mode === "FULL_DETAIL_BATCH") {
      throw new CollectionAcquisitionError(
        "LA_FULL_BASELINE_STREAMING_REQUIRED",
        "Full Lao baseline work cannot use the pilot bulk executor or bypass source activation",
        false,
      );
    }
    requireOutput(
      context,
      config.mode === "PILOT_PAGE"
        ? ["JSON", config.page === 1 ? "HTML" : "XML"]
        : ["HTML", "JSON", "IMAGE"],
    );
    const registered = this.registry.get(LAOS_SOURCE_ID);
    if (!registered) throw failure("WoPublish adapter not registered");
    const request =
      config.mode === "PILOT_PAGE"
        ? {
            sourceId: LAOS_SOURCE_ID,
            cursor: String(config.page),
            params: {
              mode: "PAGE",
              ...(config.page === 2
                ? {
                    expectedFirstPageIdsSha256: config.expectedFirstPageIdsSha256!,
                    expectedSourceTotal: String(config.expectedSourceTotal!),
                  }
                : {}),
            },
          }
        : {
            sourceId: LAOS_SOURCE_ID,
            params: { mode: "DETAIL", sourceRecordId: config.sourceRecordId },
          };
    const result = (await registered.collect(request)) as SourceAdapterResponse<LaosObservation>;
    if (
      result.sourceId !== LAOS_SOURCE_ID ||
      result.items.length !== 1 ||
      (config.mode === "PILOT_PAGE" &&
        (result.items[0]?.kind !== "PAGE" || result.items[0].page !== config.page)) ||
      (config.mode === "DETAIL_REFRESH" &&
        (result.items[0]?.kind !== "DETAIL" || result.items[0].id !== config.sourceRecordId))
    ) {
      throw failure("Registered adapter returned an unexpected source observation");
    }
    return artifactsFor(result.items[0]!);
  }

  async *acquireBatches(
    context: ArtifactBackedExecutionContext,
  ): AsyncIterable<readonly AcquiredCollectionArtifact[]> {
    const config = jobConfig(context);
    const adapter = this.options.streamAdapter;
    if (!adapter) throw failure("Full baseline requires an explicitly activated source Worker");
    const rate = context.job.planSnapshot.policy.rateLimitPerMinute;
    const minimumIntervalMs = Math.max(2_500, Math.ceil(60_000 / rate));
    if (adapter.requestIntervalMs < minimumIntervalMs) {
      throw failure("Configured WoPublish rate exceeds the frozen CollectionPlan budget");
    }
    if (config.mode === "FULL_DETAIL_BATCH") {
      if (this.options.fullDetailEnabled !== true) {
        throw failure("Full detail requires an explicitly activated streaming source Worker");
      }
      requireOutput(context, ["HTML", "JSON", "IMAGE"]);
      for await (const detail of adapter.streamFullDetails({
        sourceRecordIds: config.sourceRecordIds,
      })) {
        yield buildLaosFullDetailArtifacts(detail);
      }
      return;
    }
    if (config.mode !== "FULL_INDEX_BASELINE" || this.options.fullIndexEnabled !== true) {
      throw failure("Full index requires an explicitly activated streaming source Worker");
    }
    requireOutput(context, ["HTML", "XML", "JSON"]);
    let committed: string[] = [];
    let lastCheckpoint: LaosBaselineIndexCheckpoint | undefined;
    for await (const page of adapter.streamFullIndex({ maxPages: config.maxPages })) {
      // The shared streaming executor admits at most 8,000 artifacts per Job.
      // A page produces four source artifacts plus one cumulative checkpoint.
      if (Math.ceil(page.total / 50) * 5 > 8_000) {
        throw failure("Official Lao index exceeds the reviewed streaming artifact budget");
      }
      const batch = buildLaosBaselineIndexPageCommit({
        page,
        committedPageIdsSha256: committed,
        pageScopedCheckpoint: true,
      });
      yield [...batch.pageArtifacts, batch.checkpointArtifact];
      // Only advance this in-memory cursor after the Worker has finalized the
      // previous batch; source iterator's next page remains suspended until then.
      committed = [...batch.checkpoint.committedPageIdsSha256];
      lastCheckpoint = batch.checkpoint;
    }
    if (!lastCheckpoint?.complete) {
      throw failure("Lao full index ended without a complete durable page checkpoint");
    }
  }
}
