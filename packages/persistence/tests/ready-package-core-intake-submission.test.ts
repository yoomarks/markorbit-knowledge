import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { initializeRegistry } from "../src/index";
import { SqliteReadyPackageCoreIntakeSubmissionRepository } from "../src/ready-package-core-intake-submission";
import { SqliteReadyPackageRegistryRepository } from "../src/ready-package-registry";

const WORKSPACE_ID = "wsp_01H00000000000000000000000";

function readyPackage(database: DatabaseSync) {
  const registry = new SqliteReadyPackageRegistryRepository(
    database,
    () => new Date("2026-08-10T05:00:00.000Z"),
    () => "rdp_01H00000000000000000000000",
  );
  return registry.createVerified({
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
    idempotencyKey: "ready-package:m36",
  }).readyPackage;
}

describe("M36 ReadyPackage Core intake submission ledger", () => {
  it("reuses the exact pending submittedAt and idempotency key until a result is recorded", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const pkg = readyPackage(database);
    let now = "2026-08-10T05:01:00.000Z";
    const submissions = new SqliteReadyPackageCoreIntakeSubmissionRepository(
      database,
      () => new Date(now),
      () => "cis_first",
    );

    const first = submissions.prepare({
      workspaceId: pkg.workspaceId,
      readyPackageId: pkg.id,
      expectedDigest: pkg.evidence.digest,
    });
    now = "2026-08-10T05:02:00.000Z";
    const replay = submissions.prepare({
      workspaceId: pkg.workspaceId,
      readyPackageId: pkg.id,
      expectedDigest: pkg.evidence.digest,
    });

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.submission).toEqual(first.submission);
    expect(first.submission).toMatchObject({
      submissionId: "cis_first",
      idempotencyKey: "core-intake:cis_first",
      submittedAt: "2026-08-10T05:01:00.000Z",
      state: "PENDING",
    });

    database.close();
  });

  it("allows a fresh submission only after the prior attempt records a real Core result", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const pkg = readyPackage(database);
    let sequence = 0;
    let now = "2026-08-10T05:01:00.000Z";
    const submissions = new SqliteReadyPackageCoreIntakeSubmissionRepository(
      database,
      () => new Date(now),
      () => `cis_${++sequence}`,
    );

    const first = submissions.prepare({
      workspaceId: pkg.workspaceId,
      readyPackageId: pkg.id,
      expectedDigest: pkg.evidence.digest,
    }).submission;
    const completed = submissions.recordResult(first.submissionId, pkg.workspaceId, {
      intakeId: "intake_rejected",
      status: "REJECTED",
      readyPackageId: pkg.id,
    });
    now = "2026-08-10T05:03:00.000Z";
    const second = submissions.prepare({
      workspaceId: pkg.workspaceId,
      readyPackageId: pkg.id,
      expectedDigest: pkg.evidence.digest,
    }).submission;

    expect(completed).toMatchObject({
      state: "RESULT_RECORDED",
      result: { intakeId: "intake_rejected", status: "REJECTED" },
    });
    expect(second.submissionId).toBe("cis_2");
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(second.submittedAt).toBe("2026-08-10T05:03:00.000Z");
    expect(submissions.list(pkg.id, pkg.workspaceId)).toHaveLength(2);

    database.close();
  });
});
