import { createHash } from "node:crypto";
import path from "node:path";
import {
  CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_ID,
  CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
  CNIPA_GAZETTE_FACT_ADMISSION_JOB_SOURCE,
} from "./cnipa-gazette-fact-admission-job-acquirer";
import {
  CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_ID,
  CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_VERSION,
  CNIPA_GAZETTE_FINALIZE_JOB_SOURCE,
} from "./cnipa-gazette-finalize-job-acquirer";
import {
  CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_ID,
  CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_VERSION,
  CNIPA_GAZETTE_CAPTURE_IMPORT_SOURCE,
} from "./cnipa-gazette-capture-import-job-acquirer";

export const CNIPA_GAZETTE_ACCEPTANCE_AUTHORITY_MODE = "INTERNAL_SERVICE_GO_V1" as const;
export const CNIPA_GAZETTE_ACCEPTANCE_STAGE = "FULL_CHAIN" as const;

export const CNIPA_GAZETTE_ACCEPTANCE_STAGES = [
  "ACQUIRE",
  "PUBLISH_CHUNK",
  "BUILD_FINALIZE",
  "PUBLISH_FINALIZE",
] as const;
export type CnipaGazetteAcceptanceRuntimeStage = (typeof CNIPA_GAZETTE_ACCEPTANCE_STAGES)[number];

export type CnipaGazetteAcceptancePlan = {
  version: 2;
  operationId: string;
  workspaceId: string;
  authorityMode: typeof CNIPA_GAZETTE_ACCEPTANCE_AUTHORITY_MODE;
  executionMode: "APPLY_DISPATCH_ONCE";
  workerMode: "PROVISION_ONE_SHOT";
  stage: typeof CNIPA_GAZETTE_ACCEPTANCE_STAGE;
  announcementIssue: 75;
  announcementDate: "1983-08-15";
  sourceRecordCount: 576;
  sourcePageCount: 6;
  pageSize: 100;

  finalPageRowCount: 76;
  range: { startPage: 1; endPage: 6 };
  announcementTypeSelection: "ALL";
  anncType: "";
  acquisitionMode: "MO_CNIPA_NETWORK_CAPTURE_IMPORT";
  captureToolVersion: "0.9.4";
  captureFilePath: string;
  captureFileSha256: string;
  dataEngineUrl: string;
};

