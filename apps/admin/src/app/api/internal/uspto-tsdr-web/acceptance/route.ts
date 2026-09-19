import { NextResponse } from "next/server";
import { RegistryValidationError, type CreateSourceInput } from "@markorbit/persistence";
import type { CreateCollectionPlanInput } from "@markorbit/persistence/collection-plans";
import type { CreateWorkerInput } from "@markorbit/persistence/workers";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { authenticateUsptoTsdrWebAcceptanceRequest } from "@/server/uspto-tsdr-web-acceptance-auth";
import {
  getCollectionPlanRepository,
  getConnectorRepository,
  getExecutionLedgerRepository,
  getSourceRepository,
  getWorkerRegistryRepository,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONNECTOR_ID = "crawl4ai-web";
const CONNECTOR_VERSION = "1.3.0";
const WORKER_LABEL = "uspto-tsdr-web-governed-worker-v1";

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RegistryValidationError(`${label} is required`);
  }
  return value.trim();
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RegistryValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function sameStrings(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}

function assertOfficialTsdrWebUri(
  raw: unknown,
  expected: { stage: string; serialNumber: string },
): void {
  const value = text(raw, "source canonicalUri");
  const url = new URL(value);
  if (url.origin !== "https://tsdr.uspto.gov" || url.username || url.password || url.hash) {
    throw new RegistryValidationError("TSDR Web acceptance source origin mismatch");
  }
  const expectedUri =
    expected.stage === "STATUS"
      ? `https://tsdr.uspto.gov/statusview/sn${expected.serialNumber}`
      : expected.stage === "MARK_IMAGE"
        ? `https://tsdr.uspto.gov/img/${expected.serialNumber}/large`
        : `https://tsdr.uspto.gov/documentviewer?caseId=sn${expected.serialNumber}`;
  if (url.toString() !== expectedUri) {
    throw new RegistryValidationError("TSDR Web acceptance source URI does not match frozen plan");
  }
}

function assertConnector(value: unknown): void {
  const connector = object(value, "connector");
  if (connector.connectorId !== CONNECTOR_ID || connector.version !== CONNECTOR_VERSION) {
    throw new RegistryValidationError("TSDR Web acceptance connector identity mismatch");
  }
}

function assertSourceInput(
  value: unknown,
  workspaceId: string,
  expected: { stage: string; serialNumber: string; transportMode: string },
): CreateSourceInput {
  const source = object(value, "source");
  if (source.workspaceId !== workspaceId || source.sourceType !== "WEB") {
    throw new RegistryValidationError("TSDR Web acceptance source boundary mismatch");
  }
  assertConnector(source.connector);
  assertOfficialTsdrWebUri(source.canonicalUri, expected);
  if ("secretRef" in source && source.secretRef) {
    throw new RegistryValidationError("TSDR Web acceptance source must not persist a secretRef");
  }
  const extensions = object(source.extensions, "source.extensions");
  if (
    extensions["x-markorbit-tsdr-acquisition-channel"] !== "WEB" ||
    extensions["x-markorbit-tsdr-web-acceptance-stage"] !== expected.stage ||
    extensions["x-markorbit-tsdr-web-transport-mode"] !== expected.transportMode ||
    extensions["x-markorbit-tsdr-target-serial-only"] !== true ||
    extensions["x-markorbit-legal-effect-claim"] !== false
  ) {
    throw new RegistryValidationError("TSDR Web acceptance source boundary markers are required");
  }
  return source as unknown as CreateSourceInput;
}

function assertSourceRecord(
  sourceId: string,
  workspaceId: string,
  expected: { stage: string; serialNumber: string },
): void {
  const source = getSourceRepository().getById(sourceId);
  if (!source || source.workspaceId !== workspaceId || source.sourceType !== "WEB") {
    throw new RegistryValidationError(
      "TSDR Web acceptance source is not in the authorized workspace",
    );
  }
  assertConnector(source.connector);
  assertOfficialTsdrWebUri(source.canonicalUri, expected);
}

function assertPlanInput(
  value: unknown,
  workspaceId: string,
  planSha256: string,
  expected: { stage: string; serialNumber: string; transportMode: string },
): CreateCollectionPlanInput {
  const plan = object(value, "plan");
  if (plan.workspaceId !== workspaceId) {
    throw new RegistryValidationError("TSDR Web acceptance plan workspace mismatch");
  }
  const sourceId = text(plan.sourceId, "plan.sourceId");
  assertSourceRecord(sourceId, workspaceId, expected);
  const policy = object(plan.policy, "plan.policy");
  if (
    policy.maxDepth !== 0 ||
    policy.maxItems !== 1 ||
    policy.respectRobots !== true ||
    typeof policy.rateLimitPerMinute !== "number" ||
    policy.rateLimitPerMinute > 12
  ) {
    throw new RegistryValidationError("TSDR Web acceptance CollectionPlan policy mismatch");
  }
  const extensions = object(plan.extensions, "plan.extensions");
  if (
    extensions["x-markorbit-tsdr-acquisition-channel"] !== "WEB" ||
    extensions["x-markorbit-tsdr-web-acceptance-stage"] !== expected.stage ||
    extensions["x-markorbit-tsdr-web-transport-mode"] !== expected.transportMode ||
    policy.renderJavascript !== (expected.transportMode === "BROWSER_PROXY") ||
    extensions["x-markorbit-tsdr-web-frozen-plan-sha256"] !== planSha256
  ) {
    throw new RegistryValidationError("TSDR Web acceptance CollectionPlan SHA/channel mismatch");
  }
  return plan as unknown as CreateCollectionPlanInput;
}

