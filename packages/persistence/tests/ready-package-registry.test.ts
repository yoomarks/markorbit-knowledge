import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { RegistryConflictError, initializeRegistry } from "../src/index";
import { SqliteReadyPackageRegistryRepository } from "../src/ready-package-registry";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function input() {
  return {
    workspaceId: "wsp_01H00000000000000000000000",
    sourceId: "src_01H00000000000000000000000",
    rawArtifactId: "art_01H00000000000000000000000",
    rawArtifactSha256: SHA_A,
    capturedAt: "2026-08-08T00:00:00.000Z",
    conversionRunId: "cvr_01H00000000000000000000000",
    converter: { converterId: "builtin-markdown-staging", version: "1.0.0" },
    stagingDocumentId: "std_01H00000000000000000000000",
    stagingSha256: SHA_B,
    verificationId: "svr_01H00000000000000000000000",
    verificationOutcome: "PASS" as const,
    idempotencyKey: "ready-package:test:1",
  };
}

function secondInput() {
  return {
    ...input(),
    rawArtifactId: "art_02H00000000000000000000000",
    rawArtifactSha256: "c".repeat(64),
    conversionRunId: "cvr_02H00000000000000000000000",
    stagingDocumentId: "std_02H00000000000000000000000",
    stagingSha256: "d".repeat(64),
    verificationId: "svr_02H00000000000000000000000",
    idempotencyKey: "ready-package:test:2",
  };
}

function repository(database: DatabaseSync, readyPackageId = "rdp_01H00000000000000000000000") {
  return new SqliteReadyPackageRegistryRepository(
    database,
    () => new Date("2026-08-08T01:00:00.000Z"),
    () => readyPackageId,
  );
}

function acknowledgment(
  readyPackageId: string,
  expectedDigest: string,
  status: "RECEIVED" | "ACCEPTED" | "REJECTED",
  intakeId = "intake_01H00000000000000000000000",
) {
  return {
    workspaceId: input().workspaceId,
    readyPackageId,
    expectedDigest,
    coreIntakeResult: {
      intakeId,
      status,
      readyPackageId,
    },
  };
}

