import {
  CNIPA_CONNECTOR_ID,
  CNIPA_CONNECTOR_VERSION,
} from "@markorbit/worker-runtime/cnipa-artifact-acquirer";

export const CNIPA_FAST_QUERY_TEMPLATE_EXTENSION_KEY = "x-markorbit.cnipa-query-template" as const;
export const CNIPA_FAST_TIMEZONE = "Asia/Shanghai" as const;
export const CNIPA_FAST_DEFAULT_HOUR = 8 as const;
export const CNIPA_FAST_DEFAULT_MINUTE = 30 as const;

export type CnipaFastSourceKey = "registration" | "opposition" | "review";

export type CnipaFastSourceSpec = {
  key: CnipaFastSourceKey;
  documentKind: "REGISTRATION_EXAMINATION" | "OPPOSITION_DECISION" | "REVIEW_ADJUDICATION";
  name: string;
  slug: string;
  canonicalUri: string;
  sourceRecordIdField: "adjuOpenId" | "pubId";
  tags: readonly string[];
};

export const CNIPA_FAST_SOURCE_SPECS: readonly CnipaFastSourceSpec[] = [
  {
    key: "registration",
    documentKind: "REGISTRATION_EXAMINATION",
    name: "CNIPA Trademark Registration Examination Decisions",
    slug: "cnipa-trademark-registration-examination-decisions",
    canonicalUri:
      "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/portalui-pub-prod/trademarkRegistration",
    sourceRecordIdField: "adjuOpenId",
    tags: ["cnipa", "trademark", "judgment", "registration-examination", "fast-list"],
  },
  {
    key: "opposition",
    documentKind: "OPPOSITION_DECISION",
    name: "CNIPA Trademark Opposition Decisions",
    slug: "cnipa-trademark-opposition-decisions",
    canonicalUri: "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/portalui-pub-prod/trademarkObjection",
    sourceRecordIdField: "adjuOpenId",
    tags: ["cnipa", "trademark", "judgment", "opposition", "fast-list"],
  },
  {
    key: "review",
    documentKind: "REVIEW_ADJUDICATION",
    name: "CNIPA Trademark Review Adjudications",
    slug: "cnipa-trademark-review-adjudications",
    canonicalUri:
      "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/portalui-pub-prod/trademarkAssessment",
    sourceRecordIdField: "pubId",
    tags: ["cnipa", "trademark", "judgment", "review", "fast-list"],
  },
] as const;

export function cnipaFastCron(hour = CNIPA_FAST_DEFAULT_HOUR, minute = CNIPA_FAST_DEFAULT_MINUTE) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error("CNIPA FAST hour must be an integer in 0..23");
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error("CNIPA FAST minute must be an integer in 0..59");
  }
  return `${minute} ${hour} * * 1-5`;
}

export function cnipaResponseSchema(spec: CnipaFastSourceSpec) {
  return {
    list: {
      recordsPath: ["data", "list"],
      sourceRecordIdField: spec.sourceRecordIdField,
    },
    detail: {},
  };
}

export function cnipaSourceConnectorConfig(spec: CnipaFastSourceSpec) {
  return {
    responseSchema: cnipaResponseSchema(spec),
    limits: {
      pageSize: 100,
      maxPagesPerLibrary: 50,
      maxDetailRequestsPerRun: 1,
    },
  };
}

export function cnipaFastPlanExtensions(spec: CnipaFastSourceSpec) {
  return {
    [CNIPA_FAST_QUERY_TEMPLATE_EXTENSION_KEY]: {
      mode: "WEEKDAY_INCREMENTAL_DATE_RANGE",
      documentKinds: [spec.documentKind],
      timezone: CNIPA_FAST_TIMEZONE,
    },
    "x-markorbit.cnipa-traffic-class": "FAST_LIST",
    "x-markorbit.cnipa-document-kind": spec.documentKind,
    "x-markorbit.cnipa-detail-fanout": false,
  };
}

