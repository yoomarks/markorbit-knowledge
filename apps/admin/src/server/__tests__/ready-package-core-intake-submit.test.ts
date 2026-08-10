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
import {
  submitReadyPackageCoreIntake,
  type ReadyPackageCoreIntakeSubmitRepository,
} from "../ready-package-core-intake-submit";

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

function submitInput(readyPackage: {
  workspaceId: string;
  id: string;
  evidence: { digest: string };
}) {
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
    expect(submissions.list(readyPackage.id, readyPackage.workspaceId)).toMatchObject([
      { state: "PENDING", transportResult: undefined },
    ]);

    now = "2026-08-10T05:05:00.000Z";
    const recovered = await submitReadyPackageCoreIntake(input, repository, submissions, transport);

    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[0]).toMatchObject({
      key: "core-intake:cis_retry",
      request: { submittedAt: "2026-08-10T05:01:00.000Z" },
    });
    expect(recovered.submissionReplayed).toBe(true);
    expect(recovered.transportResultReplayed).toBe(false);
    expect(recovered.reconciledFromReceipt).toBe(false);
    expect(recovered.submission).toMatchObject({
      state: "RESULT_RECORDED",
      transportResult: { intakeId: "intake_retry", status: "RECEIVED" },
      result: { intakeId: "intake_retry", status: "RECEIVED" },
    });
    expect(recovered.acknowledgment.readyPackage.status).toBe("HANDED_OFF");
    expect(
      repository.listCoreIntakeReceipts(readyPackage.id, readyPackage.workspaceId),
    ).toHaveLength(1);

    database.close();
  });

  it("records a real REJECTED transport result before finalizing the submission", async () => {
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

    expect(result.transportResultReplayed).toBe(false);
    expect(result.reconciledFromReceipt).toBe(false);
    expect(result.acknowledgment).toMatchObject({
      handoffRecorded: false,
      disposition: "REJECTED_NOT_HANDED_OFF",
      readyPackage: { status: "VERIFIED" },
    });
    expect(result.submission).toMatchObject({
      state: "RESULT_RECORDED",
      transportResult: { intakeId: "intake_rejected", status: "REJECTED" },
      result: { intakeId: "intake_rejected", status: "REJECTED" },
    });

    database.close();
  });

  it("repairs a final-result persistence failure from the exact persisted transport result", async () => {
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
    let failFinalResultPersistence = true;
    const submissions: ReadyPackageCoreIntakeSubmissionRepository = {
      prepare(input) {
        return persistedSubmissions.prepare(input);
      },
      recordTransportResult(submissionId, workspaceId, result) {
        return persistedSubmissions.recordTransportResult(submissionId, workspaceId, result);
      },
      recordResult(submissionId, workspaceId, result) {
        if (failFinalResultPersistence) {
          failFinalResultPersistence = false;
          throw new Error("simulated final submission result persistence failure");
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
    ).rejects.toThrow("simulated final submission result persistence failure");
    expect(transportCalls).toBe(1);
    expect(repository.getById(readyPackage.id, readyPackage.workspaceId)?.status).toBe(
      "HANDED_OFF",
    );
    expect(
      repository.listCoreIntakeReceipts(readyPackage.id, readyPackage.workspaceId),
    ).toMatchObject([{ intakeId: "intake_partial_commit", status: "RECEIVED" }]);
    expect(persistedSubmissions.list(readyPackage.id, readyPackage.workspaceId)).toMatchObject([
      {
        state: "PENDING",
        submittedAt: "2026-08-10T05:01:00.000Z",
        transportResult: { intakeId: "intake_partial_commit", status: "RECEIVED" },
        result: undefined,
      },
    ]);

    submissionNow = "2026-08-10T05:03:00.000Z";
    const repaired = await submitReadyPackageCoreIntake(input, repository, submissions, transport);

    expect(transportCalls).toBe(1);
    expect(repaired.transportResultReplayed).toBe(true);
    expect(repaired.reconciledFromReceipt).toBe(false);
    expect(repaired.submissionReplayed).toBe(true);
    expect(repaired.coreIntakeResult).toEqual({
      intakeId: "intake_partial_commit",
      status: "RECEIVED",
      readyPackageId: readyPackage.id,
    });
    expect(repaired.acknowledgment.replayed).toBe(true);
    expect(repaired.submission).toMatchObject({
      state: "RESULT_RECORDED",
      transportResult: { intakeId: "intake_partial_commit", status: "RECEIVED" },
      result: { intakeId: "intake_partial_commit", status: "RECEIVED" },
    });

    database.close();
  });

  it("retries local acknowledgment from a persisted transport result without a second HTTP call", async () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const { repository, readyPackage } = createReadyPackage(database);
    let submissionNow = "2026-08-10T05:01:00.000Z";
    const submissions = new SqliteReadyPackageCoreIntakeSubmissionRepository(
      database,
      () => new Date(submissionNow),
      () => "cis_ack_failure",
    );
    let failAcknowledgment = true;
    const readyPackages: ReadyPackageCoreIntakeSubmitRepository = {
      getById(id, workspaceId) {
        return repository.getById(id, workspaceId);
      },
      recordCoreIntakeAcknowledgment(input) {
        if (failAcknowledgment) {
          failAcknowledgment = false;
          throw new Error("simulated acknowledgment persistence failure");
        }
        return repository.recordCoreIntakeAcknowledgment(input);
      },
    };
    let transportCalls = 0;
    const transport: CoreIntakeTransport = {
      async submit(request) {
        transportCalls += 1;
        if (transportCalls > 1) throw new Error("transport must not be called twice");
        return {
          intakeId: "intake_ack_failure",
          status: "RECEIVED",
          readyPackageId: request.readyPackageId,
        };
      },
    };
    const input = submitInput(readyPackage);

    await expect(
      submitReadyPackageCoreIntake(input, readyPackages, submissions, transport),
    ).rejects.toThrow("simulated acknowledgment persistence failure");
    expect(transportCalls).toBe(1);
    expect(repository.getById(readyPackage.id, readyPackage.workspaceId)?.status).toBe("VERIFIED");
    expect(
      repository.listCoreIntakeReceipts(readyPackage.id, readyPackage.workspaceId),
    ).toHaveLength(0);
    expect(submissions.list(readyPackage.id, readyPackage.workspaceId)).toMatchObject([
      {
        state: "PENDING",
        transportResult: { intakeId: "intake_ack_failure", status: "RECEIVED" },
      },
    ]);

    submissionNow = "2026-08-10T05:03:00.000Z";
    const recovered = await submitReadyPackageCoreIntake(
      input,
      readyPackages,
      submissions,
      transport,
    );

    expect(transportCalls).toBe(1);
    expect(recovered.transportResultReplayed).toBe(true);
    expect(recovered.submissionReplayed).toBe(true);
    expect(recovered.acknowledgment.readyPackage.status).toBe("HANDED_OFF");
    expect(recovered.submission.state).toBe("RESULT_RECORDED");

    database.close();
  });

  it("does not adopt an unrelated manual receipt for a pending submission", async () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    let readyPackageNow = "2026-08-10T05:00:00.000Z";
    const { repository, readyPackage } = createReadyPackage(
      database,
      () => new Date(readyPackageNow),
    );
    let submissionNow = "2026-08-10T05:01:00.000Z";
    const submissions = new SqliteReadyPackageCoreIntakeSubmissionRepository(
      database,
      () => new Date(submissionNow),
      () => "cis_manual_receipt_guard",
    );
    let transportCalls = 0;
    const transport: CoreIntakeTransport = {
      async submit(request) {
        transportCalls += 1;
        if (transportCalls === 1) throw new Error("uncertain network outcome");
        return {
          intakeId: "intake_network_result",
          status: "RECEIVED",
          readyPackageId: request.readyPackageId,
        };
      },
    };
    const input = submitInput(readyPackage);

    await expect(
      submitReadyPackageCoreIntake(input, repository, submissions, transport),
    ).rejects.toThrow("uncertain network outcome");
    expect(submissions.list(readyPackage.id, readyPackage.workspaceId)).toMatchObject([
      { state: "PENDING", transportResult: undefined },
    ]);

    readyPackageNow = "2026-08-10T05:02:00.000Z";
    repository.recordCoreIntakeAcknowledgment({
      workspaceId: readyPackage.workspaceId,
      readyPackageId: readyPackage.id,
      expectedDigest: readyPackage.evidence.digest,
      coreIntakeResult: {
        intakeId: "intake_manual_unrelated",
        status: "REJECTED",
        readyPackageId: readyPackage.id,
      },
    });

    submissionNow = "2026-08-10T05:03:00.000Z";
    const recovered = await submitReadyPackageCoreIntake(input, repository, submissions, transport);

    expect(transportCalls).toBe(2);
    expect(recovered.transportResultReplayed).toBe(false);
    expect(recovered.reconciledFromReceipt).toBe(false);
    expect(recovered.coreIntakeResult).toMatchObject({
      intakeId: "intake_network_result",
      status: "RECEIVED",
    });
    expect(
      repository.listCoreIntakeReceipts(readyPackage.id, readyPackage.workspaceId),
    ).toMatchObject([
      { intakeId: "intake_network_result", status: "RECEIVED" },
      { intakeId: "intake_manual_unrelated", status: "REJECTED" },
    ]);

    database.close();
  });
});