describe("ReadyPackage registry", () => {
  it("persists a VERIFIED provenance envelope without asserting legal truth", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const registry = repository(database);

    const created = registry.createVerified(input());
    expect(created.replayed).toBe(false);
    expect(created.readyPackage.status).toBe("VERIFIED");
    expect(created.readyPackage.evidence.artifactIds).toEqual(["art_01H00000000000000000000000"]);
    expect(created.readyPackage.evidence.rawArtifactSha256).toBe(SHA_A);
    expect(created.readyPackage.evidence.stagingSha256).toBe(SHA_B);
    expect(created.readyPackage.evidence.legalTruthVerified).toBe(false);
    expect(created.readyPackage.evidence.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(registry.getByConversionRun(input().conversionRunId, input().workspaceId)?.id).toBe(
      created.readyPackage.id,
    );

    database.close();
  });

  it("replays identical evidence but rejects idempotency drift", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const registry = repository(database);

    const first = registry.createVerified(input());
    const replay = registry.createVerified(input());
    expect(replay.replayed).toBe(true);
    expect(replay.readyPackage).toEqual(first.readyPackage);

    expect(() => registry.createVerified({ ...input(), stagingSha256: "c".repeat(64) })).toThrow(
      RegistryConflictError,
    );

    database.close();
  });

  it("requires the exact package evidence digest before marking handoff", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const registry = repository(database);
    const readyPackage = registry.createVerified(input()).readyPackage;

    expect(() =>
      registry.markHandedOff(readyPackage.id, readyPackage.workspaceId, "f".repeat(64)),
    ).toThrow(RegistryConflictError);

    const handedOff = registry.markHandedOff(
      readyPackage.id,
      readyPackage.workspaceId,
      readyPackage.evidence.digest,
    );
    expect(handedOff.status).toBe("HANDED_OFF");
    expect(handedOff.handedOffAt).toBe("2026-08-08T01:00:00.000Z");

    database.close();
  });

  it.each(["RECEIVED", "ACCEPTED"] as const)(
    "persists a %s Core receipt and hands off the package in one operation",
    (status) => {
      const database = new DatabaseSync(":memory:");
      initializeRegistry(database);
      const registry = repository(database);
      const readyPackage = registry.createVerified(input()).readyPackage;

      const result = registry.recordCoreIntakeAcknowledgment(
        acknowledgment(readyPackage.id, readyPackage.evidence.digest, status),
      );

      expect(result).toMatchObject({
        handoffRecorded: true,
        replayed: false,
        disposition: "HANDOFF_RECORDED",
        readyPackage: { status: "HANDED_OFF" },
        receipt: { status, readyPackageId: readyPackage.id },
      });
      expect(result.receipt.recordedAt).toBe("2026-08-08T01:00:00.000Z");
      expect(registry.listCoreIntakeReceipts(readyPackage.id, readyPackage.workspaceId)).toEqual([
        result.receipt,
      ]);

      database.close();
    },
  );

  it("persists a REJECTED Core receipt while leaving the package VERIFIED", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const registry = repository(database);
    const readyPackage = registry.createVerified(input()).readyPackage;

    const result = registry.recordCoreIntakeAcknowledgment(
      acknowledgment(readyPackage.id, readyPackage.evidence.digest, "REJECTED"),
    );

    expect(result).toMatchObject({
      handoffRecorded: false,
      replayed: false,
      disposition: "REJECTED_NOT_HANDED_OFF",
      readyPackage: { status: "VERIFIED" },
      receipt: { status: "REJECTED" },
    });
    expect(registry.getById(readyPackage.id, readyPackage.workspaceId)?.status).toBe("VERIFIED");
    expect(registry.listCoreIntakeReceipts(readyPackage.id, readyPackage.workspaceId)).toHaveLength(
      1,
    );

    database.close();
  });

  it("replays an exact receipt while allowing RECEIVED to progress to ACCEPTED on the same intake", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const registry = repository(database);
    const readyPackage = registry.createVerified(input()).readyPackage;
    const received = acknowledgment(
      readyPackage.id,
      readyPackage.evidence.digest,
      "RECEIVED",
      "intake_progress",
    );

    const first = registry.recordCoreIntakeAcknowledgment(received);
    const replay = registry.recordCoreIntakeAcknowledgment(received);
    expect(replay.replayed).toBe(true);
    expect(replay.receipt).toEqual(first.receipt);
    expect(replay.disposition).toBe("HANDOFF_ALREADY_RECORDED");

    const accepted = registry.recordCoreIntakeAcknowledgment({
      ...received,
      coreIntakeResult: { ...received.coreIntakeResult, status: "ACCEPTED" },
    });
    expect(accepted).toMatchObject({
      replayed: false,
      disposition: "HANDOFF_ALREADY_RECORDED",
      receipt: { intakeId: "intake_progress", status: "ACCEPTED" },
    });
    expect(
      registry
        .listCoreIntakeReceipts(readyPackage.id, readyPackage.workspaceId)
        .map((receipt) => receipt.status),
    ).toEqual(["ACCEPTED", "RECEIVED"]);

    database.close();
  });

  it("rejects reuse of one intakeId for different ReadyPackage evidence", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const firstRegistry = repository(database);
    const firstPackage = firstRegistry.createVerified(input()).readyPackage;
    firstRegistry.recordCoreIntakeAcknowledgment(
      acknowledgment(firstPackage.id, firstPackage.evidence.digest, "RECEIVED", "intake_shared"),
    );

    const secondRegistry = repository(database, "rdp_02H00000000000000000000000");
    const secondPackage = secondRegistry.createVerified(secondInput()).readyPackage;
    expect(() =>
      secondRegistry.recordCoreIntakeAcknowledgment(
        acknowledgment(
          secondPackage.id,
          secondPackage.evidence.digest,
          "RECEIVED",
          "intake_shared",
        ),
      ),
    ).toThrow("Core intake receipt intakeId was reused for different ReadyPackage evidence");
    expect(
      secondRegistry.listCoreIntakeReceipts(secondPackage.id, secondPackage.workspaceId),
    ).toHaveLength(0);

    database.close();
  });

  it("fails closed for digest and package mismatches without persisting receipt evidence", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const registry = repository(database);
    const readyPackage = registry.createVerified(input()).readyPackage;

    expect(() =>
      registry.recordCoreIntakeAcknowledgment(
        acknowledgment(readyPackage.id, "f".repeat(64), "RECEIVED"),
      ),
    ).toThrow("ReadyPackage digest mismatch");
    expect(() =>
      registry.recordCoreIntakeAcknowledgment({
        ...acknowledgment(readyPackage.id, readyPackage.evidence.digest, "RECEIVED"),
        coreIntakeResult: {
          intakeId: "intake_other",
          status: "RECEIVED",
          readyPackageId: "rdp_other",
        },
      }),
    ).toThrow("Core intake result belongs to another ReadyPackage");
    expect(registry.listCoreIntakeReceipts(readyPackage.id, readyPackage.workspaceId)).toHaveLength(
      0,
    );

    database.close();
  });

  it("rejects a new rejection after handoff and does not invent a reversing receipt", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const registry = repository(database);
    const readyPackage = registry.createVerified(input()).readyPackage;
    registry.recordCoreIntakeAcknowledgment(
      acknowledgment(readyPackage.id, readyPackage.evidence.digest, "RECEIVED", "intake_received"),
    );

    expect(() =>
      registry.recordCoreIntakeAcknowledgment(
        acknowledgment(
          readyPackage.id,
          readyPackage.evidence.digest,
          "REJECTED",
          "intake_rejected",
        ),
      ),
    ).toThrow("A rejected Core intake result cannot reverse an already recorded handoff");
    expect(registry.listCoreIntakeReceipts(readyPackage.id, readyPackage.workspaceId)).toHaveLength(
      1,
    );

    database.close();
  });

  it("rolls back HANDED_OFF when receipt persistence fails", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const registry = repository(database);
    const readyPackage = registry.createVerified(input()).readyPackage;
    database.exec(`
      CREATE TRIGGER fail_core_intake_receipt
      BEFORE INSERT ON ready_package_core_intake_receipts
      BEGIN
        SELECT RAISE(ABORT, 'receipt write failed');
      END;
    `);

    expect(() =>
      registry.recordCoreIntakeAcknowledgment(
        acknowledgment(readyPackage.id, readyPackage.evidence.digest, "RECEIVED"),
      ),
    ).toThrow("receipt write failed");
    expect(registry.getById(readyPackage.id, readyPackage.workspaceId)?.status).toBe("VERIFIED");
    expect(registry.listCoreIntakeReceipts(readyPackage.id, readyPackage.workspaceId)).toHaveLength(
      0,
    );

    database.close();
  });
});
