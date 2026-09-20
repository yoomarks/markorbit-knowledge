import type { ArtifactBackedExecutionContext } from "./artifact-backed-collection-executor";
import {
  CNIPA_GAZETTE_JOB_CONNECTOR_ID,
  CNIPA_GAZETTE_JOB_CONNECTOR_VERSION,
} from "./cnipa-gazette-job-acquirer";
import { CNIPA_GAZETTE_PUBLIC_ORIGIN } from "./cnipa-gazette-page-acquirer";
import type { CnipaGazetteBrowserStreamSession } from "./cnipa-gazette-browser-stream";

export const CNIPA_GAZETTE_BROWSER_STREAM_PLAN_EXTENSION =
  "x-markorbit-cnipa-gazette-browser-stream-v1" as const;

const QUERY_KEYS = [
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
] as const;
const EMPTY_FILTER_KEYS = [
  "regNo",
  "tmName",
  "intlCls",
  "registerCnName",
  "coowner",
  "agentName",
  "tmType",
  "startDate",
  "endDate",
] as const;

type QueryKey = (typeof QUERY_KEYS)[number];

export type CnipaGazetteBrowserStreamJobConfig = {
  announcementIssue: number;
  queryTemplate: Readonly<Record<QueryKey, string>>;
  targetLogicalPagesPerCheckpoint: number;
  maxRuntimeSeconds: number;
};

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
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
    throw new TypeError(`${label} contains unsupported keys: ${extras.join(", ")}`);
  }
}

function positiveInteger(value: unknown, label: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new TypeError(`${label} must be a positive safe integer <= ${maximum}`);
  }
  return value;
}
function parseQueryTemplate(
  value: unknown,
  announcementIssue: number,
): Readonly<Record<QueryKey, string>> {
  const raw = objectValue(value, "browserStream.queryTemplate");
  exactKeys(raw, QUERY_KEYS, "browserStream.queryTemplate");
  const query = {} as Record<QueryKey, string>;
  for (const key of QUERY_KEYS) {
    if (typeof raw[key] !== "string") {
      throw new TypeError(`browserStream.queryTemplate.${key} must be a string`);
    }
    query[key] = raw[key] as string;
  }
  if (query.anncIssue.trim() !== String(announcementIssue)) {
    throw new TypeError("browserStream.queryTemplate.anncIssue must match announcementIssue");
  }
  if (query.anncType !== "") {
    throw new TypeError("browserStream.queryTemplate.anncType must be the official ALL value");
  }
  for (const key of EMPTY_FILTER_KEYS) {
    if (query[key].trim() !== "") {
      throw new TypeError(
        `browserStream.queryTemplate.${key} must be empty for full-issue acquisition`,
      );
    }
  }
  if (query.tmDescType.trim() !== "0") {
    throw new TypeError("browserStream.queryTemplate.tmDescType must equal 0");
  }
  return Object.freeze(query);
}
function assertSourceBoundary(context: ArtifactBackedExecutionContext): void {
  const { job } = context;
  const source = job.sourceSnapshot;
  if (
    job.jobType !== "API_COLLECTION" ||
    source.sourceType !== "API" ||
    source.connector.connectorId !== CNIPA_GAZETTE_JOB_CONNECTOR_ID ||
    source.connector.version !== CNIPA_GAZETTE_JOB_CONNECTOR_VERSION ||
    job.connector.connectorId !== CNIPA_GAZETTE_JOB_CONNECTOR_ID ||
    job.connector.version !== CNIPA_GAZETTE_JOB_CONNECTOR_VERSION ||
    source.canonicalUri !== CNIPA_GAZETTE_PUBLIC_ORIGIN
  ) {
    throw new TypeError(
      "browser-stream job must use the governed CNIPA Gazette API source boundary",
    );
  }
  if (source.secretRef !== undefined) {
    throw new TypeError("browser-stream Gazette source must not carry a server-side secretRef");
  }
  const sourceConfig = objectValue(source.connectorConfig, "browser-stream source connectorConfig");
  exactKeys(sourceConfig, ["acquisitionMode"], "browser-stream source connectorConfig");
  if (sourceConfig.acquisitionMode !== CNIPA_GAZETTE_BROWSER_SOURCE_MODE) {
    throw new TypeError("browser-stream Gazette source acquisitionMode mismatch");
  }
  if (!job.planSnapshot.output.artifactKinds.includes("JSON")) {
    throw new TypeError("browser-stream Gazette job must authorize JSON artifacts");
  }
}
export function cnipaGazetteBrowserStreamJobFromContext(
  context: ArtifactBackedExecutionContext,
): CnipaGazetteBrowserStreamJobConfig {
  assertSourceBoundary(context);
  const extension =
    context.job.planSnapshot.extensions?.[CNIPA_GAZETTE_BROWSER_STREAM_PLAN_EXTENSION];
  const raw = objectValue(extension, "browserStream plan extension");
  exactKeys(
    raw,
    ["announcementIssue", "queryTemplate", "targetLogicalPagesPerCheckpoint", "maxRuntimeSeconds"],
    "browserStream plan extension",
  );
  const announcementIssue = positiveInteger(
    raw.announcementIssue,
    "browserStream.announcementIssue",
  );
  return {
    announcementIssue,
    queryTemplate: parseQueryTemplate(raw.queryTemplate, announcementIssue),
    targetLogicalPagesPerCheckpoint: positiveInteger(
      raw.targetLogicalPagesPerCheckpoint,
      "browserStream.targetLogicalPagesPerCheckpoint",
      100,
    ),
    maxRuntimeSeconds: positiveInteger(
      raw.maxRuntimeSeconds,
      "browserStream.maxRuntimeSeconds",
      86_400,
    ),
  };
}
export function assertCnipaGazetteBrowserSessionMatchesJob(
  session: CnipaGazetteBrowserStreamSession,
  job: CnipaGazetteBrowserStreamJobConfig,
): void {
  if (session.announcementIssue !== job.announcementIssue) {
    throw new TypeError("browser session announcementIssue does not match the frozen Job");
  }
  for (const key of QUERY_KEYS) {
    if (String(session.capturedQuery[key] ?? "") !== job.queryTemplate[key]) {
      throw new TypeError(`browser session query field ${key} does not match the frozen Job`);
    }
  }
  if (
    session.capturedQuery.pageIndex !== 1 ||
    !Number.isSafeInteger(session.capturedQuery.pageSize) ||
    Number(session.capturedQuery.pageSize) < 1 ||
    Number(session.capturedQuery.pageSize) > 100
  ) {
    throw new TypeError("browser session must start at pageIndex 1 with captured pageSize 1..100");
  }
}

