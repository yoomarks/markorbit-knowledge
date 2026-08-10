import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { CoreIntakeRequest } from "@markorbit/contracts";
import { initializeRegistry } from "@markorbit/persistence";
import { SqliteReadyPackageRegistryRepository } from "@markorbit/persistence/ready-packages";
import {
  SqliteReadyPackageCoreIntakeSubmissionRepository,
  type ReadyPackageCoreIntakeSubmissionRepository,
} from "@markorbit/persistence/ready-package-core-intake-submissions";
import type { CoreIntakeTransport } from "../core-intake-http-transport";
import { submitReadyPackageCoreIntake } from "../ready-package-core-intake-submit";

const WORKSPACE_ID = "wsp_01H00000000000000000000000";

function createReadyPackage(
  database: DatabaseSync,
  clock: () => Date = () => new Date("2026-08-10T05:00:00.000Z"),
) {
  const repository = new SqliteReadyPackageRegistryRepository(
    database,
    clock,
    () => "rdp_01H00000000000000000000000",
  );
  const readyPackage = repository.createVerified({
    workspaceId: WORKSPACE_ID,
    sourceId: "src_01H00000000000000000000000",
    rawArtifactId: "art_01H00000000000000000000000",
    rawArtifactSha256: "a".repeat(64),
    capturedAt: "2026-08-10T04:00:00.000Z",
    conversionRunId: "cvr_01H00000000000000000000000",
    converter: { converterId: "builtin-markdown-staging", version: "1.0.0" },
    stagingDocumentId: "std_01H00000000000000000000000",
    stagingSha256: "b".repeat(64),
    verificationId: "svr_01H00000000000000000000000",
    verificationOutcome: "PASS",
    idempotencyKey: "ready-package:m36-submit",
  }).readyPackage;
  return { repository, readyPackage };
}

function submitInput(readyPackage: { workspaceId: string; id: string; evidence: { digest: string } }) {
  return {
    workspaceId: readyPackage.workspaceId,
    readyPackageId: readyPackage.id,
    expectedDigest: readyPackage.evidence.digest,
    submit: true as const,
  };
}

