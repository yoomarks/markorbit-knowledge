import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { CROSS_SOURCE_PARENT_ARTIFACT_IDS_EXTENSION } from "@markorbit/contracts";
import {
  CNIPA_GAZETTE_ACCEPTANCE_STAGES,
  cnipaGazetteAcceptanceCaptureImportConfig,
  cnipaGazetteAcceptanceCollectionPlanPayload,
  cnipaGazetteAcceptancePlanSha256,
  cnipaGazetteAcceptanceConnectorManifest,
  cnipaGazetteAcceptanceSourcePayload,
  cnipaGazetteAcceptanceWorkerPayload,
  parseCnipaGazetteAcceptancePlan,
  type CnipaGazetteAcceptanceRuntimeStage,
} from "@markorbit/worker-runtime";
import { RegistryValidationError, type CreateSourceInput } from "@markorbit/persistence";
import type { CreateCollectionPlanInput } from "@markorbit/persistence/collection-plans";
import type { CreateConnectorManifestInput } from "@markorbit/persistence/connectors";
import type { CreateWorkerInput } from "@markorbit/persistence/workers";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { authenticateCnipaGazetteAcceptanceRequest } from "@/server/cnipa-gazette-acceptance-auth";
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

function stage(value: unknown): CnipaGazetteAcceptanceRuntimeStage {
  if (
    typeof value !== "string" ||
    !CNIPA_GAZETTE_ACCEPTANCE_STAGES.includes(value as CnipaGazetteAcceptanceRuntimeStage)
  ) {
    throw new RegistryValidationError("stage is invalid");
  }
  return value as CnipaGazetteAcceptanceRuntimeStage;
}
function artifactReference(value: unknown, label: string) {
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
    throw new RegistryValidationError("Referenced acceptance RawArtifact is unavailable");
  }
  return view;
}
function verifyReference(
  reference: ReturnType<typeof artifactReference>,
  workspaceId: string,
  planSha256: string,
  expectedStage: CnipaGazetteAcceptanceRuntimeStage,
) {
  const view = artifactMetadata(reference.artifactId, workspaceId);
  const runId = view.artifact.collectionRunId;
  if (!runId) {
    throw new RegistryValidationError(
      "Referenced acceptance RawArtifact is not bound to a CollectionRun",
    );
  }
  assertAcceptanceRun(runId, workspaceId, planSha256, expectedStage);
  if (
    view.artifact.artifactKind !== "JSON" ||
    view.artifact.canonicalUri !== reference.canonicalUri ||
    view.artifact.binaryHash.value !== reference.sha256 ||
    view.artifact.sizeBytes !== reference.sizeBytes
  ) {
    throw new RegistryValidationError(
      "Referenced acceptance RawArtifact does not match immutable ref",
    );
  }
  return view;
}