export const CNIPA_GAZETTE_BROWSER_SOURCE_MODE = "NORMAL_BROWSER_BRIDGE_V1" as const;

export function cnipaGazetteBrowserConnectorManifest() {
  return {
    connectorId: CNIPA_GAZETTE_JOB_CONNECTOR_ID,
    displayName: "CNIPA Trademark Gazette — Normal Browser Bridge",
    version: CNIPA_GAZETTE_JOB_CONNECTOR_VERSION,
    sourceTypes: ["API"],
    runtime: "NODE",
    capabilities: ["COLLECT"],
    supportedJobTypes: ["API_COLLECTION"],
    configurationSchema: {
      type: "object",
      additionalProperties: false,
      required: ["acquisitionMode"],
      properties: {
        acquisitionMode: { const: CNIPA_GAZETTE_BROWSER_SOURCE_MODE },
      },
    },
    secretSchema: { type: "object", properties: {}, additionalProperties: false },
    outputArtifactKinds: ["JSON"],
    healthCheck: { mode: "WORKER_PROBE", timeoutSeconds: 30 },
    status: "ACTIVE",
    extensions: {
      "x-markorbit-production-provider": true,
      "x-markorbit-cnipa-gazette-browser-bridge": true,
      "x-markorbit-browser-auth-owned-by-browser": true,
      "x-markorbit-historical-replay-activated": false,
    },
  };
}

