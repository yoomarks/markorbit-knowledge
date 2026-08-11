import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
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
    () => new Date("2026-08-11T00:40:00.000Z"),
    () => "rdp_01H00000000000000000000000",
  );
  const readyPackage = readyPackages.createVerified({
    workspaceId: KNOWLEDGE_WORKSPACE_ID,
    sourceId: "src_01H00000000000000000000000",
    rawArtifactId: "art_01H00000000000000000000000",
    rawArtifactSha256: "a".repeat(64),
    capturedAt: "2026-08-11T00:30:00.000Z",
    conversionRunId: "cvr_01H00000000000000000000000",
    converter: { converterId: "builtin-markdown-staging", version: "1.0.0" },
    stagingDocumentId: "std_01H00000000000000000000000",
    stagingSha256: "b".repeat(64),
    verificationId: "svr_01H00000000000000000000000",
    verificationOutcome: "PASS",
    idempotencyKey: "ready-package:r1-k02",
  }).readyPackage;
  const submissions = new SqliteReadyPackageCoreIntakeSubmissionRepository(
    database,
    () => new Date("2026-08-11T00:41:00.000Z"),
    () => "cis_frozen_workspace",
  );
  return { database, readyPackages, readyPackage, submissions };
}

function input(
  readyPackage: { workspaceId: string; id: string; evidence: { digest: string } },
  coreWorkspaceId: string | null,
) {
  return {
    workspaceId: readyPackage.workspaceId,
    coreWorkspaceId,
    readyPackageId: readyPackage.id,
    expectedDigest: readyPackage.evidence.digest,
    submit: true as const,
  };
}

describe("Core intake frozen workspace binding", () => {
  it("reuses the frozen Core workspace when the current binding changes before retry", async () => {
    const { database, readyPackages, readyPackage, submissions } = fixture();
    const attempts: Array<{ request: CoreIntakeRequest; idempotencyKey: string }> = [];
    const transport: CoreIntakeTransport = {
      async submit(request, idempotencyKey) {
        attempts.push({ request, idempotencyKey });
        if (attempts.length === 1) throw new Error("uncertain network outcome");
        return {
          intakeId: "intake_frozen_workspace",
          status: "RECEIVED",
          readyPackageId: request.readyPackageId,
        };
      },
    };

    await expect(
      submitReadyPackageCoreIntake(
        input(readyPackage, CORE_WORKSPACE_A),
        readyPackages,
        submissions,
        transport,
      ),
    ).rejects.toThrow("uncertain network outcome");

    expect(submissions.list(readyPackage.id, readyPackage.workspaceId)[0]).toMatchObject({
      state: "PENDING",
      coreWorkspaceId: CORE_WORKSPACE_A,
    });

    const recovered = await submitReadyPackageCoreIntake(
      input(readyPackage, CORE_WORKSPACE_B),
      readyPackages,
      submissions,
      transport,
    );

    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[0]).toMatchObject({
      request: { workspaceId: CORE_WORKSPACE_A },
      idempotencyKey: "core-intake:cis_frozen_workspace",
    });
    expect(recovered.submissionReplayed).toBe(true);
    expect(recovered.submission.coreWorkspaceId).toBe(CORE_WORKSPACE_A);

    database.close();
  });

  it("fails closed for a legacy pending submission without a frozen destination", async () => {
    const { database, readyPackages, readyPackage, submissions } = fixture();
    submissions.prepare({
      workspaceId: readyPackage.workspaceId,
      readyPackageId: readyPackage.id,
      expectedDigest: readyPackage.evidence.digest,
    });
    const submit = vi.fn<CoreIntakeTransport["submit"]>();

    await expect(
      submitReadyPackageCoreIntake(
        input(readyPackage, CORE_WORKSPACE_B),
        readyPackages,
        submissions,
        { submit },
      ),
    ).rejects.toMatchObject({
      code: "CORE_INTAKE_PENDING_DESTINATION_WORKSPACE_UNBOUND",
    });
    expect(submit).not.toHaveBeenCalled();

    database.close();
  });

  it("still finalizes a legacy pending submission from a persisted transport result", async () => {
    const { database, readyPackages, readyPackage, submissions } = fixture();
    const prepared = submissions.prepare({
      workspaceId: readyPackage.workspaceId,
      readyPackageId: readyPackage.id,
      expectedDigest: readyPackage.evidence.digest,
    });
    submissions.recordTransportResult(prepared.submission.submissionId, readyPackage.workspaceId, {
      intakeId: "intake_legacy_result",
      status: "RECEIVED",
      readyPackageId: readyPackage.id,
    });
    const submit = vi.fn<CoreIntakeTransport["submit"]>();

    const recovered = await submitReadyPackageCoreIntake(
      input(readyPackage, null),
      readyPackages,
      submissions,
      { submit },
    );

    expect(submit).not.toHaveBeenCalled();
    expect(recovered.transportResultReplayed).toBe(true);
    expect(recovered.coreIntakeRequest).toBeNull();
    expect(recovered.acknowledgment.readyPackage.status).toBe("HANDED_OFF");
    expect(recovered.submission.state).toBe("RESULT_RECORDED");

    database.close();
  });
});
