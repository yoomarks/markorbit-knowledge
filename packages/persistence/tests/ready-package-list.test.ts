import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { initializeRegistry } from "../src/index";
import { SqliteReadyPackageRegistryRepository } from "../src/ready-package-registry";

const WORKSPACE = "wsp_01H00000000000000000000000";
const OTHER_WORKSPACE = "wsp_02H00000000000000000000000";

function createInput(suffix: string, workspaceId = WORKSPACE) {
  return {
    workspaceId,
    sourceId: `src_${suffix}`,
    rawArtifactId: `art_${suffix}`,
    rawArtifactSha256: suffix.slice(0, 1).repeat(64),
    capturedAt: "2026-08-10T00:00:00.000Z",
    conversionRunId: `cvr_${suffix}`,
    converter: { converterId: "builtin-markdown-staging", version: "1.0.0" },
    stagingDocumentId: `std_${suffix}`,
    stagingSha256: suffix.slice(1, 2).repeat(64),
    verificationId: `svr_${suffix}`,
    verificationOutcome: "PASS" as const,
    idempotencyKey: `ready-package:list:${workspaceId}:${suffix}`,
  };
}

describe("ReadyPackage workspace listing", () => {
  it("returns only the requested workspace in newest-first order", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);

    new SqliteReadyPackageRegistryRepository(
      database,
      () => new Date("2026-08-10T01:00:00.000Z"),
      () => "rdp_first",
    ).createVerified(createInput("ab-first"));
    new SqliteReadyPackageRegistryRepository(
      database,
      () => new Date("2026-08-10T02:00:00.000Z"),
      () => "rdp_second",
    ).createVerified(createInput("cd-second"));
    new SqliteReadyPackageRegistryRepository(
      database,
      () => new Date("2026-08-10T03:00:00.000Z"),
      () => "rdp_other",
    ).createVerified(createInput("ef-other", OTHER_WORKSPACE));

    const registry = new SqliteReadyPackageRegistryRepository(database);
    expect(registry.list(WORKSPACE).map((readyPackage) => readyPackage.id)).toEqual([
      "rdp_second",
      "rdp_first",
    ]);
    expect(registry.list(OTHER_WORKSPACE).map((readyPackage) => readyPackage.id)).toEqual([
      "rdp_other",
    ]);

    database.close();
  });
});
