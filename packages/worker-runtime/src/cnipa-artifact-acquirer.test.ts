import { describe, expect, it } from "vitest";
import type { ArtifactBackedExecutionContext } from "./artifact-backed-collection-executor";
import {
  CnipaJudgmentArtifactAcquirer,
  type CnipaAuthenticatedSessionExecutorFactory,
} from "./cnipa-artifact-acquirer";
import {
  CNIPA_QUERY_TEMPLATE_EXTENSION_KEY,
  SCHEDULE_SLOT_EXTENSION_KEY,
} from "./cnipa-execution-query";
import type { CnipaAuthenticatedRequest } from "./cnipa-trademark-judgment";

function jsonResponse(request: CnipaAuthenticatedRequest, value: unknown) {
  const query = request.query ? `?${new URLSearchParams(request.query).toString()}` : "";
  return {
    status: 200,
    sourceUri: `https://cnipa.example${request.path}${query}`,
    contentType: "application/json;charset=UTF-8",
    observedAt: "2026-08-29T00:00:00.000Z",
    body: new TextEncoder().encode(JSON.stringify(value)),
    securityState: "OK" as const,
  };
}

function context(): ArtifactBackedExecutionContext {
  return {
    workerId: "worker-1",
    leaseToken: "lease-token",
    lease: { id: "lease-1" },
    job: {
      id: "job-1",
      sourceSnapshot: {
        connectorConfig: {
          query: {
            mode: "REGISTRATION_NUMBER",
            registrationNumber: "12345678",
            documentKinds: ["REGISTRATION_EXAMINATION"],
          },
          responseSchema: {
            list: {
              recordsPath: ["data", "records"],
              sourceRecordIdField: "id",
              totalPath: ["data", "total"],
              hasMorePath: ["data", "hasMore"],
            },
            detail: {
              rootPath: ["data"],
              sourceRecordIdField: "id",
              fields: { registrationNumber: "regNo" },
              parties: {
                REGISTRATION_EXAMINATION: [{ field: "applicantCnName", role: "APPLICANT" }],
              },
            },
          },
        },
      },
    },
  } as unknown as ArtifactBackedExecutionContext;
}

