import { createHash } from "node:crypto";
import {
  USPTO_TSDR_API_ORIGIN,
  admitUsptoTsdrAcquisition,
  type UsptoTsdrDocumentSelection,
} from "@markorbit/worker-runtime";
import {
  USPTO_TSDR_JOB_CONNECTOR_ID,
  USPTO_TSDR_JOB_CONNECTOR_VERSION,
} from "@markorbit/worker-runtime/uspto-tsdr-job-acquirer";

const OPERATION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SECRET_REF = /^sec_[0-9A-HJKMNP-TV-Z]{26}$/;
const WORKSPACE_ID = /^wsp_[0-9A-HJKMNP-TV-Z]{26}$/;
export const USPTO_TSDR_ACCEPTANCE_AUTHORITY_MODE = "INTERNAL_SERVICE_GO_V1" as const;

export type UsptoTsdrAcceptanceIndexPlan = {
  version: 1;
  operationId: string;
  workspaceId: string;
  authorityMode: typeof USPTO_TSDR_ACCEPTANCE_AUTHORITY_MODE;
  executionMode: "APPLY_DISPATCH_ONCE";
  workerMode: "PROVISION_ONE_SHOT";
  stage: "INDEX";
  serialNumber: string;
  secretRef: string;
};

export type UsptoTsdrAcceptanceSelectedPlan = {
  version: 1;
  operationId: string;
  workspaceId: string;
  authorityMode: typeof USPTO_TSDR_ACCEPTANCE_AUTHORITY_MODE;
  executionMode: "APPLY_DISPATCH_ONCE";
  workerMode: "PROVISION_ONE_SHOT";
  stage: "SELECTED_DOCUMENT";
  serialNumber: string;
  secretRef: string;
  format: "PDF";
  purpose: "LIVE_BUSINESS_EVENT" | "CASE_RESEARCH";
  businessChain: "OA" | "DECLARATION" | "RENEWAL" | "OTHER_RESEARCH";
  document: UsptoTsdrDocumentSelection;
};

