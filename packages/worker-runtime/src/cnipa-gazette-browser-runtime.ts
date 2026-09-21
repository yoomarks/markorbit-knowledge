import type { ExecutionReceipt, JobLease } from "@markorbit/contracts";
import {
  CollectionAcquisitionError,
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
} from "./artifact-backed-collection-executor";
import {
  assertCnipaGazetteBrowserSessionMatchesJob,
  cnipaGazetteBrowserStreamJobFromContext,
  type CnipaGazetteBrowserStreamJobConfig,
} from "./cnipa-gazette-browser-job";
import { CnipaGazetteBrowserCheckpointStream } from "./cnipa-gazette-browser-checkpoint-stream";
import {
  buildCnipaGazetteBrowserSourcePageEvidence,
  CNIPA_GAZETTE_BROWSER_LOGICAL_PAGE_EVIDENCE_SCHEMA,
  CNIPA_GAZETTE_BROWSER_SOURCE_PAGE_EVIDENCE_SCHEMA,
  CNIPA_GAZETTE_BROWSER_STREAM_STATE_ARTIFACT_SCHEMA,
  type CnipaGazetteBrowserSourcePageEvidence,
} from "./cnipa-gazette-browser-stream-artifacts";
import {
  createCnipaGazetteBrowserStreamSession,
  parseCnipaGazetteBrowserStreamState,
  rebindCnipaGazetteBrowserStreamState,
  type CnipaGazetteBrowserLogicalPage,
  type CnipaGazetteBrowserStreamSession,
  type CnipaGazetteBrowserStreamState,
} from "./cnipa-gazette-browser-stream";
import {
  CnipaGazetteLoopbackServer,
  createCnipaGazetteLoopbackToken,
} from "./cnipa-gazette-loopback-server";
import { buildCnipaGazetteCheckpoint } from "./cnipa-gazette-checkpoint-runtime";
import { CNIPA_GAZETTE_JOB_EXECUTOR } from "./cnipa-gazette-job-acquirer";
import type { CnipaGazetteDurableArtifactReader } from "./cnipa-gazette-fact-admission-job-acquirer";
import type { ControlledCollectionWorkerClient } from "./controlled-collection-worker-runtime";
import {
  StreamingArtifactWriter,
  type StreamingArtifactWriteResult,
} from "./streaming-artifact-writer";

export type CnipaGazetteBrowserRuntimeListening = {
  host: "127.0.0.1";
  port: number;
  baseUrl: string;
  bridgeToken: string;
  extensionOrigin: string;
  announcementIssue: number;
  jobId: string;
  maxRuntimeSeconds: number;
};

export type CnipaGazetteBrowserRuntimeResult = {
  listening: CnipaGazetteBrowserRuntimeListening;
  receipt: ExecutionReceipt;
};

export type CnipaGazetteBrowserRuntimeOptions = {
  extensionOrigin: string;
  port?: number;
  runtimeVersion?: string;
  keepAliveIntervalMs?: number;
  bridgeToken?: string;
  durableArtifactReader?: CnipaGazetteDurableArtifactReader;
  signal?: AbortSignal;
  onListening?: (details: CnipaGazetteBrowserRuntimeListening) => void | Promise<void>;
  onBackgroundError?: (error: unknown) => void;
};

type RuntimeStats = {
  rowsSeen: number;
  bytesPrepared: number;
  artifactReceiptIds: string[];
};

type PreparedBrowserResume = {
  priorSession: CnipaGazetteBrowserStreamSession;
  priorState: CnipaGazetteBrowserStreamState;
  logicalPages: readonly CnipaGazetteBrowserLogicalPage[];
  firstSourceRaw: AcquiredCollectionArtifact;
  firstSourceObservedAt: string;
  knownDurableParents: readonly { canonicalUri: string; artifactId: string }[];
};

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function jsonArtifact(
  artifact: AcquiredCollectionArtifact,
  label: string,
): Record<string, unknown> {
  if (artifact.artifactKind !== "JSON" || artifact.content.byteLength === 0) {
    throw new TypeError(`${label} must be a non-empty JSON RawArtifact`);
  }
  try {
    return recordValue(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(artifact.content)),
      label,
    );
  } catch (error) {
    if (error instanceof TypeError) throw error;
    throw new TypeError(`${label} must contain valid UTF-8 JSON`);
  }
}

