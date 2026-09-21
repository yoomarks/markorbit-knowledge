import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CnipaGazetteFactAdmissionJobAcquirer,
  CnipaGazetteFinalizeJobAcquirer,
  ControlledCollectionWorkerRuntime,
  HttpCnipaGazetteDurableArtifactReader,
  HttpControlledCollectionClient,
  HttpFactAdmissionClient,
  cnipaGazetteBrowserAdmissionArtifactNames,
  cnipaGazetteBrowserAdmissionPlanSha256,
  expectedCnipaGazetteBrowserAdmissionAuthorityToken,
  parseCnipaGazetteBrowserAdmissionPlan,
  type CnipaGazetteBrowserAdmissionArtifactRef,
  type CnipaGazetteBrowserAdmissionPlan,
  type CnipaGazetteBrowserAdmissionRuntimeStage,
} from "@markorbit/worker-runtime";

type CliArguments = {
  planPath: string;
  outputDirectory?: string;
  apply: boolean;
  expectedSha?: string;
  authorityToken?: string;
};

type StagePreparation = {
  runtimeStage: CnipaGazetteBrowserAdmissionRuntimeStage;
  sourceId: string;
  collectionPlanId: string;
  workerId: string;
  workerCredential: string;
  runId: string;
  jobId: string;
  replayed: boolean;
};

type ArtifactView = {
  artifactId: string;
  artifactKind: string;
  originalName: string;
  canonicalUri: string | null;
  sha256: string;
  sizeBytes: number;
  sourceId: string;
  runId: string | null;
  parentArtifactIds: string[];
};

function record(value: unknown, label = "value"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
  return value as number;
}

function valueAfter(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

export function parseCnipaGazetteBrowserAdmissionArguments(args: string[]): CliArguments {
  let planPath: string | undefined;
  let outputDirectory: string | undefined;
  let expectedSha: string | undefined;
  let authorityToken: string | undefined;
  let apply = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--") continue;
    if (arg === "--plan") {
      planPath = valueAfter(args, index, "--plan");
      index += 1;
    } else if (arg === "--output") {
      outputDirectory = valueAfter(args, index, "--output");
      index += 1;
    } else if (arg === "--expected-sha") {
      expectedSha = valueAfter(args, index, "--expected-sha");
      index += 1;
    } else if (arg === "--authority-token") {
      authorityToken = valueAfter(args, index, "--authority-token");
      index += 1;
    } else if (arg === "--apply") {
      apply = true;
    } else {
      throw new Error(`Unknown CNIPA Gazette browser admission argument: ${arg}`);
    }
  }
  if (!planPath) throw new Error("--plan is required");
  if (apply && (!expectedSha || !authorityToken || !outputDirectory)) {
    throw new Error("--apply requires --expected-sha, --authority-token, and --output");
  }
  return {
    planPath: path.resolve(planPath),
    apply,
    ...(outputDirectory ? { outputDirectory: path.resolve(outputDirectory) } : {}),
    ...(expectedSha ? { expectedSha } : {}),
    ...(authorityToken ? { authorityToken } : {}),
  };
}

export function assertCnipaGazetteBrowserAdmissionPathOutsideWorkingTree(
  target: string,
  workingDirectory = process.cwd(),
): string {
  if (!path.isAbsolute(target)) {
    throw new Error("CNIPA Gazette browser admission path must be absolute");
  }
  const resolvedTarget = path.resolve(target);
  const resolvedWorkingDirectory = path.resolve(workingDirectory);
  const relative = path.relative(resolvedWorkingDirectory, resolvedTarget);
  const inside = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  if (inside) {
    throw new Error(
      "CNIPA Gazette browser admission plan/evidence must live outside the repository",
    );
  }
  return resolvedTarget;
}

