import { describe, expect, it } from "vitest";
import type { ArtifactBackedExecutionContext } from "./artifact-backed-collection-executor";
import {
  assertCnipaGazetteBrowserSessionMatchesJob,
  cnipaGazetteBrowserConnectorManifest,
  cnipaGazetteBrowserPlanPayload,
  cnipaGazetteBrowserQueryTemplate,
  cnipaGazetteBrowserSourcePayload,
  cnipaGazetteBrowserStreamJobFromContext,
  cnipaGazetteBrowserWorkerPayload,
  CNIPA_GAZETTE_BROWSER_SOURCE_MODE,
  CNIPA_GAZETTE_BROWSER_STREAM_PLAN_EXTENSION,
} from "./cnipa-gazette-browser-job";
import { createCnipaGazetteBrowserStreamSession } from "./cnipa-gazette-browser-stream";
import {
  CNIPA_GAZETTE_JOB_CONNECTOR_ID,
  CNIPA_GAZETTE_JOB_CONNECTOR_VERSION,
} from "./cnipa-gazette-job-acquirer";

const queryTemplate = {
  anncIssue: "75",
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
};
function context(
  input: {
    extension?: unknown;
    secretRef?: string;
    jobType?: string;
  } = {},
): ArtifactBackedExecutionContext {
  return {
    workerId: "wrk_fixture",
    leaseToken: "lease-token",
    lease: { id: "lse_fixture" },
    job: {
      jobType: input.jobType ?? "API_COLLECTION",
      connector: {
        connectorId: CNIPA_GAZETTE_JOB_CONNECTOR_ID,
        version: CNIPA_GAZETTE_JOB_CONNECTOR_VERSION,
      },
      sourceSnapshot: {
        sourceType: "API",
        connector: {
          connectorId: CNIPA_GAZETTE_JOB_CONNECTOR_ID,
          version: CNIPA_GAZETTE_JOB_CONNECTOR_VERSION,
        },
        connectorConfig: { acquisitionMode: "NORMAL_BROWSER_BRIDGE_V1" },
        canonicalUri: "https://pub.sbj.cnipa.gov.cn",
        ...(input.secretRef ? { secretRef: input.secretRef } : {}),
      },
      planSnapshot: {
        output: { artifactKinds: ["JSON"] },
        extensions: {
          [CNIPA_GAZETTE_BROWSER_STREAM_PLAN_EXTENSION]: input.extension ?? {
            announcementIssue: 75,
            queryTemplate,
            targetLogicalPagesPerCheckpoint: 24,
            maxRuntimeSeconds: 3600,
          },
        },
      },
    },
  } as unknown as ArtifactBackedExecutionContext;
}
describe("CNIPA Gazette browser-stream Job boundary", () => {
  it("parses the frozen full-issue scope", () => {
    expect(cnipaGazetteBrowserStreamJobFromContext(context())).toEqual({
      announcementIssue: 75,
      queryTemplate,
      targetLogicalPagesPerCheckpoint: 24,
      maxRuntimeSeconds: 3600,
    });
  });

  it("freezes explicit resume references into the immutable Job snapshot", () => {
    const resumeFrom = {
      stateArtifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      logicalProjectionArtifactIds: ["art_01ARZ3NDEKTSV4RRFFQ69G5FAW"],
      firstSourceRawArtifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAX",
      firstSourceProjectionArtifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAY",
      previousSourceProjectionArtifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAZ",
    };
    const parsed = cnipaGazetteBrowserStreamJobFromContext(
      context({
        extension: {
          announcementIssue: 75,
          queryTemplate,
          targetLogicalPagesPerCheckpoint: 6,
          maxRuntimeSeconds: 3600,
          resumeFrom,
        },
      }),
    );
    expect(parsed).toEqual({
      announcementIssue: 75,
      queryTemplate,
      targetLogicalPagesPerCheckpoint: 6,
      maxRuntimeSeconds: 3600,
      resumeFrom,
    });

    const plan = cnipaGazetteBrowserPlanPayload({
      workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      announcementIssue: 75,
      targetLogicalPagesPerCheckpoint: 6,
      maxRuntimeSeconds: 3600,
      resumeFrom,
    });
    expect(plan.extensions[CNIPA_GAZETTE_BROWSER_STREAM_PLAN_EXTENSION]).toMatchObject({
      resumeFrom,
    });
  });

  it("rejects filtered/non-ALL query templates and issue drift", () => {
    expect(() =>
      cnipaGazetteBrowserStreamJobFromContext(
        context({
          extension: {
            announcementIssue: 75,
            queryTemplate: { ...queryTemplate, regNo: "200602" },
            targetLogicalPagesPerCheckpoint: 24,
            maxRuntimeSeconds: 3600,
          },
        }),
      ),
    ).toThrow(/regNo must be empty/);
    expect(() =>
      cnipaGazetteBrowserStreamJobFromContext(
        context({
          extension: {
            announcementIssue: 76,
            queryTemplate,
            targetLogicalPagesPerCheckpoint: 24,
            maxRuntimeSeconds: 3600,
          },
        }),
      ),
    ).toThrow(/anncIssue must match/);
  });
  it("rejects a server-side source secret", () => {
    expect(() =>
      cnipaGazetteBrowserStreamJobFromContext(
        context({ secretRef: "sec_01ARZ3NDEKTSV4RRFFQ69G5FAV" }),
      ),
    ).toThrow(/must not carry a server-side secretRef/);
  });

  it("binds the live browser session to the frozen issue/query while allowing captured pageSize", () => {
    const job = cnipaGazetteBrowserStreamJobFromContext(context());
    const session = createCnipaGazetteBrowserStreamSession({
      sessionId: "gazette-75-live",
      announcementIssue: 75,
      sourceUrl:
        "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg",
      capturedQuery: {
        ...queryTemplate,
        pageIndex: 1,
        pageSize: 30,
      },
      sourceTotal: 576,
      sourcePages: 20,
      announcementDate: "1983-08-15",
      startedAt: "2026-09-20T10:00:00.000Z",
    });
    expect(() => assertCnipaGazetteBrowserSessionMatchesJob(session, job)).not.toThrow();

    const drifted = createCnipaGazetteBrowserStreamSession({
      sessionId: "gazette-76-live",
      announcementIssue: 76,
      sourceUrl:
        "https://pub.sbj.cnipa.gov.cn/toas-pub-prod/pub-prod-api/public/web/anncInfo/searchEsTmgg",
      capturedQuery: {
        ...queryTemplate,
        anncIssue: "76",
        pageIndex: 1,
        pageSize: 30,
      },
      sourceTotal: 100,
      sourcePages: 4,
      announcementDate: "1983-09-01",
      startedAt: "2026-09-20T10:01:00.000Z",
    });
    expect(() => assertCnipaGazetteBrowserSessionMatchesJob(drifted, job)).toThrow(
      /announcementIssue does not match/,
    );
  });
});

