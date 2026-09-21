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
import { cnipaGazetteAcceptanceConnectorManifest } from "./cnipa-gazette-acceptance-plan";

export const CNIPA_GAZETTE_BROWSER_ADMISSION_AUTHORITY_MODE = "INTERNAL_SERVICE_GO_V1" as const;
export const CNIPA_GAZETTE_BROWSER_ADMISSION_STAGE = "BROWSER_DATASET_ADMISSION" as const;
export const CNIPA_GAZETTE_BROWSER_ADMISSION_STAGES = [
  "PUBLISH_CHUNK",
  "BUILD_FINALIZE",
  "PUBLISH_FINALIZE",
] as const;
export type CnipaGazetteBrowserAdmissionRuntimeStage =
  (typeof CNIPA_GAZETTE_BROWSER_ADMISSION_STAGES)[number];

export type CnipaGazetteBrowserAdmissionArtifactRef = {
  artifactId: string;
  canonicalUri: string;
  sha256: string;
  sizeBytes: number;
};

export type CnipaGazetteBrowserAdmissionPlan = {
  version: 1;
  operationId: string;
  workspaceId: string;
  authorityMode: typeof CNIPA_GAZETTE_BROWSER_ADMISSION_AUTHORITY_MODE;
  executionMode: "APPLY_DISPATCH_ONCE";
  workerMode: "PROVISION_ONE_SHOT";
  stage: typeof CNIPA_GAZETTE_BROWSER_ADMISSION_STAGE;
  announcementIssue: 75;
  announcementDate: "1983-08-15";
  sourceRecordCount: 576;
  browserSourcePageSize: 10;
  browserSourcePageCount: 58;
  logicalPageSize: 100;
  logicalPageCount: 6;
  finalLogicalPageRowCount: 76;
  range: { startPage: 1; endPage: 6 };
  announcementTypeSelection: "ALL";
  anncType: "";
  acquisitionMode: "MO_CNIPA_NORMAL_BROWSER_STREAM_V1";
  captureTool: "MO CNIPA Network Capture";
  captureToolVersion: "1.0.3";
  sourceDatasetSha256: string;
  datasetIdentityRef: CnipaGazetteBrowserAdmissionArtifactRef;
  chunkRequestRef: CnipaGazetteBrowserAdmissionArtifactRef;
  dataEngineUrl: string;
  historicalReplayActivated: false;
};