export async function loadCnipaGazetteBrowserAdmissionPlanFile(
  planPath: string,
  workingDirectory = process.cwd(),
) {
  const absolutePath = assertCnipaGazetteBrowserAdmissionPathOutsideWorkingTree(
    planPath,
    workingDirectory,
  );
  const bytes = await readFile(absolutePath);
  const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  const plan = parseCnipaGazetteBrowserAdmissionPlan(parsed);
  return {
    plan,
    planSha256: cnipaGazetteBrowserAdmissionPlanSha256(plan),
    absolutePath,
  };
}

export function assertCnipaGazetteBrowserAdmissionAuthority(input: {
  plan: CnipaGazetteBrowserAdmissionPlan;
  planSha256: string;
  expectedSha?: string;
  authorityToken?: string;
}) {
  if (input.expectedSha !== input.planSha256) {
    throw new Error("CNIPA Gazette browser admission expected SHA does not match the frozen plan");
  }
  const expected = expectedCnipaGazetteBrowserAdmissionAuthorityToken(input.plan, input.planSha256);
  if (input.authorityToken !== expected) {
    throw new Error("CNIPA Gazette browser admission GO token does not match the frozen plan");
  }
  return createHash("sha256").update(expected).digest("hex");
}

function normalizedBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Control-plane URL must use http or https");
  }
  return url.toString().replace(/\/$/u, "");
}

async function admissionRequest(
  baseUrl: string,
  plan: CnipaGazetteBrowserAdmissionPlan,
  planSha256: string,
  authorityToken: string,
  operation: string,
  payload: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const internalSecret = process.env.MO_INTERNAL_SERVICE_SECRET?.trim();
  if (!internalSecret) {
    throw new Error("MO_INTERNAL_SERVICE_SECRET is required for browser admission apply");
  }
  const requestPath = "/api/internal/cnipa-gazette/browser-admission";
  const response = await fetch(`${baseUrl}${requestPath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-markorbit-internal-authorization": internalSecret,
      "x-markorbit-cnipa-gazette-browser-admission-authority": authorityToken,
    },
    body: JSON.stringify({
      workspaceId: plan.workspaceId,
      operation,
      authority: { frozenPlan: plan, planSha256 },
      payload,
    }),
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const top =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const error =
      top.error && typeof top.error === "object" && !Array.isArray(top.error)
        ? (top.error as Record<string, unknown>)
        : {};
    const message = typeof error.message === "string" ? error.message : `HTTP ${response.status}`;
    throw new Error(`${requestPath}: ${message}`);
  }
  return record(body, "browser admission response");
}

async function prepareStage(input: {
  baseUrl: string;
  plan: CnipaGazetteBrowserAdmissionPlan;
  planSha256: string;
  authorityToken: string;
  stage: CnipaGazetteBrowserAdmissionRuntimeStage;
  connectorConfig: Record<string, unknown>;
  dispatchAttemptKey: string;
}): Promise<StagePreparation> {
  const body = await admissionRequest(
    input.baseUrl,
    input.plan,
    input.planSha256,
    input.authorityToken,
    "PREPARE_STAGE",
    {
      stage: input.stage,
      connectorConfig: input.connectorConfig,
      dispatchAttemptKey: input.dispatchAttemptKey,
    },
  );
  return {
    runtimeStage: input.stage,
    sourceId: stringValue(body.sourceId, "sourceId"),
    collectionPlanId: stringValue(body.collectionPlanId, "collectionPlanId"),
    workerId: stringValue(body.workerId, "workerId"),
    workerCredential: stringValue(body.workerCredential, "workerCredential"),
    runId: stringValue(body.runId, "runId"),
    jobId: stringValue(body.jobId, "jobId"),
    replayed: body.replayed === true,
  };
}

function artifactView(value: unknown, label: string): ArtifactView {
  const item = record(value, label);
  return {
    artifactId: stringValue(item.artifactId, `${label}.artifactId`),
    artifactKind: stringValue(item.artifactKind, `${label}.artifactKind`),
    originalName: stringValue(item.originalName, `${label}.originalName`),
    canonicalUri:
      item.canonicalUri === null ? null : stringValue(item.canonicalUri, `${label}.canonicalUri`),
    sha256: stringValue(item.sha256, `${label}.sha256`),
    sizeBytes: integer(item.sizeBytes, `${label}.sizeBytes`),
    sourceId: stringValue(item.sourceId, `${label}.sourceId`),
    runId: item.runId === null ? null : stringValue(item.runId, `${label}.runId`),
    parentArtifactIds: Array.isArray(item.parentArtifactIds)
      ? item.parentArtifactIds.map((parent, index) =>
          stringValue(parent, `${label}.parentArtifactIds[${index}]`),
        )
      : [],
  };
}

async function listRunArtifacts(input: {
  baseUrl: string;
  plan: CnipaGazetteBrowserAdmissionPlan;
  planSha256: string;
  authorityToken: string;
  runId: string;
}): Promise<ArtifactView[]> {
  const body = await admissionRequest(
    input.baseUrl,
    input.plan,
    input.planSha256,
    input.authorityToken,
    "LIST_RUN_ARTIFACTS",
    { runId: input.runId },
  );
  if (!Array.isArray(body.items)) throw new Error("Browser admission artifact list is invalid");
  return body.items.map((value, index) => artifactView(value, `items[${index}]`));
}

async function readJsonArtifact(input: {
  baseUrl: string;
  plan: CnipaGazetteBrowserAdmissionPlan;
  planSha256: string;
  authorityToken: string;
  runId: string;
  artifactId: string;
}): Promise<{ artifact: ArtifactView; json: unknown }> {
  const body = await admissionRequest(
    input.baseUrl,
    input.plan,
    input.planSha256,
    input.authorityToken,
    "READ_JSON_ARTIFACT",
    { runId: input.runId, artifactId: input.artifactId },
  );
  return {
    artifact: artifactView(body.artifact, "artifact"),
    json: body.json,
  };
}

async function readSeedJsonArtifact(input: {
  baseUrl: string;
  plan: CnipaGazetteBrowserAdmissionPlan;
  planSha256: string;
  authorityToken: string;
  artifactId: string;
}): Promise<{ artifact: ArtifactView; json: unknown }> {
  const body = await admissionRequest(
    input.baseUrl,
    input.plan,
    input.planSha256,
    input.authorityToken,
    "READ_SEED_JSON_ARTIFACT",
    { artifactId: input.artifactId },
  );
  return {
    artifact: artifactView(body.artifact, "artifact"),
    json: body.json,
  };
}

function oneArtifact(items: ArtifactView[], originalName: string): ArtifactView {
  const matches = items.filter((item) => item.originalName === originalName);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${originalName}; observed ${matches.length}`);
  }
  return matches[0]!;
}

