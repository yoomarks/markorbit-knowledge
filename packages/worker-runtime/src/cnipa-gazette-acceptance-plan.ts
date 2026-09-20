import { createHash } from "node:crypto";
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
  "IMPORT_CAPTURE",
  "PUBLISH_CHUNK",
  "BUILD_FINALIZE",
  "PUBLISH_FINALIZE",
] as const;
export type CnipaGazetteAcceptanceRuntimeStage = (typeof CNIPA_GAZETTE_ACCEPTANCE_STAGES)[number];

export type CnipaGazetteAcceptancePlan = {
  version: 1;
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
  acquisitionMode: "MO_CNIPA_NETWORK_CAPTURE_V094_IMPORT";
  captureTool: "MO CNIPA Network Capture";
  captureToolVersion: "0.9.4";
  captureExportSchema: "mo-cnipa-gazette-small-complete-v1";
  captureToolBundleSha256: "c657000199271dce8c2098b72823a69d906c30ebcd702571a81b2cb61e3883c2";
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
      "captureTool",
      "captureToolVersion",
      "captureExportSchema",
      "captureToolBundleSha256",
      "dataEngineUrl",
    ],
    "root",
  );
  if (input.version !== 1)
    throw new Error("CNIPA Gazette acceptance plan invalid: version must be 1");
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
    input.acquisitionMode !== "MO_CNIPA_NETWORK_CAPTURE_V094_IMPORT" ||
    input.captureTool !== "MO CNIPA Network Capture" ||
    input.captureToolVersion !== "0.9.4" ||
    input.captureExportSchema !== "mo-cnipa-gazette-small-complete-v1" ||
    input.captureToolBundleSha256 !==
      "c657000199271dce8c2098b72823a69d906c30ebcd702571a81b2cb61e3883c2"
  ) {
    throw new Error("CNIPA Gazette acceptance plan invalid: issue-75 frozen scope mismatch");
  }

  return {
    version: 1,
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
    acquisitionMode: "MO_CNIPA_NETWORK_CAPTURE_V094_IMPORT",
    captureTool: "MO CNIPA Network Capture",
    captureToolVersion: "0.9.4",
    captureExportSchema: "mo-cnipa-gazette-small-complete-v1",
    captureToolBundleSha256: "c657000199271dce8c2098b72823a69d906c30ebcd702571a81b2cb61e3883c2",
    dataEngineUrl: dataEngineUrl(input.dataEngineUrl),
  };
}

export function expectedCnipaGazetteAcceptanceAuthorityToken(
  plan: CnipaGazetteAcceptancePlan,
  planSha256: string,
): string {
  return `GO #860 CNIPA-GAZETTE ${plan.operationId} FULL_CHAIN ${planSha256}`;
}

export function cnipaGazetteAcceptanceRequestTemplate(
  plan: CnipaGazetteAcceptancePlan,
): Record<string, string | number> {
  return {
    anncIssue: String(plan.announcementIssue),
    anncType: "",
    regNo: "",
    tmName: "",
    intlCls: "",
    registerCnName: "",
    coowner: "",
    agentName: "",
    tmType: "",
    tmDescType: "0",
    startDate: "",
    endDate: "",
    pageIndex: 1,
    pageSize: 100,
  };
}