export type UsptoTsdrAcceptancePlan =
  UsptoTsdrAcceptanceIndexPlan | UsptoTsdrAcceptanceSelectedPlan;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`TSDR acceptance plan invalid: ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const set = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !set.has(key));
  if (unknown.length > 0) {
    throw new Error(
      `TSDR acceptance plan invalid: ${label} contains unsupported keys: ${unknown.join(", ")}`,
    );
  }
}

function operationId(value: unknown): string {
  if (typeof value !== "string" || !OPERATION_ID.test(value)) {
    throw new Error("TSDR acceptance plan invalid: operationId must be a lowercase slug");
  }
  return value;
}

function secretRef(value: unknown): string {
  if (typeof value !== "string" || !SECRET_REF.test(value)) {
    throw new Error("TSDR acceptance plan invalid: secretRef must be a Schema v1 secret reference");
  }
  return value;
}

function workspaceId(value: unknown): string {
  if (typeof value !== "string" || !WORKSPACE_ID.test(value)) {
    throw new Error("TSDR acceptance plan invalid: workspaceId must be a Schema v1 workspace id");
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

export function usptoTsdrAcceptancePlanSha256(plan: UsptoTsdrAcceptancePlan): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(plan)))
    .digest("hex");
}

export function parseUsptoTsdrAcceptancePlan(value: unknown): UsptoTsdrAcceptancePlan {
  const input = record(value, "root");
  if (input.version !== 1) {
    throw new Error("TSDR acceptance plan invalid: version must be 1");
  }
  const id = operationId(input.operationId);
  const workspace = workspaceId(input.workspaceId);
  if (input.authorityMode !== USPTO_TSDR_ACCEPTANCE_AUTHORITY_MODE) {
    throw new Error(
      `TSDR acceptance plan invalid: authorityMode must be ${USPTO_TSDR_ACCEPTANCE_AUTHORITY_MODE}`,
    );
  }
  if (input.executionMode !== "APPLY_DISPATCH_ONCE") {
    throw new Error("TSDR acceptance plan invalid: executionMode must be APPLY_DISPATCH_ONCE");
  }
  if (input.workerMode !== "PROVISION_ONE_SHOT") {
    throw new Error("TSDR acceptance plan invalid: workerMode must be PROVISION_ONE_SHOT");
  }
  const ref = secretRef(input.secretRef);

  if (input.stage === "INDEX") {
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
        "serialNumber",
        "secretRef",
      ],
      "root",
    );
    const admitted = admitUsptoTsdrAcquisition({
      intent: "CASE_DOCUMENT_INDEX",
      serialNumber: input.serialNumber,
      secretRef: ref,
      requestsPerMinute: 30,
      coverageClaim: "TARGET_SERIAL_ONLY",
      legalEffectClaim: false,
    });
    return {
      version: 1,
      operationId: id,
      workspaceId: workspace,
      authorityMode: USPTO_TSDR_ACCEPTANCE_AUTHORITY_MODE,
      executionMode: "APPLY_DISPATCH_ONCE",
      workerMode: "PROVISION_ONE_SHOT",
      stage: "INDEX",
      serialNumber: admitted.serialNumber,
      secretRef: ref,
    };
  }

  if (input.stage === "SELECTED_DOCUMENT") {
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
        "serialNumber",
        "secretRef",
        "format",
        "purpose",
        "businessChain",
        "document",
      ],
      "root",
    );
    if (input.format !== "PDF") {
      throw new Error("TSDR acceptance plan invalid: acceptance v1 admits PDF only");
    }
    const admitted = admitUsptoTsdrAcquisition({
      intent: "SELECTED_DOCUMENT_BINARY",
      serialNumber: input.serialNumber,
      secretRef: ref,
      requestsPerMinute: 4,
      coverageClaim: "TARGET_SERIAL_ONLY",
      legalEffectClaim: false,
      format: input.format,
      purpose: input.purpose,
      businessChain: input.businessChain,
      document: input.document,
    });
    if (!admitted.document || !admitted.purpose || !admitted.businessChain) {
      throw new Error("TSDR acceptance plan invalid: selected document admission incomplete");
    }
    return {
      version: 1,
      operationId: id,
      workspaceId: workspace,
      authorityMode: USPTO_TSDR_ACCEPTANCE_AUTHORITY_MODE,
      executionMode: "APPLY_DISPATCH_ONCE",
      workerMode: "PROVISION_ONE_SHOT",
      stage: "SELECTED_DOCUMENT",
      serialNumber: admitted.serialNumber,
      secretRef: ref,
      format: "PDF",
      purpose: admitted.purpose,
      businessChain: admitted.businessChain,
      document: admitted.document,
    };
  }

  throw new Error("TSDR acceptance plan invalid: stage must be INDEX or SELECTED_DOCUMENT");
}

export function usptoTsdrAcceptanceSourcePayload(plan: UsptoTsdrAcceptancePlan) {
  const config =
    plan.stage === "INDEX"
      ? { intent: "CASE_DOCUMENT_INDEX", serialNumber: plan.serialNumber }
      : {
          intent: "SELECTED_DOCUMENT_BINARY",
          serialNumber: plan.serialNumber,
          format: plan.format,
          purpose: plan.purpose,
          businessChain: plan.businessChain,
          document: plan.document,
        };
  return {
    workspaceId: plan.workspaceId,
    name: `USPTO TSDR ${plan.serialNumber} — ${plan.stage}`,
    slug: `uspto-tsdr-${plan.serialNumber}-${plan.stage.toLowerCase().replace("_", "-")}-${plan.operationId}`,
    sourceType: "API",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en-US"],
    connector: {
      connectorId: USPTO_TSDR_JOB_CONNECTOR_ID,
      version: USPTO_TSDR_JOB_CONNECTOR_VERSION,
    },
    connectorConfig: config,
    secretRef: plan.secretRef,
    canonicalUri: USPTO_TSDR_API_ORIGIN,
    entrypoints: [{ uri: USPTO_TSDR_API_ORIGIN, label: "USPTO TSDR API" }],
    tags: ["uspto", "tsdr", "trademark", "official", "acceptance", plan.stage.toLowerCase()],
    extensions: {
      "x-markorbit-tsdr-acceptance-operation": plan.operationId,
      "x-markorbit-tsdr-acceptance-stage": plan.stage,
      "x-markorbit-tsdr-acceptance-authority-mode": plan.authorityMode,
      "x-markorbit-tsdr-acceptance-execution-mode": plan.executionMode,
      "x-markorbit-tsdr-acceptance-worker-mode": plan.workerMode,
      "x-markorbit-tsdr-target-serial-only": true,
      "x-markorbit-legal-effect-claim": false,
    },
  };
}

export function usptoTsdrAcceptanceCollectionPlanPayload(
  sourceId: string,
  plan: UsptoTsdrAcceptancePlan,
) {
  const rateLimitPerMinute = plan.stage === "INDEX" ? 30 : 4;
  const artifactKinds = plan.stage === "INDEX" ? ["XML"] : ["PDF"];
  return {
    workspaceId: plan.workspaceId,
    sourceId,
    name: `USPTO TSDR ${plan.serialNumber} — ${plan.stage} — ${plan.operationId}`,
    status: "ACTIVE",
    schedule: { mode: "MANUAL" },
    priority: "HIGH",
    policy: {
      includePatterns: [],
      excludePatterns: [],
      maxDepth: 0,
      maxItems: 1,
      renderJavascript: false,
      fetchAttachments: false,
      respectRobots: false,
      rateLimitPerMinute,
      timeoutSeconds: 180,
      retry: { maxAttempts: 1, backoffSeconds: 0 },
      locale: "en-US",
    },
    output: { artifactKinds },
    extensions: {
      "x-markorbit-tsdr-acceptance-operation": plan.operationId,
      "x-markorbit-tsdr-acceptance-stage": plan.stage,
      "x-markorbit-tsdr-acceptance-authority-mode": plan.authorityMode,
      "x-markorbit-tsdr-acceptance-execution-mode": plan.executionMode,
      "x-markorbit-tsdr-acceptance-worker-mode": plan.workerMode,
      "x-markorbit-tsdr-frozen-plan-sha256": usptoTsdrAcceptancePlanSha256(plan),
    },
  };
}

export function usptoTsdrAcceptanceConnectorManifest() {
  return {
    connectorId: USPTO_TSDR_JOB_CONNECTOR_ID,
    displayName: "USPTO TSDR Governed Evidence Worker",
    version: USPTO_TSDR_JOB_CONNECTOR_VERSION,
    sourceTypes: ["API"],
    runtime: "NODE",
    capabilities: ["COLLECT"],
    supportedJobTypes: ["API_COLLECTION"],
    configurationSchema: {
      type: "object",
      additionalProperties: false,
      required: ["intent", "serialNumber"],
      properties: {
        intent: {
          enum: ["CASE_DOCUMENT_INDEX", "SELECTED_DOCUMENT_BINARY"],
        },
        serialNumber: { type: "string", pattern: "^[0-9]{8}$" },
        format: { const: "PDF" },
        purpose: { enum: ["LIVE_BUSINESS_EVENT", "CASE_RESEARCH"] },
        businessChain: { enum: ["OA", "DECLARATION", "RENEWAL", "OTHER_RESEARCH"] },
        document: { type: "object" },
      },
    },
    secretSchema: { type: "object", properties: {}, additionalProperties: false },
    outputArtifactKinds: ["XML", "PDF"],
    healthCheck: { mode: "WORKER_PROBE", timeoutSeconds: 30 },
    status: "ACTIVE",
    extensions: {
      "x-markorbit-production-provider": true,
      "x-markorbit-auth-policy": "schema-v1-secret-ref-runtime-binding",
      "x-markorbit-evidence-boundary": "target-serial-official-tsdr-only",
      "x-markorbit-legal-effect-claim": false,
    },
  };
}

export function usptoTsdrAcceptanceWorkerPayload(workspaceIdValue: string) {
  const workspaceId = workspaceIdValue.trim();
  if (!WORKSPACE_ID.test(workspaceId)) {
    throw new Error("TSDR acceptance worker requires a Schema v1 workspace id");
  }
  return {
    workspaceId,
    displayName: "USPTO TSDR Governed Evidence Worker",
    desiredState: "ACTIVE",
    runtime: {
      runtimeId: "uspto-tsdr-worker",
      version: USPTO_TSDR_JOB_CONNECTOR_VERSION,
    },
    supportedJobTypes: ["API_COLLECTION"],
    connectorBindings: [
      {
        connectorId: USPTO_TSDR_JOB_CONNECTOR_ID,
        version: USPTO_TSDR_JOB_CONNECTOR_VERSION,
        capabilities: ["COLLECT"],
      },
    ],
    maxConcurrency: 1,
    labels: [
      "production",
      "uspto",
      "tsdr",
      "governed-evidence",
      "target-serial-only",
      "uspto-tsdr-governed-worker-v1",
    ],
    extensions: {
      "x-markorbit-secret-policy": "runtime-binding-by-secret-ref",
      "x-markorbit-tsdr-worker-concurrency": 1,
    },
  };
}