function connectorConfigAndGrants(
  runtimeStage: CnipaGazetteAcceptanceRuntimeStage,
  rawConfig: unknown,
  workspaceId: string,
  plan: ReturnType<typeof parseCnipaGazetteAcceptancePlan>,
) {
  if (runtimeStage === "IMPORT_CAPTURE") {
    const config = objectValue(rawConfig, "connectorConfig");
    const captureSha256 = text(config.captureSha256, "captureSha256").toLowerCase();
    const captureOriginalName = text(config.captureOriginalName, "captureOriginalName");
    const captureSizeBytes = config.captureSizeBytes;
    if (
      !/^[a-f0-9]{64}$/u.test(captureSha256) ||
      !Number.isSafeInteger(captureSizeBytes) ||
      (captureSizeBytes as number) < 1
    ) {
      throw new RegistryValidationError("Gazette capture identity is invalid");
    }
    const expected = cnipaGazetteAcceptanceCaptureImportConfig(plan, {
      sha256: captureSha256,
      sizeBytes: captureSizeBytes as number,
      originalName: captureOriginalName,
    });
    if (stable(rawConfig) !== stable(expected)) {
      throw new RegistryValidationError(
        "Gazette IMPORT_CAPTURE config must equal the frozen issue-75 scope",
      );
    }
    return { connectorConfig: expected, grants: [] as string[] };
  }
  const config = objectValue(rawConfig, "connectorConfig");
  const planSha256 = cnipaGazetteAcceptancePlanSha256(plan);
  if (runtimeStage === "PUBLISH_CHUNK" || runtimeStage === "PUBLISH_FINALIZE") {
    if (config.intent !== "PUBLISH_DURABLE_REQUEST") {
      throw new RegistryValidationError("Gazette publisher intent is invalid");
    }
    const reference = artifactReference(config.requestArtifactRef, "requestArtifactRef");
    const expectedParentStage =
      runtimeStage === "PUBLISH_CHUNK" ? "IMPORT_CAPTURE" : "BUILD_FINALIZE";
    const view = verifyReference(reference, workspaceId, planSha256, expectedParentStage);
    const expectedMarker = runtimeStage === "PUBLISH_CHUNK" ? "chunk" : "finalize";
    if (
      !view.artifact.originalName.includes("fact-admission-request") ||
      !view.artifact.originalName.toLowerCase().includes(expectedMarker)
    ) {
      throw new RegistryValidationError("Gazette publisher request artifact stage mismatch");
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
  verifyReference(datasetIdentityRef, workspaceId, planSha256, "IMPORT_CAPTURE");
  const rawReceipts = config.chunkReceiptRefs;
  if (!Array.isArray(rawReceipts) || rawReceipts.length !== 1) {
    throw new RegistryValidationError("Issue-75 acceptance requires exactly one CHUNK receipt");
  }
  const chunkReceiptRefs = rawReceipts.map((value, index) =>
    artifactReference(value, `chunkReceiptRefs[${index}]`),
  );
  for (const ref of chunkReceiptRefs) {
    verifyReference(ref, workspaceId, planSha256, "PUBLISH_CHUNK");
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

function ensureConnector(runtimeStage: CnipaGazetteAcceptanceRuntimeStage) {
  const expected = cnipaGazetteAcceptanceConnectorManifest(runtimeStage);
  const repository = getConnectorRepository();
  const existing = repository.get(expected.connectorId, expected.version);
  if (existing) {
    if (
      stable(existing.manifest.sourceTypes) !== stable(expected.sourceTypes) ||
      stable(existing.manifest.outputArtifactKinds) !== stable(expected.outputArtifactKinds)
    ) {
      throw new RegistryValidationError("Existing Gazette acceptance connector drifted");
    }
    return existing;
  }
  return repository.create(expected as unknown as CreateConnectorManifestInput);
}

function ensureSource(input: {
  runtimeStage: CnipaGazetteAcceptanceRuntimeStage;
  plan: ReturnType<typeof parseCnipaGazetteAcceptancePlan>;
  connectorConfig: Record<string, unknown>;
}) {
  const expected = cnipaGazetteAcceptanceSourcePayload({
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
      throw new RegistryValidationError("Existing Gazette acceptance Source drifted");
    }
    return existing;
  }
  return repository.create(expected as unknown as CreateSourceInput);
}

function ensurePlan(input: {
  runtimeStage: CnipaGazetteAcceptanceRuntimeStage;
  plan: ReturnType<typeof parseCnipaGazetteAcceptancePlan>;
  sourceId: string;
}) {
  const expected = cnipaGazetteAcceptanceCollectionPlanPayload({
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
      throw new RegistryValidationError("Existing Gazette acceptance CollectionPlan drifted");
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

function provisionWorker(workspaceId: string, runtimeStage: CnipaGazetteAcceptanceRuntimeStage) {
  const expected = cnipaGazetteAcceptanceWorkerPayload(workspaceId, runtimeStage);
  const repository = getWorkerRegistryRepository();
  const existing = repository.list({ workspaceId, label: "issue-75", limit: 100 });
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

function assertAcceptanceRun(
  runId: string,
  workspaceId: string,
  planSha256: string,
  expectedStage?: CnipaGazetteAcceptanceRuntimeStage,
) {
  const record = getExecutionLedgerRepository().getById(runId);
  if (!record || record.run.workspaceId !== workspaceId) {
    throw new RegistryValidationError("Gazette acceptance run is unavailable");
  }
  const source = getSourceRepository().getById(record.run.sourceId);
  if (
    !source ||
    source.extensions?.["x-markorbit-gazette-frozen-plan-sha256"] !== planSha256 ||
    (expectedStage !== undefined &&
      source.extensions?.["x-markorbit-gazette-acceptance-stage"] !== expectedStage)
  ) {
    throw new RegistryValidationError("Run is outside the frozen Gazette acceptance scope");
  }
  return record;
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

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const workspaceId = text(body.workspaceId, "workspaceId");
    const operation = text(body.operation, "operation");
    const authority = objectValue(body.authority, "authority");
    const plan = parseCnipaGazetteAcceptancePlan(authority.frozenPlan);
    const access = authenticateCnipaGazetteAcceptanceRequest(request, {
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
        "x-markorbit-gazette-acceptance-operation": plan.operationId,
        "x-markorbit-gazette-acceptance-stage": runtimeStage,
        "x-markorbit-gazette-frozen-plan-sha256": access.planSha256,
        ...(prepared.grants.length > 0
          ? { [CROSS_SOURCE_PARENT_ARTIFACT_IDS_EXTENSION]: prepared.grants }
          : {}),
      };
      const dispatched = getExecutionLedgerRepository().dispatchManual({
        planId: collectionPlan.id,
        requestedBy: { actorType: "API_CLIENT", actorId: access.actorId },
        idempotencyKey: `cnipa-gazette-acceptance-${runtimeStage}-${access.planSha256.slice(0, 24)}-${rawDispatchAttemptKey}`,
        extensions,
      });
      const jobs = dispatched.record.jobs;
      if (jobs.length !== 1) {
        throw new RegistryValidationError("Gazette acceptance stage must dispatch exactly one Job");
      }
      return NextResponse.json({
        runtimeStage,
        sourceId: source.id,
        collectionPlanId: collectionPlan.id,
        workerId: worker.workerId,
        workerCredential: worker.credential,
        workerProvisioning: worker.provisioning,
        runId: dispatched.record.run.id,
        jobId: jobs[0]!.id,
        replayed: dispatched.replayed,
      });
    }

    if (operation === "LIST_RUN_ARTIFACTS") {
      const runId = text(payload.runId, "runId");
      assertAcceptanceRun(runId, workspaceId, access.planSha256);
      const result = getRawArtifactRepository().list({
        workspaceId,
        runId,
        limit: 100,
      });
      return NextResponse.json({ items: result.items.map(safeArtifactView), total: result.total });
    }

    if (operation === "READ_JSON_ARTIFACT") {
      const runId = text(payload.runId, "runId");
      const artifactId = text(payload.artifactId, "artifactId");
      assertAcceptanceRun(runId, workspaceId, access.planSha256);
      const view = artifactMetadata(artifactId, workspaceId);
      if (view.artifact.collectionRunId !== runId || view.artifact.artifactKind !== "JSON") {
        throw new RegistryValidationError("Gazette acceptance JSON artifact is outside the run");
      }
      const content = getRawArtifactRepository().contentPath(artifactId);
      const bytes = await readFile(content.path);
      if (
        bytes.byteLength !== view.artifact.sizeBytes ||
        createHash("sha256").update(bytes).digest("hex") !== view.artifact.binaryHash.value
      ) {
        throw new RegistryValidationError("Gazette acceptance artifact storage integrity mismatch");
      }
      let json: unknown;
      try {
        json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
      } catch {
        throw new RegistryValidationError("Gazette acceptance artifact is not valid JSON");
      }
      return NextResponse.json({ artifact: safeArtifactView(view), json });
    }

    throw new RegistryValidationError("Unsupported CNIPA Gazette acceptance operation");
  } catch (error) {
    return apiError(error);
  }
}