const OPERATION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const WORKSPACE_ID = /^wsp_[0-9A-HJKMNP-TV-Z]{26}$/u;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`CNIPA Gazette acceptance plan invalid: ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string) {
  const set = new Set(allowed);

  const extra = Object.keys(value).filter((key) => !set.has(key));
  if (extra.length > 0) {
    throw new Error(
      `CNIPA Gazette acceptance plan invalid: ${label} contains unsupported keys: ${extra.join(", ")}`,
    );
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function dataEngineUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("CNIPA Gazette acceptance plan invalid: dataEngineUrl is required");
  }

  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("CNIPA Gazette acceptance plan invalid: dataEngineUrl must use http or https");
  }
  return url.toString().replace(/\/$/u, "");
}

function captureFilePath(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("CNIPA Gazette acceptance plan invalid: captureFilePath must be absolute");
  }
  const normalized = value.trim();
  if (!path.isAbsolute(normalized) && !path.win32.isAbsolute(normalized)) {
    throw new Error("CNIPA Gazette acceptance plan invalid: captureFilePath must be absolute");
  }
  return path.win32.isAbsolute(normalized)
    ? path.win32.normalize(normalized)
    : path.resolve(normalized);
}

function captureFileSha256(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value.trim().toLowerCase())) {
    throw new Error(
      "CNIPA Gazette acceptance plan invalid: captureFileSha256 must be 64 hexadecimal characters",
    );
  }
  return value.trim().toLowerCase();
}

export function cnipaGazetteAcceptancePlanSha256(plan: CnipaGazetteAcceptancePlan): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(plan)))
    .digest("hex");
}

export function parseCnipaGazetteAcceptancePlan(value: unknown): CnipaGazetteAcceptancePlan {
  const input = objectValue(value, "root");
  exactKeys(
    input,
    [
      "version",
      "operationId",
      "workspaceId",
      "authorityMode",
      "executionMode",
      "workerMode",
      "stage",
      "announcementIssue",
      "announcementDate",

      "sourceRecordCount",
      "sourcePageCount",
      "pageSize",
      "finalPageRowCount",
      "range",
      "announcementTypeSelection",
      "anncType",
      "acquisitionMode",
      "captureToolVersion",
      "captureFilePath",
      "captureFileSha256",
      "dataEngineUrl",
    ],
    "root",
  );
  if (input.version !== 2)
    throw new Error("CNIPA Gazette acceptance plan invalid: version must be 2");
  if (typeof input.operationId !== "string" || !OPERATION_ID.test(input.operationId)) {
    throw new Error("CNIPA Gazette acceptance plan invalid: operationId must be a lowercase slug");
  }
  if (typeof input.workspaceId !== "string" || !WORKSPACE_ID.test(input.workspaceId)) {
    throw new Error("CNIPA Gazette acceptance plan invalid: workspaceId must be Schema v1");
  }
  if (input.authorityMode !== CNIPA_GAZETTE_ACCEPTANCE_AUTHORITY_MODE) {
    throw new Error("CNIPA Gazette acceptance plan invalid: authorityMode mismatch");
  }

  if (input.executionMode !== "APPLY_DISPATCH_ONCE" || input.workerMode !== "PROVISION_ONE_SHOT") {
    throw new Error("CNIPA Gazette acceptance plan invalid: execution/worker mode mismatch");
  }
  if (input.stage !== CNIPA_GAZETTE_ACCEPTANCE_STAGE) {
    throw new Error("CNIPA Gazette acceptance plan invalid: stage must be FULL_CHAIN");
  }
  const range = objectValue(input.range, "range");
  exactKeys(range, ["startPage", "endPage"], "range");
  if (
    input.announcementIssue !== 75 ||
    input.announcementDate !== "1983-08-15" ||
    input.sourceRecordCount !== 576 ||
    input.sourcePageCount !== 6 ||
    input.pageSize !== 100 ||
    input.finalPageRowCount !== 76 ||
    range.startPage !== 1 ||
    range.endPage !== 6 ||
    input.announcementTypeSelection !== "ALL" ||
    input.anncType !== "" ||
    input.acquisitionMode !== "MO_CNIPA_NETWORK_CAPTURE_IMPORT" ||
    input.captureToolVersion !== "0.9.4"
  ) {
    throw new Error("CNIPA Gazette acceptance plan invalid: issue-75 frozen scope mismatch");
  }

  return {
    version: 2,
    operationId: input.operationId,
    workspaceId: input.workspaceId,
    authorityMode: CNIPA_GAZETTE_ACCEPTANCE_AUTHORITY_MODE,
    executionMode: "APPLY_DISPATCH_ONCE",
    workerMode: "PROVISION_ONE_SHOT",
    stage: CNIPA_GAZETTE_ACCEPTANCE_STAGE,
    announcementIssue: 75,
    announcementDate: "1983-08-15",
    sourceRecordCount: 576,
    sourcePageCount: 6,
    pageSize: 100,
    finalPageRowCount: 76,
    range: { startPage: 1, endPage: 6 },
    announcementTypeSelection: "ALL",
    anncType: "",
    acquisitionMode: "MO_CNIPA_NETWORK_CAPTURE_IMPORT",
    captureToolVersion: "0.9.4",
    captureFilePath: captureFilePath(input.captureFilePath),
    captureFileSha256: captureFileSha256(input.captureFileSha256),
    dataEngineUrl: dataEngineUrl(input.dataEngineUrl),
  };
}

export function expectedCnipaGazetteAcceptanceAuthorityToken(
  plan: CnipaGazetteAcceptancePlan,
  planSha256: string,
): string {
  return `GO #860 CNIPA-GAZETTE ${plan.operationId} FULL_CHAIN ${planSha256}`;
}