function assertWorkerInput(value: unknown, workspaceId: string): CreateWorkerInput {
  const worker = object(value, "worker");
  const runtime = object(worker.runtime, "worker.runtime");
  const bindings = Array.isArray(worker.connectorBindings) ? worker.connectorBindings : [];
  const binding = object(bindings[0], "worker.connectorBindings[0]");
  if (
    worker.workspaceId !== workspaceId ||
    worker.displayName !== "USPTO TSDR Web Governed Evidence Worker" ||
    worker.desiredState !== "ACTIVE" ||
    runtime.runtimeId !== "uspto-tsdr-web-worker" ||
    runtime.version !== "1.0.0" ||
    !sameStrings(worker.supportedJobTypes, ["WEB_CRAWL"]) ||
    bindings.length !== 1 ||
    binding.connectorId !== CONNECTOR_ID ||
    binding.version !== CONNECTOR_VERSION ||
    !sameStrings(binding.capabilities, ["COLLECT"]) ||
    worker.maxConcurrency !== 1 ||
    !Array.isArray(worker.labels) ||
    !worker.labels.includes(WORKER_LABEL)
  ) {
    throw new RegistryValidationError("TSDR Web acceptance Worker definition mismatch");
  }
  return worker as unknown as CreateWorkerInput;
}

function sameWorker(value: unknown, expected: CreateWorkerInput, workspaceId: string): boolean {
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
    const access = authenticateUsptoTsdrWebAcceptanceRequest(request, {
      workspaceId,
      frozenPlan: authority.frozenPlan,
      planSha256: authority.planSha256,
    });

    if (operation === "GET_CONNECTOR") {
      const connector = getConnectorRepository().get(CONNECTOR_ID, CONNECTOR_VERSION);
      if (!connector) {
        throw new RegistryValidationError(
          "Governed crawl4ai-web@1.3.0 connector is not registered",
        );
      }
      return NextResponse.json({ connector });
    }

    if (operation === "LIST_SOURCES") {
      const slug = text(payload.slug, "slug");
      return NextResponse.json(getSourceRepository().list({ workspaceId, q: slug, limit: 100 }));
    }

    if (operation === "CREATE_SOURCE") {
      const source = getSourceRepository().create(
        assertSourceInput(payload.source, workspaceId, access),
      );
      return NextResponse.json({ source }, { status: 201 });
    }

    if (operation === "LIST_PLANS") {
      const sourceId = text(payload.sourceId, "sourceId");
      assertSourceRecord(sourceId, workspaceId, access);
      return NextResponse.json(
        getCollectionPlanRepository().list({ workspaceId, sourceId, limit: 100 }),
      );
    }

    if (operation === "CREATE_PLAN") {
      const plan = getCollectionPlanRepository().create(
        assertPlanInput(payload.plan, workspaceId, access.planSha256, access),
      );
      return NextResponse.json({ plan }, { status: 201 });
    }

    if (operation === "PROVISION_WORKER") {
      const expected = assertWorkerInput(payload.worker, workspaceId);
      const repository = getWorkerRegistryRepository();
      const existing = repository.list({ workspaceId, label: WORKER_LABEL, limit: 100 });
      for (const candidate of existing.items) {
        if (!sameWorker(candidate, expected, workspaceId)) continue;
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
          "Existing TSDR Web governed Worker drifted from the frozen runtime definition",
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

    if (operation === "DISPATCH_RUN") {
      const planId = text(payload.planId, "planId");
      const planRecord = getCollectionPlanRepository().getById(planId);
      if (!planRecord || planRecord.plan.workspaceId !== workspaceId) {
        throw new RegistryValidationError("TSDR Web acceptance CollectionPlan workspace mismatch");
      }
      assertSourceRecord(planRecord.plan.sourceId, workspaceId, access);
      const extensions = planRecord.plan.extensions ?? {};
      if (extensions["x-markorbit-tsdr-web-frozen-plan-sha256"] !== access.planSha256) {
        throw new RegistryValidationError("TSDR Web acceptance dispatch SHA mismatch");
      }
      const result = getExecutionLedgerRepository().dispatchManual({
        planId,
        requestedBy: { actorType: "API_CLIENT", actorId: access.actorId },
        idempotencyKey: text(payload.idempotencyKey, "idempotencyKey"),
      });
      return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
    }

    throw new RegistryValidationError("Unsupported TSDR Web acceptance transport operation");
  } catch (error) {
    return apiError(error);
  }
}