describe("CNIPA Gazette browser-stream bootstrap payloads", () => {
  it("freezes the connector/source boundary without server-side secrets", () => {
    const connector = cnipaGazetteBrowserConnectorManifest();
    expect(connector).toMatchObject({
      connectorId: CNIPA_GAZETTE_JOB_CONNECTOR_ID,
      version: CNIPA_GAZETTE_JOB_CONNECTOR_VERSION,
      secretSchema: { type: "object", additionalProperties: false },
      extensions: {
        "x-markorbit-cnipa-gazette-browser-bridge": true,
        "x-markorbit-browser-auth-owned-by-browser": true,
      },
    });
    const source = cnipaGazetteBrowserSourcePayload("wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(source).toMatchObject({
      connectorConfig: { acquisitionMode: CNIPA_GAZETTE_BROWSER_SOURCE_MODE },
      canonicalUri: "https://pub.sbj.cnipa.gov.cn",
      extensions: { "x-markorbit-server-side-secret-forbidden": true },
    });
    expect(source).not.toHaveProperty("secretRef");
  });

  it("builds an issue-specific MANUAL plan with one exact ALL query and no replay activation", () => {
    const plan = cnipaGazetteBrowserPlanPayload({
      workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      announcementIssue: 75,
      targetLogicalPagesPerCheckpoint: 12,
      maxRuntimeSeconds: 7200,
    });
    expect(plan.schedule).toEqual({ mode: "MANUAL" });
    expect(plan.extensions[CNIPA_GAZETTE_BROWSER_STREAM_PLAN_EXTENSION]).toEqual({
      announcementIssue: 75,
      queryTemplate: cnipaGazetteBrowserQueryTemplate(75),
      targetLogicalPagesPerCheckpoint: 12,
      maxRuntimeSeconds: 7200,
    });
    expect(plan.extensions["x-markorbit-historical-replay-activated"]).toBe(false);
  });

  it("builds a one-concurrency governed Worker binding", () => {
    expect(cnipaGazetteBrowserWorkerPayload("wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV")).toMatchObject({
      maxConcurrency: 1,
      supportedJobTypes: ["API_COLLECTION"],
      connectorBindings: [
        {
          connectorId: CNIPA_GAZETTE_JOB_CONNECTOR_ID,
          version: CNIPA_GAZETTE_JOB_CONNECTOR_VERSION,
          capabilities: ["COLLECT"],
        },
      ],
    });
  });
});
