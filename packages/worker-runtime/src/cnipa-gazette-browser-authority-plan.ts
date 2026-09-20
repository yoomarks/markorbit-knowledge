import { createHash } from "node:crypto";

export const CNIPA_GAZETTE_BROWSER_AUTHORITY_MODE = "INTERNAL_SERVICE_GO_V1" as const;
export const CNIPA_GAZETTE_BROWSER_ACQUISITION_MODE = "MO_CNIPA_NORMAL_BROWSER_STREAM_V1" as const;
export const CNIPA_GAZETTE_BROWSER_DISPATCH_MODES = [
  "PREPARE_ONLY",
  "PREPARE_AND_DISPATCH_ONCE",
] as const;
export type CnipaGazetteBrowserDispatchMode = (typeof CNIPA_GAZETTE_BROWSER_DISPATCH_MODES)[number];

export type CnipaGazetteBrowserAuthorityPlan = {
  version: 1;
  operationId: string;
  workspaceId: string;
  authorityMode: typeof CNIPA_GAZETTE_BROWSER_AUTHORITY_MODE;
  dispatchMode: CnipaGazetteBrowserDispatchMode;
  announcementIssue: number;
  announcementTypeSelection: "ALL";
  anncType: "";
  targetLogicalPagesPerCheckpoint: number;
  maxRuntimeSeconds: number;
  acquisitionMode: typeof CNIPA_GAZETTE_BROWSER_ACQUISITION_MODE;
  captureTool: "MO CNIPA Network Capture";
  captureToolVersion: "1.0.0";
  captureToolBundleName: string;
  captureToolBundleSha256: string;
  minimumChromeVersion: 118;
  sourcePageSizeMode: "PRESERVE_CAPTURED_1_TO_100";
  dataEngineMutation: "DISABLED";
  historicalReplayActivated: false;
};

