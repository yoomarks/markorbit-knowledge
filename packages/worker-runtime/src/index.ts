import { createHash } from "node:crypto";
import {
  type ExecutionExecutor,
  type ExecutionReceipt,
  type Job,
  type JobLease,
} from "@markorbit/contracts";

export { ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION } from "@markorbit/contracts";
export type {
  AcquisitionRunEvidence,
  ExecutionReceipt,
  Job,
  RunLesson,
} from "@markorbit/contracts";

export * from "./acquisition-learning-profile";
export * from "./conversion-fixture";
export * from "./controlled-fixture-pipeline";
export * from "./production-markdown-staging";
export * from "./production-document-normalization";
export * from "./local-document-extraction";
export * from "./http-production-conversion-client";
export * from "./production-conversion-worker-runtime";
export * from "./runtime-runner";
export * from "./artifact-ingestion-port";
export * from "./artifact-backed-collection-executor";
export * from "./crawl4ai-subprocess-acquirer";
export * from "./api-acquirer";
export * from "./conditional-http-change-watch";
export * from "./public-network-policy";
export * from "./rss-acquirer";
export * from "./github-acquirer";
export * from "./http-controlled-collection-client";
export * from "./http-acquisition-intelligence-client";
export * from "./controlled-collection-worker-runtime";
export * from "./local-folder-acquirer";
export * from "./local-file-connector";
export * from "./source-connector-port";
export * from "./http-source-connector";
export * from "./collection-scheduler-port";
export * from "./memory-collection-scheduler";
export * from "./scheduled-collection-dispatcher";
export * from "./collection-job-runner";
export * from "./collection-queue-consumer";
export * from "./collection-worker-loop";
export * from "./collection-job-lease-manager";
export * from "./worker-concurrency-controller";
export * from "./worker-crash-recovery-manager";
export * from "./worker-heartbeat-manager";
export * from "./source-discovery-runner";
export * from "./source-collection-flow";
export * from "./discovery-candidate-intelligence";
export * from "./source-intelligence-evaluator";
export * from "./source-intelligence-observation";
export * from "./source-intelligence-cross-source-observation";
export * from "./source-intelligence-review-queue";
export * from "./source-intelligence-review-health";
export * from "./source-intelligence-review-ownership";
export * from "./source-intelligence-assignment-health";
export * from "./source-intelligence-manual-sla";
export * from "./source-intelligence-policy-scope";
export * from "./source-intelligence-policy-audit";
export * from "./source-intelligence-policy-audit-query";
export * from "./source-intelligence-historical-policy-resolution";
export * from "./source-intelligence-historical-policy-comparison";
export * from "./http-website-discovery-provider";
export * from "./expanding-website-discovery-provider";
export * from "./core-intake-adapter";
export * from "./intake-pipeline-orchestrator";
export * from "./ready-package-builder";
export * from "./persistence-adapter-port";
export * from "./memory-persistence-adapter";
export * from "./queue-execution-port";
export * from "./memory-queue-execution";
export * from "./retry-policy-port";
export * from "./exponential-retry-policy";
export * from "./failure-recovery-orchestrator";
export * from "./observability-port";
export * from "./external-connector-port";
export * from "./memory-external-connector";
export * from "./http-external-connector";
export * from "./rate-limit-policy-port";
export * from "./auth-provider-port";
export * from "./memory-auth-provider";
export * from "./connector-request-middleware";
export * from "./connector-retry-middleware";
export * from "./source-adapter-port";
export * from "./source-registry";
export * from "./source-metadata-schema";
export * from "./source-adapter-registry";
export * from "./uspto-source-adapter";
export * from "./wipo-source-adapter";
export * from "./cnipa-source-adapter";
export * from "./source-capability-matrix";
export * from "./source-config-registry";
export * from "./source-parser-port";
export * from "./source-normalizer-port";
export * from "./uspto-source-parser";
export * from "./uspto-source-normalizer";
export * from "./uspto-pipeline-runner";
export * from "./raw-artifact-schema";
export * from "./artifact-storage-port";
export * from "./memory-artifact-storage";

