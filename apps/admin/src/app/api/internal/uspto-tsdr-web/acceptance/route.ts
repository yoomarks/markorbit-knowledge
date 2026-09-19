import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { RegistryValidationError, type CreateSourceInput } from "@markorbit/persistence";
import type { CreateCollectionPlanInput } from "@markorbit/persistence/collection-plans";
import type { CreateWorkerInput } from "@markorbit/persistence/workers";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { authenticateUsptoTsdrWebAcceptanceRequest } from "@/server/uspto-tsdr-web-acceptance-auth";
import { verifyUsptoTsdrWebSelectedDocumentParentEvidence } from "@/server/uspto-tsdr-web-selected-document-parent";
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

function sourceStage(expectedStage: string): string {
  return expectedStage === "SELECTED_DOCUMENT" ? "DOCUMENT_INDEX" : expectedStage;
}

function assertOfficialTsdrWebUri(
  raw: unknown,
  expected: { stage: string; serialNumber: string },
): void {
  const value = text(raw, "source canonicalUri");
  const url = new URL(value);
  const expectedStage = sourceStage(expected.stage);
  if (url.origin !== "https://tsdr.uspto.gov" || url.username || url.password || url.hash) {
    throw new RegistryValidationError("TSDR Web acceptance source origin mismatch");
  }
  const expectedUri =
    expectedStage === "STATUS"
      ? `https://tsdr.uspto.gov/statusview/sn${expected.serialNumber}`
      : expectedStage === "MARK_IMAGE"
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
  expected: {
    stage: string;
    serialNumber: string;
    transportMode: string;
    robotsPolicy: string;
  },
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
    extensions["x-markorbit-tsdr-web-acceptance-stage"] !== sourceStage(expected.stage) ||
    extensions["x-markorbit-tsdr-web-transport-mode"] !== expected.transportMode ||
    extensions["x-markorbit-tsdr-web-robots-policy"] !== expected.robotsPolicy ||
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
  expected: {
    stage: string;
    serialNumber: string;
    transportMode: string;
    robotsPolicy: string;
  },
): void {
  const source = getSourceRepository().getById(sourceId);
  if (!source || source.workspaceId !== workspaceId || source.sourceType !== "WEB") {
    throw new RegistryValidationError(
      "TSDR Web acceptance source is not in the authorized workspace",
    );
  }
  assertConnector(source.connector);
  assertOfficialTsdrWebUri(source.canonicalUri, expected);
  const extensions = source.extensions ?? {};
  if (
    extensions["x-markorbit-tsdr-web-acceptance-stage"] !== sourceStage(expected.stage) ||
    extensions["x-markorbit-tsdr-web-transport-mode"] !== expected.transportMode ||
    extensions["x-markorbit-tsdr-web-robots-policy"] !== expected.robotsPolicy
  ) {
    throw new RegistryValidationError("TSDR Web acceptance source execution semantics mismatch");
  }
}

