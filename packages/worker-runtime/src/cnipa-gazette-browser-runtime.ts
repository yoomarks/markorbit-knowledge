import type { ExecutionReceipt, JobLease } from "@markorbit/contracts";
import {
  CollectionAcquisitionError,
  type ArtifactBackedExecutionContext,
} from "./artifact-backed-collection-executor";
import {
  assertCnipaGazetteBrowserSessionMatchesJob,
  cnipaGazetteBrowserStreamJobFromContext,
  type CnipaGazetteBrowserStreamJobConfig,
} from "./cnipa-gazette-browser-job";
import { CnipaGazetteBrowserCheckpointStream } from "./cnipa-gazette-browser-checkpoint-stream";
import {
  CnipaGazetteLoopbackServer,
  createCnipaGazetteLoopbackToken,
} from "./cnipa-gazette-loopback-server";
import { CNIPA_GAZETTE_JOB_EXECUTOR } from "./cnipa-gazette-job-acquirer";
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
  signal?: AbortSignal;
  onListening?: (details: CnipaGazetteBrowserRuntimeListening) => void | Promise<void>;
  onBackgroundError?: (error: unknown) => void;
};

type RuntimeStats = {
  rowsSeen: number;
  bytesPrepared: number;
  artifactReceiptIds: string[];
};
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

  private createServer(
    context: ArtifactBackedExecutionContext,
    jobConfig: CnipaGazetteBrowserStreamJobConfig,
    stats: RuntimeStats,
    completion: ReturnType<typeof deferred<void>>,
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
          const stream = new CnipaGazetteBrowserCheckpointStream(
            session,
            new StreamingArtifactWriter(context, this.client),
            { targetLogicalPagesPerCheckpoint: jobConfig.targetLogicalPagesPerCheckpoint },
          );
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

      server = this.createServer(context, jobConfig, stats, completion);
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