function reference(view: ArtifactView): CnipaGazetteBrowserAdmissionArtifactRef {
  if (!view.canonicalUri) throw new Error(`Artifact ${view.artifactId} is missing canonicalUri`);
  return {
    artifactId: view.artifactId,
    canonicalUri: view.canonicalUri,
    sha256: view.sha256,
    sizeBytes: view.sizeBytes,
  };
}

async function runStageWorker(input: {
  baseUrl: string;
  prepared: StagePreparation;
  acquirer: CnipaGazetteFactAdmissionJobAcquirer | CnipaGazetteFinalizeJobAcquirer;
}) {
  const client = new HttpControlledCollectionClient(
    input.baseUrl,
    input.prepared.workerId,
    input.prepared.workerCredential,
  );
  const runtime = new ControlledCollectionWorkerRuntime(client, input.acquirer, {
    runtimeVersion: "1.0.0",
  });
  const claimed = await runtime.runOnce(input.prepared.jobId);
  if (!claimed) {
    throw new Error(`Gazette ${input.prepared.runtimeStage} Worker did not claim its Job`);
  }
}

function assertDatasetIdentity(value: unknown, plan: CnipaGazetteBrowserAdmissionPlan): void {
  const root = record(value, "dataset identity");
  const identity = record(root.identity, "dataset identity.identity");
  const scope = record(identity.queryScope, "dataset identity.queryScope");
  if (
    identity.announcementIssue !== plan.announcementIssue ||
    identity.announcementDate !== plan.announcementDate ||
    identity.sourceRecordCount !== plan.sourceRecordCount ||
    identity.sourcePageCount !== plan.logicalPageCount ||
    identity.pageSize !== plan.logicalPageSize ||
    scope.announcementTypeSelection !== "ALL" ||
    scope.anncType !== ""
  ) {
    throw new Error("Browser dataset identity does not match the frozen single-issue plan");
  }
}