describe("CnipaJudgmentArtifactAcquirer", () => {
  it("converts exact list/detail responses into immutable JSON artifact inputs", async () => {
    let closed = 0;
    const factory: CnipaAuthenticatedSessionExecutorFactory = {
      async create() {
        return {
          async execute(request) {
            if (request.surface === "LIST") {
              return jsonResponse(request, {
                data: { records: [{ id: "record-1" }], total: 1, hasMore: false },
              });
            }
            return jsonResponse(request, {
              data: { id: "record-1", regNo: "12345678", applicantCnName: "Applicant" },
            });
          },
          async close() {
            closed += 1;
          },
        };
      },
    };

    const artifacts = await new CnipaJudgmentArtifactAcquirer(factory).acquire(context());

    expect(artifacts).toHaveLength(2);
    expect(artifacts.every((artifact) => artifact.artifactKind === "JSON")).toBe(true);
    expect(artifacts.every((artifact) => artifact.content.byteLength > 0)).toBe(true);
    expect(artifacts[0]?.canonicalUri).toContain("markorbit-cnipa-query=");
    expect(artifacts[1]?.sourceUri).toContain("record-1");
    expect(closed).toBe(1);
  });

  it("materializes a scheduled local-day template into the actual registration LIST request", async () => {
    const input = context();
    input.job.planSnapshot = {
      schedule: { mode: "CRON", expression: "30 0 * * *", timezone: "Asia/Shanghai" },
      extensions: {
        [CNIPA_QUERY_TEMPLATE_EXTENSION_KEY]: {
          mode: "SCHEDULE_SLOT_DATE_RANGE",
          documentKinds: ["REGISTRATION_EXAMINATION"],
          fromDayOffset: -1,
          toDayOffset: -1,
        },
      },
    } as unknown as typeof input.job.planSnapshot;
    input.job.extensions = {
      [SCHEDULE_SLOT_EXTENSION_KEY]: "2026-09-17T16:30:00.000Z",
    };
    (input.job.sourceSnapshot.connectorConfig as Record<string, unknown>).query = {
      mode: "REGISTRATION_NUMBER",
      registrationNumber: "stale-static-query",
      documentKinds: ["REGISTRATION_EXAMINATION"],
    };
    (input.job.sourceSnapshot.connectorConfig as Record<string, unknown>).responseSchema = {
      list: {
        recordsPath: ["data", "list"],
        sourceRecordIdField: "adjuOpenId",
        totalPath: ["data", "total"],
      },
      detail: {},
    };

    const requests: CnipaAuthenticatedRequest[] = [];
    const factory: CnipaAuthenticatedSessionExecutorFactory = {
      async create() {
        return {
          async execute(request) {
            requests.push(request);
            return jsonResponse(request, {
              data: {
                list: [
                  {
                    adjuOpenId: "scheduled-1",
                    fileContent: "scheduled registration decision",
                  },
                ],
                total: 100,
                pageIndex: 1,
                pageSize: 100,
                pages: 1,
              },
            });
          },
          async close() {},
        };
      },
    };

    const artifacts = await new CnipaJudgmentArtifactAcquirer(factory).acquire(input);

    const rawList = artifacts.filter((artifact) => artifact.originalName.includes("-list-"));
    const factProjection = artifacts.filter((artifact) =>
      artifact.originalName.includes("-facts-"),
    );
    const markdown = artifacts.filter((artifact) => artifact.artifactKind === "MARKDOWN");

    expect(rawList).toHaveLength(1);
    expect(factProjection).toHaveLength(1);
    expect(markdown).toHaveLength(1);
    expect(factProjection[0]?.parentCanonicalUris).toEqual([rawList[0]?.canonicalUri]);
    expect(markdown[0]?.parentCanonicalUris).toEqual([rawList[0]?.canonicalUri]);
    expect(markdown[0]?.canonicalUri).toBe("cnipa://judgment/REGISTRATION_EXAMINATION/scheduled-1");
    expect(markdown[0]?.sourceUri).toContain("tmscJudgment/queryPageList");
    expect(markdown[0]?.sourceUri).toContain("markorbit-cnipa-record=scheduled-1");
    expect(markdown[0]?.sourceUri).not.toContain("queryInfo");
    const projectionPayload = JSON.parse(new TextDecoder().decode(factProjection[0]!.content));
    expect(projectionPayload.records[0].sourceFields).not.toHaveProperty("fileContent");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      documentKind: "REGISTRATION_EXAMINATION",
      surface: "LIST",
      jsonBody: {
        regNo: "",
        tmName: "",
        applicantCnName: "",
        returnDateStart: "2026-09-17",
        returnDateEnd: "2026-09-17",
        pageIndex: 1,
        pageSize: 100,
      },
    });
  });

  it("acquires registration date ranges as hidden-paged LIST evidence without DETAIL fan-out", async () => {
    const input = context();
    (input.job.sourceSnapshot.connectorConfig as Record<string, unknown>).query = {
      mode: "DATE_RANGE",
      fromDate: "2026-07-02",
      toDate: "2026-07-02",
      documentKinds: ["REGISTRATION_EXAMINATION"],
    };
    (input.job.sourceSnapshot.connectorConfig as Record<string, unknown>).responseSchema = {
      list: {
        recordsPath: ["data", "list"],
        sourceRecordIdField: "adjuOpenId",
        totalPath: ["data", "total"],
      },
      detail: {},
    };
    let closed = 0;
    const factory: CnipaAuthenticatedSessionExecutorFactory = {
      async create() {
        return {
          async execute(request) {
            if (request.surface !== "LIST") throw new Error("DETAIL must not be requested");
            const pageIndex = Number(request.jsonBody?.pageIndex ?? 1);
            const count = pageIndex === 1 ? 100 : 79;
            return jsonResponse(request, {
              data: {
                list: Array.from({ length: count }, (_, index) => ({
                  adjuOpenId: `r${pageIndex}-${index + 1}`,
                  fileContent: `registration-${pageIndex}-${index + 1}`,
                })),
                total: 100,
                pageIndex: 1,
                pageSize: 100,
                pages: 1,
              },
            });
          },
          async close() {
            closed += 1;
          },
        };
      },
    };

    const artifacts = await new CnipaJudgmentArtifactAcquirer(factory).acquire(input);

    const rawList = artifacts.filter((artifact) =>
      artifact.originalName.includes("registration-examination-list-"),
    );
    const factProjection = artifacts.filter((artifact) =>
      artifact.originalName.includes("registration-examination-facts-"),
    );
    const markdown = artifacts.filter((artifact) => artifact.artifactKind === "MARKDOWN");
    const coverage = artifacts.filter((artifact) =>
      artifact.originalName.includes("registration-examination-coverage-"),
    );

    expect(rawList).toHaveLength(2);
    expect(factProjection).toHaveLength(2);
    expect(markdown).toHaveLength(179);
    expect(rawList[0]?.canonicalUri).toContain("page=1");
    expect(rawList[1]?.canonicalUri).toContain("page=2");
    expect(factProjection[0]?.parentCanonicalUris).toEqual([rawList[0]?.canonicalUri]);
    expect(factProjection[1]?.parentCanonicalUris).toEqual([rawList[1]?.canonicalUri]);
    expect(coverage).toHaveLength(1);
    expect(coverage[0]?.parentCanonicalUris).toEqual([
      rawList[0]?.canonicalUri,
      rawList[1]?.canonicalUri,
    ]);
    const coveragePayload = JSON.parse(new TextDecoder().decode(coverage[0]!.content));
    expect(coveragePayload).toMatchObject({
      rawListPageCount: 2,
      rawListRecordCount: 179,
      uniqueSourceRecordCount: 179,
      terminalPageLength: 79,
      stopReason: "NATURAL_SHORT_OR_EMPTY_PAGE",
      safetyCeilingReached: false,
      completeByObservedPaging: true,
    });
    expect(closed).toBe(1);
  });

  it("acquires opposition date ranges as hidden-paged LIST evidence without DETAIL fan-out", async () => {
    const input = context();
    (input.job.sourceSnapshot.connectorConfig as Record<string, unknown>).query = {
      mode: "DATE_RANGE",
      fromDate: "2026-07-01",
      toDate: "2026-07-09",
      documentKinds: ["OPPOSITION_DECISION"],
    };
    (input.job.sourceSnapshot.connectorConfig as Record<string, unknown>).responseSchema = {
      list: {
        recordsPath: ["data", "list"],
        sourceRecordIdField: "adjuOpenId",
        totalPath: ["data", "total"],
      },
      detail: {},
    };
    let closed = 0;
    const factory: CnipaAuthenticatedSessionExecutorFactory = {
      async create() {
        return {
          async execute(request) {
            if (request.surface !== "LIST") throw new Error("DETAIL must not be requested");
            const pageIndex = Number(request.jsonBody?.pageIndex ?? 1);
            const count = pageIndex === 1 ? 100 : 97;
            return jsonResponse(request, {
              data: {
                list: Array.from({ length: count }, (_, index) => ({
                  adjuOpenId: `o${pageIndex}-${index + 1}`,
                  fileContent: `opposition-${pageIndex}-${index + 1}`,
                })),
                total: 100,
                pageIndex: 1,
                pageSize: 100,
                pages: 1,
              },
            });
          },
          async close() {
            closed += 1;
          },
        };
      },
    };

    const artifacts = await new CnipaJudgmentArtifactAcquirer(factory).acquire(input);

    const rawList = artifacts.filter((artifact) =>
      artifact.originalName.includes("opposition-decision-list-"),
    );
    const factProjection = artifacts.filter((artifact) =>
      artifact.originalName.includes("opposition-decision-facts-"),
    );
    const markdown = artifacts.filter((artifact) => artifact.artifactKind === "MARKDOWN");

    expect(rawList).toHaveLength(2);
    expect(factProjection).toHaveLength(2);
    expect(markdown).toHaveLength(197);
    expect(rawList[0]?.canonicalUri).toContain("page=1");
    expect(rawList[1]?.canonicalUri).toContain("page=2");
    expect(closed).toBe(1);
  });

  it("acquires review date ranges as hidden-paged LIST evidence without DETAIL fan-out", async () => {
    const input = context();
    (input.job.sourceSnapshot.connectorConfig as Record<string, unknown>).query = {
      mode: "DATE_RANGE",
      fromDate: "2026-07-01",
      toDate: "2026-07-01",
      documentKinds: ["REVIEW_ADJUDICATION"],
    };
    (input.job.sourceSnapshot.connectorConfig as Record<string, unknown>).responseSchema = {
      list: {
        recordsPath: ["data", "list"],
        sourceRecordIdField: "pubId",
        totalPath: ["data", "total"],
      },
      detail: {},
    };
    let closed = 0;
    const factory: CnipaAuthenticatedSessionExecutorFactory = {
      async create() {
        return {
          async execute(request) {
            if (request.surface !== "LIST") throw new Error("DETAIL must not be requested");
            const pageIndex = Number(request.jsonBody?.pageIndex ?? 1);
            const count = pageIndex === 1 ? 100 : 35;
            return jsonResponse(request, {
              data: {
                list: Array.from({ length: count }, (_, index) => ({
                  pubId: `p${pageIndex}-${index + 1}`,
                  fileContent: `decision-${pageIndex}-${index + 1}`,
                })),
                total: 100,
                pageIndex: 1,
                pageSize: 100,
                pages: 1,
              },
            });
          },
          async close() {
            closed += 1;
          },
        };
      },
    };

    const artifacts = await new CnipaJudgmentArtifactAcquirer(factory).acquire(input);

    const rawList = artifacts.filter((artifact) =>
      artifact.originalName.includes("review-adjudication-list-"),
    );
    const factProjection = artifacts.filter((artifact) =>
      artifact.originalName.includes("review-adjudication-facts-"),
    );
    const markdown = artifacts.filter((artifact) => artifact.artifactKind === "MARKDOWN");

    expect(rawList).toHaveLength(2);
    expect(factProjection).toHaveLength(2);
    expect(markdown).toHaveLength(135);
    expect(rawList[0]?.canonicalUri).toContain("page=1");
    expect(rawList[1]?.canonicalUri).toContain("page=2");
    expect(closed).toBe(1);
  });

  it("keeps LIST fact materialization successful when fileContent is missing", async () => {
    const input = context();
    (input.job.sourceSnapshot.connectorConfig as Record<string, unknown>).query = {
      mode: "DATE_RANGE",
      fromDate: "2026-07-01",
      toDate: "2026-07-01",
      documentKinds: ["REVIEW_ADJUDICATION"],
    };
    (input.job.sourceSnapshot.connectorConfig as Record<string, unknown>).responseSchema = {
      list: {
        recordsPath: ["data", "list"],
        sourceRecordIdField: "pubId",
        totalPath: ["data", "total"],
      },
      detail: {},
    };
    const factory: CnipaAuthenticatedSessionExecutorFactory = {
      async create() {
        return {
          async execute(request) {
            if (request.surface !== "LIST") throw new Error("DETAIL must not be requested");
            return jsonResponse(request, {
              data: {
                list: [{ pubId: "review-no-body", regNo: "12345678", fileContent: null }],
                total: 100,
                pageIndex: 1,
                pageSize: 100,
                pages: 1,
              },
            });
          },
          async close() {},
        };
      },
    };

    const artifacts = await new CnipaJudgmentArtifactAcquirer(factory).acquire(input);

    expect(artifacts.filter((artifact) => artifact.originalName.includes("-list-"))).toHaveLength(
      1,
    );
    expect(artifacts.filter((artifact) => artifact.originalName.includes("-facts-"))).toHaveLength(
      1,
    );
    expect(artifacts.filter((artifact) => artifact.artifactKind === "MARKDOWN")).toHaveLength(0);
  });

  it("fails before opening a browser for unverified party-name request parameters", async () => {
    let creates = 0;
    const factory: CnipaAuthenticatedSessionExecutorFactory = {
      async create() {
        creates += 1;
        throw new Error("must not be reached");
      },
    };
    const input = context();
    (input.job.sourceSnapshot.connectorConfig as Record<string, unknown>).query = {
      mode: "PARTY_NAME",
      partyName: "Example Co.",
    };

    await expect(new CnipaJudgmentArtifactAcquirer(factory).acquire(input)).rejects.toMatchObject({
      code: "CNIPA_SCHEMA_UNVERIFIED",
      retryable: false,
    });
    expect(creates).toBe(0);
  });

  it("keeps invalid response-schema failures typed and does not open a browser", async () => {
    let creates = 0;
    const factory: CnipaAuthenticatedSessionExecutorFactory = {
      async create() {
        creates += 1;
        throw new Error("must not be reached");
      },
    };
    const input = context();
    (input.job.sourceSnapshot.connectorConfig as Record<string, unknown>).responseSchema = {
      list: { recordsPath: [], sourceRecordIdField: "id" },
      detail: {},
    };

    await expect(new CnipaJudgmentArtifactAcquirer(factory).acquire(input)).rejects.toMatchObject({
      code: "CNIPA_SCHEMA_UNVERIFIED",
      retryable: false,
    });
    expect(creates).toBe(0);
  });
});
