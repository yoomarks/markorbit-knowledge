import { NextResponse } from "next/server";
import {
  cnipaGazetteBrowserConnectorManifest,
  cnipaGazetteBrowserPlanPayload,
  cnipaGazetteBrowserSourcePayload,
  cnipaGazetteBrowserStreamJobFromContext,
  cnipaGazetteBrowserWorkerPayload,
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
export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const workspaceId = text(body.workspaceId, "workspaceId");
    if (body.operation !== "PREPARE_BROWSER_JOB") {
      throw new RegistryValidationError("Unsupported CNIPA Gazette browser-stream operation");
    }
    const authority = objectValue(body.authority, "authority");
    const plan = parseCnipaGazetteBrowserAuthorityPlan(authority.frozenPlan);
    const access = authenticateCnipaGazetteBrowserRequest(request, {
      workspaceId,
      frozenPlan: plan,
      planSha256: authority.planSha256,
    });

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
