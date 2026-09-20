import { describe, expect, it } from "vitest";
import {
  CNIPA_GAZETTE_BROWSER_STREAM_PLAN_EXTENSION,
  CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_ID,
  CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
  CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_ID,
  CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_VERSION,
  CNIPA_GAZETTE_JOB_CONNECTOR_ID,
  CNIPA_GAZETTE_JOB_CONNECTOR_VERSION,
} from "@markorbit/worker-runtime";
import type { WorkerLeaseReadAuthorization } from "@markorbit/persistence/worker-execution";
import type { RawArtifactView } from "@markorbit/persistence/raw-artifacts";
import {
  authorizeCnipaGazetteWorkerArtifactRead,
  type CnipaGazetteWorkerArtifactReadDependencies,
} from "../cnipa-gazette-worker-artifact-read";

const REQUEST_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const DATASET_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const RECEIPT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAX";
const OTHER_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAY";
const RESUME_STATE_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FA0";
const RESUME_LOGICAL_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FA1";
const RESUME_FIRST_RAW_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FA2";
const RESUME_FIRST_PROJECTION_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FA3";
const RESUME_PREVIOUS_PROJECTION_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FA4";
const WORKSPACE_ID = "wsp_fixture";
const SHA = "a".repeat(64);

type FixtureKind = "publisher" | "finalize" | "browser" | "other";

function authorization(kind: FixtureKind): WorkerLeaseReadAuthorization {
  const connector =
    kind === "publisher"
      ? {
          connectorId: CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_ID,
          version: CNIPA_GAZETTE_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
        }
      : kind === "finalize"
        ? {
            connectorId: CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_ID,
            version: CNIPA_GAZETTE_FINALIZE_JOB_CONNECTOR_VERSION,
          }
        : kind === "browser"
          ? {
              connectorId: CNIPA_GAZETTE_JOB_CONNECTOR_ID,
              version: CNIPA_GAZETTE_JOB_CONNECTOR_VERSION,
            }
          : { connectorId: "fixture", version: "1.0.0" };
  const connectorConfig =
    kind === "publisher"
      ? { intent: "PUBLISH_DURABLE_REQUEST", requestArtifactRef: { artifactId: REQUEST_ID } }
      : kind === "finalize"
        ? {
            intent: "BUILD_FINALIZE_REQUEST",
            datasetIdentityRef: { artifactId: DATASET_ID },
            chunkReceiptRefs: [{ artifactId: RECEIPT_ID }],
          }
        : {};

  const planSnapshot =
    kind === "browser"
      ? {
          extensions: {
            [CNIPA_GAZETTE_BROWSER_STREAM_PLAN_EXTENSION]: {
              resumeFrom: {
                stateArtifactId: RESUME_STATE_ID,
                logicalProjectionArtifactIds: [RESUME_LOGICAL_ID],
                firstSourceRawArtifactId: RESUME_FIRST_RAW_ID,
                firstSourceProjectionArtifactId: RESUME_FIRST_PROJECTION_ID,
                previousSourceProjectionArtifactId: RESUME_PREVIOUS_PROJECTION_ID,
              },
            },
          },
        }
      : {};

  return {
    workspaceId: WORKSPACE_ID,
    runId: "run_fixture",
    jobId: "job_fixture",
    leaseId: "lse_fixture",
    workerId: "wrk_fixture",
    job: {
      connector,
      sourceSnapshot: { connector, connectorConfig },
      planSnapshot,
    },
  } as unknown as WorkerLeaseReadAuthorization;
}

function view(id: string, workspaceId = WORKSPACE_ID): RawArtifactView {
  return {
    artifact: {
      id,
      workspaceId,
      binaryHash: { algorithm: "SHA-256", value: SHA },
      sizeBytes: 12,
    },
    contentObject: { sha256: SHA, sizeBytes: 12 },
  } as unknown as RawArtifactView;
}

