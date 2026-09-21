import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { CROSS_SOURCE_PARENT_ARTIFACT_IDS_EXTENSION } from "@markorbit/contracts";
import {
  CNIPA_GAZETTE_BROWSER_ADMISSION_STAGES,
  cnipaGazetteBrowserAdmissionCollectionPlanPayload,
  cnipaGazetteBrowserAdmissionConnectorManifest,
  cnipaGazetteBrowserAdmissionPlanSha256,
  cnipaGazetteBrowserAdmissionSourcePayload,
  cnipaGazetteBrowserAdmissionWorkerPayload,
  parseCnipaGazetteBrowserAdmissionPlan,
  type CnipaGazetteBrowserAdmissionArtifactRef,
  type CnipaGazetteBrowserAdmissionRuntimeStage,
} from "@markorbit/worker-runtime";
import { RegistryValidationError, type CreateSourceInput } from "@markorbit/persistence";
import type { CreateCollectionPlanInput } from "@markorbit/persistence/collection-plans";
import type { CreateConnectorManifestInput } from "@markorbit/persistence/connectors";
import type { CreateWorkerInput } from "@markorbit/persistence/workers";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { authenticateCnipaGazetteBrowserAdmissionRequest } from "@/server/cnipa-gazette-browser-admission-auth";
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
  if (typeof value !== "string" || !value.trim()) {
    throw new RegistryValidationError(`${label} is required`);
  }
  return value.trim();
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RegistryValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map((child) => JSON.parse(stable(child))));
  if (value && typeof value === "object") {
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, JSON.parse(stable(child))]),
      ),
    );
  }
  return JSON.stringify(value);
}

function stage(value: unknown): CnipaGazetteBrowserAdmissionRuntimeStage {
  if (
    typeof value !== "string" ||
    !CNIPA_GAZETTE_BROWSER_ADMISSION_STAGES.includes(
      value as CnipaGazetteBrowserAdmissionRuntimeStage,
    )
  ) {
    throw new RegistryValidationError("stage is invalid");
  }
  return value as CnipaGazetteBrowserAdmissionRuntimeStage;
}

function artifactReference(value: unknown, label: string): CnipaGazetteBrowserAdmissionArtifactRef {
  const raw = objectValue(value, label);
  const artifactId = text(raw.artifactId, `${label}.artifactId`);
  const canonicalUri = text(raw.canonicalUri, `${label}.canonicalUri`);
  const sha256 = text(raw.sha256, `${label}.sha256`).toLowerCase();
  const sizeBytes = raw.sizeBytes;
  if (
    !/^art_[0-9A-HJKMNP-TV-Z]{26}$/u.test(artifactId) ||
    !/^[a-f0-9]{64}$/u.test(sha256) ||
    !Number.isSafeInteger(sizeBytes) ||
    (sizeBytes as number) < 1
  ) {
    throw new RegistryValidationError(`${label} is invalid`);
  }
  return { artifactId, canonicalUri, sha256, sizeBytes: sizeBytes as number };
}

function artifactMetadata(artifactId: string, workspaceId: string) {
  const view = getRawArtifactRepository().getArtifact(artifactId);
  if (!view || view.artifact.workspaceId !== workspaceId) {
    throw new RegistryValidationError("Referenced Gazette RawArtifact is unavailable");
  }
  return view;
}

function verifyExactReference(
  reference: CnipaGazetteBrowserAdmissionArtifactRef,
  workspaceId: string,
) {
  const view = artifactMetadata(reference.artifactId, workspaceId);
  if (
    view.artifact.artifactKind !== "JSON" ||
    view.artifact.canonicalUri !== reference.canonicalUri ||
    view.artifact.binaryHash.value !== reference.sha256 ||
    view.artifact.sizeBytes !== reference.sizeBytes
  ) {
    throw new RegistryValidationError("Referenced Gazette RawArtifact does not match immutable ref");
  }
  return view;
}