function requiredInteger(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${label} must be an integer >= ${minimum}`);
  }
  return value;
}

function requiredIso(value: unknown, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${label} must be ISO-8601`);
  }
  return value;
}

function parseResumeStateArtifact(artifact: AcquiredCollectionArtifact): {
  session: CnipaGazetteBrowserStreamSession;
  state: CnipaGazetteBrowserStreamState;
} {
  const root = jsonArtifact(artifact, "resume state artifact");
  if (root.schemaVersion !== CNIPA_GAZETTE_BROWSER_STREAM_STATE_ARTIFACT_SCHEMA) {
    throw new TypeError("resume state artifact schema mismatch");
  }
  const rawSession = recordValue(root.session, "resume state session");
  const session = createCnipaGazetteBrowserStreamSession({
    sessionId: String(rawSession.sessionId ?? ""),
    announcementIssue: requiredInteger(rawSession.announcementIssue, "resume announcementIssue", 1),
    sourceUrl: String(rawSession.sourceUrl ?? ""),
    capturedQuery: rawSession.capturedQuery,
    sourceTotal: requiredInteger(rawSession.sourceTotal, "resume sourceTotal", 0),
    sourcePages: requiredInteger(rawSession.sourcePages, "resume sourcePages", 1),
    announcementDate:
      rawSession.announcementDate === null ? null : String(rawSession.announcementDate ?? ""),
    startedAt: String(rawSession.startedAt ?? ""),
  });
  const state = parseCnipaGazetteBrowserStreamState(root.state, session);
  const expectedCanonical =
    `cnipa://trademark-gazette/issue/${session.announcementIssue}` +
    `/browser-stream/${state.sessionFingerprintSha256}/state`;
  if (artifact.canonicalUri !== expectedCanonical) {
    throw new TypeError("resume state artifact canonicalUri mismatch");
  }
  return { session, state };
}

function parseResumeLogicalPage(
  artifact: AcquiredCollectionArtifact,
  session: CnipaGazetteBrowserStreamSession,
): CnipaGazetteBrowserLogicalPage {
  const root = jsonArtifact(artifact, "resume logical projection");
  if (root.schemaVersion !== CNIPA_GAZETTE_BROWSER_LOGICAL_PAGE_EVIDENCE_SCHEMA) {
    throw new TypeError("resume logical projection schema mismatch");
  }
  const page = recordValue(root.page, "resume logical projection page");
  if (!Array.isArray(page.rows) || !Array.isArray(root.sourcePageIndices)) {
    throw new TypeError("resume logical projection rows/provenance must be arrays");
  }
  const pageIndex = requiredInteger(page.pageIndex, "resume logical pageIndex", 1);
  const pageSize = requiredInteger(page.pageSize, "resume logical pageSize", 1);
  if (pageSize !== 100) throw new TypeError("resume logical pageSize must equal 100");
  const sourcePageIndices = root.sourcePageIndices.map((value, index) =>
    requiredInteger(value, `resume sourcePageIndices[${index}]`, 1),
  );
  const logical: CnipaGazetteBrowserLogicalPage = {
    pageIndex,
    pageSize: 100,
    sourceTotal: requiredInteger(page.sourceTotal, "resume logical sourceTotal", 0),
    sourcePages: requiredInteger(page.sourcePages, "resume logical sourcePages", 1),
    announcementDate: page.announcementDate === null ? null : String(page.announcementDate ?? ""),
    rows: page.rows as CnipaGazetteBrowserLogicalPage["rows"],
    sourcePageIndices,
    observedAt: requiredIso(root.observedAt, "resume logical observedAt"),
  };
  buildCnipaGazetteCheckpoint({
    announcementIssue: session.announcementIssue,
    range: { startPage: pageIndex, endPage: pageIndex },
    pages: [logical],
  });
  if (
    logical.sourceTotal !== session.sourceTotal ||
    logical.announcementDate !== session.announcementDate ||
    sourcePageIndices.length === 0 ||
    sourcePageIndices.some((value) => value > session.sourcePages) ||
    artifact.canonicalUri !==
      `cnipa://trademark-gazette/issue/${session.announcementIssue}/list/page/${pageIndex}/projection`
  ) {
    throw new TypeError("resume logical projection does not match durable session");
  }
  return logical;
}

