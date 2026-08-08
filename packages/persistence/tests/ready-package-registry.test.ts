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

describe("ReadyPackage registry", () => {
  it("persists a VERIFIED provenance envelope without asserting legal truth", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const repository = new SqliteReadyPackageRegistryRepository(
      database,
      () => new Date("2026-08-08T01:00:00.000Z"),
      () => "rdp_01H00000000000000000000000",
    );

    const created = repository.createVerified(input());
    expect(created.replayed).toBe(false);
    expect(created.readyPackage.status).toBe("VERIFIED");
    expect(created.readyPackage.evidence.artifactIds).toEqual([
      "art_01H00000000000000000000000",
    ]);
    expect(created.readyPackage.evidence.rawArtifactSha256).toBe(SHA_A);
    expect(created.readyPackage.evidence.stagingSha256).toBe(SHA_B);
    expect(created.readyPackage.evidence.legalTruthVerified).toBe(false);
    expect(created.readyPackage.evidence.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.getByConversionRun(input().conversionRunId, input().workspaceId)?.id).toBe(
      created.readyPackage.id,
    );

    database.close();
  });

  it("replays identical evidence but rejects idempotency drift", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const repository = new SqliteReadyPackageRegistryRepository(
      database,
      () => new Date("2026-08-08T01:00:00.000Z"),
      () => "rdp_01H00000000000000000000000",
    );

    const first = repository.createVerified(input());
    const replay = repository.createVerified(input());
    expect(replay.replayed).toBe(true);
    expect(replay.readyPackage).toEqual(first.readyPackage);

    expect(() =>
      repository.createVerified({ ...input(), stagingSha256: "c".repeat(64) }),
    ).toThrow(RegistryConflictError);

    database.close();
  });

  it("requires the exact package evidence digest before marking handoff", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const repository = new SqliteReadyPackageRegistryRepository(
      database,
      () => new Date("2026-08-08T01:00:00.000Z"),
      () => "rdp_01H00000000000000000000000",
    );
    const readyPackage = repository.createVerified(input()).readyPackage;

    expect(() =>
      repository.markHandedOff(readyPackage.id, readyPackage.workspaceId, "f".repeat(64)),
    ).toThrow(RegistryConflictError);

    const handedOff = repository.markHandedOff(
      readyPackage.id,
      readyPackage.workspaceId,
      readyPackage.evidence.digest,
    );
    expect(handedOff.status).toBe("HANDED_OFF");
    expect(handedOff.handedOffAt).toBe("2026-08-08T01:00:00.000Z");

    database.close();
  });
});
