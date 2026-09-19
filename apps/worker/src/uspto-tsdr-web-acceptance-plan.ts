import { createHash } from "node:crypto";
import { parseUsptoTsdrWebTarget, type UsptoTsdrWebSurface } from "@markorbit/worker-runtime";

const OPERATION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const WORKSPACE_ID = /^wsp_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SERIAL_NUMBER = /^[0-9]{8}$/u;

export const USPTO_TSDR_WEB_ACCEPTANCE_AUTHORITY_MODE = "INTERNAL_SERVICE_GO_V1" as const;
export const USPTO_TSDR_WEB_CONNECTOR_ID = "crawl4ai-web" as const;
export const USPTO_TSDR_WEB_CONNECTOR_VERSION = "1.3.0" as const;

export type UsptoTsdrWebAcceptanceStage = UsptoTsdrWebSurface;
export type UsptoTsdrWebTransportMode = "STATIC_HTTP_PINNED" | "BROWSER_PROXY";
export type UsptoTsdrWebRobotsPolicy =
  | "RFC9309_4XX_UNAVAILABLE_ALLOW_5XX_UNREACHABLE_FAIL_V1"
  | "BROWSER_PROVIDER_NATIVE_V1";

export type UsptoTsdrWebAcceptancePlan = {
  version: 1;
  operationId: string;
  workspaceId: string;
  authorityMode: typeof USPTO_TSDR_WEB_ACCEPTANCE_AUTHORITY_MODE;
  executionMode: "APPLY_DISPATCH_ONCE";
  workerMode: "PROVISION_ONE_SHOT";
  channel: "WEB";
  stage: UsptoTsdrWebAcceptanceStage;
  transportMode: UsptoTsdrWebTransportMode;
  robotsPolicy: UsptoTsdrWebRobotsPolicy;
  serialNumber: string;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("TSDR Web acceptance plan must be an object");
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const set = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !set.has(key));
  if (unknown.length > 0) {
    throw new Error(`TSDR Web acceptance plan contains unsupported keys: ${unknown.join(", ")}`);
  }
}

function targetUrl(stage: UsptoTsdrWebAcceptanceStage, serialNumber: string): string {
  if (stage === "STATUS") return `https://tsdr.uspto.gov/statusview/sn${serialNumber}`;
  if (stage === "MARK_IMAGE") return `https://tsdr.uspto.gov/img/${serialNumber}/large`;
  return `https://tsdr.uspto.gov/documentviewer?caseId=sn${serialNumber}`;
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

export function usptoTsdrWebAcceptancePlanSha256(plan: UsptoTsdrWebAcceptancePlan): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(plan)))
    .digest("hex");
}

export function parseUsptoTsdrWebAcceptancePlan(value: unknown): UsptoTsdrWebAcceptancePlan {
  const input = record(value);
  exactKeys(input, [
    "version",
    "operationId",
    "workspaceId",
    "authorityMode",
    "executionMode",
    "workerMode",
    "channel",
    "stage",
    "transportMode",
    "robotsPolicy",
    "serialNumber",
  ]);
  if (input.version !== 1) throw new Error("TSDR Web acceptance plan version must be 1");
  if (typeof input.operationId !== "string" || !OPERATION_ID.test(input.operationId)) {
    throw new Error("TSDR Web acceptance operationId must be a lowercase slug");
  }
  if (typeof input.workspaceId !== "string" || !WORKSPACE_ID.test(input.workspaceId)) {
    throw new Error("TSDR Web acceptance workspaceId is invalid");
  }
  if (input.authorityMode !== USPTO_TSDR_WEB_ACCEPTANCE_AUTHORITY_MODE) {
    throw new Error("TSDR Web acceptance authorityMode mismatch");
  }
  if (input.executionMode !== "APPLY_DISPATCH_ONCE") {
    throw new Error("TSDR Web acceptance executionMode mismatch");
  }
  if (input.workerMode !== "PROVISION_ONE_SHOT") {
    throw new Error("TSDR Web acceptance workerMode mismatch");
  }
  if (input.channel !== "WEB") throw new Error("TSDR Web acceptance channel must be WEB");
  if (!["STATUS", "MARK_IMAGE", "DOCUMENT_INDEX"].includes(String(input.stage))) {
    throw new Error("TSDR Web acceptance stage is invalid");
  }
  if (typeof input.serialNumber !== "string" || !SERIAL_NUMBER.test(input.serialNumber)) {
    throw new Error("TSDR Web acceptance serialNumber must be 8 digits");
  }
  const stage = input.stage as UsptoTsdrWebAcceptanceStage;
  const expectedTransportMode = stage === "DOCUMENT_INDEX" ? "BROWSER_PROXY" : "STATIC_HTTP_PINNED";
  if (input.transportMode !== expectedTransportMode) {
    throw new Error(
      `TSDR Web acceptance transportMode for ${stage} must be ${expectedTransportMode}`,
    );
  }
  const expectedRobotsPolicy =
    expectedTransportMode === "STATIC_HTTP_PINNED"
      ? "RFC9309_4XX_UNAVAILABLE_ALLOW_5XX_UNREACHABLE_FAIL_V1"
      : "BROWSER_PROVIDER_NATIVE_V1";
  if (input.robotsPolicy !== expectedRobotsPolicy) {
    throw new Error(
      `TSDR Web acceptance robotsPolicy for ${stage} must be ${expectedRobotsPolicy}`,
    );
  }
  const parsedTarget = parseUsptoTsdrWebTarget(targetUrl(stage, input.serialNumber));
  if (parsedTarget.surface !== stage || parsedTarget.serialNumber !== input.serialNumber) {
    throw new Error("TSDR Web acceptance target derivation mismatch");
  }
  return {
    version: 1,
    operationId: input.operationId,
    workspaceId: input.workspaceId,
    authorityMode: USPTO_TSDR_WEB_ACCEPTANCE_AUTHORITY_MODE,
    executionMode: "APPLY_DISPATCH_ONCE",
    workerMode: "PROVISION_ONE_SHOT",
    channel: "WEB",
    stage,
    transportMode: expectedTransportMode,
    robotsPolicy: expectedRobotsPolicy,
    serialNumber: input.serialNumber,
  };
}