export const FIXTURE_EXECUTOR: ExecutionExecutor = {
  executorId: "fixture-connector-runtime",
  version: "1.0.0",
  mode: "FIXTURE",
};
export type FixtureExecutionScenario =
  "SUCCESS" | "FAIL_AFTER_START" | "FAIL_DURING_UPLOAD" | "FAIL_DURING_VERIFY";
export type ClaimedExecutionContext = { workerId: string; job: Job; lease: JobLease };
export interface WorkerExecutionClient {
  start(context: ClaimedExecutionContext, executor: ExecutionExecutor, key: string): Promise<void>;
  uploading(context: ClaimedExecutionContext, key: string): Promise<void>;
  verifying(context: ClaimedExecutionContext, key: string): Promise<void>;
  complete(context: ClaimedExecutionContext, receipt: ExecutionReceipt, key: string): Promise<void>;
  fail(
    context: ClaimedExecutionContext,
    failure: { code: string; message: string; retryable: boolean },
    key: string,
  ): Promise<void>;
}

export interface FixtureExecutionResult {
  receipt: ExecutionReceipt;
  idempotencyKeys: string[];
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildFixtureExecutionReceipt(context: ClaimedExecutionContext): ExecutionReceipt {
  const binary = sha256(`binary:${context.job.id}:${context.job.input.uri}`);
  const content = sha256(`content:${context.job.id}:${context.job.input.uri}`);
  return {
    schemaVersion: "1.0",
    objectType: "EXECUTION_RECEIPT",
    runId: context.job.runId,
    jobId: context.job.id,
    leaseId: context.lease.id,
    workerId: context.workerId,
    executor: FIXTURE_EXECUTOR,
    artifactsPrepared: 1,
    bytesPrepared: Buffer.byteLength(context.job.input.uri, "utf8"),
    artifactDigests: [
      {
        artifactKind: context.job.output.artifactKinds[0] ?? "HTML",
        binaryHash: { algorithm: "SHA-256", value: binary },
        contentHash: { algorithm: "SHA-256", value: content },
      },
    ],
    capture: {
      startedAt: context.lease.leasedAt,
      completedAt: new Date().toISOString(),
    },
    extensions: {
      "x-markorbit-fixture": true,
    },
  };
}

function idempotencyKey(context: ClaimedExecutionContext, transition: string): string {
  return `${context.lease.id}:${transition}`;
}

export async function executeFixtureLease(
  client: WorkerExecutionClient,
  context: ClaimedExecutionContext,
  scenario: FixtureExecutionScenario = "SUCCESS",
): Promise<FixtureExecutionResult> {
  const keys: string[] = [];
  const runTransition = async (
    transition: string,
    operation: (key: string) => Promise<void>,
  ): Promise<void> => {
    const key = idempotencyKey(context, transition);
    keys.push(key);
    await operation(key);
  };

  await runTransition("start", (key) => client.start(context, FIXTURE_EXECUTOR, key));
  if (scenario === "FAIL_AFTER_START") {
    await runTransition("fail", (key) =>
      client.fail(
        context,
        { code: "FIXTURE_FAIL_AFTER_START", message: "Fixture failure after start", retryable: true },
        key,
      ),
    );
    return { receipt: buildFixtureExecutionReceipt(context), idempotencyKeys: keys };
  }

  await runTransition("uploading", (key) => client.uploading(context, key));
  if (scenario === "FAIL_DURING_UPLOAD") {
    await runTransition("fail", (key) =>
      client.fail(
        context,
        { code: "FIXTURE_FAIL_DURING_UPLOAD", message: "Fixture upload failure", retryable: true },
        key,
      ),
    );
    return { receipt: buildFixtureExecutionReceipt(context), idempotencyKeys: keys };
  }

  await runTransition("verifying", (key) => client.verifying(context, key));
  if (scenario === "FAIL_DURING_VERIFY") {
    await runTransition("fail", (key) =>
      client.fail(
        context,
        { code: "FIXTURE_FAIL_DURING_VERIFY", message: "Fixture verify failure", retryable: false },
        key,
      ),
    );
    return { receipt: buildFixtureExecutionReceipt(context), idempotencyKeys: keys };
  }

  const receipt = buildFixtureExecutionReceipt(context);
  await runTransition("complete", (key) => client.complete(context, receipt, key));
  return { receipt, idempotencyKeys: keys };
}