function assertBrowserSeed(
  reference: CnipaGazetteBrowserAdmissionArtifactRef,
  workspaceId: string,
  role: "DATASET_IDENTITY" | "CHUNK_REQUEST",
  datasetIdentityArtifactId: string,
) {
  const view = verifyExactReference(reference, workspaceId);
  const runId = view.artifact.collectionRunId;
  if (!runId) {
    throw new RegistryValidationError("Browser seed RawArtifact is not bound to a CollectionRun");
  }
  const run = getExecutionLedgerRepository().getById(runId);
  const source = run ? getSourceRepository().getById(run.run.sourceId) : null;
  const config =
    source?.connectorConfig && typeof source.connectorConfig === "object"
      ? (source.connectorConfig as Record<string, unknown>)
      : {};
  if (
    !run ||
    run.run.workspaceId !== workspaceId ||
    !source ||
    source.sourceType !== "API" ||
    source.connector.connectorId !== "cnipa-trademark-gazette" ||
    source.connector.version !== "1.0.0" ||
    config.acquisitionMode !== "NORMAL_BROWSER_BRIDGE_V1" ||
    source.extensions?.["x-markorbit-browser-auth-owned-by-browser"] !== true ||
    source.extensions?.["x-markorbit-historical-replay-activated"] !== false
  ) {
    throw new RegistryValidationError(
      "Browser seed RawArtifact is outside the governed normal-browser source boundary",
    );
  }
  if (
    role === "CHUNK_REQUEST" &&
    !view.artifact.provenance.parentArtifactIds?.includes(datasetIdentityArtifactId)
  ) {
    throw new RegistryValidationError(
      "Browser CHUNK request does not descend from the frozen dataset identity",
    );
  }
  return view;
}

function assertAdmissionRun(
  runId: string,
  workspaceId: string,
  planSha256: string,
  expectedStage?: CnipaGazetteBrowserAdmissionRuntimeStage,
) {
  const record = getExecutionLedgerRepository().getById(runId);
  if (!record || record.run.workspaceId !== workspaceId) {
    throw new RegistryValidationError("Gazette browser admission run is unavailable");
  }
  const source = getSourceRepository().getById(record.run.sourceId);
  if (
    !source ||
    source.extensions?.["x-markorbit-gazette-browser-admission-plan-sha256"] !== planSha256 ||
    (expectedStage !== undefined &&
      source.extensions?.["x-markorbit-gazette-browser-admission-stage"] !== expectedStage)
  ) {
    throw new RegistryValidationError("Run is outside the frozen Gazette browser admission scope");
  }
  return record;
}

function verifyAdmissionReference(
  reference: CnipaGazetteBrowserAdmissionArtifactRef,
  workspaceId: string,
  planSha256: string,
  expectedStage: CnipaGazetteBrowserAdmissionRuntimeStage,
) {
  const view = verifyExactReference(reference, workspaceId);
  const runId = view.artifact.collectionRunId;
  if (!runId) {
    throw new RegistryValidationError("Referenced downstream RawArtifact has no CollectionRun");
  }
  assertAdmissionRun(runId, workspaceId, planSha256, expectedStage);
  return view;
}