function parseFirstSourceObservedAt(
  artifact: AcquiredCollectionArtifact,
  session: CnipaGazetteBrowserStreamSession,
): string {
  const root = jsonArtifact(artifact, "resume source page 1 projection");
  if (root.schemaVersion !== CNIPA_GAZETTE_BROWSER_SOURCE_PAGE_EVIDENCE_SCHEMA) {
    throw new TypeError("resume source page 1 projection schema mismatch");
  }
  const sourcePage = recordValue(root.sourcePage, "resume source page 1");
  if (
    requiredInteger(sourcePage.sourcePageIndex, "resume sourcePageIndex", 1) !== 1 ||
    requiredInteger(sourcePage.sourcePageSize, "resume sourcePageSize", 1) !==
      session.sourcePageSize ||
    requiredInteger(sourcePage.sourceTotal, "resume sourceTotal", 0) !== session.sourceTotal ||
    requiredInteger(sourcePage.sourcePages, "resume sourcePages", 1) !== session.sourcePages ||
    (sourcePage.announcementDate === null ? null : String(sourcePage.announcementDate ?? "")) !==
      session.announcementDate
  ) {
    throw new TypeError("resume source page 1 projection does not match durable session");
  }
  const expected =
    `cnipa://trademark-gazette/issue/${session.announcementIssue}` +
    `/browser-source/page-size/${session.sourcePageSize}/page/1/projection`;
  if (artifact.canonicalUri !== expected) {
    throw new TypeError("resume source page 1 projection canonicalUri mismatch");
  }
  return requiredIso(sourcePage.observedAt, "resume source page 1 observedAt");
}

function extensionOrigin(value: string): string {
  const normalized = value.trim();
  if (!/^chrome-extension:\/\/[a-p]{32}$/u.test(normalized)) {
    throw new TypeError(
      "extensionOrigin must be an explicit chrome-extension://<32-char-id> origin",
    );
  }
  return normalized;
}