export function cnipaConnectorManifest() {
  return {
    connectorId: CNIPA_CONNECTOR_ID,
    displayName: "CNIPA Authenticated Trademark Judgment Worker",
    version: CNIPA_CONNECTOR_VERSION,
    sourceTypes: ["API"],
    runtime: "NODE",
    capabilities: ["COLLECT"],
    supportedJobTypes: ["API_COLLECTION"],
    configurationSchema: {
      type: "object",
      additionalProperties: false,
      required: ["responseSchema", "limits"],
      properties: {
        query: { type: "object" },
        responseSchema: {
          type: "object",
          additionalProperties: false,
          required: ["list", "detail"],
          properties: {
            list: {
              type: "object",
              additionalProperties: false,
              required: ["recordsPath", "sourceRecordIdField"],
              properties: {
                recordsPath: {
                  type: "array",
                  minItems: 1,
                  maxItems: 12,
                  items: { type: "string", maxLength: 128 },
                },
                sourceRecordIdField: { type: "string", maxLength: 128 },
                totalPath: {
                  type: "array",
                  maxItems: 12,
                  items: { type: "string", maxLength: 128 },
                },
                hasMorePath: {
                  type: "array",
                  maxItems: 12,
                  items: { type: "string", maxLength: 128 },
                },
              },
            },
            detail: { type: "object" },
          },
        },
        limits: {
          type: "object",
          additionalProperties: false,
          properties: {
            pageSize: { type: "integer", minimum: 1, maximum: 100 },
            maxPagesPerLibrary: { type: "integer", minimum: 1, maximum: 50 },
            maxDetailRequestsPerRun: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
      },
    },
    secretSchema: { type: "object", properties: {}, additionalProperties: false },
    outputArtifactKinds: ["JSON", "MARKDOWN"],
    healthCheck: { mode: "WORKER_PROBE", timeoutSeconds: 30 },
    status: "ACTIVE",
    extensions: {
      "x-markorbit-production-provider": true,
      "x-markorbit-auth-policy": "operator-managed-persistent-browser-profile",
      "x-markorbit-traffic-class": "FAST_LIST",
      "x-markorbit-evidence-boundary": "raw-list-plus-derived-knowledge-assets",
      "x-markorbit-detail-lane": "SEPARATE_SLOW_ENRICHMENT",
    },
  };
}

export function cnipaFastPlanPayload(
  sourceId: string,
  spec: CnipaFastSourceSpec,
  options: { hour?: number; minute?: number } = {},
) {
  return {
    sourceId,
    name: `${spec.name} — FAST LIST`,
    status: "ACTIVE",
    schedule: {
      mode: "CRON",
      expression: cnipaFastCron(options.hour, options.minute),
      timezone: CNIPA_FAST_TIMEZONE,
    },
    priority: "HIGH",
    policy: {
      includePatterns: [],
      excludePatterns: [],
      maxDepth: 0,
      maxItems: 500,
      renderJavascript: false,
      fetchAttachments: false,
      respectRobots: false,
      rateLimitPerMinute: 10,
      timeoutSeconds: 300,
      retry: { maxAttempts: 1, backoffSeconds: 0 },
      locale: "zh-CN",
    },
    output: { artifactKinds: ["JSON", "MARKDOWN"] },
    extensions: cnipaFastPlanExtensions(spec),
  };
}

export function cnipaFastWorkerPayload() {
  return {
    displayName: "CNIPA FAST Trademark Judgment Production Worker",
    desiredState: "ACTIVE",
    runtime: { runtimeId: "cnipa-worker", version: CNIPA_CONNECTOR_VERSION },
    supportedJobTypes: ["API_COLLECTION"],
    connectorBindings: [
      {
        connectorId: CNIPA_CONNECTOR_ID,
        version: CNIPA_CONNECTOR_VERSION,
        capabilities: ["COLLECT"],
      },
    ],
    maxConcurrency: 1,
    labels: ["production", "cnipa", "trademark-judgments", "fast-list", "cnipa-fast-worker-v1"],
    extensions: {
      "x-markorbit-auth-policy": "operator-managed-persistent-browser-profile",
      "x-markorbit-cnipa-session-concurrency": 1,
      "x-markorbit-detail-lane": "excluded",
    },
  };
}
