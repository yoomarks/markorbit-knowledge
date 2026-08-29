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
  SourceFingerprint,
} from "@markorbit/contracts";

export * from "./acquisition-learning-profile";
export * from "./conversion-fixture";
export * from "./controlled-fixture-pipeline";
export * from "./production-markdown-staging";
export * from "./production-document-normalization";
export * from "./local-document-extraction";
export * from "./http-production-conversion-client";
export * from "./production-conversion-worker-runtime";
export * from "./artifact-ingestion-port";
export * from "./artifact-backed-collection-executor";
export * from "./crawl4ai-subprocess-acquirer";
export * from "./bright-data-fallback-acquirer";
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
export * from "./source-discovery-runner";
export * from "./source-collection-flow";
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
export * from "./tavily-website-discovery-provider";
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
export interface ConnectorExecutor {
  readonly executor: ExecutionExecutor;
  execute(
    context: ClaimedExecutionContext,
    client: WorkerExecutionClient,
    scenario?: FixtureExecutionScenario,
  ): Promise<ExecutionReceipt | null>;
}
function deterministicNumber(jobId: string, offset: number, modulo: number): number {
  const digest = createHash("sha256").update(`${jobId}:${offset}`).digest();
  return digest.readUInt32BE(0) % modulo;
}
function fixtureReceipt(job: Job): ExecutionReceipt {
  return {
    executor: FIXTURE_EXECUTOR,
    outputKinds: [...job.planSnapshot.output.artifactKinds],
    itemsObserved: deterministicNumber(job.id, 1, 25) + 1,
    bytesPrepared: deterministicNumber(job.id, 2, 50000),
    metadataOnly: true,
    summary: "Deterministic fixture execution; no external I/O or RawArtifact was produced.",
  };
}
async function failFixture(
  context: ClaimedExecutionContext,
  client: WorkerExecutionClient,
  prefix: string,
  code: string,
): Promise<null> {
  await client.fail(
    context,
    {
      code,
      message: `Deterministic fixture failure: ${code}`,
      retryable: false,
    },
    `${prefix}-fail`,
  );
  return null;
}
export class FixtureConnectorExecutor implements ConnectorExecutor {
  readonly executor = FIXTURE_EXECUTOR;
  async execute(
    context: ClaimedExecutionContext,
    client: WorkerExecutionClient,
    scenario: FixtureExecutionScenario = "SUCCESS",
  ): Promise<ExecutionReceipt | null> {
    const prefix = `fixture-${context.lease.id}`;
    await client.start(context, this.executor, `${prefix}-start`);
    if (scenario === "FAIL_AFTER_START") {
      return failFixture(context, client, prefix, "FIXTURE_FAILURE_AFTER_START");
    }
    await client.uploading(context, `${prefix}-uploading`);
    if (scenario === "FAIL_DURING_UPLOAD") {
      return failFixture(context, client, prefix, "FIXTURE_FAILURE_DURING_UPLOAD");
    }
    await client.verifying(context, `${prefix}-verifying`);
    if (scenario === "FAIL_DURING_VERIFY") {
      return failFixture(context, client, prefix, "FIXTURE_FAILURE_DURING_VERIFY");
    }
    const receipt = fixtureReceipt(context.job);
    await client.complete(context, receipt, `${prefix}-complete`);
    return receipt;
  }
}