const OPERATION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const WORKSPACE_ID = /^wsp_[0-9A-HJKMNP-TV-Z]{26}$/u;
const ARTIFACT_ID = /^art_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`CNIPA Gazette browser admission plan invalid: ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const accepted = new Set(allowed);
  const extra = Object.keys(value).filter((key) => !accepted.has(key));
  if (extra.length > 0) {
    throw new Error(
      `CNIPA Gazette browser admission plan invalid: ${label} contains unsupported keys: ${extra.join(", ")}`,
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

function artifactRef(value: unknown, label: string): CnipaGazetteBrowserAdmissionArtifactRef {
  const raw = objectValue(value, label);
  exactKeys(raw, ["artifactId", "canonicalUri", "sha256", "sizeBytes"], label);
  if (
    typeof raw.artifactId !== "string" ||
    !ARTIFACT_ID.test(raw.artifactId) ||
    typeof raw.canonicalUri !== "string" ||
    !raw.canonicalUri.trim() ||
    typeof raw.sha256 !== "string" ||
    !SHA256.test(raw.sha256) ||
    !Number.isSafeInteger(raw.sizeBytes) ||
    (raw.sizeBytes as number) < 1
  ) {
    throw new Error(`CNIPA Gazette browser admission plan invalid: ${label} is invalid`);
  }
  return {
    artifactId: raw.artifactId,
    canonicalUri: raw.canonicalUri.trim(),
    sha256: raw.sha256,
    sizeBytes: raw.sizeBytes as number,
  };
}

function dataEngineUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("CNIPA Gazette browser admission plan invalid: dataEngineUrl is required");
  }
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      "CNIPA Gazette browser admission plan invalid: dataEngineUrl must use http or https",
    );
  }
  return url.toString().replace(/\/$/u, "");
}

export function parseCnipaGazetteBrowserAdmissionPlan(
  value: unknown,
): CnipaGazetteBrowserAdmissionPlan {
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
      "browserSourcePageSize",
      "browserSourcePageCount",
      "logicalPageSize",
      "logicalPageCount",
      "finalLogicalPageRowCount",
      "range",
      "announcementTypeSelection",
      "anncType",
      "acquisitionMode",
      "captureTool",
      "captureToolVersion",
      "sourceDatasetSha256",
      "datasetIdentityRef",
      "chunkRequestRef",
      "dataEngineUrl",
      "historicalReplayActivated",
    ],
    "root",
  );
  if (input.version !== 1) {
    throw new Error("CNIPA Gazette browser admission plan invalid: version must be 1");
  }
  if (typeof input.operationId !== "string" || !OPERATION_ID.test(input.operationId)) {
    throw new Error(
      "CNIPA Gazette browser admission plan invalid: operationId must be a lowercase slug",
    );
  }
  if (typeof input.workspaceId !== "string" || !WORKSPACE_ID.test(input.workspaceId)) {
    throw new Error("CNIPA Gazette browser admission plan invalid: workspaceId must be Schema v1");
  }
  if (
    input.authorityMode !== CNIPA_GAZETTE_BROWSER_ADMISSION_AUTHORITY_MODE ||
    input.executionMode !== "APPLY_DISPATCH_ONCE" ||
    input.workerMode !== "PROVISION_ONE_SHOT" ||
    input.stage !== CNIPA_GAZETTE_BROWSER_ADMISSION_STAGE
  ) {
    throw new Error(
      "CNIPA Gazette browser admission plan invalid: authority/execution boundary mismatch",
    );
  }
  const range = objectValue(input.range, "range");
  exactKeys(range, ["startPage", "endPage"], "range");
  if (
    input.announcementIssue !== 75 ||
    input.announcementDate !== "1983-08-15" ||
    input.sourceRecordCount !== 576 ||
    input.browserSourcePageSize !== 10 ||
    input.browserSourcePageCount !== 58 ||
    input.logicalPageSize !== 100 ||
    input.logicalPageCount !== 6 ||
    input.finalLogicalPageRowCount !== 76 ||
    range.startPage !== 1 ||
    range.endPage !== 6 ||
    input.announcementTypeSelection !== "ALL" ||
    input.anncType !== "" ||
    input.acquisitionMode !== "MO_CNIPA_NORMAL_BROWSER_STREAM_V1" ||
    input.captureTool !== "MO CNIPA Network Capture" ||
    input.captureToolVersion !== "1.0.3" ||
    input.historicalReplayActivated !== false
  ) {
    throw new Error("CNIPA Gazette browser admission plan invalid: issue-75 frozen scope mismatch");
  }
  if (typeof input.sourceDatasetSha256 !== "string" || !SHA256.test(input.sourceDatasetSha256)) {
    throw new Error("CNIPA Gazette browser admission plan invalid: sourceDatasetSha256 is invalid");
  }
  const datasetIdentityRef = artifactRef(input.datasetIdentityRef, "datasetIdentityRef");
  const chunkRequestRef = artifactRef(input.chunkRequestRef, "chunkRequestRef");
  if (datasetIdentityRef.artifactId === chunkRequestRef.artifactId) {
    throw new Error(
      "CNIPA Gazette browser admission plan invalid: seed artifact ids must be unique",
    );
  }
  const datasetCanonical = `cnipa://trademark-gazette/issue/75/dataset/${input.sourceDatasetSha256}`;
  if (datasetIdentityRef.canonicalUri !== datasetCanonical) {
    throw new Error(
      "CNIPA Gazette browser admission plan invalid: dataset identity canonical URI mismatch",
    );
  }
  if (chunkRequestRef.canonicalUri !== `${datasetCanonical}/fact-admission/chunk/1-6/request`) {
    throw new Error(
      "CNIPA Gazette browser admission plan invalid: CHUNK request canonical URI mismatch",
    );
  }
  return {
    version: 1,
    operationId: input.operationId,
    workspaceId: input.workspaceId,
    authorityMode: CNIPA_GAZETTE_BROWSER_ADMISSION_AUTHORITY_MODE,
    executionMode: "APPLY_DISPATCH_ONCE",
    workerMode: "PROVISION_ONE_SHOT",
    stage: CNIPA_GAZETTE_BROWSER_ADMISSION_STAGE,
    announcementIssue: 75,
    announcementDate: "1983-08-15",
    sourceRecordCount: 576,
    browserSourcePageSize: 10,
    browserSourcePageCount: 58,
    logicalPageSize: 100,
    logicalPageCount: 6,
    finalLogicalPageRowCount: 76,
    range: { startPage: 1, endPage: 6 },
    announcementTypeSelection: "ALL",
    anncType: "",
    acquisitionMode: "MO_CNIPA_NORMAL_BROWSER_STREAM_V1",
    captureTool: "MO CNIPA Network Capture",
    captureToolVersion: "1.0.3",
    sourceDatasetSha256: input.sourceDatasetSha256,
    datasetIdentityRef,
    chunkRequestRef,
    dataEngineUrl: dataEngineUrl(input.dataEngineUrl),
    historicalReplayActivated: false,
  };
}

export function cnipaGazetteBrowserAdmissionPlanSha256(
  plan: CnipaGazetteBrowserAdmissionPlan,
): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(plan)))
    .digest("hex");
}

export function expectedCnipaGazetteBrowserAdmissionAuthorityToken(
  plan: CnipaGazetteBrowserAdmissionPlan,
  planSha256: string,
): string {
  return `GO #866 CNIPA-GAZETTE-BROWSER-ADMISSION ${plan.operationId} FULL_CHAIN ${planSha256}`;
}

