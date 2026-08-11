import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { CoreIntakeRequest, CoreIntakeResult } from "@markorbit/contracts";
import { initializeRegistry } from "@markorbit/persistence";
import { SqliteReadyPackageCoreIntakeSubmissionRepository } from "@markorbit/persistence/ready-package-core-intake-submissions";
import { SqliteReadyPackageRegistryRepository } from "@markorbit/persistence/ready-packages";
import { HttpCoreIntakeTransport, type CoreIntakeTransport } from "../core-intake-http-transport";
import { submitReadyPackageCoreIntake } from "../ready-package-core-intake-submit";

const KNOWLEDGE_WORKSPACE_ID = "wsp_01H00000000000000000000000";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the real Core intake E2E test`);
  return value;
}

function createFixture() {
  const database = new DatabaseSync(":memory:");
  initializeRegistry(database);
  const suffix = `${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
  const readyPackages = new SqliteReadyPackageRegistryRepository(
    database,
    () => new Date("2026-08-11T01:30:00.000Z"),
    () => `rdp_e2e_${suffix}`,
  );
  const readyPackage = readyPackages.createVerified({
    workspaceId: KNOWLEDGE_WORKSPACE_ID,
    sourceId: "src_01H00000000000000000000000",
    rawArtifactId: "art_01H00000000000000000000000",
    rawArtifactSha256: "a".repeat(64),
    capturedAt: "2026-08-11T01:20:00.000Z",
    conversionRunId: "cvr_01H00000000000000000000000",
    converter: { converterId: "builtin-markdown-staging", version: "1.0.0" },
    stagingDocumentId: "std_01H00000000000000000000000",
    stagingSha256: "b".repeat(64),
    verificationId: "svr_01H00000000000000000000000",
    verificationOutcome: "PASS",
    idempotencyKey: `ready-package:e2e:${suffix}`,
  }).readyPackage;
  const submissions = new SqliteReadyPackageCoreIntakeSubmissionRepository(
    database,
    () => new Date("2026-08-11T01:31:00.000Z"),
    () => `cis_e2e_${suffix}`,
  );
  return { database, readyPackages, readyPackage, submissions };
}

describe.sequential("Knowledge -> real Core ReadyPackage intake", () => {
  it("recovers from a lost response by replaying the exact frozen request against Core", async () => {
    const intakeUrl = requiredEnvironment("MARKORBIT_CORE_INTAKE_URL");
    const internalSecret = requiredEnvironment("MARKORBIT_CORE_INTERNAL_SECRET");
    const coreWorkspaceId = requiredEnvironment("MARKORBIT_E2E_CORE_WORKSPACE_ID").toLowerCase();
    const { database, readyPackages, readyPackage, submissions } = createFixture();

    try {
      const realTransport = new HttpCoreIntakeTransport(intakeUrl, internalSecret, fetch, 10_000);
      const attempts: Array<{ request: CoreIntakeRequest; idempotencyKey: string }> = [];
      let firstCoreResult: CoreIntakeResult | null = null;
      const lossyTransport: CoreIntakeTransport = {
        async submit(request, idempotencyKey) {
          attempts.push({ request: structuredClone(request), idempotencyKey });
          const result = await realTransport.submit(request, idempotencyKey);
          if (!firstCoreResult) {
            firstCoreResult = result;
            throw new Error("E2E_SIMULATED_RESPONSE_LOSS_AFTER_CORE_ACCEPT");
          }
          return result;
        },
      };
      const input = {
        workspaceId: readyPackage.workspaceId,
        coreWorkspaceId,
        readyPackageId: readyPackage.id,
        expectedDigest: readyPackage.evidence.digest,
        submit: true as const,
      };

      await expect(
        submitReadyPackageCoreIntake(input, readyPackages, submissions, lossyTransport),
      ).rejects.toThrow("E2E_SIMULATED_RESPONSE_LOSS_AFTER_CORE_ACCEPT");

      expect(firstCoreResult).toMatchObject({
        status: "RECEIVED",
        readyPackageId: readyPackage.id,
      });
      expect(submissions.list(readyPackage.id, readyPackage.workspaceId)[0]).toMatchObject({
        state: "PENDING",
        coreWorkspaceId,
      });

      const recovered = await submitReadyPackageCoreIntake(
        input,
        readyPackages,
        submissions,
        lossyTransport,
      );

      expect(attempts).toHaveLength(2);
      expect(attempts[1]).toEqual(attempts[0]);
      expect(recovered.coreIntakeResult).toEqual(firstCoreResult);
      expect(recovered.submissionReplayed).toBe(true);
      expect(recovered.transportResultReplayed).toBe(false);
      expect(recovered.submission).toMatchObject({
        state: "RESULT_RECORDED",
        coreWorkspaceId,
      });
      expect(recovered.acknowledgment.readyPackage.status).toBe("HANDED_OFF");
    } finally {
      database.close();
    }
  });
});
