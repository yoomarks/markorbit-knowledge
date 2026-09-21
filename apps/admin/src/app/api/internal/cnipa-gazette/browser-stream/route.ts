import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import {
  cnipaGazetteBrowserAdmissionPlanSha256,
  cnipaGazetteBrowserConnectorManifest,
  cnipaGazetteBrowserPlanPayload,
  cnipaGazetteBrowserSourcePayload,
  cnipaGazetteBrowserStreamJobFromContext,
  cnipaGazetteBrowserWorkerPayload,
  expectedCnipaGazetteBrowserAdmissionAuthorityToken,
  parseCnipaGazetteBrowserAdmissionPlan,
  parseCnipaGazetteBrowserAuthorityPlan,
  type CnipaGazetteBrowserAuthorityPlan,
} from "@markorbit/worker-runtime";
import type { ArtifactBackedExecutionContext } from "@markorbit/worker-runtime";
import { RegistryValidationError, type CreateSourceInput } from "@markorbit/persistence";
import type { CreateCollectionPlanInput } from "@markorbit/persistence/collection-plans";
import type { CreateConnectorManifestInput } from "@markorbit/persistence/connectors";
import type { CreateWorkerInput } from "@markorbit/persistence/workers";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { authenticateCnipaGazetteBrowserRequest } from "@/server/cnipa-gazette-browser-auth";
import {
  getCollectionPlanRepository,
  getConnectorRepository,
  getExecutionLedgerRepository,
  getRawArtifactRepository,
  getSourceRepository,
  getWorkerRegistryRepository,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new RegistryValidationError(`${label} is required`);
  return value.trim();
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RegistryValidationError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function stable(value: unknown): string {
  return JSON.stringify(canonical(value));
}
function ensureConnector() {
  const expected = cnipaGazetteBrowserConnectorManifest();
  const repository = getConnectorRepository();
  const existing = repository.get(expected.connectorId, expected.version);
  if (existing) {
    const manifest = existing.manifest;
    if (
      manifest.connectorId !== expected.connectorId ||
      manifest.displayName !== expected.displayName ||
      manifest.version !== expected.version ||
      stable(manifest.sourceTypes) !== stable(expected.sourceTypes) ||
      manifest.runtime !== expected.runtime ||
      stable(manifest.capabilities) !== stable(expected.capabilities) ||
      stable(manifest.supportedJobTypes) !== stable(expected.supportedJobTypes) ||
      stable(manifest.configurationSchema) !== stable(expected.configurationSchema) ||
      stable(manifest.secretSchema) !== stable(expected.secretSchema) ||
      stable(manifest.outputArtifactKinds) !== stable(expected.outputArtifactKinds) ||
      stable(manifest.healthCheck) !== stable(expected.healthCheck) ||
      manifest.status !== expected.status ||
      stable(manifest.extensions) !== stable(expected.extensions)
    ) {
      throw new RegistryValidationError("Existing Gazette browser connector drifted");
    }
    return existing;
  }
  return repository.create(expected as unknown as CreateConnectorManifestInput);
}

function ensureSource(plan: CnipaGazetteBrowserAuthorityPlan) {
  const expected = cnipaGazetteBrowserSourcePayload(plan.workspaceId);
  const repository = getSourceRepository();
  const listed = repository.list({ workspaceId: plan.workspaceId, q: expected.slug, limit: 100 });
  const matches = listed.items.filter((item) => item.slug === expected.slug);
  if (matches.length > 1)
    throw new RegistryValidationError("Multiple Gazette browser sources found");
  const existing = matches[0];
  if (existing) {
    if (
      existing.sourceType !== expected.sourceType ||
      existing.category !== expected.category ||
      existing.authorityLevel !== expected.authorityLevel ||
      existing.status !== expected.status ||
      stable(existing.jurisdictions) !== stable(expected.jurisdictions) ||
      stable(existing.languages) !== stable(expected.languages) ||
      stable(existing.connector) !== stable(expected.connector) ||
      stable(existing.connectorConfig) !== stable(expected.connectorConfig) ||
      existing.secretRef !== undefined ||
      existing.canonicalUri !== expected.canonicalUri ||
      stable(existing.entrypoints) !== stable(expected.entrypoints) ||
      stable(existing.tags) !== stable(expected.tags) ||
      stable(existing.extensions) !== stable(expected.extensions)
    ) {
      throw new RegistryValidationError("Existing Gazette browser Source drifted");
    }
    return existing;
  }
  return repository.create(expected as unknown as CreateSourceInput);
}

function ensurePlan(input: {
  plan: CnipaGazetteBrowserAuthorityPlan;
  planSha256: string;
  sourceId: string;
}) {
  const base = cnipaGazetteBrowserPlanPayload({
    workspaceId: input.plan.workspaceId,
    sourceId: input.sourceId,
    announcementIssue: input.plan.announcementIssue,
    targetLogicalPagesPerCheckpoint: input.plan.targetLogicalPagesPerCheckpoint,
    maxRuntimeSeconds: input.plan.maxRuntimeSeconds,
    ...(input.plan.resumeFrom ? { resumeFrom: input.plan.resumeFrom } : {}),
  });
  const expected = {
    ...base,
    name: `${base.name} | ${input.plan.operationId}`,
    extensions: {
      ...base.extensions,
      "x-markorbit-gazette-browser-operation": input.plan.operationId,
      "x-markorbit-gazette-browser-frozen-plan-sha256": input.planSha256,
      "x-markorbit-capture-tool-bundle-sha256": input.plan.captureToolBundleSha256,
    },
  };
  const repository = getCollectionPlanRepository();
  const listed = repository.list({
    workspaceId: input.plan.workspaceId,
    sourceId: input.sourceId,
    limit: 100,
  });
  for (const candidate of listed.items) {
    const value = candidate.plan;
    if (value.name !== expected.name) continue;
    if (
      value.status !== expected.status ||
      stable(value.schedule) !== stable(expected.schedule) ||
      value.priority !== expected.priority ||
      stable(value.policy) !== stable(expected.policy) ||
      stable(value.output) !== stable(expected.output) ||
      stable(value.extensions) !== stable(expected.extensions)
    ) {
      throw new RegistryValidationError("Existing Gazette browser CollectionPlan drifted");
    }
    return value;
  }
  return repository.create(expected as unknown as CreateCollectionPlanInput).plan;
}
function sameStrings(value: readonly string[], expected: readonly string[]): boolean {
  return value.length === expected.length && value.every((item, index) => item === expected[index]);
}

function provisionWorker(workspaceId: string, rotateExisting: boolean) {
  const expected = cnipaGazetteBrowserWorkerPayload(workspaceId);
  const repository = getWorkerRegistryRepository();
  const listed = repository.list({
    workspaceId,
    label: "cnipa-gazette-browser-bridge",
    limit: 100,
  });
  for (const candidate of listed.items) {
    const worker = candidate.worker;
    const binding = worker.connectorBindings[0];
    if (
      worker.displayName !== expected.displayName ||
      worker.runtime.runtimeId !== expected.runtime.runtimeId ||
      worker.runtime.version !== expected.runtime.version ||
      worker.connectorBindings.length !== 1 ||
      binding?.connectorId !== expected.connectorBindings[0]!.connectorId ||
      binding.version !== expected.connectorBindings[0]!.version ||
      !sameStrings(binding.capabilities, ["COLLECT"]) ||
      !sameStrings(worker.supportedJobTypes, expected.supportedJobTypes) ||
      worker.maxConcurrency !== expected.maxConcurrency ||
      stable(worker.labels) !== stable(expected.labels) ||
      stable(worker.extensions) !== stable(expected.extensions)
    )
      continue;
    if (!rotateExisting) {
      return { workerId: worker.id, credential: null, provisioning: "REUSED" as const };
    }
    const rotated = repository.rotateCredential(worker.id);
    return {
      workerId: worker.id,
      credential: rotated.credential,
      provisioning: "ROTATED" as const,
    };
  }
  const created = repository.create(expected as unknown as CreateWorkerInput);
  return {
    workerId: created.view.worker.id,
    credential: created.credential,
    provisioning: "CREATED" as const,
  };
}

function validateJob(
  value: unknown,
  input: {
    plan: CnipaGazetteBrowserAuthorityPlan;
    planId: string;
    sourceId: string;
  },
): string {
  const job = objectValue(value, "dispatched Job");
  if (job.planId !== input.planId || job.sourceId !== input.sourceId) {
    throw new RegistryValidationError(
      "Dispatched Gazette browser Job escaped prepared plan/source",
    );
  }
  const context = {
    workerId: "wrk_validation",
    leaseToken: "validation-only",
    lease: { id: "lse_validation" },
    job,
  } as unknown as ArtifactBackedExecutionContext;
  const parsed = cnipaGazetteBrowserStreamJobFromContext(context);
  if (parsed.announcementIssue !== input.plan.announcementIssue) {
    throw new RegistryValidationError("Dispatched Gazette browser Job issue mismatch");
  }
  const id = job.id;
  if (typeof id !== "string" || !/^job_[0-9A-HJKMNP-TV-Z]{26}$/u.test(id)) {
    throw new RegistryValidationError("Dispatched Gazette browser Job id is invalid");
  }
  return id;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new RegistryValidationError(`${label} must be a positive integer`);
  }
  return value as number;
}

