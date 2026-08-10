import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { CoreIntakeRequest } from "@markorbit/contracts";
import { initializeRegistry } from "@markorbit/persistence";
import { SqliteReadyPackageRegistryRepository } from "@markorbit/persistence/ready-packages";
import { SqliteReadyPackageCoreIntakeSubmissionRepository } from "@markorbit/persistence/ready-package-core-intake-submissions";
import type { CoreIntakeTransport } from "../core-intake-http-transport";
import { submitReadyPackageCoreIntake } from "../ready-package-core-intake-submit";

const WORKSPACE_ID = "wsp_01H00000000000000000000000";

function createReadyPackage(database: DatabaseSync) {
  const repository = new SqliteReadyPackageRegistryRepository(
    database,
    () => new Date("2026-08-10T05:00:00.000Z"),
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

describe("M36 explicit ReadyPackage Core intake submission", () => {
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
    const input = {
      workspaceId: readyPackage.workspaceId,
      readyPackageId: readyPackage.id,
      expectedDigest: readyPackage.evidence.digest,
      submit: true as const,
    };

    await expect(
      submitReadyPackageCoreIntake(input, repository, submissions, transport),
    ).rejects.toThrow("uncertain network outcome");
    now = "2026-08-10T05:05:00.000Z";
    const recovered = await submitReadyPackageCoreIntake(
      input,
      repository,
      submissions,
      transport,
    );

    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[0]).toMatchObject({
      key: "core-intake:cis_retry",
      request: { submittedAt: "2026-08-10T05:01:00.000Z" },
    });
    expect(recovered.submissionReplayed).toBe(true);
    expect(recovered.submission.state).toBe("RESULT_RECORDED");
    expect(recovered.acknowledgment.readyPackage.status).toBe("HANDED_OFF");
    expect(repository.listCoreIntakeReceipts(readyPackage.id, readyPackage.workspaceId)).toHaveLength(
      1,
    );

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
      {
        workspaceId: readyPackage.workspaceId,
        readyPackageId: readyPackage.id,
        expectedDigest: readyPackage.evidence.digest,
        submit: true,
      },
      repository,
      submissions,
      transport,
    );

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
});