function stageRuntime(stage: CnipaGazetteAcceptanceRuntimeStage) {
  if (stage === "ACQUIRE") {
    return {
      connectorId: CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_ID,
      connectorVersion: CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_VERSION,
      sourceType: "MANUAL_UPLOAD" as const,
      canonicalUri: CNIPA_GAZETTE_CAPTURE_IMPORT_SOURCE,
      category: "OFFICIAL_AUTHORITY" as const,
      authorityLevel: "PRIMARY_OFFICIAL" as const,
      jobType: "LOCAL_FILE_SCAN" as const,
    };
  }
  if (stage === "BUILD_FINALIZE") {
    return {
      connectorId: CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_ID,
      connectorVersion: CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_VERSION,
      sourceType: "DATABASE" as const,
      canonicalUri: CNIPA_GAZETTE_FINALIZE_JOB_SOURCE,
      category: "INTERNAL" as const,
      authorityLevel: "INTERNAL" as const,
      jobType: "API_COLLECTION" as const,
    };
  }

  return {
    connectorId: CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_ID,
    connectorVersion: CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
    sourceType: "DATABASE" as const,
    canonicalUri: CNIPA_GAZETTE_FACT_ADMISSION_JOB_SOURCE,
    category: "INTERNAL" as const,
    authorityLevel: "INTERNAL" as const,
    jobType: "API_COLLECTION" as const,
  };
}

function durableArtifactReferenceSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["artifactId", "canonicalUri", "sha256", "sizeBytes"],
    properties: {
      artifactId: { type: "string", pattern: "^art_[0-9A-HJKMNP-TV-Z]{26}$" },
      canonicalUri: { type: "string", minLength: 1 },
      sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
      sizeBytes: { type: "integer", minimum: 1 },
    },
  };
}

function acceptanceConfigurationSchema(stage: CnipaGazetteAcceptanceRuntimeStage) {
  if (stage === "ACQUIRE") {
    return {
      type: "object",
      additionalProperties: false,
      required: [
        "intent",
        "announcementIssue",
        "announcementDate",
        "captureFilePath",
        "captureSha256",
        "captureToolVersion",
      ],
      properties: {
        intent: { const: "IMPORT_SMALL_COMPLETE_CAPTURE" },
        announcementIssue: { const: 75 },
        announcementDate: { const: "1983-08-15" },
        captureFilePath: { type: "string", minLength: 1 },
        captureSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
        captureToolVersion: { const: "0.9.4" },
      },
    };
  }
  if (stage === "BUILD_FINALIZE") {
    return {
      type: "object",
      additionalProperties: false,
      required: ["intent", "datasetIdentityRef", "chunkReceiptRefs"],
      properties: {
        intent: { const: "BUILD_FINALIZE_REQUEST" },
        datasetIdentityRef: durableArtifactReferenceSchema(),
        chunkReceiptRefs: {
          type: "array",
          minItems: 1,
          maxItems: 1,
          items: durableArtifactReferenceSchema(),
        },
      },
    };
  }
  return {
    type: "object",
    additionalProperties: false,
    required: ["intent", "requestArtifactRef"],
    properties: {
      intent: { const: "PUBLISH_DURABLE_REQUEST" },
      requestArtifactRef: durableArtifactReferenceSchema(),
    },
  };
}

export function cnipaGazetteAcceptanceConnectorManifest(stage: CnipaGazetteAcceptanceRuntimeStage) {
  const runtime = stageRuntime(stage);
  return {
    connectorId: runtime.connectorId,
    displayName: `CNIPA Gazette ${stage} Governed Worker`,
    version: runtime.connectorVersion,
    sourceTypes: [runtime.sourceType],
    runtime: "NODE",
    capabilities: ["COLLECT"],
    supportedJobTypes: [runtime.jobType],
    configurationSchema: acceptanceConfigurationSchema(stage),
    secretSchema: { type: "object", properties: {}, additionalProperties: false },

    outputArtifactKinds: ["JSON"],
    healthCheck: { mode: "WORKER_PROBE", timeoutSeconds: 30 },
    status: "ACTIVE",
    extensions: {
      "x-markorbit-production-provider": true,
      "x-markorbit-gazette-acceptance-stage": stage,
      "x-markorbit-historical-replay-activated": false,
    },
  };
}