function browserRunRecord(
  runId: string,
  workspaceId: string,
  plan: CnipaGazetteBrowserAuthorityPlan,
  planSha256: string,
) {
  const record = getExecutionLedgerRepository().getById(runId);
  if (!record || record.run.workspaceId !== workspaceId) {
    throw new RegistryValidationError("Gazette browser run is unavailable");
  }
  const source = getSourceRepository().getById(record.run.sourceId);
  if (
    !source ||
    source.extensions?.["x-markorbit-gazette-browser-operation"] !== plan.operationId ||
    source.extensions?.["x-markorbit-gazette-browser-frozen-plan-sha256"] !== planSha256 ||
    source.extensions?.["x-markorbit-historical-replay-activated"] !== false
  ) {
    throw new RegistryValidationError("Gazette browser run is outside the frozen browser scope");
  }
  return record;
}

async function verifiedArtifactJson(
  view: ReturnType<ReturnType<typeof getRawArtifactRepository>["getArtifact"]>,
) {
  if (!view) throw new RegistryValidationError("Gazette browser artifact is unavailable");
  const content = getRawArtifactRepository().contentPath(view.artifact.id);
  const bytes = await readFile(content.path);
  const observedSha = createHash("sha256").update(bytes).digest("hex");
  if (
    bytes.byteLength !== view.artifact.sizeBytes ||
    observedSha !== view.artifact.binaryHash.value
  ) {
    throw new RegistryValidationError("Gazette browser artifact storage integrity mismatch");
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new RegistryValidationError("Gazette browser artifact is not valid JSON");
  }
}