function connectorConfigAndGrants(
  runtimeStage: CnipaGazetteBrowserAdmissionRuntimeStage,
  rawConfig: unknown,
  workspaceId: string,
  plan: ReturnType<typeof parseCnipaGazetteBrowserAdmissionPlan>,
) {
  const config = objectValue(rawConfig, "connectorConfig");
  const planSha256 = cnipaGazetteBrowserAdmissionPlanSha256(plan);
  if (runtimeStage === "PUBLISH_CHUNK") {
    if (config.intent !== "PUBLISH_DURABLE_REQUEST") {
      throw new RegistryValidationError("Gazette publisher intent is invalid");
    }
    const reference = artifactReference(config.requestArtifactRef, "requestArtifactRef");
    if (stable(reference) !== stable(plan.chunkRequestRef)) {
      throw new RegistryValidationError("PUBLISH_CHUNK must use the frozen browser CHUNK request ref");
    }
    const view = assertBrowserSeed(
      reference,
      workspaceId,
      "CHUNK_REQUEST",
      plan.datasetIdentityRef.artifactId,
    );
    if (
      view.artifact.originalName.toLowerCase() !==
      "cnipa-gazette-issue-75-chunk-1-6-fact-admission-request.json"
    ) {
      throw new RegistryValidationError("Browser CHUNK request artifact stage mismatch");
    }
    return {
      connectorConfig: { intent: "PUBLISH_DURABLE_REQUEST", requestArtifactRef: reference },
      grants: [reference.artifactId],
    };
  }

  if (runtimeStage === "PUBLISH_FINALIZE") {
    if (config.intent !== "PUBLISH_DURABLE_REQUEST") {
      throw new RegistryValidationError("Gazette publisher intent is invalid");
    }
    const reference = artifactReference(config.requestArtifactRef, "requestArtifactRef");
    const view = verifyAdmissionReference(
      reference,
      workspaceId,
      planSha256,
      "BUILD_FINALIZE",
    );
    if (
      view.artifact.originalName.toLowerCase() !==
      "cnipa-gazette-issue-75-fact-admission-finalize-request.json"
    ) {
      throw new RegistryValidationError("Gazette FINALIZE request artifact stage mismatch");
    }
    return {
      connectorConfig: { intent: "PUBLISH_DURABLE_REQUEST", requestArtifactRef: reference },
      grants: [reference.artifactId],
    };
  }

  if (config.intent !== "BUILD_FINALIZE_REQUEST") {
    throw new RegistryValidationError("Gazette finalize-builder intent is invalid");
  }
  const datasetIdentityRef = artifactReference(config.datasetIdentityRef, "datasetIdentityRef");
  if (stable(datasetIdentityRef) !== stable(plan.datasetIdentityRef)) {
    throw new RegistryValidationError("BUILD_FINALIZE must use the frozen browser dataset identity");
  }
  assertBrowserSeed(
    datasetIdentityRef,
    workspaceId,
    "DATASET_IDENTITY",
    plan.datasetIdentityRef.artifactId,
  );
  const rawReceipts = config.chunkReceiptRefs;
  if (!Array.isArray(rawReceipts) || rawReceipts.length !== 1) {
    throw new RegistryValidationError("Issue-75 browser admission requires exactly one CHUNK receipt");
  }
  const chunkReceiptRefs = rawReceipts.map((value, index) =>
    artifactReference(value, `chunkReceiptRefs[${index}]`),
  );
  for (const reference of chunkReceiptRefs) {
    const view = verifyAdmissionReference(
      reference,
      workspaceId,
      planSha256,
      "PUBLISH_CHUNK",
    );
    if (
      view.artifact.originalName.toLowerCase() !==
      "cnipa-gazette-issue-75-chunk-1-6-fact-admission-receipt.json"
    ) {
      throw new RegistryValidationError("Gazette CHUNK receipt artifact stage mismatch");
    }
  }
  return {
    connectorConfig: {
      intent: "BUILD_FINALIZE_REQUEST",
      datasetIdentityRef,
      chunkReceiptRefs,
    },
    grants: [datasetIdentityRef.artifactId, ...chunkReceiptRefs.map((ref) => ref.artifactId)],
  };
}

function ensureConnector(runtimeStage: CnipaGazetteBrowserAdmissionRuntimeStage) {
  const expected = cnipaGazetteBrowserAdmissionConnectorManifest(runtimeStage);
  const repository = getConnectorRepository();
  const existing = repository.get(expected.connectorId, expected.version);
  if (existing) {
    if (
      stable(existing.manifest.sourceTypes) !== stable(expected.sourceTypes) ||
      stable(existing.manifest.outputArtifactKinds) !== stable(expected.outputArtifactKinds)
    ) {
      throw new RegistryValidationError("Existing Gazette downstream connector drifted");
    }
    return existing;
  }
  return repository.create(expected as unknown as CreateConnectorManifestInput);
}