export function usptoTsdrWebAcceptanceTargetUrl(plan: UsptoTsdrWebAcceptancePlan): string {
  return targetUrl(plan.stage, plan.serialNumber);
}

export function usptoTsdrWebAcceptanceSourcePayload(plan: UsptoTsdrWebAcceptancePlan) {
  const uri = usptoTsdrWebAcceptanceTargetUrl(plan);
  return {
    workspaceId: plan.workspaceId,
    name: `USPTO TSDR Web ${plan.serialNumber} — ${plan.stage}`,
    slug: `uspto-tsdr-web-${plan.serialNumber}-${plan.stage.toLowerCase().replace("_", "-")}-${plan.operationId}`,
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en-US"],
    connector: {
      connectorId: USPTO_TSDR_WEB_CONNECTOR_ID,
      version: USPTO_TSDR_WEB_CONNECTOR_VERSION,
    },
    connectorConfig: {},
    canonicalUri: uri,
    entrypoints: [{ uri, label: `USPTO TSDR Web ${plan.stage}` }],
    tags: ["uspto", "tsdr", "web", "official", "acceptance", plan.stage.toLowerCase()],
    extensions: {
      "x-markorbit-tsdr-acquisition-channel": "WEB",
      "x-markorbit-tsdr-web-acceptance-operation": plan.operationId,
      "x-markorbit-tsdr-web-acceptance-stage": plan.stage,
      "x-markorbit-tsdr-web-transport-mode": plan.transportMode,
      "x-markorbit-tsdr-web-robots-policy": plan.robotsPolicy,
      "x-markorbit-tsdr-target-serial-only": true,
      "x-markorbit-legal-effect-claim": false,
    },
  };
}

export function usptoTsdrWebAcceptanceCollectionPlanPayload(
  sourceId: string,
  plan: UsptoTsdrWebAcceptancePlan,
) {
  const artifactKinds =
    plan.stage === "MARK_IMAGE"
      ? ["IMAGE"]
      : plan.stage === "STATUS"
        ? ["HTML"]
        : ["HTML", "MARKDOWN"];
  return {
    workspaceId: plan.workspaceId,
    sourceId,
    name: `USPTO TSDR Web ${plan.serialNumber} — ${plan.stage} — ${plan.operationId}`,
    status: "ACTIVE",
    schedule: { mode: "MANUAL" },
    priority: "HIGH",
    policy: {
      includePatterns: [],
      excludePatterns: [],
      maxDepth: 0,
      maxItems: 1,
      renderJavascript: plan.transportMode === "BROWSER_PROXY",
      fetchAttachments: false,
      respectRobots: true,
      rateLimitPerMinute: 6,
      timeoutSeconds: 120,
      retry: { maxAttempts: 1, backoffSeconds: 0 },
      locale: "en-US",
    },
    output: { artifactKinds },
    extensions: {
      "x-markorbit-tsdr-acquisition-channel": "WEB",
      "x-markorbit-tsdr-web-acceptance-operation": plan.operationId,
      "x-markorbit-tsdr-web-acceptance-stage": plan.stage,
      "x-markorbit-tsdr-web-transport-mode": plan.transportMode,
      "x-markorbit-tsdr-web-robots-policy": plan.robotsPolicy,
      "x-markorbit-tsdr-web-frozen-plan-sha256": usptoTsdrWebAcceptancePlanSha256(plan),
    },
  };
}

export function usptoTsdrWebAcceptanceWorkerPayload(workspaceId: string) {
  if (!WORKSPACE_ID.test(workspaceId))
    throw new Error("TSDR Web acceptance workspaceId is invalid");
  return {
    workspaceId,
    displayName: "USPTO TSDR Web Governed Evidence Worker",
    desiredState: "ACTIVE",
    runtime: { runtimeId: "uspto-tsdr-web-worker", version: "1.0.0" },
    supportedJobTypes: ["WEB_CRAWL"],
    connectorBindings: [
      {
        connectorId: USPTO_TSDR_WEB_CONNECTOR_ID,
        version: USPTO_TSDR_WEB_CONNECTOR_VERSION,
        capabilities: ["COLLECT"],
      },
    ],
    maxConcurrency: 1,
    labels: [
      "production",
      "uspto",
      "tsdr",
      "web",
      "governed-evidence",
      "target-serial-only",
      "uspto-tsdr-web-governed-worker-v1",
    ],
    extensions: {
      "x-markorbit-tsdr-acquisition-channel": "WEB",
      "x-markorbit-tsdr-web-worker-concurrency": 1,
    },
  };
}