function stageRuntime(stage: CnipaGazetteBrowserAdmissionRuntimeStage) {
  if (stage === "BUILD_FINALIZE") {
    return {
      connectorId: CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_ID,
      connectorVersion: CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_VERSION,
      canonicalUri: CNIPA_GAZETTE_FINALIZE_JOB_SOURCE,
    };
  }
  return {
    connectorId: CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_ID,
    connectorVersion: CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
    canonicalUri: CNIPA_GAZETTE_FACT_ADMISSION_JOB_SOURCE,
  };
}

export function cnipaGazetteBrowserAdmissionConnectorManifest(
  stage: CnipaGazetteBrowserAdmissionRuntimeStage,
) {
  return cnipaGazetteAcceptanceConnectorManifest(stage);
}

export function cnipaGazetteBrowserAdmissionSourcePayload(input: {
  plan: CnipaGazetteBrowserAdmissionPlan;
  stage: CnipaGazetteBrowserAdmissionRuntimeStage;
  connectorConfig: Record<string, unknown>;
}) {
  const runtime = stageRuntime(input.stage);
  const suffix = input.stage.toLowerCase().replace(/_/gu, "-");
  const configFingerprint = createHash("sha256")
    .update(JSON.stringify(canonicalize(input.connectorConfig)))
    .digest("hex")
    .slice(0, 16);
  const planSha256 = cnipaGazetteBrowserAdmissionPlanSha256(input.plan);
  return {
    workspaceId: input.plan.workspaceId,
    name: `CNIPA Gazette browser admission | ${input.stage} | ${input.plan.operationId}`,
    slug: `cnipa-gazette-browser-admission-${suffix}-${input.plan.operationId}-${configFingerprint}`,
    sourceType: "DATABASE" as const,
    category: "INTERNAL" as const,
    authorityLevel: "INTERNAL" as const,
    status: "ACTIVE",
    jurisdictions: ["CN"],
    languages: ["zh-CN"],
    connector: { connectorId: runtime.connectorId, version: runtime.connectorVersion },
    connectorConfig: input.connectorConfig,
    canonicalUri: runtime.canonicalUri,
    entrypoints: [{ uri: runtime.canonicalUri, label: `CNIPA Gazette ${input.stage}` }],
    tags: ["cnipa", "gazette", "browser-admission", "issue-75", suffix],
    extensions: {
      "x-markorbit-gazette-browser-admission-operation": input.plan.operationId,
      "x-markorbit-gazette-browser-admission-stage": input.stage,
      "x-markorbit-gazette-browser-admission-plan-sha256": planSha256,
      "x-markorbit-historical-replay-activated": false,
    },
  };
}

export function cnipaGazetteBrowserAdmissionCollectionPlanPayload(input: {
  sourceId: string;
  plan: CnipaGazetteBrowserAdmissionPlan;
  stage: CnipaGazetteBrowserAdmissionRuntimeStage;
}) {
  return {
    workspaceId: input.plan.workspaceId,
    sourceId: input.sourceId,
    name: `CNIPA Gazette browser admission | ${input.stage} | ${input.plan.operationId}`,
    status: "ACTIVE",
    schedule: { mode: "MANUAL" },
    priority: "HIGH",
    policy: {
      includePatterns: [],
      excludePatterns: [],
      maxDepth: 0,
      maxItems: 5,
      renderJavascript: false,
      fetchAttachments: false,
      respectRobots: false,
      rateLimitPerMinute: 60,
      timeoutSeconds: 300,
      retry: { maxAttempts: 1, backoffSeconds: 0 },
      locale: "zh-CN",
    },
    output: { artifactKinds: ["JSON"] },
    extensions: {
      "x-markorbit-gazette-browser-admission-operation": input.plan.operationId,
      "x-markorbit-gazette-browser-admission-stage": input.stage,
      "x-markorbit-gazette-browser-admission-plan-sha256": cnipaGazetteBrowserAdmissionPlanSha256(
        input.plan,
      ),
      "x-markorbit-historical-replay-activated": false,
    },
  };
}

export function cnipaGazetteBrowserAdmissionWorkerPayload(
  workspaceId: string,
  stage: CnipaGazetteBrowserAdmissionRuntimeStage,
) {
  const runtime = stageRuntime(stage);
  return {
    workspaceId,
    displayName: `CNIPA Gazette Browser Admission ${stage} One-Shot Worker`,
    desiredState: "ACTIVE",
    runtime: {
      runtimeId: `cnipa-gazette-browser-admission-${stage.toLowerCase().replace(/_/gu, "-")}`,
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
    labels: [
      "production",
      "cnipa",
      "gazette",
      "browser-admission",
      "issue-75",
      stage.toLowerCase(),
    ],
    extensions: {
      "x-markorbit-gazette-browser-admission-stage": stage,
      "x-markorbit-worker-concurrency": 1,
    },
  };
}