const OPERATION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const WORKSPACE_ID = /^wsp_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`CNIPA Gazette browser authority plan invalid: ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}
function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const accepted = new Set(allowed);
  const extras = Object.keys(value).filter((key) => !accepted.has(key));
  if (extras.length > 0) {
    throw new TypeError(
      `CNIPA Gazette browser authority plan invalid: ${label} contains unsupported keys: ${extras.join(", ")}`,
    );
  }
}

function positiveInteger(value: unknown, label: string, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new TypeError(
      `CNIPA Gazette browser authority plan invalid: ${label} must be a positive integer <= ${maximum}`,
    );
  }
  return value;
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

export function parseCnipaGazetteBrowserAuthorityPlan(
  value: unknown,
): CnipaGazetteBrowserAuthorityPlan {
  const input = objectValue(value, "root");
  exactKeys(
    input,
    [
      "version",
      "operationId",
      "workspaceId",
      "authorityMode",
      "dispatchMode",
      "announcementIssue",
      "announcementTypeSelection",
      "anncType",
      "targetLogicalPagesPerCheckpoint",
      "maxRuntimeSeconds",
      "acquisitionMode",
      "captureTool",
      "captureToolVersion",
      "captureToolBundleName",
      "captureToolBundleSha256",
      "minimumChromeVersion",
      "sourcePageSizeMode",
      "dataEngineMutation",
      "historicalReplayActivated",
    ],
    "root",
  );
  if (input.version !== 1)
    throw new TypeError("CNIPA Gazette browser authority plan invalid: version must be 1");
  if (typeof input.operationId !== "string" || !OPERATION_ID.test(input.operationId)) {
    throw new TypeError(
      "CNIPA Gazette browser authority plan invalid: operationId must be a lowercase slug",
    );
  }
  if (typeof input.workspaceId !== "string" || !WORKSPACE_ID.test(input.workspaceId)) {
    throw new TypeError(
      "CNIPA Gazette browser authority plan invalid: workspaceId must be Schema v1",
    );
  }
  if (input.authorityMode !== CNIPA_GAZETTE_BROWSER_AUTHORITY_MODE) {
    throw new TypeError("CNIPA Gazette browser authority plan invalid: authorityMode mismatch");
  }
  if (
    !CNIPA_GAZETTE_BROWSER_DISPATCH_MODES.includes(
      input.dispatchMode as CnipaGazetteBrowserDispatchMode,
    )
  ) {
    throw new TypeError("CNIPA Gazette browser authority plan invalid: dispatchMode mismatch");
  }
  const announcementIssue = positiveInteger(input.announcementIssue, "announcementIssue", 999999);
  const targetLogicalPagesPerCheckpoint = positiveInteger(
    input.targetLogicalPagesPerCheckpoint,
    "targetLogicalPagesPerCheckpoint",
    100,
  );
  const maxRuntimeSeconds = positiveInteger(input.maxRuntimeSeconds, "maxRuntimeSeconds", 86400);
  if (maxRuntimeSeconds < 60) {
    throw new TypeError(
      "CNIPA Gazette browser authority plan invalid: maxRuntimeSeconds must be >= 60",
    );
  }
  if (
    input.announcementTypeSelection !== "ALL" ||
    input.anncType !== "" ||
    input.acquisitionMode !== CNIPA_GAZETTE_BROWSER_ACQUISITION_MODE ||
    input.captureTool !== "MO CNIPA Network Capture" ||
    input.captureToolVersion !== "1.0.0" ||
    input.minimumChromeVersion !== 118 ||
    input.sourcePageSizeMode !== "PRESERVE_CAPTURED_1_TO_100" ||
    input.dataEngineMutation !== "DISABLED" ||
    input.historicalReplayActivated !== false
  ) {
    throw new TypeError(
      "CNIPA Gazette browser authority plan invalid: frozen browser-stream scope mismatch",
    );
  }
  if (
    typeof input.captureToolBundleName !== "string" ||
    !input.captureToolBundleName.trim() ||
    input.captureToolBundleName.length > 255
  ) {
    throw new TypeError(
      "CNIPA Gazette browser authority plan invalid: captureToolBundleName is invalid",
    );
  }
  if (
    typeof input.captureToolBundleSha256 !== "string" ||
    !SHA256.test(input.captureToolBundleSha256)
  ) {
    throw new TypeError(
      "CNIPA Gazette browser authority plan invalid: captureToolBundleSha256 is invalid",
    );
  }
  return {
    version: 1,
    operationId: input.operationId,
    workspaceId: input.workspaceId,
    authorityMode: CNIPA_GAZETTE_BROWSER_AUTHORITY_MODE,
    dispatchMode: input.dispatchMode as CnipaGazetteBrowserDispatchMode,
    announcementIssue,
    announcementTypeSelection: "ALL",
    anncType: "",
    targetLogicalPagesPerCheckpoint,
    maxRuntimeSeconds,
    acquisitionMode: CNIPA_GAZETTE_BROWSER_ACQUISITION_MODE,
    captureTool: "MO CNIPA Network Capture",
    captureToolVersion: "1.0.0",
    captureToolBundleName: input.captureToolBundleName.trim(),
    captureToolBundleSha256: input.captureToolBundleSha256,
    minimumChromeVersion: 118,
    sourcePageSizeMode: "PRESERVE_CAPTURED_1_TO_100",
    dataEngineMutation: "DISABLED",
    historicalReplayActivated: false,
  };
}

export function cnipaGazetteBrowserAuthorityPlanSha256(
  plan: CnipaGazetteBrowserAuthorityPlan,
): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(plan)))
    .digest("hex");
}

export function expectedCnipaGazetteBrowserAuthorityToken(
  plan: CnipaGazetteBrowserAuthorityPlan,
  planSha256 = cnipaGazetteBrowserAuthorityPlanSha256(plan),
): string {
  if (!SHA256.test(planSha256)) throw new TypeError("planSha256 must be lowercase SHA-256");
  return `GO #865 CNIPA-GAZETTE-BROWSER ${plan.operationId} ${plan.dispatchMode} ${planSha256}`;
}

export function cnipaGazetteBrowserAuthorityPlan(input: {
  operationId: string;
  workspaceId: string;
  dispatchMode: CnipaGazetteBrowserDispatchMode;
  announcementIssue: number;
  targetLogicalPagesPerCheckpoint?: number;
  maxRuntimeSeconds?: number;
  captureToolBundleName: string;
  captureToolBundleSha256: string;
}): CnipaGazetteBrowserAuthorityPlan {
  return parseCnipaGazetteBrowserAuthorityPlan({
    version: 1,
    operationId: input.operationId,
    workspaceId: input.workspaceId,
    authorityMode: CNIPA_GAZETTE_BROWSER_AUTHORITY_MODE,
    dispatchMode: input.dispatchMode,
    announcementIssue: input.announcementIssue,
    announcementTypeSelection: "ALL",
    anncType: "",
    targetLogicalPagesPerCheckpoint: input.targetLogicalPagesPerCheckpoint ?? 24,
    maxRuntimeSeconds: input.maxRuntimeSeconds ?? 21600,
    acquisitionMode: CNIPA_GAZETTE_BROWSER_ACQUISITION_MODE,
    captureTool: "MO CNIPA Network Capture",
    captureToolVersion: "1.0.0",
    captureToolBundleName: input.captureToolBundleName,
    captureToolBundleSha256: input.captureToolBundleSha256,
    minimumChromeVersion: 118,
    sourcePageSizeMode: "PRESERVE_CAPTURED_1_TO_100",
    dataEngineMutation: "DISABLED",
    historicalReplayActivated: false,
  });
}
