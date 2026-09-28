import { describe, expect, it } from "vitest";
import {
  GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_ID,
  GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
  GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_SOURCE,
} from "@markorbit/worker-runtime";
import type { WorkerLeaseReadAuthorization } from "@markorbit/persistence/worker-execution";
import type { RawArtifactView } from "@markorbit/persistence/raw-artifacts";
import {
  authorizeFactAdmissionWorkerArtifactRead,
  type FactAdmissionWorkerArtifactReadDependencies,
} from "../fact-admission-worker-artifact-read";

const REQUEST_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const OTHER_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const WORKSPACE_ID = "wsp_fixture";
const SHA = "a".repeat(64);

function authorization(valid = true, referenceSha = SHA): WorkerLeaseReadAuthorization {
  const connector = valid
    ? {
        connectorId: GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_ID,
        version: GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
      }
    : { connectorId: "other", version: "1.0.0" };
  return {
    workspaceId: WORKSPACE_ID,
    runId: "run_fixture",
    jobId: "job_fixture",
    leaseId: "lse_fixture",
    workerId: "wrk_fixture",
    job: {
      connector,
      sourceSnapshot: {
        sourceType: "DATABASE",
        canonicalUri: GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_SOURCE,
        connector,
        connectorConfig: {
          intent: "PUBLISH_DURABLE_REQUEST",
          requestArtifactRef: {
            artifactId: REQUEST_ID,
            canonicalUri: "la-dipo://wopublish/trademarks/list/page/1/fact-admission-request",
            sha256: referenceSha,
            sizeBytes: 12,
          },
        },
      },
    },
  } as unknown as WorkerLeaseReadAuthorization;
}
function view(id: string, workspaceId = WORKSPACE_ID): RawArtifactView {
  return {
    artifact: {
      id,
      workspaceId,
      artifactKind: "JSON",
      canonicalUri: "la-dipo://wopublish/trademarks/list/page/1/fact-admission-request",
      binaryHash: { algorithm: "SHA-256", value: SHA },
      sizeBytes: 12,
    },
    contentObject: { sha256: SHA, sizeBytes: 12 },
  } as unknown as RawArtifactView;
}
function deps(
  allowed: boolean,
  artifacts: Record<string, RawArtifactView>,
  referenceSha = SHA,
): FactAdmissionWorkerArtifactReadDependencies {
  return {
    executions: { authorizeArtifactRead: () => authorization(allowed, referenceSha) },
    artifacts: {
      getArtifact: (id) => artifacts[id] ?? null,
      contentPath: (id) => ({
        path: "C:\\fixture\\" + id + ".json",
        mimeType: "application/json",
        originalName: id + ".json",
        sizeBytes: artifacts[id]?.artifact.sizeBytes ?? 0,
      }),
    },
  };
}
const input = (artifactId: string) => ({
  workerId: "wrk_fixture",
  credential: "credential",
  leaseId: "lse_fixture",
  leaseToken: "lease-token",
  artifactId,
});

describe("generic fact-admission Worker RawArtifact read authorization", () => {
  it("allows only the exact durable request frozen into the publisher Job", () => {
    const dependencies = deps(true, {
      [REQUEST_ID]: view(REQUEST_ID),
      [OTHER_ID]: view(OTHER_ID),
    });
    expect(
      authorizeFactAdmissionWorkerArtifactRead(input(REQUEST_ID), dependencies).view.artifact.id,
    ).toBe(REQUEST_ID);
    expect(() =>
      authorizeFactAdmissionWorkerArtifactRead(input(OTHER_ID), dependencies),
    ).toThrowError(
      expect.objectContaining({ code: "FACT_ADMISSION_WORKER_ARTIFACT_READ_NOT_AUTHORIZED" }),
    );
  });
  it("rejects another workspace, another connector, or invalid artifact integrity", () => {
    expect(() =>
      authorizeFactAdmissionWorkerArtifactRead(
        input(REQUEST_ID),
        deps(true, { [REQUEST_ID]: view(REQUEST_ID, "wsp_other") }),
      ),
    ).toThrowError(
      expect.objectContaining({ code: "FACT_ADMISSION_WORKER_ARTIFACT_READ_NOT_AUTHORIZED" }),
    );
    expect(() =>
      authorizeFactAdmissionWorkerArtifactRead(
        input(REQUEST_ID),
        deps(false, { [REQUEST_ID]: view(REQUEST_ID) }),
      ),
    ).toThrowError(
      expect.objectContaining({ code: "FACT_ADMISSION_WORKER_ARTIFACT_READ_JOB_INVALID" }),
    );
    expect(() =>
      authorizeFactAdmissionWorkerArtifactRead(
        input(REQUEST_ID),
        deps(true, { [REQUEST_ID]: view(REQUEST_ID) }, "b".repeat(64)),
      ),
    ).toThrowError(
      expect.objectContaining({ code: "FACT_ADMISSION_WORKER_ARTIFACT_INTEGRITY_INVALID" }),
    );
    const broken = view(REQUEST_ID);
    broken.contentObject.sha256 = "b".repeat(64);
    expect(() =>
      authorizeFactAdmissionWorkerArtifactRead(
        input(REQUEST_ID),
        deps(true, { [REQUEST_ID]: broken }),
      ),
    ).toThrowError(
      expect.objectContaining({ code: "FACT_ADMISSION_WORKER_ARTIFACT_INTEGRITY_INVALID" }),
    );
  });
});
