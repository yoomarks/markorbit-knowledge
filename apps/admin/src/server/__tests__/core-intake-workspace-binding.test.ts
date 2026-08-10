import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { CoreIntakeRequest } from "@markorbit/contracts";
import { initializeRegistry } from "@markorbit/persistence";
import { SqliteReadyPackageCoreIntakeSubmissionRepository } from "@markorbit/persistence/ready-package-core-intake-submissions";
import { SqliteReadyPackageRegistryRepository } from "@markorbit/persistence/ready-packages";
import type { CoreIntakeTransport } from "../core-intake-http-transport";
import { submitReadyPackageCoreIntake } from "../ready-package-core-intake-submit";

const KNOWLEDGE_WORKSPACE_ID = "wsp_01H00000000000000000000000";
const CORE_WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const CORE_WORKSPACE_B = "22222222-2222-4222-8222-222222222222";

function fixture() {
  const database = new DatabaseSync(":memory:");
  initializeRegistry(database);
  const readyPackages = new SqliteReadyPackageRegistryRepository(
    database,
    () => new Date("2026-08-10T17:30:00.000Z"),
    () => "rdp_01H00000000000000000000000",
  );
  const readyPackage = readyPackages.createVerified({
    workspaceId: KNOWLEDGE_WORKSPACE_ID,
    sourceId: "src_01H00000000000000000000000",
    rawArtifactId: "art_01H00000000000000000000000",
    rawArtifactSha256: "a".repeat(64),
    capturedAt: "2026-08-10T17:00:00.000Z",
    conversionRunId: "cvr_01H00000000000000000000000",
    converter: { converterId: "builtin-markdown-staging", version: "1.0.0" },
    stagingDocumentId: "std_01H00000000000000000000000",
    stagingSha256: "b".repeat(64),
    verificationId: "svr_01H00000000000000000000000",
    verificationOutcome: "PASS",
    idempotencyKey: "ready-package:m44-core-binding",
  }).readyPackage;
  const submissions = new SqliteReadyPackageCoreIntakeSubmissionRepository(
    database,
    () => new Date("2026-08-10T17:31:00.000Z"),
    () => "cis_m44_binding",
  );
  const input = {
    workspaceId: readyPackage.workspaceId,
    readyPackageId: readyPackage.id,
    expectedDigest: readyPackage.evidence.digest,
    submit: true as const,
  };
  return { database, readyPackages, readyPackage, submissions, input };
}

describe("Core intake workspace binding", () => {
  it("freezes the resolved Core UUID before transport and reuses it across an uncertain retry", async () => {
    const { database, readyPackages, readyPackage, submissions, input } = fixture();
    let configuredCoreWorkspace = CORE_WORKSPACE_A;
    let resolutionCalls = 0;
    const attempts: Array<{ request: CoreIntakeRequest; key: string }> = [];
    const transport: CoreIntakeTransport = {
      resolveDestinationWorkspaceId() {
        resolutionCalls += 1;
        return configuredCoreWorkspace;
      },
      async submit(request, key) {
        attempts.push({ request, key });
        if (attempts.length === 1) throw new Error("uncertain Core outcome");
        return {
          intakeId: "33333333-3333-4333-8333-333333333333",
          status: "RECEIVED",
          readyPackageId: request.readyPackageId,
        };
      },
    };

    await expect(
      submitReadyPackageCoreIntake(input, readyPackages, submissions, transport),
    ).rejects.toThrow("uncertain Core outcome");
    expect(submissions.list(readyPackage.id, KNOWLEDGE_WORKSPACE_ID)[0]).toMatchObject({
      state: "PENDING",
      coreWorkspaceId: CORE_WORKSPACE_A,
      transportResult: undefined,
    });

    configuredCoreWorkspace = CORE_WORKSPACE_B;
    const recovered = await submitReadyPackageCoreIntake(
      input,
      readyPackages,
      submissions,
      transport,
    );

    expect(resolutionCalls).toBe(1);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[0]).toMatchObject({
      key: "core-intake:cis_m44_binding",
      request: {
        workspaceId: CORE_WORKSPACE_A,
        submittedAt: "2026-08-10T17:31:00.000Z",
      },
    });
    expect(recovered.submission).toMatchObject({
      coreWorkspaceId: CORE_WORKSPACE_A,
      state: "RESULT_RECORDED",
    });
    database.close();
  });

  it("refuses to rebind a legacy pending submission under its existing idempotency key", async () => {
    const { database, readyPackages, readyPackage, submissions, input } = fixture();
    submissions.prepare({
      workspaceId: KNOWLEDGE_WORKSPACE_ID,
      readyPackageId: readyPackage.id,
      expectedDigest: readyPackage.evidence.digest,
    });
    let transportCalls = 0;
    const transport: CoreIntakeTransport = {
      resolveDestinationWorkspaceId: () => CORE_WORKSPACE_A,
      async submit() {
        transportCalls += 1;
        throw new Error("must not submit");
      },
    };

    await expect(
      submitReadyPackageCoreIntake(input, readyPackages, submissions, transport),
    ).rejects.toMatchObject({
      code: "CORE_INTAKE_PENDING_DESTINATION_WORKSPACE_UNBOUND",
    });
    expect(transportCalls).toBe(0);
    expect(submissions.list(readyPackage.id, KNOWLEDGE_WORKSPACE_ID)[0].coreWorkspaceId).toBeUndefined();
    database.close();
  });

  it("finalizes a legacy persisted transport result without current workspace binding or HTTP", async () => {
    const { database, readyPackages, readyPackage, submissions, input } = fixture();
    const prepared = submissions.prepare({
      workspaceId: KNOWLEDGE_WORKSPACE_ID,
      readyPackageId: readyPackage.id,
      expectedDigest: readyPackage.evidence.digest,
    });
    submissions.recordTransportResult(prepared.submission.submissionId, KNOWLEDGE_WORKSPACE_ID, {
      intakeId: "44444444-4444-4444-8444-444444444444",
      status: "RECEIVED",
      readyPackageId: readyPackage.id,
    });
    let resolverCalls = 0;
    let transportCalls = 0;
    const transport: CoreIntakeTransport = {
      resolveDestinationWorkspaceId() {
        resolverCalls += 1;
        throw new Error("current binding must not be required");
      },
      async submit() {
        transportCalls += 1;
        throw new Error("HTTP must not be called");
      },
    };

    const finalized = await submitReadyPackageCoreIntake(
      input,
      readyPackages,
      submissions,
      transport,
    );

    expect(resolverCalls).toBe(0);
    expect(transportCalls).toBe(0);
    expect(finalized.transportResultReplayed).toBe(true);
    expect(finalized.submission.state).toBe("RESULT_RECORDED");
    expect(finalized.acknowledgment.readyPackage.status).toBe("HANDED_OFF");
    database.close();
  });
});
