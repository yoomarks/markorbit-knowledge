import { describe, expect, it } from "vitest";
import type { ArtifactBackedExecutionContext } from "./artifact-backed-collection-executor";
import {
  CnipaJudgmentArtifactAcquirer,
  type CnipaAuthenticatedSessionExecutorFactory,
} from "./cnipa-artifact-acquirer";
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