function admissionArtifactRef(
  view: NonNullable<ReturnType<ReturnType<typeof getRawArtifactRepository>["getArtifact"]>>,
) {
  if (!view.artifact.canonicalUri) {
    throw new RegistryValidationError("Gazette browser admission seed is missing canonical URI");
  }
  return {
    artifactId: view.artifact.id,
    canonicalUri: view.artifact.canonicalUri,
    sha256: view.artifact.binaryHash.value,
    sizeBytes: view.artifact.sizeBytes,
  };
}

function listAllRunArtifacts(input: {
  workspaceId: string;
  runId: string;
  q: string;
}) {
  const repository = getRawArtifactRepository();
  const items: ReturnType<typeof repository.list>["items"] = [];
  let offset = 0;
  let total = 0;
  do {
    const page = repository.list({
      workspaceId: input.workspaceId,
      runId: input.runId,
      artifactKind: "JSON",
      q: input.q,
      limit: 100,
      offset,
    });
    total = page.total;
    items.push(...page.items);
    offset += page.items.length;
    if (items.length > 10_000) {
      throw new RegistryValidationError("Gazette browser artifact set exceeds bounded limit");
    }
    if (page.items.length === 0 && offset < total) {
      throw new RegistryValidationError("Gazette browser artifact pagination stalled");
    }
  } while (offset < total);
  return { items, total };
}