function ensureSource(input: {
  runtimeStage: CnipaGazetteBrowserAdmissionRuntimeStage;
  plan: ReturnType<typeof parseCnipaGazetteBrowserAdmissionPlan>;
  connectorConfig: Record<string, unknown>;
}) {
  const expected = cnipaGazetteBrowserAdmissionSourcePayload({
    plan: input.plan,
    stage: input.runtimeStage,
    connectorConfig: input.connectorConfig,
  });
  const repository = getSourceRepository();
  const listed = repository.list({
    workspaceId: input.plan.workspaceId,
    q: expected.slug,
    limit: 100,
  });
  const existing = listed.items.find((item) => item.slug === expected.slug);
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
      existing.canonicalUri !== expected.canonicalUri ||
      stable(existing.entrypoints) !== stable(expected.entrypoints) ||
      stable(existing.tags) !== stable(expected.tags) ||
      stable(existing.extensions) !== stable(expected.extensions)
    ) {
      throw new RegistryValidationError("Existing Gazette browser admission Source drifted");
    }
    return existing;
  }
  return repository.create(expected as unknown as CreateSourceInput);
}

function ensurePlan(input: {
  runtimeStage: CnipaGazetteBrowserAdmissionRuntimeStage;
  plan: ReturnType<typeof parseCnipaGazetteBrowserAdmissionPlan>;
  sourceId: string;
}) {
  const expected = cnipaGazetteBrowserAdmissionCollectionPlanPayload({
    sourceId: input.sourceId,
    plan: input.plan,
    stage: input.runtimeStage,
  });
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
      throw new RegistryValidationError("Existing Gazette browser admission CollectionPlan drifted");
    }
    return value;
  }
  return repository.create(expected as unknown as CreateCollectionPlanInput).plan;
}

function sameStrings(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}

