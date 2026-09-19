import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CnipaGazetteCaptureImportJobArtifactAcquirer,
  CnipaGazetteFactAdmissionJobAcquirer,
  CnipaGazetteFinalizeJobAcquirer,
  ControlledCollectionWorkerRuntime,
  HttpCnipaGazetteDurableArtifactReader,
  HttpControlledCollectionClient,
  HttpFactAdmissionClient,
  cnipaGazetteAcceptanceCaptureImportConfig,
  cnipaGazetteAcceptancePlanSha256,
  cnipaGazetteCaptureSha256,
  expectedCnipaGazetteAcceptanceAuthorityToken,
  parseCnipaGazetteAcceptancePlan,
  parseCnipaGazetteV094SmallCompleteCaptureBytes,
  type CnipaGazetteAcceptancePlan,
  type CnipaGazetteAcceptanceRuntimeStage,
} from "@markorbit/worker-runtime";
type CliArguments = {
  planPath: string;
  outputDirectory?: string;
  capturePath?: string;
  apply: boolean;
  expectedSha?: string;
  authorityToken?: string;
};

type StagePreparation = {
  runtimeStage: CnipaGazetteAcceptanceRuntimeStage;
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
  runId: string;
  parentArtifactIds: string[];
};
type ArtifactReference = {
  artifactId: string;
  canonicalUri: string;
  sha256: string;
  sizeBytes: number;
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
export function parseCnipaGazetteAcceptanceArguments(args: string[]): CliArguments {
  let planPath: string | undefined;
  let outputDirectory: string | undefined;
  let capturePath: string | undefined;
  let expectedSha: string | undefined;
  let authorityToken: string | undefined;
  let apply = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--plan") {
      planPath = valueAfter(args, index, "--plan");
      index += 1;
    } else if (arg === "--output") {
      outputDirectory = valueAfter(args, index, "--output");
      index += 1;
    } else if (arg === "--capture") {
      capturePath = valueAfter(args, index, "--capture");
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
      throw new Error(`Unknown CNIPA Gazette acceptance argument: ${arg}`);
    }
  }
  if (!planPath) throw new Error("--plan is required");
  if (apply && (!expectedSha || !authorityToken || !outputDirectory || !capturePath)) {
    throw new Error("--apply requires --capture, --expected-sha, --authority-token, and --output");
  }
  return {
    planPath: path.resolve(planPath),
    apply,
    ...(outputDirectory ? { outputDirectory: path.resolve(outputDirectory) } : {}),
    ...(capturePath ? { capturePath: path.resolve(capturePath) } : {}),
    ...(expectedSha ? { expectedSha } : {}),
    ...(authorityToken ? { authorityToken } : {}),
  };
}

export function assertCnipaGazetteAcceptancePathOutsideWorkingTree(
  target: string,
  workingDirectory = process.cwd(),
): string {
  if (!path.isAbsolute(target)) throw new Error("CNIPA Gazette acceptance path must be absolute");
  const resolvedTarget = path.resolve(target);
  const resolvedWorkingDirectory = path.resolve(workingDirectory);
  const relative = path.relative(resolvedWorkingDirectory, resolvedTarget);
  const inside = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  if (inside) {
    throw new Error("CNIPA Gazette acceptance plan/evidence must live outside the repository");
  }
  return resolvedTarget;
}

export async function loadCnipaGazetteAcceptancePlanFile(
  planPath: string,
  workingDirectory = process.cwd(),
) {
  const absolutePath = assertCnipaGazetteAcceptancePathOutsideWorkingTree(
    planPath,
    workingDirectory,
  );
  const bytes = await readFile(absolutePath);
  const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  const plan = parseCnipaGazetteAcceptancePlan(parsed);
  return {
    plan,
    planSha256: cnipaGazetteAcceptancePlanSha256(plan),
    absolutePath,
  };
}