async function buildAdmissionPlanFromBrowserRun(input: {
  workspaceId: string;
  browserPlan: CnipaGazetteBrowserAuthorityPlan;
  browserPlanSha256: string;
  runId: string;
  authorityIssueNumber: number;
  operationId: string;
  dataEngineUrl: string;
}) {
  browserRunRecord(input.runId, input.workspaceId, input.browserPlan, input.browserPlanSha256);
  const artifacts = getRawArtifactRepository();

  const identityResult = artifacts.list({
    workspaceId: input.workspaceId,
    runId: input.runId,
    artifactKind: "JSON",
    q: "dataset-identity",
    limit: 10,
  });
  if (identityResult.total !== 1 || identityResult.items.length !== 1) {
    throw new RegistryValidationError(
      "Completed Gazette browser run must contain exactly one dataset identity",
    );
  }
  const identityView = identityResult.items[0]!;
  const identityRaw = objectValue(await verifiedArtifactJson(identityView), "dataset identity");
  const identity = objectValue(identityRaw.identity, "dataset identity.identity");
  const queryScope = objectValue(identity.queryScope, "dataset identity.queryScope");
  const sourceDatasetSha256 = text(identityRaw.sourceDatasetSha256, "sourceDatasetSha256");
  if (!/^[a-f0-9]{64}$/u.test(sourceDatasetSha256)) {
    throw new RegistryValidationError("Gazette dataset identity SHA-256 is invalid");
  }
  const announcementIssue = positiveInteger(identity.announcementIssue, "announcementIssue");
  const sourceRecordCount = positiveInteger(identity.sourceRecordCount, "sourceRecordCount");
  const logicalPageCount = positiveInteger(identity.sourcePageCount, "logicalPageCount");
  const logicalPageSize = positiveInteger(identity.pageSize, "logicalPageSize");
  const browserSourcePageSize = positiveInteger(
    identity.sourceCapturePageSize,
    "browserSourcePageSize",
  );
  const browserSourcePageCount = positiveInteger(
    identity.sourceCapturePageCount,
    "browserSourcePageCount",
  );
  const announcementDate = text(identity.announcementDate, "announcementDate");
  if (
    announcementIssue !== input.browserPlan.announcementIssue ||
    logicalPageSize !== 100 ||
    queryScope.announcementTypeSelection !== "ALL" ||
    queryScope.anncType !== ""
  ) {
    throw new RegistryValidationError("Gazette dataset identity escaped frozen browser scope");
  }
  const expectedIdentityCanonical = `cnipa://trademark-gazette/issue/${announcementIssue}/dataset/${sourceDatasetSha256}`;
  if (identityView.artifact.canonicalUri !== expectedIdentityCanonical) {
    throw new RegistryValidationError("Gazette dataset identity canonical URI mismatch");
  }

  const chunkResult = listAllRunArtifacts({
    workspaceId: input.workspaceId,
    runId: input.runId,
    q: "/fact-admission/chunk/",
  });
  if (
    chunkResult.total < 1 ||
    chunkResult.total > 10_000 ||
    chunkResult.items.length !== chunkResult.total
  ) {
    throw new RegistryValidationError(
      "Gazette browser run must expose 1..10000 frozen CHUNK requests",
    );
  }

  const chunkRequests = [];
  for (const view of chunkResult.items) {
    const raw = objectValue(await verifiedArtifactJson(view), "CHUNK request");
    const payload = objectValue(raw.payload, "CHUNK request.payload");
    const range = objectValue(raw.range, "CHUNK request.range");
    const startPage = positiveInteger(range.startPage, "CHUNK request.range.startPage");
    const endPage = positiveInteger(range.endPage, "CHUNK request.range.endPage");
    if (
      raw.operation !== "CHUNK" ||
      raw.announcementIssue !== announcementIssue ||
      raw.sourceDatasetSha256 !== sourceDatasetSha256 ||
      payload.source_record_count !== sourceRecordCount ||
      payload.source_page_count !== logicalPageCount ||
      payload.page_size !== 100 ||
      payload.range_start_page !== startPage ||
      payload.range_end_page !== endPage
    ) {
      throw new RegistryValidationError("Gazette CHUNK request does not match dataset identity");
    }
    chunkRequests.push({
      range: { startPage, endPage },
      requestRef: admissionArtifactRef(view),
    });
  }
  chunkRequests.sort((left, right) => left.range.startPage - right.range.startPage);

  const finalSourcePageRowCount =
    sourceRecordCount - (browserSourcePageCount - 1) * browserSourcePageSize;
  const finalLogicalPageRowCount = sourceRecordCount - (logicalPageCount - 1) * 100;

  const plan = parseCnipaGazetteBrowserAdmissionPlan({
    version: 1,
    operationId: input.operationId,
    workspaceId: input.workspaceId,
    authorityMode: "INTERNAL_SERVICE_GO_V1",
    executionMode: "APPLY_DISPATCH_ONCE",
    workerMode: "PROVISION_ONE_SHOT",
    stage: "BROWSER_DATASET_ADMISSION",
    authorityIssueNumber: input.authorityIssueNumber,
    announcementIssue,
    announcementDate,
    sourceRecordCount,
    browserSourcePageSize,
    browserSourcePageCount,
    finalSourcePageRowCount,
    logicalPageSize: 100,
    logicalPageCount,
    finalLogicalPageRowCount,
    range: { startPage: 1, endPage: logicalPageCount },
    announcementTypeSelection: "ALL",
    anncType: "",
    acquisitionMode: "MO_CNIPA_NORMAL_BROWSER_STREAM_V1",
    captureTool: "MO CNIPA Network Capture",
    captureToolVersion: input.browserPlan.captureToolVersion,
    sourceDatasetSha256,
    datasetIdentityRef: admissionArtifactRef(identityView),
    chunkRequests,
    dataEngineUrl: input.dataEngineUrl,
    historicalReplayActivated: false,
  });
  const planSha256 = cnipaGazetteBrowserAdmissionPlanSha256(plan);
  return {
    plan,
    planSha256,
    expectedAuthorityToken: expectedCnipaGazetteBrowserAdmissionAuthorityToken(plan, planSha256),
  };
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const workspaceId = text(body.workspaceId, "workspaceId");
    const operation = text(body.operation, "operation");
    if (operation !== "PREPARE_BROWSER_JOB" && operation !== "BUILD_ADMISSION_PLAN") {
      throw new RegistryValidationError("Unsupported CNIPA Gazette browser-stream operation");
    }
    const authority = objectValue(body.authority, "authority");
    const plan = parseCnipaGazetteBrowserAuthorityPlan(authority.frozenPlan);
    const access = authenticateCnipaGazetteBrowserRequest(request, {
      workspaceId,
      frozenPlan: plan,
      planSha256: authority.planSha256,
    });

    if (operation === "BUILD_ADMISSION_PLAN") {
      const payload = objectValue(body.payload ?? {}, "payload");
      const runId = text(payload.runId, "runId");
      const authorityIssueNumber = positiveInteger(
        payload.authorityIssueNumber,
        "authorityIssueNumber",
      );
      const operationId = text(payload.operationId, "operationId");
      const dataEngineUrl = text(payload.dataEngineUrl, "dataEngineUrl");
      const result = await buildAdmissionPlanFromBrowserRun({
        workspaceId,
        browserPlan: plan,
        browserPlanSha256: access.planSha256,
        runId,
        authorityIssueNumber,
        operationId,
        dataEngineUrl,
      });
      return NextResponse.json({
        ...result,
        sourceBrowserRunId: runId,
        historicalReplayActivated: false,
      });
    }

    ensureConnector();
    const source = ensureSource(plan);
    const collectionPlan = ensurePlan({ plan, planSha256: access.planSha256, sourceId: source.id });
    const mayDispatch = plan.dispatchMode === "PREPARE_AND_DISPATCH_ONCE";
    const worker = provisionWorker(workspaceId, mayDispatch);

    if (!mayDispatch) {
      return NextResponse.json({
        sourceId: source.id,
        collectionPlanId: collectionPlan.id,
        workerId: worker.workerId,
        workerCredential: worker.credential,
        workerProvisioning: worker.provisioning,
        runId: null,
        jobId: null,
        replayed: false,
        dispatchPerformed: false,
        captureToolBundleSha256: plan.captureToolBundleSha256,
        historicalReplayActivated: false,
      });
    }

    const dispatched = getExecutionLedgerRepository().dispatchManual({
      planId: collectionPlan.id,
      requestedBy: { actorType: "API_CLIENT", actorId: access.actorId },
      idempotencyKey: `cnipa-gazette-browser-${access.planSha256}`,
      extensions: {
        "x-markorbit-gazette-browser-operation": plan.operationId,
        "x-markorbit-gazette-browser-frozen-plan-sha256": access.planSha256,
        "x-markorbit-capture-tool-bundle-sha256": plan.captureToolBundleSha256,
        "x-markorbit-historical-replay-activated": false,
      },
    });
    const jobs = dispatched.record.jobs;
    if (jobs.length !== 1)
      throw new RegistryValidationError("Gazette browser dispatch must create exactly one Job");
    const jobId = validateJob(jobs[0], { plan, planId: collectionPlan.id, sourceId: source.id });
    return NextResponse.json({
      sourceId: source.id,
      collectionPlanId: collectionPlan.id,
      workerId: worker.workerId,
      workerCredential: worker.credential,
      workerProvisioning: worker.provisioning,
      runId: dispatched.record.run.id,
      jobId,
      replayed: dispatched.replayed,
      dispatchPerformed: true,
      captureToolBundleSha256: plan.captureToolBundleSha256,
      historicalReplayActivated: false,
    });
  } catch (error) {
    return apiError(error);
  }
}