function expectedLogicalPageRowCount(
  plan: CnipaGazetteBrowserAdmissionPlan,
  pageIndex: number,
): number {
  return pageIndex === plan.logicalPageCount
    ? plan.finalLogicalPageRowCount
    : plan.logicalPageSize;
}

function assertChunkRequest(value: unknown, plan: CnipaGazetteBrowserAdmissionPlan): void {
  const root = record(value, "chunk request");
  const payload = record(root.payload, "chunk request.payload");
  if (
    root.operation !== "CHUNK" ||
    root.announcementIssue !== plan.announcementIssue ||
    root.sourceDatasetSha256 !== plan.sourceDatasetSha256 ||
    payload.source_record_count !== plan.sourceRecordCount ||
    payload.source_page_count !== plan.logicalPageCount ||
    payload.page_size !== plan.logicalPageSize ||
    payload.range_start_page !== 1 ||
    payload.range_end_page !== plan.logicalPageCount ||
    payload.chunk_row_count !== plan.sourceRecordCount
  ) {
    throw new Error("Browser CHUNK request does not match the frozen single-issue plan");
  }
  const counts = payload.page_row_counts;
  if (!Array.isArray(counts) || counts.length !== plan.logicalPageCount) {
    throw new Error("Browser CHUNK page_row_counts do not cover the frozen logical range");
  }
  counts.forEach((entry, index) => {
    const row = record(entry, `page_row_counts[${index}]`);
    const pageIndex = index + 1;
    if (
      row.page_index !== pageIndex ||
      row.row_count !== expectedLogicalPageRowCount(plan, pageIndex)
    ) {
      throw new Error(`Browser logical page ${pageIndex} row count mismatch`);
    }
  });
  if (!Array.isArray(payload.records) || payload.records.length !== plan.sourceRecordCount) {
    throw new Error("Browser CHUNK record count does not match the frozen plan");
  }
}

function assertChunkReceipt(value: unknown, plan: CnipaGazetteBrowserAdmissionPlan): boolean {
  const root = record(value, "chunk receipt");
  const receipt = record(root.receipt, "chunk receipt.receipt");
  const range = record(root.range, "chunk receipt.range");
  if (
    root.operation !== "CHUNK" ||
    root.sourceDatasetSha256 !== plan.sourceDatasetSha256 ||
    root.announcementIssue !== plan.announcementIssue ||
    range.startPage !== 1 ||
    range.endPage !== plan.logicalPageCount ||
    receipt.outcome !== "CHUNK_ADMITTED" ||
    typeof receipt.replayed !== "boolean"
  ) {
    throw new Error("Browser CHUNK receipt is invalid");
  }
  return receipt.replayed;
}

function assertFinalizeRequest(value: unknown, plan: CnipaGazetteBrowserAdmissionPlan): void {
  const root = record(value, "finalize request");
  const payload = record(root.payload, "finalize request.payload");
  if (
    root.operation !== "FINALIZE" ||
    root.sourceDatasetSha256 !== plan.sourceDatasetSha256 ||
    root.announcementIssue !== plan.announcementIssue ||
    root.pageCount !== plan.logicalPageCount ||
    payload.record_count !== plan.sourceRecordCount ||
    payload.page_count !== plan.logicalPageCount ||
    payload.page_size !== plan.logicalPageSize
  ) {
    throw new Error("Browser FINALIZE request does not match the frozen plan");
  }
}