describe("ReadyPackage Core intake submission", () => {
  it("retries an uncertain transport outcome with the exact same request and idempotency key", async () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const { repository, readyPackage } = createReadyPackage(database);
    let now = "2026-08-10T05:01:00.000Z";
    const submissions = new SqliteReadyPackageCoreIntakeSubmissionRepository(
      database,
      () => new Date(now),
      () => "cis_retry",
    );
    const attempts: Array<{ request: CoreIntakeRequest; key: string }> = [];
    let transportCalls = 0;
    const transport: CoreIntakeTransport = {
      async submit(request, key) {
        attempts.push({ request, key });
        transportCalls += 1;
        if (transportCalls === 1) throw new Error("uncertain network outcome");
        return {
          intakeId: "intake_retry",
          status: "RECEIVED",
          readyPackageId: request.readyPackageId,
        };
      },
    };
    const input = submitInput(readyPackage);

    await expect(
      submitReadyPackageCoreIntake(input, repository, submissions, transport),
    ).rejects.toThrow("uncertain network outcome");
    now = "2026-08-10T05:05:00.000Z";
    const recovered = await submitReadyPackageCoreIntake(input, repository, submissions, transport);

    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[0]).toMatchObject({
      key: "core-intake:cis_retry",
      request: { submittedAt: "2026-08-10T05:01:00.000Z" },
    });
    expect(recovered.submissionReplayed).toBe(true);
    expect(recovered.reconciledFromReceipt).toBe(false);
    expect(recovered.submission.state).toBe("RESULT_RECORDED");
    expect(recovered.acknowledgment.readyPackage.status).toBe("HANDED_OFF");
    expect(
      repository.listCoreIntakeReceipts(readyPackage.id, readyPackage.workspaceId),
    ).toHaveLength(1);

    database.close();
  });

  it("records a real REJECTED result without marking the ReadyPackage handed off", async () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const { repository, readyPackage } = createReadyPackage(database);
    const submissions = new SqliteReadyPackageCoreIntakeSubmissionRepository(
      database,
      () => new Date("2026-08-10T05:01:00.000Z"),
      () => "cis_rejected",
    );
    const transport: CoreIntakeTransport = {
      async submit(request) {
        return {
          intakeId: "intake_rejected",
          status: "REJECTED",
          readyPackageId: request.readyPackageId,
        };
      },
    };

    const result = await submitReadyPackageCoreIntake(
      submitInput(readyPackage),
      repository,
      submissions,
      transport,
    );

    expect(result.reconciledFromReceipt).toBe(false);
    expect(result.acknowledgment).toMatchObject({
      handoffRecorded: false,
      disposition: "REJECTED_NOT_HANDED_OFF",
      readyPackage: { status: "VERIFIED" },
    });
    expect(result.submission).toMatchObject({
      state: "RESULT_RECORDED",
      result: { intakeId: "intake_rejected", status: "REJECTED" },
    });

    database.close();
  });

  it("repairs a pending submission from its persisted receipt without a second transport call", async () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    let readyPackageNow = "2026-08-10T05:00:00.000Z";
    const { repository, readyPackage } = createReadyPackage(
      database,
      () => new Date(readyPackageNow),
    );
    let submissionNow = "2026-08-10T05:01:00.000Z";
    const persistedSubmissions = new SqliteReadyPackageCoreIntakeSubmissionRepository(
      database,
      () => new Date(submissionNow),
      () => "cis_partial_commit",
    );
    let failResultPersistence = true;
    const submissions: ReadyPackageCoreIntakeSubmissionRepository = {
      prepare(input) {
        return persistedSubmissions.prepare(input);
      },
      recordResult(submissionId, workspaceId, result) {
        if (failResultPersistence) {
          failResultPersistence = false;
          throw new Error("simulated submission result persistence failure");
        }
        return persistedSubmissions.recordResult(submissionId, workspaceId, result);
      },
      list(readyPackageId, workspaceId) {
        return persistedSubmissions.list(readyPackageId, workspaceId);
      },
    };
    let transportCalls = 0;
    const transport: CoreIntakeTransport = {
      async submit(request) {
        transportCalls += 1;
        if (transportCalls > 1) throw new Error("transport must not be called twice");
        readyPackageNow = "2026-08-10T05:02:00.000Z";
        return {
          intakeId: "intake_partial_commit",
          status: "RECEIVED",
          readyPackageId: request.readyPackageId,
        };
      },
    };
    const input = submitInput(readyPackage);

    await expect(
      submitReadyPackageCoreIntake(input, repository, submissions, transport),
    ).rejects.toThrow("simulated submission result persistence failure");
    expect(transportCalls).toBe(1);
    expect(repository.getById(readyPackage.id, readyPackage.workspaceId)?.status).toBe("HANDED_OFF");
    expect(repository.listCoreIntakeReceipts(readyPackage.id, readyPackage.workspaceId)).toMatchObject([
      { intakeId: "intake_partial_commit", status: "RECEIVED" },
    ]);
    expect(persistedSubmissions.list(readyPackage.id, readyPackage.workspaceId)).toMatchObject([
      { state: "PENDING", submittedAt: "2026-08-10T05:01:00.000Z" },
    ]);

    submissionNow = "2026-08-10T05:03:00.000Z";
    const repaired = await submitReadyPackageCoreIntake(input, repository, submissions, transport);

    expect(transportCalls).toBe(1);
    expect(repaired.reconciledFromReceipt).toBe(true);
    expect(repaired.submissionReplayed).toBe(true);
    expect(repaired.coreIntakeResult).toEqual({
      intakeId: "intake_partial_commit",
      status: "RECEIVED",
      readyPackageId: readyPackage.id,
    });
    expect(repaired.acknowledgment.replayed).toBe(true);
    expect(repaired.submission).toMatchObject({
      state: "RESULT_RECORDED",
      result: { intakeId: "intake_partial_commit", status: "RECEIVED" },
    });

    database.close();
  });

  it("does not reconcile a new submission from an older completed rejection receipt", async () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    let readyPackageNow = "2026-08-10T05:00:00.000Z";
    const { repository, readyPackage } = createReadyPackage(
      database,
      () => new Date(readyPackageNow),
    );
    let submissionNow = "2026-08-10T05:01:00.000Z";
    let nextSubmission = 0;
    const submissions = new SqliteReadyPackageCoreIntakeSubmissionRepository(
      database,
      () => new Date(submissionNow),
      () => (nextSubmission++ === 0 ? "cis_old_rejection" : "cis_new_attempt"),
    );
    let transportCalls = 0;
    const transport: CoreIntakeTransport = {
      async submit(request) {
        transportCalls += 1;
        if (transportCalls === 1) {
          readyPackageNow = "2026-08-10T05:02:00.000Z";
          return {
            intakeId: "intake_old_rejection",
            status: "REJECTED",
            readyPackageId: request.readyPackageId,
          };
        }
        readyPackageNow = "2026-08-10T05:04:00.000Z";
        return {
          intakeId: "intake_new_attempt",
          status: "RECEIVED",
          readyPackageId: request.readyPackageId,
        };
      },
    };
    const input = submitInput(readyPackage);

    const rejected = await submitReadyPackageCoreIntake(input, repository, submissions, transport);
    expect(rejected.acknowledgment.disposition).toBe("REJECTED_NOT_HANDED_OFF");

    submissionNow = "2026-08-10T05:03:00.000Z";
    const acceptedLater = await submitReadyPackageCoreIntake(input, repository, submissions, transport);

    expect(transportCalls).toBe(2);
    expect(acceptedLater.reconciledFromReceipt).toBe(false);
    expect(acceptedLater.coreIntakeResult).toMatchObject({
      intakeId: "intake_new_attempt",
      status: "RECEIVED",
    });

    database.close();
  });
});