function stageRuntime(stage: CnipaGazetteAcceptanceRuntimeStage) {
  if (stage === "IMPORT_CAPTURE") {
    return {
      connectorId: CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_ID,
      connectorVersion: CNIPA_GAZETTE_CAPTURE_IMPORT_CONNECTOR_VERSION,
      sourceType: "DATABASE" as const,
      canonicalUri: CNIPA_GAZETTE_CAPTURE_IMPORT_SOURCE,
      category: "INTERNAL" as const,
      authorityLevel: "INTERNAL" as const,
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
    };
  }

  return {
    connectorId: CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_ID,
    connectorVersion: CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
    sourceType: "DATABASE" as const,
    canonicalUri: CNIPA_GAZETTE_FACT_ADMISSION_JOB_SOURCE,
    category: "INTERNAL" as const,
    authorityLevel: "INTERNAL" as const,
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
  if (stage === "IMPORT_CAPTURE") {
    return {
      type: "object",
      additionalProperties: false,
      required: [
        "intent",
        "captureSha256",
        "captureSizeBytes",
        "captureOriginalName",
        "announcementIssue",
        "range",
        "requestTemplate",
        "pagesPerCheckpoint",
      ],
      properties: {
        intent: { const: "IMPORT_V094_SMALL_COMPLETE" },
        captureSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
        captureSizeBytes: { type: "integer", minimum: 1 },
        captureOriginalName: { type: "string", minLength: 1, maxLength: 255 },
        announcementIssue: { const: 75 },
        range: {
          type: "object",
          additionalProperties: false,
          required: ["startPage", "endPage"],
          properties: { startPage: { const: 1 }, endPage: { const: 6 } },
        },
        requestTemplate: {
          type: "object",
          additionalProperties: false,
          required: [
            "anncIssue",
            "anncType",
            "regNo",
            "tmName",
            "intlCls",
            "registerCnName",
            "coowner",
            "agentName",
            "tmType",
            "tmDescType",
            "startDate",
            "endDate",
            "pageIndex",
            "pageSize",
          ],
          properties: {
            anncIssue: { const: "75" },
            anncType: { const: "" },
            regNo: { const: "" },
            tmName: { const: "" },
            intlCls: { const: "" },
            registerCnName: { const: "" },
            coowner: { const: "" },
            agentName: { const: "" },
            tmType: { const: "" },
            tmDescType: { const: "0" },
            startDate: { const: "" },
            endDate: { const: "" },
            pageIndex: { const: 1 },
            pageSize: { const: 100 },
          },
        },
        pagesPerCheckpoint: { const: 6 },
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
    supportedJobTypes: ["API_COLLECTION"],
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
    name: `CNIPA Gazette issue 75 | ${input.stage} | ${input.plan.operationId}`,
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
    name: `CNIPA Gazette issue 75 | ${input.stage} | ${input.plan.operationId}`,
    status: "ACTIVE",
    schedule: { mode: "MANUAL" },
    priority: "HIGH",
    policy: {
      includePatterns: [],
      excludePatterns: [],
      maxDepth: 0,
      maxItems: input.stage === "IMPORT_CAPTURE" ? 20 : 5,
      renderJavascript: false,
      fetchAttachments: false,
      respectRobots: false,
      rateLimitPerMinute: input.stage === "IMPORT_CAPTURE" ? 60 : 60,
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
    supportedJobTypes: ["API_COLLECTION"],
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

export function cnipaGazetteAcceptanceCaptureImportConfig(
  plan: CnipaGazetteAcceptancePlan,
  capture: {
    sha256: string;
    sizeBytes: number;
    originalName: string;
  },
) {
  if (!/^[a-f0-9]{64}$/u.test(capture.sha256)) {
    throw new Error("CNIPA Gazette acceptance capture SHA-256 is invalid");
  }
  if (!Number.isSafeInteger(capture.sizeBytes) || capture.sizeBytes < 1) {
    throw new Error("CNIPA Gazette acceptance capture size is invalid");
  }
  if (!capture.originalName.trim() || capture.originalName.length > 255) {
    throw new Error("CNIPA Gazette acceptance capture filename is invalid");
  }
  return {
    intent: "IMPORT_V094_SMALL_COMPLETE",
    captureSha256: capture.sha256,
    captureSizeBytes: capture.sizeBytes,
    captureOriginalName: capture.originalName,
    announcementIssue: 75,
    range: { startPage: 1, endPage: 6 },
    requestTemplate: cnipaGazetteAcceptanceRequestTemplate(plan),
    pagesPerCheckpoint: 6,
  };
}
