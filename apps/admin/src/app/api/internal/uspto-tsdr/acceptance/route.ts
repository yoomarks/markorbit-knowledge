import { NextResponse } from "next/server";
import { RegistryValidationError, type CreateSourceInput } from "@markorbit/persistence";
import type { CreateCollectionPlanInput } from "@markorbit/persistence/collection-plans";
import type { CreateConnectorManifestInput } from "@markorbit/persistence/connectors";
import type { CreateWorkerInput } from "@markorbit/persistence/workers";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { authenticateUsptoTsdrAcceptanceRequest } from "@/server/uspto-tsdr-acceptance-auth";
import {
  getCollectionPlanRepository,
  getConnectorRepository,
  getExecutionLedgerRepository,
  getSourceRepository,
  getWorkerRegistryRepository,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONNECTOR_ID = "uspto-tsdr";
const CONNECTOR_VERSION = "1.0.0";
const TSDR_ORIGIN = "https://tsdrapi.uspto.gov";
const WORKER_LABEL = "uspto-tsdr-governed-worker-v1";
const SECRET_REF = /^sec_[0-9A-HJKMNP-TV-Z]{26}$/;
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RegistryValidationError(label + " is required");
  }
  return value.trim();
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RegistryValidationError(label + " must be an object");
  }
  return value as Record<string, unknown>;
}

function tsdrConnector(value: unknown): void {
  const connector = object(value, "connector");
  if (connector.connectorId !== CONNECTOR_ID || connector.version !== CONNECTOR_VERSION) {
    throw new RegistryValidationError("TSDR acceptance connector identity mismatch");
  }
}

function assertTsdrSourceInput(value: unknown, workspaceId: string): CreateSourceInput {
  const source = object(value, "source");
  if (source.workspaceId !== workspaceId) {
    throw new RegistryValidationError("TSDR acceptance source workspace mismatch");
  }
  tsdrConnector(source.connector);
  if (source.canonicalUri !== TSDR_ORIGIN) {
    throw new RegistryValidationError("TSDR acceptance source origin mismatch");
  }
  if (typeof source.secretRef !== "string" || !SECRET_REF.test(source.secretRef)) {
    throw new RegistryValidationError("TSDR acceptance source requires a governed secretRef");
  }
  const extensions = object(source.extensions, "source.extensions");
  if (
    extensions["x-markorbit-tsdr-target-serial-only"] !== true ||
    extensions["x-markorbit-legal-effect-claim"] !== false
  ) {
    throw new RegistryValidationError("TSDR acceptance source boundary markers are required");
  }
  return source as unknown as CreateSourceInput;
}

function assertTsdrSourceRecord(sourceId: string, workspaceId: string): void {
  const source = getSourceRepository().getById(sourceId);
  if (!source || source.workspaceId !== workspaceId) {
    throw new RegistryValidationError("TSDR acceptance source is not in the authorized workspace");
  }
  tsdrConnector(source.connector);
  if (source.canonicalUri !== TSDR_ORIGIN) {
    throw new RegistryValidationError("TSDR acceptance source origin mismatch");
  }
}

function assertTsdrPlanInput(
  value: unknown,
  workspaceId: string,
  planSha256: string,
): CreateCollectionPlanInput {
  const plan = object(value, "plan");
  if (plan.workspaceId !== workspaceId) {
    throw new RegistryValidationError("TSDR acceptance plan workspace mismatch");
  }
  const sourceId = text(plan.sourceId, "plan.sourceId");
  assertTsdrSourceRecord(sourceId, workspaceId);
  const extensions = object(plan.extensions, "plan.extensions");
  if (extensions["x-markorbit-tsdr-frozen-plan-sha256"] !== planSha256) {
    throw new RegistryValidationError("TSDR acceptance CollectionPlan SHA mismatch");
  }
  return plan as unknown as CreateCollectionPlanInput;
}

function sameStrings(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}

function assertTsdrWorkerInput(value: unknown, workspaceId: string): CreateWorkerInput {
  const worker = object(value, "worker");
  const runtime = object(worker.runtime, "worker.runtime");
  const bindings = Array.isArray(worker.connectorBindings) ? worker.connectorBindings : [];
  const binding = object(bindings[0], "worker.connectorBindings[0]");
  if (
    worker.workspaceId !== workspaceId ||
    worker.displayName !== "USPTO TSDR Governed Evidence Worker" ||
    worker.desiredState !== "ACTIVE" ||
    runtime.runtimeId !== "uspto-tsdr-worker" ||
    runtime.version !== CONNECTOR_VERSION ||
    !sameStrings(worker.supportedJobTypes, ["API_COLLECTION"]) ||
    bindings.length !== 1 ||
    binding.connectorId !== CONNECTOR_ID ||
    binding.version !== CONNECTOR_VERSION ||
    !sameStrings(binding.capabilities, ["COLLECT"]) ||
    worker.maxConcurrency !== 1 ||
    !Array.isArray(worker.labels) ||
    !worker.labels.includes(WORKER_LABEL)
  ) {
    throw new RegistryValidationError("TSDR acceptance Worker definition mismatch");
  }
  return worker as unknown as CreateWorkerInput;
}