export async function loadCnipaGazetteAcceptanceCaptureFile(
  capturePath: string,
  plan: CnipaGazetteAcceptancePlan,
  workingDirectory = process.cwd(),
) {
  const absolutePath = assertCnipaGazetteAcceptancePathOutsideWorkingTree(
    capturePath,
    workingDirectory,
  );
  const bytes = new Uint8Array(await readFile(absolutePath));
  const capture = parseCnipaGazetteV094SmallCompleteCaptureBytes(bytes);
  if (
    capture.announcementIssue !== String(plan.announcementIssue) ||
    capture.announcementDate !== plan.announcementDate ||
    capture.sourceTotal !== plan.sourceRecordCount ||
    capture.sourcePages !== plan.sourcePageCount ||
    capture.pageSize !== plan.pageSize ||
    capture.observedLastPageLength !== plan.finalPageRowCount
  ) {
    throw new Error("CNIPA Gazette capture does not match the frozen issue-75 acceptance scope");
  }
  return {
    absolutePath,
    originalName: path.basename(absolutePath),
    bytes,
    sha256: cnipaGazetteCaptureSha256(bytes),
    sizeBytes: bytes.byteLength,
    capture,
  };
}

export function assertCnipaGazetteAcceptanceAuthority(input: {
  plan: CnipaGazetteAcceptancePlan;
  planSha256: string;
  expectedSha?: string;
  authorityToken?: string;
}) {
  if (input.expectedSha !== input.planSha256) {
    throw new Error("CNIPA Gazette acceptance expected SHA does not match the frozen plan");
  }
  const expectedToken = expectedCnipaGazetteAcceptanceAuthorityToken(input.plan, input.planSha256);
  if (input.authorityToken !== expectedToken) {
    throw new Error("CNIPA Gazette acceptance GO token does not match the frozen plan");
  }
  return createHash("sha256").update(expectedToken).digest("hex");
}
function normalizedBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Control-plane URL must use http or https");
  }
  return url.toString().replace(/\/$/u, "");
}

