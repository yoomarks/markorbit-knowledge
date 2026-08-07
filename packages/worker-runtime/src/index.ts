import { createHash } from "node:crypto";
import { type ExecutionExecutor, type ExecutionReceipt, type Job, type JobLease } from "@markorbit/contracts";

export * from "./conversion-fixture";
export * from "./controlled-fixture-pipeline";
export * from "./runtime-runner";
export * from "./artifact-ingestion-port";
export * from "./local-file-connector";
export * from "./source-connector-port";
export * from "./http-source-connector";
export * from "./collection-scheduler-port";
export * from "./source-discovery-runner";
export * from "./core-intake-adapter";
export * from "./intake-pipeline-orchestrator";
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
export * from "./raw-artifact-schema";
export * from "./artifact-storage-port";
export * from "./memory-artifact-storage";

export const FIXTURE_EXECUTOR: ExecutionExecutor = { executorId: "fixture-connector-runtime", version: "1.0.0", mode: "FIXTURE" };
export type FixtureExecutionScenario = "SUCCESS" | "FAIL_AFTER_START" | "FAIL_DURING_UPLOAD" | "FAIL_DURING_VERIFY";
export type ClaimedExecutionContext = { workerId: string; job: Job; lease: JobLease };
export interface WorkerExecutionClient { start(context: ClaimedExecutionContext, executor: ExecutionExecutor, key: string): Promise<void>; uploading(context: ClaimedExecutionContext, key: string): Promise<void>; verifying(context: ClaimedExecutionContext, key: string): Promise<void>; complete(context: ClaimedExecutionContext, receipt: ExecutionReceipt, key: string): Promise<void>; fail(context: ClaimedExecutionContext, failure: { code: string; message: string; retryable: boolean }, key: string): Promise<void>; }
export interface ConnectorExecutor { readonly executor: ExecutionExecutor; execute(context: ClaimedExecutionContext, client: WorkerExecutionClient, scenario?: FixtureExecutionScenario): Promise<ExecutionReceipt | null>; }
function deterministicNumber(jobId: string, offset: number, modulo: number): number { const digest = createHash("sha256").update(`${jobId}:${offset}`).digest(); return digest.readUInt32BE(0) % modulo; }
function fixtureReceipt(job: Job): ExecutionReceipt { return { executor: FIXTURE_EXECUTOR, outputKinds: [...job.planSnapshot.output.artifactKinds], itemsObserved: deterministicNumber(job.id, 1, 25) + 1, bytesPrepared: deterministicNumber(job.id, 2, 50000), metadataOnly: true, summary: "Deterministic fixture execution; no external I/O or RawArtifact was produced." }; }
export class FixtureConnectorExecutor implements ConnectorExecutor { readonly executor = FIXTURE_EXECUTOR; async execute(context: ClaimedExecutionContext, client: WorkerExecutionClient, scenario: FixtureExecutionScenario = "SUCCESS"): Promise<ExecutionReceipt | null> { const prefix = `fixture-${context.lease.id}`; await client.start(context, this.executor, `${prefix}-start`); if (scenario === "FAIL_AFTER_START") return null; await client.uploading(context, `${prefix}-uploading`); if (scenario === "FAIL_DURING_UPLOAD") return null; await client.verifying(context, `${prefix}-verifying`); if (scenario === "FAIL_DURING_VERIFY") return null; const receipt = fixtureReceipt(context.job); await client.complete(context, receipt, `${prefix}-complete`); return receipt; } }