function assertPlanInput(
  value: unknown,
  workspaceId: string,
  planSha256: string,
  expected: {
    stage: string;
    serialNumber: string;
    transportMode: string;
    robotsPolicy: string;
    document?: {
      sourceIndexArtifactId: string;
      sourceIndexArtifactSha256: string;
      sourceDocumentId: string;
      classifierIdentity: string;
      classifierVersion: string;
    };
  },
): CreateCollectionPlanInput {
  const plan = object(value, "plan");
  if (plan.workspaceId !== workspaceId) {
    throw new RegistryValidationError("TSDR Web acceptance plan workspace mismatch");
  }
  const sourceId = text(plan.sourceId, "plan.sourceId");
  assertSourceRecord(sourceId, workspaceId, expected);
  const policy = object(plan.policy, "plan.policy");
  const selected = expected.stage === "SELECTED_DOCUMENT";
  const rateLimitCeiling = selected ? 4 : 12;
  if (
    policy.maxDepth !== 0 ||
    policy.maxItems !== 1 ||
    policy.respectRobots !== true ||
    policy.renderJavascript !== false ||
    typeof policy.rateLimitPerMinute !== "number" ||
    !Number.isInteger(policy.rateLimitPerMinute) ||
    policy.rateLimitPerMinute < 1 ||
    policy.rateLimitPerMinute > rateLimitCeiling
  ) {
    throw new RegistryValidationError("TSDR Web acceptance CollectionPlan policy mismatch");
  }
  const output = object(plan.output, "plan.output");
  const expectedArtifactKinds =
    expected.stage === "MARK_IMAGE" ? ["IMAGE"] : selected ? ["PDF"] : ["HTML"];
  if (!sameStrings(output.artifactKinds, expectedArtifactKinds)) {
    throw new RegistryValidationError("TSDR Web acceptance CollectionPlan output mismatch");
  }
  const extensions = object(plan.extensions, "plan.extensions");
  if (
    extensions["x-markorbit-tsdr-acquisition-channel"] !== "WEB" ||
    extensions["x-markorbit-tsdr-web-acceptance-stage"] !== expected.stage ||
    extensions["x-markorbit-tsdr-web-transport-mode"] !== expected.transportMode ||
    extensions["x-markorbit-tsdr-web-robots-policy"] !== expected.robotsPolicy ||
    extensions["x-markorbit-tsdr-web-frozen-plan-sha256"] !== planSha256
  ) {
    throw new RegistryValidationError("TSDR Web acceptance CollectionPlan SHA/channel mismatch");
  }
  if (selected) {
    const document = expected.document;
    if (
      !document ||
      extensions["x-markorbit-tsdr-web-selected-parent-artifact-id"] !==
        document.sourceIndexArtifactId ||
      extensions["x-markorbit-tsdr-web-selected-parent-sha256"] !==
        document.sourceIndexArtifactSha256 ||
      extensions["x-markorbit-tsdr-web-selected-document-id"] !== document.sourceDocumentId ||
      extensions["x-markorbit-tsdr-web-selected-document-family"] !== "OFFICE_ACTION" ||
      extensions["x-markorbit-tsdr-web-selected-classifier"] !==
        `${document.classifierIdentity}@${document.classifierVersion}`
    ) {
      throw new RegistryValidationError(
        "TSDR Web selected-document CollectionPlan lineage mismatch",
      );
    }
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
      if (access.stage === "SELECTED_DOCUMENT") {
        throw new RegistryValidationError(
          "Selected TSDR Web documents must reuse the immutable document-index Source",
        );
      }
      const source = getSourceRepository().create(
        assertSourceInput(payload.source, workspaceId, access),
      );
      return NextResponse.json({ source }, { status: 201 });
    }

    if (operation === "VERIFY_SELECTED_DOCUMENT_PARENT") {
      if (access.stage !== "SELECTED_DOCUMENT" || !access.document) {
        throw new RegistryValidationError(
          "Selected-document parent verification requires SELECTED_DOCUMENT authority",
        );
      }
      const artifacts = getRawArtifactRepository();
      const view = artifacts.getArtifact(access.document.sourceIndexArtifactId);
      if (!view) {
        throw new RegistryValidationError("Selected-document parent RawArtifact was not found");
      }
      const content = readFileSync(artifacts.contentPath(view.artifact.id).path);
      let verified: { sourceId: string };
      try {
        verified = verifyUsptoTsdrWebSelectedDocumentParentEvidence({
          workspaceId,
          serialNumber: access.serialNumber,
          document: access.document,
          parent: {
            workspaceId: view.artifact.workspaceId,
            sourceId: view.artifact.sourceId,
            artifactId: view.artifact.id,
            artifactKind: view.artifact.artifactKind,
            mimeType: view.artifact.mimeType,
            canonicalUri: view.artifact.canonicalUri ?? null,
            sha256: view.contentObject.sha256,
            sizeBytes: view.contentObject.sizeBytes,
            content,
          },
        });
      } catch (error) {
        throw new RegistryValidationError(
          error instanceof Error
            ? error.message
            : "Selected-document parent evidence verification failed",
        );
      }
      assertSourceRecord(verified.sourceId, workspaceId, access);
      return NextResponse.json({
        sourceId: verified.sourceId,
        parentArtifactId: access.document.sourceIndexArtifactId,
      });
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