function sameGovernedWorker(
  value: unknown,
  expected: CreateWorkerInput,
  workspaceId: string,
): boolean {
  const container = object(value, "worker view");
  const worker = object(container.worker ?? container, "worker");
  const runtime = object(worker.runtime, "worker.runtime");
  const bindings = Array.isArray(worker.connectorBindings) ? worker.connectorBindings : [];
  const binding = object(bindings[0], "worker.connectorBindings[0]");
  return (
    worker.workspaceId === workspaceId &&
    worker.displayName === expected.displayName &&
    runtime.runtimeId === expected.runtime.runtimeId &&
    runtime.version === expected.runtime.version &&
    worker.maxConcurrency === expected.maxConcurrency &&
    sameStrings(worker.supportedJobTypes, expected.supportedJobTypes) &&
    bindings.length === 1 &&
    binding.connectorId === CONNECTOR_ID &&
    binding.version === CONNECTOR_VERSION &&
    sameStrings(binding.capabilities, ["COLLECT"]) &&
    Array.isArray(worker.labels) &&
    worker.labels.includes(WORKER_LABEL)
  );
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const workspaceId = text(body.workspaceId, "workspaceId");
    const operation = text(body.operation, "operation");
    const payload = object(body.payload ?? {}, "payload");
    const authority = object(body.authority, "authority");
    const access = authenticateUsptoTsdrAcceptanceRequest(request, {
      workspaceId,
      frozenPlan: authority.frozenPlan,
      planSha256: authority.planSha256,
    });
    if (operation === "GET_CONNECTOR") {
      return NextResponse.json({
        connector: getConnectorRepository().get(CONNECTOR_ID, CONNECTOR_VERSION),
      });
    }

    if (operation === "CREATE_CONNECTOR") {
      const manifest = object(payload.manifest, "manifest");
      tsdrConnector(manifest);
      const connector = getConnectorRepository().create(
        manifest as unknown as CreateConnectorManifestInput,
      );
      return NextResponse.json({ connector }, { status: 201 });
    }

    if (operation === "LIST_SOURCES") {
      const slug = text(payload.slug, "slug");
      return NextResponse.json(getSourceRepository().list({ workspaceId, q: slug, limit: 100 }));
    }

    if (operation === "CREATE_SOURCE") {
      const source = getSourceRepository().create(
        assertTsdrSourceInput(payload.source, workspaceId),
      );
      return NextResponse.json({ source }, { status: 201 });
    }
    if (operation === "LIST_PLANS") {
      const sourceId = text(payload.sourceId, "sourceId");
      assertTsdrSourceRecord(sourceId, workspaceId);
      return NextResponse.json(
        getCollectionPlanRepository().list({ workspaceId, sourceId, limit: 100 }),
      );
    }

    if (operation === "CREATE_PLAN") {
      const plan = getCollectionPlanRepository().create(
        assertTsdrPlanInput(payload.plan, workspaceId, access.planSha256),
      );
      return NextResponse.json({ plan }, { status: 201 });
    }

    if (operation === "PROVISION_WORKER") {
      const expected = assertTsdrWorkerInput(payload.worker, workspaceId);
      const repository = getWorkerRegistryRepository();
      const existing = repository.list({
        workspaceId,
        label: WORKER_LABEL,
        limit: 100,
      });
      for (const candidate of existing.items) {
        if (!sameGovernedWorker(candidate, expected, workspaceId)) continue;
        const workerId = text(object(candidate.worker ?? candidate, "worker").id, "worker.id");
        const rotated = repository.rotateCredential(workerId);
        return NextResponse.json({
          workerId,
          credential: rotated.credential,
          provisioning: "ROTATED",
        });
      }
      if (existing.items.length > 0) {
        throw new RegistryValidationError(
          "Existing TSDR governed Worker drifted from the frozen runtime definition",
        );
      }
      const created = repository.create(expected);
      return NextResponse.json(
        {
          workerId: created.view.worker.id,
          credential: created.credential,
          provisioning: "CREATED",
        },
        { status: 201 },
      );
    }

    if (operation === "LIST_WORKERS") {
      return NextResponse.json(
        getWorkerRegistryRepository().list({
          workspaceId,
          label: WORKER_LABEL,
          limit: 100,
        }),
      );
    }

    if (operation === "DISPATCH_RUN") {
      const planId = text(payload.planId, "planId");
      const planRecord = getCollectionPlanRepository().getById(planId);
      if (!planRecord || planRecord.plan.workspaceId !== workspaceId) {
        throw new RegistryValidationError("TSDR acceptance CollectionPlan workspace mismatch");
      }
      assertTsdrSourceRecord(planRecord.plan.sourceId, workspaceId);
      const extensions = planRecord.plan.extensions ?? {};
      if (extensions["x-markorbit-tsdr-frozen-plan-sha256"] !== access.planSha256) {
        throw new RegistryValidationError("TSDR acceptance dispatch SHA mismatch");
      }
      const idempotencyKey = text(payload.idempotencyKey, "idempotencyKey");
      const result = getExecutionLedgerRepository().dispatchManual({
        planId,
        requestedBy: { actorType: "API_CLIENT", actorId: access.actorId },
        idempotencyKey,
      });
      return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
    }

    throw new RegistryValidationError("Unsupported TSDR acceptance transport operation");
  } catch (error) {
    return apiError(error);
  }
}