export function cnipaGazetteBrowserSourcePayload(workspaceId: string) {
  return {
    workspaceId,
    name: "CNIPA Trademark Gazette — Normal Browser Bridge",
    slug: "cnipa-trademark-gazette-browser-bridge",
    sourceType: "API",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["CN"],
    languages: ["zh-CN"],
    connector: {
      connectorId: CNIPA_GAZETTE_JOB_CONNECTOR_ID,
      version: CNIPA_GAZETTE_JOB_CONNECTOR_VERSION,
    },
    connectorConfig: { acquisitionMode: CNIPA_GAZETTE_BROWSER_SOURCE_MODE },
    canonicalUri: CNIPA_GAZETTE_PUBLIC_ORIGIN,
    entrypoints: [
      {
        uri: `${CNIPA_GAZETTE_PUBLIC_ORIGIN}/toas-pub-prod/portalui-pub-prod/brandNotice`,
        label: "CNIPA Trademark Gazette",
      },
    ],
    tags: ["cnipa", "gazette", "official", "normal-browser", "bridge"],
    extensions: {
      "x-markorbit-source-owner": "China National Intellectual Property Administration",
      "x-markorbit-browser-auth-owned-by-browser": true,
      "x-markorbit-server-side-secret-forbidden": true,
      "x-markorbit-historical-replay-activated": false,
    },
  };
}

export function cnipaGazetteBrowserQueryTemplate(announcementIssue: number) {
  const issue = positiveInteger(announcementIssue, "announcementIssue");
  return {
    anncIssue: String(issue),
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
  } as const;
}

export function cnipaGazetteBrowserPlanPayload(input: {
  workspaceId: string;
  sourceId: string;
  announcementIssue: number;
  targetLogicalPagesPerCheckpoint?: number;
  maxRuntimeSeconds?: number;
}) {
  const announcementIssue = positiveInteger(input.announcementIssue, "announcementIssue");
  const targetLogicalPagesPerCheckpoint = positiveInteger(
    input.targetLogicalPagesPerCheckpoint ?? 24,
    "targetLogicalPagesPerCheckpoint",
    100,
  );
  const maxRuntimeSeconds = positiveInteger(
    input.maxRuntimeSeconds ?? 21_600,
    "maxRuntimeSeconds",
    86_400,
  );
  return {
    workspaceId: input.workspaceId,
    sourceId: input.sourceId,
    name: `CNIPA Gazette issue ${announcementIssue} — browser stream`,
    status: "ACTIVE",
    schedule: { mode: "MANUAL" },
    priority: "HIGH",
    policy: {
      includePatterns: [],
      excludePatterns: [],
      maxDepth: 0,
      maxItems: 100,
      renderJavascript: false,
      fetchAttachments: false,
      respectRobots: false,
      rateLimitPerMinute: 120,
      timeoutSeconds: 300,
      retry: { maxAttempts: 1, backoffSeconds: 0 },
      locale: "zh-CN",
    },
    output: { artifactKinds: ["JSON"] },
    extensions: {
      [CNIPA_GAZETTE_BROWSER_STREAM_PLAN_EXTENSION]: {
        announcementIssue,
        queryTemplate: cnipaGazetteBrowserQueryTemplate(announcementIssue),
        targetLogicalPagesPerCheckpoint,
        maxRuntimeSeconds,
      },
      "x-markorbit-browser-auth-owned-by-browser": true,
      "x-markorbit-historical-replay-activated": false,
    },
  };
}

export function cnipaGazetteBrowserWorkerPayload(workspaceId: string) {
  return {
    workspaceId,
    displayName: "CNIPA Gazette Normal-Browser Bridge Worker",
    desiredState: "ACTIVE",
    runtime: { runtimeId: "cnipa-gazette-browser-bridge", version: "1.0.0" },
    supportedJobTypes: ["API_COLLECTION"],
    connectorBindings: [
      {
        connectorId: CNIPA_GAZETTE_JOB_CONNECTOR_ID,
        version: CNIPA_GAZETTE_JOB_CONNECTOR_VERSION,
        capabilities: ["COLLECT"],
      },
    ],
    maxConcurrency: 1,
    labels: [
      "production",
      "cnipa",
      "gazette",
      "normal-browser",
      "bridge",
      "cnipa-gazette-browser-bridge",
    ],
    extensions: {
      "x-markorbit-browser-auth-owned-by-browser": true,
      "x-markorbit-worker-concurrency": 1,
    },
  };
}