function provisionWorker(
  workspaceId: string,
  runtimeStage: CnipaGazetteBrowserAdmissionRuntimeStage,
) {
  const expected = cnipaGazetteBrowserAdmissionWorkerPayload(workspaceId, runtimeStage);
  const repository = getWorkerRegistryRepository();
  const existing = repository.list({ workspaceId, label: "browser-admission", limit: 100 });
  for (const candidate of existing.items) {
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
    ) {
      continue;
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

function safeArtifactView(view: ReturnType<typeof artifactMetadata>) {
  return {
    artifactId: view.artifact.id,
    artifactKind: view.artifact.artifactKind,
    originalName: view.artifact.originalName,
    canonicalUri: view.artifact.canonicalUri ?? null,
    sha256: view.artifact.binaryHash.value,
    sizeBytes: view.artifact.sizeBytes,
    sourceId: view.artifact.sourceId,
    runId: view.artifact.collectionRunId,
    parentArtifactIds: view.artifact.provenance.parentArtifactIds ?? [],
  };
}

async function readArtifactJson(view: ReturnType<typeof artifactMetadata>) {
  const content = getRawArtifactRepository().contentPath(view.artifact.id);
  const bytes = await readFile(content.path);
  if (
    bytes.byteLength !== view.artifact.sizeBytes ||
    createHash("sha256").update(bytes).digest("hex") !== view.artifact.binaryHash.value
  ) {
    throw new RegistryValidationError("Gazette artifact storage integrity mismatch");
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new RegistryValidationError("Gazette artifact is not valid JSON");
  }
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const workspaceId = text(body.workspaceId, "workspaceId");
    const operation = text(body.operation, "operation");
    const authority = objectValue(body.authority, "authority");
    const plan = parseCnipaGazetteBrowserAdmissionPlan(authority.frozenPlan);
    const access = authenticateCnipaGazetteBrowserAdmissionRequest(request, {
      workspaceId,
      frozenPlan: plan,
      planSha256: authority.planSha256,
    });
    const payload = objectValue(body.payload ?? {}, "payload");

    if (operation === "PREPARE_STAGE") {
      const runtimeStage = stage(payload.stage);
      const rawDispatchAttemptKey =
        payload.dispatchAttemptKey === undefined
          ? "default"
          : text(payload.dispatchAttemptKey, "dispatchAttemptKey");
      if (!/^[a-z0-9-]{1,48}$/u.test(rawDispatchAttemptKey)) {
        throw new RegistryValidationError("Gazette dispatch attempt key is invalid");
      }
      const prepared = connectorConfigAndGrants(
        runtimeStage,
        payload.connectorConfig,
        workspaceId,
        plan,
      );
      ensureConnector(runtimeStage);
      const source = ensureSource({
        runtimeStage,
        plan,
        connectorConfig: prepared.connectorConfig,
      });
      const collectionPlan = ensurePlan({ runtimeStage, plan, sourceId: source.id });
      const worker = provisionWorker(workspaceId, runtimeStage);
      const extensions = {
        "x-markorbit-gazette-browser-admission-operation": plan.operationId,
        "x-markorbit-gazette-browser-admission-stage": runtimeStage,
        "x-markorbit-gazette-browser-admission-plan-sha256": access.planSha256,
        ...(prepared.grants.length > 0
          ? { [CROSS_SOURCE_PARENT_ARTIFACT_IDS_EXTENSION]: prepared.grants }
          : {}),
      };
      const dispatched = getExecutionLedgerRepository().dispatchManual({
        planId: collectionPlan.id,
        requestedBy: { actorType: "API_CLIENT", actorId: access.actorId },
        idempotencyKey:
          `cnipa-gazette-browser-admission-${runtimeStage}-${access.planSha256.slice(0, 24)}-${rawDispatchAttemptKey}`,
        extensions,
      });
      if (dispatched.record.jobs.length !== 1) {
        throw new RegistryValidationError(
          "Gazette browser admission stage must dispatch exactly one Job",
        );
      }
      return NextResponse.json({
        runtimeStage,
        sourceId: source.id,
        collectionPlanId: collectionPlan.id,
        workerId: worker.workerId,
        workerCredential: worker.credential,
        workerProvisioning: worker.provisioning,
        runId: dispatched.record.run.id,
        jobId: dispatched.record.jobs[0]!.id,
        replayed: dispatched.replayed,
      });
    }

    if (operation === "LIST_RUN_ARTIFACTS") {
      const runId = text(payload.runId, "runId");
      assertAdmissionRun(runId, workspaceId, access.planSha256);
      const result = getRawArtifactRepository().list({ workspaceId, runId, limit: 100 });
      return NextResponse.json({ items: result.items.map(safeArtifactView), total: result.total });
    }

    if (operation === "READ_JSON_ARTIFACT") {
      const runId = text(payload.runId, "runId");
      const artifactId = text(payload.artifactId, "artifactId");
      assertAdmissionRun(runId, workspaceId, access.planSha256);
      const view = artifactMetadata(artifactId, workspaceId);
      if (view.artifact.collectionRunId !== runId || view.artifact.artifactKind !== "JSON") {
        throw new RegistryValidationError("Gazette browser admission JSON artifact is outside the run");
      }
      return NextResponse.json({ artifact: safeArtifactView(view), json: await readArtifactJson(view) });
    }

    if (operation === "READ_SEED_JSON_ARTIFACT") {
      const artifactId = text(payload.artifactId, "artifactId");
      const role =
        artifactId === plan.datasetIdentityRef.artifactId
          ? ("DATASET_IDENTITY" as const)
          : artifactId === plan.chunkRequestRef.artifactId
            ? ("CHUNK_REQUEST" as const)
            : null;
      if (!role) {
        throw new RegistryValidationError("Requested seed artifact is outside the frozen plan");
      }
      const reference =
        role === "DATASET_IDENTITY" ? plan.datasetIdentityRef : plan.chunkRequestRef;
      const view = assertBrowserSeed(
        reference,
        workspaceId,
        role,
        plan.datasetIdentityRef.artifactId,
      );
      return NextResponse.json({ artifact: safeArtifactView(view), json: await readArtifactJson(view) });
    }

    throw new RegistryValidationError("Unsupported CNIPA Gazette browser admission operation");
  } catch (error) {
    return apiError(error);
  }
}