async function acceptanceRequest(
  baseUrl: string,
  plan: CnipaGazetteAcceptancePlan,
  planSha256: string,
  authorityToken: string,
  operation: string,
  payload: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const internalSecret = process.env.MO_INTERNAL_SERVICE_SECRET?.trim();
  if (!internalSecret) {
    throw new Error("MO_INTERNAL_SERVICE_SECRET is required for Gazette acceptance apply");
  }
  const requestPath = "/api/internal/cnipa-gazette/acceptance";
  const response = await fetch(`${baseUrl}${requestPath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-markorbit-internal-authorization": internalSecret,
      "x-markorbit-cnipa-gazette-authority": authorityToken,
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
  return record(body, "acceptance response");
}
async function prepareStage(input: {
  baseUrl: string;
  plan: CnipaGazetteAcceptancePlan;
  planSha256: string;
  authorityToken: string;
  stage: CnipaGazetteAcceptanceRuntimeStage;
  connectorConfig: Record<string, unknown>;
}): Promise<StagePreparation> {
  const body = await acceptanceRequest(
    input.baseUrl,
    input.plan,
    input.planSha256,
    input.authorityToken,
    "PREPARE_STAGE",
    { stage: input.stage, connectorConfig: input.connectorConfig },
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
async function listRunArtifacts(input: {
  baseUrl: string;
  plan: CnipaGazetteAcceptancePlan;
  planSha256: string;
  authorityToken: string;
  runId: string;
}): Promise<ArtifactView[]> {
  const body = await acceptanceRequest(
    input.baseUrl,
    input.plan,
    input.planSha256,
    input.authorityToken,
    "LIST_RUN_ARTIFACTS",
    { runId: input.runId },
  );
  if (!Array.isArray(body.items)) throw new Error("Acceptance artifact list is invalid");
  return body.items.map((value, index) => {
    const item = record(value, `items[${index}]`);
    const parents = Array.isArray(item.parentArtifactIds)
      ? item.parentArtifactIds.map((parent, parentIndex) =>
          stringValue(parent, `items[${index}].parentArtifactIds[${parentIndex}]`),
        )
      : [];
    return {
      artifactId: stringValue(item.artifactId, "artifactId"),
      artifactKind: stringValue(item.artifactKind, "artifactKind"),
      originalName: stringValue(item.originalName, "originalName"),
      canonicalUri:
        item.canonicalUri === null ? null : stringValue(item.canonicalUri, "canonicalUri"),
      sha256: stringValue(item.sha256, "sha256"),
      sizeBytes: integer(item.sizeBytes, "sizeBytes"),
      sourceId: stringValue(item.sourceId, "sourceId"),
      runId: stringValue(item.runId, "runId"),
      parentArtifactIds: parents,
    };
  });
}
async function readJsonArtifact(input: {
  baseUrl: string;
  plan: CnipaGazetteAcceptancePlan;
  planSha256: string;
  authorityToken: string;
  runId: string;
  artifactId: string;
}): Promise<{ artifact: ArtifactView; json: unknown }> {
  const body = await acceptanceRequest(
    input.baseUrl,
    input.plan,
    input.planSha256,
    input.authorityToken,
    "READ_JSON_ARTIFACT",
    { runId: input.runId, artifactId: input.artifactId },
  );
  const artifact = record(body.artifact, "artifact");
  return {
    artifact: {
      artifactId: stringValue(artifact.artifactId, "artifactId"),
      artifactKind: stringValue(artifact.artifactKind, "artifactKind"),
      originalName: stringValue(artifact.originalName, "originalName"),
      canonicalUri:
        artifact.canonicalUri === null ? null : stringValue(artifact.canonicalUri, "canonicalUri"),
      sha256: stringValue(artifact.sha256, "sha256"),
      sizeBytes: integer(artifact.sizeBytes, "sizeBytes"),
      sourceId: stringValue(artifact.sourceId, "sourceId"),
      runId: stringValue(artifact.runId, "runId"),
      parentArtifactIds: Array.isArray(artifact.parentArtifactIds)
        ? (artifact.parentArtifactIds as unknown[]).map((item) =>
            stringValue(item, "parentArtifactId"),
          )
        : [],
    },
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

function reference(view: ArtifactView): ArtifactReference {
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
  acquirer:
    | CnipaGazetteCaptureImportJobArtifactAcquirer
    | CnipaGazetteFactAdmissionJobAcquirer
    | CnipaGazetteFinalizeJobAcquirer;
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
function assertAcquisitionArtifactSet(items: ArtifactView[], captureOriginalName: string): void {
  const expected = new Set<string>([captureOriginalName]);
  for (let page = 1; page <= 6; page += 1) {
    expected.add(`cnipa-gazette-issue-75-list-p${page}.json`);
    expected.add(`cnipa-gazette-issue-75-projection-p${page}.json`);
  }
  expected.add("cnipa-gazette-issue-75-checkpoint-1-6.json");
  expected.add("cnipa-gazette-issue-75-dataset-identity.json");
  expected.add("cnipa-gazette-issue-75-chunk-1-6-fact-admission-request.json");
  const actual = new Set(items.map((item) => item.originalName));
  if (items.length !== expected.size || [...expected].some((name) => !actual.has(name))) {
    throw new Error(
      `Issue-75 acquisition artifact set mismatch: expected ${expected.size}, observed ${items.length}`,
    );
  }
}

function assertDatasetIdentity(value: unknown, plan: CnipaGazetteAcceptancePlan): void {
  const root = record(value, "dataset identity");
  const identity = record(root.identity, "dataset identity.identity");
  const scope = record(identity.queryScope, "dataset identity.queryScope");
  if (
    identity.announcementIssue !== plan.announcementIssue ||
    identity.announcementDate !== plan.announcementDate ||
    identity.sourceRecordCount !== plan.sourceRecordCount ||
    identity.sourcePageCount !== plan.sourcePageCount ||
    identity.pageSize !== plan.pageSize ||
    scope.announcementTypeSelection !== "ALL" ||
    scope.anncType !== ""
  ) {
    throw new Error("Issue-75 dataset identity does not match the frozen acceptance plan");
  }
}
function assertChunkRequest(value: unknown, plan: CnipaGazetteAcceptancePlan): void {
  const root = record(value, "chunk request");
  const payload = record(root.payload, "chunk request.payload");
  if (
    root.operation !== "CHUNK" ||
    root.announcementIssue !== 75 ||
    payload.source_record_count !== plan.sourceRecordCount ||
    payload.source_page_count !== plan.sourcePageCount ||
    payload.page_size !== 100 ||
    payload.range_start_page !== 1 ||
    payload.range_end_page !== 6 ||
    payload.chunk_row_count !== 576
  ) {
    throw new Error("Issue-75 CHUNK request does not match the frozen acceptance plan");
  }
  const counts = payload.page_row_counts;
  if (!Array.isArray(counts) || counts.length !== 6) {
    throw new Error("Issue-75 CHUNK page_row_counts must contain six pages");
  }
  const expected = [100, 100, 100, 100, 100, 76];
  counts.forEach((entry, index) => {
    const row = record(entry, `page_row_counts[${index}]`);
    if (row.page_index !== index + 1 || row.row_count !== expected[index]) {
      throw new Error(`Issue-75 page ${index + 1} row count mismatch`);
    }
  });
  if (!Array.isArray(payload.records) || payload.records.length !== 576) {
    throw new Error("Issue-75 CHUNK must materialize exactly 576 records");
  }
}
function assertChunkReceipt(value: unknown): void {
  const root = record(value, "chunk receipt");
  const receipt = record(root.receipt, "chunk receipt.receipt");
  const range = record(root.range, "chunk receipt.range");
  if (
    root.operation !== "CHUNK" ||
    root.announcementIssue !== 75 ||
    range.startPage !== 1 ||
    range.endPage !== 6 ||
    receipt.outcome !== "CHUNK_ADMITTED"
  ) {
    throw new Error("Issue-75 CHUNK receipt is invalid");
  }
}

function assertFinalizeRequest(value: unknown, plan: CnipaGazetteAcceptancePlan): void {
  const root = record(value, "finalize request");
  const payload = record(root.payload, "finalize request.payload");
  if (
    root.operation !== "FINALIZE" ||
    root.announcementIssue !== 75 ||
    root.pageCount !== 6 ||
    payload.record_count !== plan.sourceRecordCount ||
    payload.page_count !== plan.sourcePageCount ||
    payload.page_size !== plan.pageSize
  ) {
    throw new Error("Issue-75 FINALIZE request does not match the frozen acceptance plan");
  }
}

function assertFinalizeReceipt(value: unknown): void {
  const root = record(value, "finalize receipt");
  const receipt = record(root.receipt, "finalize receipt.receipt");
  if (
    root.operation !== "FINALIZE" ||
    root.announcementIssue !== 75 ||
    root.pageCount !== 6 ||
    receipt.outcome !== "ADMITTED"
  ) {
    throw new Error("Issue-75 FINALIZE receipt is invalid");
  }
}
type StageEvidence = {
  stage: CnipaGazetteAcceptanceRuntimeStage;
  workerId: string;
  runId: string;
  jobId: string;
  artifacts: Array<{
    artifactId: string;
    originalName: string;
    canonicalUri: string | null;
    sha256: string;
    sizeBytes: number;
    parentArtifactIds: string[];
  }>;
};

function stageEvidence(prepared: StagePreparation, artifacts: ArtifactView[]): StageEvidence {
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

export async function applyCnipaGazetteAcceptance(input: {
  baseUrl: string;
  plan: CnipaGazetteAcceptancePlan;
  planSha256: string;
  authorityToken: string;
  outputDirectory: string;
  capture: {
    bytes: Uint8Array;
    sha256: string;
    sizeBytes: number;
    originalName: string;
  };
}) {
  const outputDirectory = assertCnipaGazetteAcceptancePathOutsideWorkingTree(input.outputDirectory);
  await mkdir(outputDirectory, { recursive: true });
  const acquisition = await prepareStage({
    ...input,
    stage: "IMPORT_CAPTURE",
    connectorConfig: cnipaGazetteAcceptanceCaptureImportConfig(input.plan, {
      sha256: input.capture.sha256,
      sizeBytes: input.capture.sizeBytes,
      originalName: input.capture.originalName,
    }),
  });
  await runStageWorker({
    baseUrl: input.baseUrl,
    prepared: acquisition,
    acquirer: new CnipaGazetteCaptureImportJobArtifactAcquirer({
      captureBytes: input.capture.bytes,
    }),
  });
  const acquisitionArtifacts = await listRunArtifacts({
    ...input,
    runId: acquisition.runId,
  });
  assertAcquisitionArtifactSet(acquisitionArtifacts, input.capture.originalName);
  const captureArtifact = oneArtifact(acquisitionArtifacts, input.capture.originalName);
  for (let page = 1; page <= 6; page += 1) {
    const raw = oneArtifact(acquisitionArtifacts, `cnipa-gazette-issue-75-list-p${page}.json`);
    if (!raw.parentArtifactIds.includes(captureArtifact.artifactId)) {
      throw new Error(`Issue-75 page ${page} is not descended from the durable v0.9.4 capture`);
    }
  }
  const identityArtifact = oneArtifact(
    acquisitionArtifacts,
    "cnipa-gazette-issue-75-dataset-identity.json",
  );
  const chunkRequestArtifact = oneArtifact(
    acquisitionArtifacts,
    "cnipa-gazette-issue-75-chunk-1-6-fact-admission-request.json",
  );
  const identityJson = await readJsonArtifact({
    ...input,
    runId: acquisition.runId,
    artifactId: identityArtifact.artifactId,
  });
  const chunkRequestJson = await readJsonArtifact({
    ...input,
    runId: acquisition.runId,
    artifactId: chunkRequestArtifact.artifactId,
  });
  assertDatasetIdentity(identityJson.json, input.plan);
  assertChunkRequest(chunkRequestJson.json, input.plan);

  const dataEngineKey = process.env.MARKORBIT_DATA_ENGINE_FACT_ADMISSION_KEY?.trim();
  if (!dataEngineKey || dataEngineKey.length < 32) {
    throw new Error(
      "MARKORBIT_DATA_ENGINE_FACT_ADMISSION_KEY (>=32 chars) is required for Gazette acceptance apply",
    );
  }
  const chunkPublisher = await prepareStage({
    ...input,
    stage: "PUBLISH_CHUNK",
    connectorConfig: {
      intent: "PUBLISH_DURABLE_REQUEST",
      requestArtifactRef: reference(chunkRequestArtifact),
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
  const chunkPublisherArtifacts = await listRunArtifacts({
    ...input,
    runId: chunkPublisher.runId,
  });
  const chunkReceiptArtifact = oneArtifact(
    chunkPublisherArtifacts,
    "cnipa-gazette-issue-75-chunk-1-6-fact-admission-receipt.json",
  );
  const chunkReceiptJson = await readJsonArtifact({
    ...input,
    runId: chunkPublisher.runId,
    artifactId: chunkReceiptArtifact.artifactId,
  });
  assertChunkReceipt(chunkReceiptJson.json);

  const finalizeBuilder = await prepareStage({
    ...input,
    stage: "BUILD_FINALIZE",
    connectorConfig: {
      intent: "BUILD_FINALIZE_REQUEST",
      datasetIdentityRef: reference(identityArtifact),
      chunkReceiptRefs: [reference(chunkReceiptArtifact)],
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
  const finalizeRequestArtifact = oneArtifact(
    finalizeBuilderArtifacts,
    "cnipa-gazette-issue-75-fact-admission-finalize-request.json",
  );
  const finalizeRequestJson = await readJsonArtifact({
    ...input,
    runId: finalizeBuilder.runId,
    artifactId: finalizeRequestArtifact.artifactId,
  });
  assertFinalizeRequest(finalizeRequestJson.json, input.plan);

  const finalizePublisher = await prepareStage({
    ...input,
    stage: "PUBLISH_FINALIZE",
    connectorConfig: {
      intent: "PUBLISH_DURABLE_REQUEST",
      requestArtifactRef: reference(finalizeRequestArtifact),
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
  const finalizeReceiptArtifact = oneArtifact(
    finalizePublisherArtifacts,
    "cnipa-gazette-issue-75-fact-admission-finalize-receipt.json",
  );
  const finalizeReceiptJson = await readJsonArtifact({
    ...input,
    runId: finalizePublisher.runId,
    artifactId: finalizeReceiptArtifact.artifactId,
  });
  assertFinalizeReceipt(finalizeReceiptJson.json);

  const manifest = {
    schema: "markorbit-cnipa-gazette-bounded-acceptance-v1",
    generatedAt: new Date().toISOString(),
    planSha256: input.planSha256,
    operationId: input.plan.operationId,
    frozenScope: {
      announcementIssue: 75,
      announcementDate: "1983-08-15",
      announcementTypeSelection: "ALL",
      anncType: "",
      sourceRecordCount: 576,
      sourcePageCount: 6,
      pageSize: 100,
      finalPageRowCount: 76,
      acquisitionMode: input.plan.acquisitionMode,
      captureTool: input.plan.captureTool,
      captureToolVersion: input.plan.captureToolVersion,
      captureExportSchema: input.plan.captureExportSchema,
      captureToolBundleSha256: input.plan.captureToolBundleSha256,
    },
    capture: {
      originalName: input.capture.originalName,
      sha256: input.capture.sha256,
      sizeBytes: input.capture.sizeBytes,
      durableArtifactId: captureArtifact.artifactId,
    },
    assertions: {
      acquisitionArtifactCount: acquisitionArtifacts.length,
      materializedRecordCount: 576,
      pageRowCounts: [100, 100, 100, 100, 100, 76],
      chunkOutcome: "CHUNK_ADMITTED",
      finalizeOutcome: "ADMITTED",
      historicalReplayActivated: false,
    },
    stages: [
      stageEvidence(acquisition, acquisitionArtifacts),
      stageEvidence(chunkPublisher, chunkPublisherArtifacts),
      stageEvidence(finalizeBuilder, finalizeBuilderArtifacts),
      stageEvidence(finalizePublisher, finalizePublisherArtifacts),
    ],
  };
  const manifestPath = path.join(outputDirectory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifest, manifestPath };
}

async function main(): Promise<void> {
  const args = parseCnipaGazetteAcceptanceArguments(process.argv.slice(2));
  const loaded = await loadCnipaGazetteAcceptancePlanFile(args.planPath);
  const expectedAuthorityToken = expectedCnipaGazetteAcceptanceAuthorityToken(
    loaded.plan,
    loaded.planSha256,
  );
  const loadedCapture = args.capturePath
    ? await loadCnipaGazetteAcceptanceCaptureFile(args.capturePath, loaded.plan)
    : null;
  if (!args.apply) {
    process.stdout.write(
      `${JSON.stringify({
        event: "cnipa_gazette.acceptance.plan_validated",
        operationId: loaded.plan.operationId,
        announcementIssue: 75,
        sourceRecordCount: 576,
        sourcePageCount: 6,
        planSha256: loaded.planSha256,
        captureValidated: loadedCapture !== null,
        ...(loadedCapture
          ? {
              captureSha256: loadedCapture.sha256,
              captureSizeBytes: loadedCapture.sizeBytes,
              captureOriginalName: loadedCapture.originalName,
            }
          : {}),
        applyPerformed: false,
        expectedAuthorityToken,
        message:
          "Frozen plan/capture validation only. No CNIPA network request, Knowledge mutation, or Data Engine write was performed.",
      })}\n`,
    );
    return;
  }
  if (!loadedCapture) {
    throw new Error("--capture is required for Gazette acceptance apply");
  }
  const authorityTokenSha256 = assertCnipaGazetteAcceptanceAuthority({
    plan: loaded.plan,
    planSha256: loaded.planSha256,
    expectedSha: args.expectedSha,
    authorityToken: args.authorityToken,
  });
  const controlPlane = process.env.MARKORBIT_CONTROL_PLANE_URL?.trim();
  if (!controlPlane) {
    throw new Error("MARKORBIT_CONTROL_PLANE_URL is required for Gazette acceptance apply");
  }
  const result = await applyCnipaGazetteAcceptance({
    baseUrl: normalizedBaseUrl(controlPlane),
    plan: loaded.plan,
    planSha256: loaded.planSha256,
    authorityToken: args.authorityToken!,
    outputDirectory: args.outputDirectory!,
    capture: {
      bytes: loadedCapture.bytes,
      sha256: loadedCapture.sha256,
      sizeBytes: loadedCapture.sizeBytes,
      originalName: loadedCapture.originalName,
    },
  });
  process.stdout.write(
    `${JSON.stringify({
      event: "cnipa_gazette.acceptance.completed",
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
        event: "cnipa_gazette.acceptance.failed",
        message: error instanceof Error ? error.message : "CNIPA Gazette acceptance failed",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