export function cnipaGazetteAcceptanceSourcePayload(input: {
  plan: CnipaGazetteAcceptancePlan;
  stage: CnipaGazetteAcceptanceRuntimeStage;
  connectorConfig: Record<string, unknown>;
}) {
  const runtime = stageRuntime(input.stage);
  const suffix = input.stage.toLowerCase().replace(/_/gu, "-");
  return {
    workspaceId: input.plan.workspaceId,
    name: `CNIPA Gazette issue 75 — ${input.stage} — ${input.plan.operationId}`,
    slug: `cnipa-gazette-75-${suffix}-${input.plan.operationId}`,
    sourceType: runtime.sourceType,
    category: runtime.category,

    authorityLevel: runtime.authorityLevel,
    status: "ACTIVE",
    jurisdictions: ["CN"],
    languages: ["zh-CN"],
    connector: { connectorId: runtime.connectorId, version: runtime.connectorVersion },
    connectorConfig: input.connectorConfig,
    canonicalUri: runtime.canonicalUri,
    entrypoints: [{ uri: runtime.canonicalUri, label: `CNIPA Gazette ${input.stage}` }],
    tags: ["cnipa", "gazette", "acceptance", "issue-75", suffix],
    extensions: {
      "x-markorbit-gazette-acceptance-operation": input.plan.operationId,
      "x-markorbit-gazette-acceptance-stage": input.stage,
      "x-markorbit-gazette-frozen-plan-sha256": cnipaGazetteAcceptancePlanSha256(input.plan),
      "x-markorbit-historical-replay-activated": false,
    },
  };
}

export function cnipaGazetteAcceptanceCollectionPlanPayload(input: {
  sourceId: string;
  plan: CnipaGazetteAcceptancePlan;
  stage: CnipaGazetteAcceptanceRuntimeStage;
}) {
  return {
    workspaceId: input.plan.workspaceId,
    sourceId: input.sourceId,
    name: `CNIPA Gazette issue 75 — ${input.stage} — ${input.plan.operationId}`,
    status: "ACTIVE",
    schedule: { mode: "MANUAL" },
    priority: "HIGH",
    policy: {
      includePatterns: [],
      excludePatterns: [],
      maxDepth: 0,
      maxItems: input.stage === "ACQUIRE" ? 20 : 5,
      renderJavascript: false,
      fetchAttachments: false,
      respectRobots: false,
      rateLimitPerMinute: input.stage === "ACQUIRE" ? 12 : 60,
      timeoutSeconds: 300,
      retry: { maxAttempts: 1, backoffSeconds: 0 },
      locale: "zh-CN",
    },
    output: { artifactKinds: ["JSON"] },

    extensions: {
      "x-markorbit-gazette-acceptance-operation": input.plan.operationId,
      "x-markorbit-gazette-acceptance-stage": input.stage,
      "x-markorbit-gazette-frozen-plan-sha256": cnipaGazetteAcceptancePlanSha256(input.plan),
      "x-markorbit-historical-replay-activated": false,
    },
  };
}

export function cnipaGazetteAcceptanceWorkerPayload(
  workspaceId: string,
  stage: CnipaGazetteAcceptanceRuntimeStage,
) {
  const runtime = stageRuntime(stage);
  return {
    workspaceId,
    displayName: `CNIPA Gazette ${stage} One-Shot Worker`,
    desiredState: "ACTIVE",
    runtime: {
      runtimeId: `cnipa-gazette-${stage.toLowerCase().replace(/_/gu, "-")}`,
      version: "1.0.0",
    },
    supportedJobTypes: [runtime.jobType],
    connectorBindings: [
      {
        connectorId: runtime.connectorId,
        version: runtime.connectorVersion,
        capabilities: ["COLLECT"],
      },
    ],

    maxConcurrency: 1,
    labels: ["production", "cnipa", "gazette", "acceptance", "issue-75", stage.toLowerCase()],
    extensions: {
      "x-markorbit-gazette-acceptance-stage": stage,
      "x-markorbit-worker-concurrency": 1,
    },
  };
}

export function cnipaGazetteAcceptanceAcquisitionConfig(plan: CnipaGazetteAcceptancePlan) {
  return {
    intent: "IMPORT_SMALL_COMPLETE_CAPTURE",
    announcementIssue: 75,
    announcementDate: "1983-08-15",
    captureFilePath: plan.captureFilePath,
    captureSha256: plan.captureFileSha256,
    captureToolVersion: plan.captureToolVersion,
  };
}