function positiveInteger(value: number, label: string, minimum = 1): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${label} must be a safe integer >= ${minimum}`);
  }
  return value;
}

function failureFrom(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error instanceof CollectionAcquisitionError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  return {
    code: "CNIPA_GAZETTE_BROWSER_STREAM_FAILED",
    message: error instanceof Error ? error.message : "CNIPA Gazette browser stream failed",
    retryable: false,
  };
}

function addWrite(stats: RuntimeStats, result: StreamingArtifactWriteResult): void {
  if (result.reused) return;
  stats.bytesPrepared += result.sizeBytes;
  if (result.receipt?.id) stats.artifactReceiptIds.push(result.receipt.id);
}

function addCommitWrites(
  stats: RuntimeStats,
  commit: Awaited<ReturnType<CnipaGazetteBrowserCheckpointStream["acceptSourcePage"]>>,
): void {
  addWrite(stats, commit.rawArtifact);
  addWrite(stats, commit.sourceProjectionArtifact);
  addWrite(stats, commit.stateArtifact);
  for (const item of commit.logicalProjectionArtifacts) addWrite(stats, item);
  if (commit.checkpoint) {
    addWrite(stats, commit.checkpoint.checkpointArtifact);
    addWrite(stats, commit.checkpoint.datasetIdentityArtifact);
    addWrite(stats, commit.checkpoint.chunkRequestArtifact);
  }
  stats.rowsSeen = commit.state.rowsSeen;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function abortPromise(signal: AbortSignal | undefined): {
  promise: Promise<never>;
  cancel: () => void;
} {
  if (!signal) {
    return { promise: new Promise<never>(() => undefined), cancel: () => undefined };
  }
  let listener: (() => void) | undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    const rejectAbort = () =>
      reject(
        new CollectionAcquisitionError(
          "CNIPA_GAZETTE_BROWSER_STREAM_ABORTED",
          "CNIPA Gazette browser stream was aborted by the operator/runtime",
          true,
        ),
      );
    if (signal.aborted) {
      rejectAbort();
      return;
    }
    listener = rejectAbort;
    signal.addEventListener("abort", listener, { once: true });
  });
  return {
    promise,
    cancel: () => {
      if (listener) signal.removeEventListener("abort", listener);
    },
  };
}

function timeoutPromise(seconds: number): { promise: Promise<never>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new CollectionAcquisitionError(
          "CNIPA_GAZETTE_BROWSER_STREAM_TIMEOUT",
          `CNIPA Gazette browser stream exceeded frozen maxRuntimeSeconds=${seconds}`,
          true,
        ),
      );
    }, seconds * 1000);
  });
  return {
    promise,
    cancel: () => {
      if (timer) clearTimeout(timer);
    },
  };
}

export class CnipaGazetteBrowserRuntime {
  private readonly runtimeVersion: string;
  private readonly keepAliveIntervalMs: number;
  private readonly allowedOrigin: string;
  private readonly requestedPort: number;
  private readonly bridgeToken: string;

  constructor(
    private readonly client: ControlledCollectionWorkerClient,
    private readonly options: CnipaGazetteBrowserRuntimeOptions,
  ) {
    this.allowedOrigin = extensionOrigin(options.extensionOrigin);
    this.runtimeVersion = options.runtimeVersion ?? "1.0.0-cnipa-gazette-browser";
    this.keepAliveIntervalMs = positiveInteger(
      options.keepAliveIntervalMs ?? 30_000,
      "keepAliveIntervalMs",
      1_000,
    );
    this.requestedPort = options.port ?? 0;
    if (
      !Number.isSafeInteger(this.requestedPort) ||
      this.requestedPort < 0 ||
      this.requestedPort > 65_535
    ) {
      throw new TypeError("port must be an integer from 0 to 65535");
    }
    this.bridgeToken = options.bridgeToken ?? createCnipaGazetteLoopbackToken();
  }
  private startKeepAlive(lease: JobLease, leaseToken: string): () => void {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pulse = async () => {
      if (stopped) return;
      try {
        await this.client.renewLease(lease.id, leaseToken);
        await this.client.heartbeat(this.runtimeVersion, [lease.id]);
      } catch (error) {
        this.options.onBackgroundError?.(error);
      } finally {
        if (!stopped) timer = setTimeout(pulse, this.keepAliveIntervalMs);
      }
    };
    timer = setTimeout(pulse, this.keepAliveIntervalMs);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }

  private async loadPreparedResume(
    context: ArtifactBackedExecutionContext,
    jobConfig: CnipaGazetteBrowserStreamJobConfig,
  ): Promise<PreparedBrowserResume | null> {
    if (!jobConfig.resumeFrom) return null;
    const reader = this.options.durableArtifactReader;
    if (!reader) {
      throw new TypeError("browser Gazette resume requires a durable artifact reader");
    }
    const refs = jobConfig.resumeFrom;
    const tailSourceProjectionArtifactIds = refs.tailSourceProjectionArtifactIds ?? [];
    const [
      stateArtifact,
      logicalArtifacts,
      firstSourceRaw,
      firstSourceProjection,
      previousSourceProjection,
      tailSourceProjections,
    ] = await Promise.all([
      reader.read(refs.stateArtifactId, context),
      Promise.all(
        refs.logicalProjectionArtifactIds.map((artifactId) => reader.read(artifactId, context)),
      ),
      reader.read(refs.firstSourceRawArtifactId, context),
      reader.read(refs.firstSourceProjectionArtifactId, context),
      reader.read(refs.previousSourceProjectionArtifactId, context),
      Promise.all(
        tailSourceProjectionArtifactIds.map((artifactId) => reader.read(artifactId, context)),
      ),
    ]);
    const parsed = parseResumeStateArtifact(stateArtifact);
    assertCnipaGazetteBrowserSessionMatchesJob(parsed.session, jobConfig);
    const logicalPages = logicalArtifacts
      .map((artifact) => parseResumeLogicalPage(artifact, parsed.session))
      .sort((left, right) => left.pageIndex - right.pageIndex);
    if (
      new Set(logicalPages.map((page) => page.pageIndex)).size !== logicalPages.length ||
      logicalPages.length !== parsed.state.nextLogicalPageIndex - 1
    ) {
      throw new TypeError("resume logical projection refs do not cover durable logical progress");
    }
    const expectedRaw =
      `cnipa://trademark-gazette/issue/${parsed.session.announcementIssue}` +
      `/browser-source/page-size/${parsed.session.sourcePageSize}/page/1/raw`;
    if (firstSourceRaw.canonicalUri !== expectedRaw) {
      throw new TypeError("resume source page 1 raw canonicalUri mismatch");
    }
    const previousSourcePageIndex = parsed.state.nextSourcePageIndex - 1;
    const expectedPreviousProjection =
      `cnipa://trademark-gazette/issue/${parsed.session.announcementIssue}` +
      `/browser-source/page-size/${parsed.session.sourcePageSize}` +
      `/page/${previousSourcePageIndex}/projection`;
    if (previousSourceProjection.canonicalUri !== expectedPreviousProjection) {
      throw new TypeError("resume previous source projection canonicalUri mismatch");
    }
    const tailSourcePageIndices = [...new Set(parsed.state.tailSourcePageIndices)].sort(
      (left, right) => left - right,
    );
    if (tailSourceProjectionArtifactIds.length > 0) {
      if (
        tailSourceProjectionArtifactIds.length !== tailSourcePageIndices.length ||
        tailSourceProjections.length !== tailSourcePageIndices.length
      ) {
        throw new TypeError(
          "resume tail source projection refs do not cover durable tail provenance",
        );
      }
      for (let index = 0; index < tailSourceProjections.length; index += 1) {
        const pageIndex = tailSourcePageIndices[index]!;
        const expected =
          `cnipa://trademark-gazette/issue/${parsed.session.announcementIssue}` +
          `/browser-source/page-size/${parsed.session.sourcePageSize}` +
          `/page/${pageIndex}/projection`;
        if (tailSourceProjections[index]!.canonicalUri !== expected) {
          throw new TypeError(
            "resume tail source projection canonicalUri does not match durable tail provenance",
          );
        }
      }
      if (
        tailSourceProjectionArtifactIds[tailSourceProjectionArtifactIds.length - 1] !==
        refs.previousSourceProjectionArtifactId
      ) {
        throw new TypeError(
          "resume previous source projection must equal the final durable tail projection",
        );
      }
    } else if (
      tailSourcePageIndices.length !== 1 ||
      tailSourcePageIndices[0] !== previousSourcePageIndex
    ) {
      throw new TypeError(
        "resume with multi-page durable tail requires tailSourceProjectionArtifactIds",
      );
    }
    const firstSourceObservedAt = parseFirstSourceObservedAt(firstSourceProjection, parsed.session);
    return {
      priorSession: parsed.session,
      priorState: parsed.state,
      logicalPages,
      firstSourceRaw,
      firstSourceObservedAt,
      knownDurableParents: [
        {
          canonicalUri: firstSourceRaw.canonicalUri!,
          artifactId: refs.firstSourceRawArtifactId,
        },
        {
          canonicalUri: firstSourceProjection.canonicalUri!,
          artifactId: refs.firstSourceProjectionArtifactId,
        },
        ...(tailSourceProjections.length > 0
          ? tailSourceProjections.map((artifact, index) => ({
              canonicalUri: artifact.canonicalUri!,
              artifactId: tailSourceProjectionArtifactIds[index]!,
            }))
          : [
              {
                canonicalUri: previousSourceProjection.canonicalUri!,
                artifactId: refs.previousSourceProjectionArtifactId,
              },
            ]),
        ...logicalArtifacts.map((artifact, index) => ({
          canonicalUri: artifact.canonicalUri!,
          artifactId: refs.logicalProjectionArtifactIds[index]!,
        })),
      ],
    };
  }

  private createServer(
    context: ArtifactBackedExecutionContext,
    jobConfig: CnipaGazetteBrowserStreamJobConfig,
    stats: RuntimeStats,
    completion: ReturnType<typeof deferred<void>>,
    resume: PreparedBrowserResume | null,
  ): CnipaGazetteLoopbackServer {
    let streamCreated = false;
    return new CnipaGazetteLoopbackServer({
      bridgeToken: this.bridgeToken,
      allowedExtensionOrigins: [this.allowedOrigin],
      maxSessions: 1,
      createStream: (session) => {
        try {
          if (streamCreated) {
            throw new TypeError(
              "this governed browser-stream Job permits one browser session only",
            );
          }
          assertCnipaGazetteBrowserSessionMatchesJob(session, jobConfig);
          streamCreated = true;
          let resumeInput:
            | {
                state: CnipaGazetteBrowserStreamState;
                logicalPages: readonly CnipaGazetteBrowserLogicalPage[];
                firstSourcePageEvidence: CnipaGazetteBrowserSourcePageEvidence;
              }
            | undefined;
          if (resume) {
            const state = rebindCnipaGazetteBrowserStreamState({
              priorSession: resume.priorSession,
              priorState: resume.priorState,
              session,
            });
            const firstSourcePageEvidence = buildCnipaGazetteBrowserSourcePageEvidence({
              session,
              requestedPageIndex: 1,
              observedAt: resume.firstSourceObservedAt,
              httpStatus: 200,
              rawBody: resume.firstSourceRaw.content,
              contentType: resume.firstSourceRaw.mimeType,
            });
            resumeInput = {
              state,
              logicalPages: resume.logicalPages,
              firstSourcePageEvidence,
            };
            stats.rowsSeen = state.rowsSeen;
          }
          const writer = new StreamingArtifactWriter(context, this.client);
          for (const parent of resume?.knownDurableParents ?? []) {
            writer.remember(parent.canonicalUri, parent.artifactId);
          }
          const stream = new CnipaGazetteBrowserCheckpointStream(session, writer, {
            targetLogicalPagesPerCheckpoint: jobConfig.targetLogicalPagesPerCheckpoint,
            ...(resumeInput ? { resume: resumeInput } : {}),
          });
          return {
            checkpointPlans: () => stream.checkpointPlans(),
            snapshot: () => stream.snapshot(),
            acceptSourcePage: async (input) => {
              try {
                const result = await stream.acceptSourcePage(input);
                addCommitWrites(stats, result);
                if (result.completed) completion.resolve();
                return result;
              } catch (error) {
                completion.reject(error);
                throw error;
              }
            },
          };
        } catch (error) {
          completion.reject(error);
          throw error;
        }
      },
    });
  }
  async run(jobId: string): Promise<CnipaGazetteBrowserRuntimeResult> {
    const normalizedJobId = jobId.trim();
    if (!/^job_[0-9A-HJKMNP-TV-Z]{26}$/u.test(normalizedJobId)) {
      throw new TypeError("jobId must satisfy the Schema v1 Job id format");
    }

    await this.client.heartbeat(this.runtimeVersion, []);
    const claim = await this.client.claim(normalizedJobId);
    if (!claim.job || !claim.lease || !claim.leaseToken || claim.job.id !== normalizedJobId) {
      throw new CollectionAcquisitionError(
        "CNIPA_GAZETTE_BROWSER_JOB_NOT_CLAIMED",
        "the requested governed Gazette browser-stream Job could not be claimed",
        true,
      );
    }

    const context: ArtifactBackedExecutionContext = {
      workerId: this.client.workerId,
      job: claim.job,
      lease: claim.lease,
      leaseToken: claim.leaseToken,
    };
    const jobConfig = cnipaGazetteBrowserStreamJobFromContext(context);
    const prefix = `cnipa-gazette-browser-${claim.lease.id}`;
    const stats: RuntimeStats = { rowsSeen: 0, bytesPrepared: 0, artifactReceiptIds: [] };
    let started = false;
    let server: CnipaGazetteLoopbackServer | null = null;
    const stopKeepAlive = this.startKeepAlive(claim.lease, claim.leaseToken);
    const completion = deferred<void>();
    const timeout = timeoutPromise(jobConfig.maxRuntimeSeconds);
    const abort = abortPromise(this.options.signal);

    try {
      await this.client.heartbeat(this.runtimeVersion, [claim.lease.id]);
      await this.client.start(context, CNIPA_GAZETTE_JOB_EXECUTOR, `${prefix}-start`);
      started = true;
      await this.client.uploading(context, `${prefix}-uploading`);
      const resume = await this.loadPreparedResume(context, jobConfig);

      server = this.createServer(context, jobConfig, stats, completion, resume);
      const address = await server.listen(this.requestedPort);
      const listening: CnipaGazetteBrowserRuntimeListening = {
        ...address,
        bridgeToken: this.bridgeToken,
        extensionOrigin: this.allowedOrigin,
        announcementIssue: jobConfig.announcementIssue,
        jobId: normalizedJobId,
        maxRuntimeSeconds: jobConfig.maxRuntimeSeconds,
      };
      if (this.options.onListening) await this.options.onListening(listening);

      await Promise.race([completion.promise, timeout.promise, abort.promise]);
      await this.client.verifying(context, `${prefix}-verifying`);
      const receipt: ExecutionReceipt = {
        executor: CNIPA_GAZETTE_JOB_EXECUTOR,
        outputKinds: ["JSON"],
        itemsObserved: stats.rowsSeen,
        bytesPrepared: stats.bytesPrepared,
        metadataOnly: false,
        artifactReceiptIds: [...new Set(stats.artifactReceiptIds)],
        summary:
          `Normal-browser CNIPA Gazette issue ${jobConfig.announcementIssue} streamed ` +
          `${stats.rowsSeen} official row(s) through durable checkpoint evidence; ` +
          "Data Engine mutation was not performed by this Job.",
      };
      await this.client.complete(context, receipt, `${prefix}-complete`);
      return { listening, receipt };
    } catch (error) {
      if (started) {
        try {
          await this.client.fail(context, failureFrom(error), `${prefix}-fail`);
        } catch (failureError) {
          this.options.onBackgroundError?.(failureError);
        }
      }
      throw error;
    } finally {
      timeout.cancel();
      abort.cancel();
      stopKeepAlive();
      if (server) {
        try {
          await server.close();
        } catch (error) {
          this.options.onBackgroundError?.(error);
        }
      }
      try {
        await this.client.heartbeat(this.runtimeVersion, []);
      } catch (error) {
        this.options.onBackgroundError?.(error);
      }
    }
  }
}