function assertFinalizeReceipt(value: unknown, plan: CnipaGazetteBrowserAdmissionPlan): boolean {
  const root = record(value, "finalize receipt");
  const receipt = record(root.receipt, "finalize receipt.receipt");
  if (
    root.operation !== "FINALIZE" ||
    root.sourceDatasetSha256 !== plan.sourceDatasetSha256 ||
    root.announcementIssue !== plan.announcementIssue ||
    root.pageCount !== plan.logicalPageCount ||
    receipt.outcome !== "ADMITTED" ||
    typeof receipt.replayed !== "boolean"
  ) {
    throw new Error("Browser FINALIZE receipt is invalid");
  }
  return receipt.replayed;
}

function stageEvidence(prepared: StagePreparation, artifacts: ArtifactView[]) {
  return {
    stage: prepared.runtimeStage,
    workerId: prepared.workerId,
    runId: prepared.runId,
    jobId: prepared.jobId,
    artifacts: artifacts.map((item) => ({
      artifactId: item.artifactId,
      originalName: item.originalName,
      canonicalUri: item.canonicalUri,
      sha256: item.sha256,
      sizeBytes: item.sizeBytes,
      parentArtifactIds: item.parentArtifactIds,
    })),
  };
}

export async function applyCnipaGazetteBrowserAdmission(input: {
  baseUrl: string;
  plan: CnipaGazetteBrowserAdmissionPlan;
  planSha256: string;
  authorityToken: string;
  outputDirectory: string;
}) {
  const outputDirectory = assertCnipaGazetteBrowserAdmissionPathOutsideWorkingTree(
    input.outputDirectory,
  );
  await mkdir(outputDirectory, { recursive: true });

  const datasetSeed = await readSeedJsonArtifact({
    ...input,
    artifactId: input.plan.datasetIdentityRef.artifactId,
  });
  const chunkSeed = await readSeedJsonArtifact({
    ...input,
    artifactId: input.plan.chunkRequestRef.artifactId,
  });
  assertDatasetIdentity(datasetSeed.json, input.plan);
  assertChunkRequest(chunkSeed.json, input.plan);
  if (!chunkSeed.artifact.parentArtifactIds.includes(input.plan.datasetIdentityRef.artifactId)) {
    throw new Error("Browser CHUNK request is not descended from the frozen dataset identity");
  }

  const dataEngineKey = process.env.MARKORBIT_DATA_ENGINE_FACT_ADMISSION_KEY?.trim();
  if (!dataEngineKey || dataEngineKey.length < 32) {
    throw new Error(
      "MARKORBIT_DATA_ENGINE_FACT_ADMISSION_KEY (>=32 chars) is required for browser admission apply",
    );
  }
  const dispatchAttemptKey = `try-${Date.now().toString(36)}-${process.pid.toString(36)}`;
  const artifactNames = cnipaGazetteBrowserAdmissionArtifactNames(input.plan);

  const chunkPublisher = await prepareStage({
    ...input,
    dispatchAttemptKey,
    stage: "PUBLISH_CHUNK",
    connectorConfig: {
      intent: "PUBLISH_DURABLE_REQUEST",
      requestArtifactRef: input.plan.chunkRequestRef,
    },
  });
  await runStageWorker({
    baseUrl: input.baseUrl,
    prepared: chunkPublisher,
    acquirer: new CnipaGazetteFactAdmissionJobAcquirer({
      reader: new HttpCnipaGazetteDurableArtifactReader(
        input.baseUrl,
        chunkPublisher.workerId,
        chunkPublisher.workerCredential,
      ),
      client: new HttpFactAdmissionClient(input.plan.dataEngineUrl, dataEngineKey),
    }),
  });
  const chunkArtifacts = await listRunArtifacts({ ...input, runId: chunkPublisher.runId });
  const chunkReceipt = oneArtifact(chunkArtifacts, artifactNames.chunkReceipt);
  const chunkReceiptJson = await readJsonArtifact({
    ...input,
    runId: chunkPublisher.runId,
    artifactId: chunkReceipt.artifactId,
  });
  const chunkReplayed = assertChunkReceipt(chunkReceiptJson.json, input.plan);
  if (!chunkReceipt.parentArtifactIds.includes(input.plan.chunkRequestRef.artifactId)) {
    throw new Error("CHUNK receipt does not descend from the frozen browser CHUNK request");
  }

  const finalizeBuilder = await prepareStage({
    ...input,
    dispatchAttemptKey,
    stage: "BUILD_FINALIZE",
    connectorConfig: {
      intent: "BUILD_FINALIZE_REQUEST",
      datasetIdentityRef: input.plan.datasetIdentityRef,
      chunkReceiptRefs: [reference(chunkReceipt)],
    },
  });
  await runStageWorker({
    baseUrl: input.baseUrl,
    prepared: finalizeBuilder,
    acquirer: new CnipaGazetteFinalizeJobAcquirer({
      reader: new HttpCnipaGazetteDurableArtifactReader(
        input.baseUrl,
        finalizeBuilder.workerId,
        finalizeBuilder.workerCredential,
      ),
    }),
  });
  const finalizeBuilderArtifacts = await listRunArtifacts({
    ...input,
    runId: finalizeBuilder.runId,
  });
  const finalizeRequest = oneArtifact(finalizeBuilderArtifacts, artifactNames.finalizeRequest);
  const finalizeRequestJson = await readJsonArtifact({
    ...input,
    runId: finalizeBuilder.runId,
    artifactId: finalizeRequest.artifactId,
  });
  assertFinalizeRequest(finalizeRequestJson.json, input.plan);
  if (
    !finalizeRequest.parentArtifactIds.includes(input.plan.datasetIdentityRef.artifactId) ||
    !finalizeRequest.parentArtifactIds.includes(chunkReceipt.artifactId)
  ) {
    throw new Error("FINALIZE request lineage is incomplete");
  }

  const finalizePublisher = await prepareStage({
    ...input,
    dispatchAttemptKey,
    stage: "PUBLISH_FINALIZE",
    connectorConfig: {
      intent: "PUBLISH_DURABLE_REQUEST",
      requestArtifactRef: reference(finalizeRequest),
    },
  });
  await runStageWorker({
    baseUrl: input.baseUrl,
    prepared: finalizePublisher,
    acquirer: new CnipaGazetteFactAdmissionJobAcquirer({
      reader: new HttpCnipaGazetteDurableArtifactReader(
        input.baseUrl,
        finalizePublisher.workerId,
        finalizePublisher.workerCredential,
      ),
      client: new HttpFactAdmissionClient(input.plan.dataEngineUrl, dataEngineKey),
    }),
  });
  const finalizePublisherArtifacts = await listRunArtifacts({
    ...input,
    runId: finalizePublisher.runId,
  });
  const finalizeReceipt = oneArtifact(finalizePublisherArtifacts, artifactNames.finalizeReceipt);
  const finalizeReceiptJson = await readJsonArtifact({
    ...input,
    runId: finalizePublisher.runId,
    artifactId: finalizeReceipt.artifactId,
  });
  const finalizeReplayed = assertFinalizeReceipt(finalizeReceiptJson.json, input.plan);
  if (!finalizeReceipt.parentArtifactIds.includes(finalizeRequest.artifactId)) {
    throw new Error("FINALIZE receipt does not descend from the durable FINALIZE request");
  }

  const manifest = {
    schema: "markorbit-cnipa-gazette-browser-admission-v1",
    generatedAt: new Date().toISOString(),
    planSha256: input.planSha256,
    operationId: input.plan.operationId,
    frozenScope: {
      authorityIssueNumber: input.plan.authorityIssueNumber,
      announcementIssue: input.plan.announcementIssue,
      announcementDate: input.plan.announcementDate,
      announcementTypeSelection: "ALL",
      anncType: "",
      sourceRecordCount: input.plan.sourceRecordCount,
      browserSourcePageSize: input.plan.browserSourcePageSize,
      browserSourcePageCount: input.plan.browserSourcePageCount,
      finalSourcePageRowCount: input.plan.finalSourcePageRowCount,
      logicalPageSize: input.plan.logicalPageSize,
      logicalPageCount: input.plan.logicalPageCount,
      finalLogicalPageRowCount: input.plan.finalLogicalPageRowCount,
      acquisitionMode: input.plan.acquisitionMode,
      captureToolVersion: input.plan.captureToolVersion,
      sourceDatasetSha256: input.plan.sourceDatasetSha256,
    },
    browserSeeds: {
      datasetIdentity: input.plan.datasetIdentityRef,
      chunkRequest: input.plan.chunkRequestRef,
    },
    assertions: {
      chunkOutcome: "CHUNK_ADMITTED",
      chunkReplayed,
      finalizeOutcome: "ADMITTED",
      finalizeReplayed,
      browserSecretsCrossedBridge: false,
      cnipaNetworkAccessPerformedByAdmission: false,
      historicalReplayActivated: false,
    },
    stages: [
      stageEvidence(chunkPublisher, chunkArtifacts),
      stageEvidence(finalizeBuilder, finalizeBuilderArtifacts),
      stageEvidence(finalizePublisher, finalizePublisherArtifacts),
    ],
    terminal: {
      chunkReceiptArtifactId: chunkReceipt.artifactId,
      finalizeRequestArtifactId: finalizeRequest.artifactId,
      finalizeReceiptArtifactId: finalizeReceipt.artifactId,
    },
  };
  const manifestPath = path.join(outputDirectory, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return { manifestPath, manifest };
}

async function main(): Promise<void> {
  const args = parseCnipaGazetteBrowserAdmissionArguments(process.argv.slice(2));
  const loaded = await loadCnipaGazetteBrowserAdmissionPlanFile(args.planPath);
  const expectedAuthorityToken = expectedCnipaGazetteBrowserAdmissionAuthorityToken(
    loaded.plan,
    loaded.planSha256,
  );
  if (!args.apply) {
    process.stdout.write(
      `${JSON.stringify({
        event: "cnipa_gazette_browser_admission.plan_validated",
        operationId: loaded.plan.operationId,
        announcementIssue: loaded.plan.announcementIssue,
        sourceDatasetSha256: loaded.plan.sourceDatasetSha256,
        datasetIdentityArtifactId: loaded.plan.datasetIdentityRef.artifactId,
        chunkRequestArtifactId: loaded.plan.chunkRequestRef.artifactId,
        planSha256: loaded.planSha256,
        applyPerformed: false,
        expectedAuthorityToken,
        historicalReplayActivated: false,
        message:
          "Frozen browser-origin downstream plan validation only. No CNIPA request, Knowledge mutation, or Data Engine write was performed.",
      })}\n`,
    );
    return;
  }

  const authorityTokenSha256 = assertCnipaGazetteBrowserAdmissionAuthority({
    plan: loaded.plan,
    planSha256: loaded.planSha256,
    expectedSha: args.expectedSha,
    authorityToken: args.authorityToken,
  });
  const controlPlane = process.env.MARKORBIT_CONTROL_PLANE_URL?.trim();
  if (!controlPlane) {
    throw new Error("MARKORBIT_CONTROL_PLANE_URL is required for browser admission apply");
  }
  const result = await applyCnipaGazetteBrowserAdmission({
    baseUrl: normalizedBaseUrl(controlPlane),
    plan: loaded.plan,
    planSha256: loaded.planSha256,
    authorityToken: args.authorityToken!,
    outputDirectory: args.outputDirectory!,
  });
  process.stdout.write(
    `${JSON.stringify({
      event: "cnipa_gazette_browser_admission.completed",
      operationId: loaded.plan.operationId,
      planSha256: loaded.planSha256,
      authorityTokenSha256,
      manifestPath: result.manifestPath,
      historicalReplayActivated: false,
    })}\n`,
  );
}

if (process.env.VITEST !== "true") {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        event: "cnipa_gazette_browser_admission.failed",
        message: error instanceof Error ? error.message : "CNIPA Gazette browser admission failed",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