function dependencies(
  kind: FixtureKind,
  artifacts: Record<string, RawArtifactView>,
): CnipaGazetteWorkerArtifactReadDependencies {
  return {
    executions: {
      authorizeArtifactRead: () => authorization(kind),
    },
    artifacts: {
      getArtifact: (id) => artifacts[id] ?? null,
      contentPath: (id) => ({
        path: `C:\\fixture\\${id}.json`,
        mimeType: "application/json",
        originalName: `${id}.json`,
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

describe("CNIPA Gazette Worker RawArtifact read authorization", () => {
  it("allows only the publisher request artifact named by the immutable Job snapshot", () => {
    const deps = dependencies("publisher", {
      [REQUEST_ID]: view(REQUEST_ID),
      [OTHER_ID]: view(OTHER_ID),
    });

    expect(authorizeCnipaGazetteWorkerArtifactRead(input(REQUEST_ID), deps).view.artifact.id).toBe(
      REQUEST_ID,
    );
    expect(() => authorizeCnipaGazetteWorkerArtifactRead(input(OTHER_ID), deps)).toThrowError(
      expect.objectContaining({ code: "GAZETTE_WORKER_ARTIFACT_READ_NOT_AUTHORIZED" }),
    );
  });

  it("allows the finalize dataset identity and listed CHUNK receipt artifacts", () => {
    const deps = dependencies("finalize", {
      [DATASET_ID]: view(DATASET_ID),
      [RECEIPT_ID]: view(RECEIPT_ID),
    });
    expect(authorizeCnipaGazetteWorkerArtifactRead(input(DATASET_ID), deps).view.artifact.id).toBe(
      DATASET_ID,
    );
    expect(authorizeCnipaGazetteWorkerArtifactRead(input(RECEIPT_ID), deps).view.artifact.id).toBe(
      RECEIPT_ID,
    );
  });

  it("allows only browser resume artifacts frozen into the immutable Job snapshot", () => {
    const deps = dependencies("browser", {
      [RESUME_STATE_ID]: view(RESUME_STATE_ID),
      [RESUME_LOGICAL_ID]: view(RESUME_LOGICAL_ID),
      [RESUME_FIRST_RAW_ID]: view(RESUME_FIRST_RAW_ID),
      [RESUME_FIRST_PROJECTION_ID]: view(RESUME_FIRST_PROJECTION_ID),
      [RESUME_PREVIOUS_PROJECTION_ID]: view(RESUME_PREVIOUS_PROJECTION_ID),
      [OTHER_ID]: view(OTHER_ID),
    });
    for (const artifactId of [
      RESUME_STATE_ID,
      RESUME_LOGICAL_ID,
      RESUME_FIRST_RAW_ID,
      RESUME_FIRST_PROJECTION_ID,
      RESUME_PREVIOUS_PROJECTION_ID,
    ]) {
      expect(
        authorizeCnipaGazetteWorkerArtifactRead(input(artifactId), deps).view.artifact.id,
      ).toBe(artifactId);
    }
    expect(() => authorizeCnipaGazetteWorkerArtifactRead(input(OTHER_ID), deps)).toThrowError(
      expect.objectContaining({ code: "GAZETTE_WORKER_ARTIFACT_READ_NOT_AUTHORIZED" }),
    );
  });

  it("rejects a referenced artifact outside the active Job workspace", () => {
    const deps = dependencies("publisher", {
      [REQUEST_ID]: view(REQUEST_ID, "wsp_other"),
    });

    expect(() => authorizeCnipaGazetteWorkerArtifactRead(input(REQUEST_ID), deps)).toThrowError(
      expect.objectContaining({ code: "GAZETTE_WORKER_ARTIFACT_READ_NOT_AUTHORIZED" }),
    );
  });

  it("fails closed on registry/storage integrity mismatches", () => {
    const artifact = view(REQUEST_ID);
    artifact.contentObject.sha256 = "b".repeat(64);
    const deps = dependencies("publisher", { [REQUEST_ID]: artifact });
    expect(() => authorizeCnipaGazetteWorkerArtifactRead(input(REQUEST_ID), deps)).toThrowError(
      expect.objectContaining({ code: "GAZETTE_WORKER_ARTIFACT_INTEGRITY_INVALID" }),
    );
  });

  it("rejects non-Gazette Jobs even when an artifact exists in the same workspace", () => {
    const deps = dependencies("other", { [REQUEST_ID]: view(REQUEST_ID) });
    expect(() => authorizeCnipaGazetteWorkerArtifactRead(input(REQUEST_ID), deps)).toThrowError(
      expect.objectContaining({ code: "GAZETTE_WORKER_ARTIFACT_READ_JOB_INVALID" }),
    );
  });
});
