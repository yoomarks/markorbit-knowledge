import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import {
  serializeReadyPackageContentExportV1,
  type ReadyPackageContentExportV1,
} from "@markorbit/contracts";
import { initializeRegistry } from "@markorbit/persistence";
import { SqliteReadyPackageCoreIntakeSubmissionRepository } from "@markorbit/persistence/ready-package-core-intake-submissions";
import { SqliteReadyPackageRegistryRepository } from "@markorbit/persistence/ready-packages";
import type { CoreContentTransport } from "../core-content-http-transport";
import { submitReadyPackageCoreContent } from "../ready-package-core-content-submit";
import { submitReadyPackageCoreIntake } from "../ready-package-core-intake-submit";

const WORKSPACE_ID = "wsp_01H00000000000000000000000";
const CORE_WORKSPACE_ID = "01900000-0000-7000-8000-000000000001";
const CORE_INTAKE_ID = "01900000-0000-7000-8000-000000000002";
const READY_PACKAGE_ID = "rdp_01H00000000000000000000001";
const MARKDOWN = "# Frozen content\n\nSecond-stage delivery.\n";
const STAGING_SHA = createHash("sha256").update(MARKDOWN, "utf8").digest("hex");

async function fixture() {
  const database = new DatabaseSync(":memory:");
  initializeRegistry(database);
  const readyPackages = new SqliteReadyPackageRegistryRepository(
    database,
    () => new Date("2026-08-11T08:00:00.000Z"),
    () => READY_PACKAGE_ID,
  );
  const readyPackage = readyPackages.createVerified({
    workspaceId: WORKSPACE_ID,
    sourceId: "src_01H00000000000000000000000",
    rawArtifactId: "art_01H00000000000000000000000",
    rawArtifactSha256: "a".repeat(64),
    capturedAt: "2026-08-11T07:50:00.000Z",
    conversionRunId: "cvr_01H00000000000000000000000",
    converter: { converterId: "builtin-markdown-staging", version: "1.0.0" },
    stagingDocumentId: "std_01H00000000000000000000000",
    stagingSha256: STAGING_SHA,
    verificationId: "svr_01H00000000000000000000000",
    verificationOutcome: "PASS",
    idempotencyKey: "ready-package:core-content:test",
  }).readyPackage;
  const submissions = new SqliteReadyPackageCoreIntakeSubmissionRepository(
    database,
    () => new Date("2026-08-11T08:01:00.000Z"),
    () => "cis_core_content_test",
  );
  await submitReadyPackageCoreIntake(
    {
      workspaceId: WORKSPACE_ID,
      coreWorkspaceId: CORE_WORKSPACE_ID,
      readyPackageId: readyPackage.id,
      expectedDigest: readyPackage.evidence.digest,
      submit: true,
    },
    readyPackages,
    submissions,
    {
      submit: async () => ({
        intakeId: CORE_INTAKE_ID,
        readyPackageId: readyPackage.id,
        status: "RECEIVED",
      }),
    },
  );
  const handedOff = readyPackages.getById(readyPackage.id, WORKSPACE_ID)!;
  const contentExport: ReadyPackageContentExportV1 = {
    contractVersion: "1.0",
    objectType: "READY_PACKAGE_CONTENT_EXPORT",
    readyPackageId: handedOff.id,
    knowledgeWorkspaceId: WORKSPACE_ID,
    readyPackageDigest: handedOff.evidence.digest,
    provenance: {
      sourceId: handedOff.evidence.sourceId!,
      conversionRunId: handedOff.evidence.conversionRunId!,
      verificationId: handedOff.evidence.verificationId!,
      verificationOutcome: handedOff.evidence.verificationOutcome!,
      capturedAt: handedOff.evidence.capturedAt!,
      converter: handedOff.evidence.converter!,
      legalTruthVerified: false,
    },
    rawArtifact: {
      artifactId: handedOff.evidence.artifactIds[0]!,
      sha256: handedOff.evidence.rawArtifactSha256!,
      sizeBytes: 11,
      mimeType: "text/plain",
      originalName: "source.txt",
    },
    stagingDocument: {
      documentId: handedOff.evidence.stagingDocumentId,
      sha256: handedOff.evidence.stagingSha256!,
      sizeBytes: Buffer.byteLength(MARKDOWN, "utf8"),
      mediaType: "text/markdown",
      encoding: "utf-8",
      content: MARKDOWN,
    },
  };
  return { database, readyPackages, handedOff, submissions, contentExport };
}

function resultFor(contentExport: ReadyPackageContentExportV1) {
  const requestJson = serializeReadyPackageContentExportV1(contentExport);
  return {
    intakeId: CORE_INTAKE_ID,
    readyPackageId: READY_PACKAGE_ID,
    status: "ACCEPTED" as const,
    exportSha256: createHash("sha256").update(requestJson, "utf8").digest("hex"),
  };
}

describe("retry-safe ReadyPackage Core content submission", () => {
  it("freezes the exact request before network and reuses it after an unknown outcome", async () => {
    const { database, readyPackages, handedOff, submissions, contentExport } = await fixture();
    try {
      const attempts: Array<{ intakeId: string; requestJson: string }> = [];
      let exporterCalls = 0;
      const expected = resultFor(contentExport);
      const transport: CoreContentTransport = {
        async submit(intakeId, requestJson) {
          attempts.push({ intakeId, requestJson });
          if (attempts.length === 1) throw new Error("SIMULATED_UNKNOWN_CORE_CONTENT_OUTCOME");
          return expected;
        },
      };
      const input = {
        workspaceId: WORKSPACE_ID,
        readyPackageId: handedOff.id,
        expectedDigest: handedOff.evidence.digest,
        submit: true as const,
      };
      const exporter = async () => {
        exporterCalls += 1;
        return structuredClone(contentExport);
      };
      await expect(
        submitReadyPackageCoreContent(input, readyPackages, submissions, exporter, transport),
      ).rejects.toThrow("SIMULATED_UNKNOWN_CORE_CONTENT_OUTCOME");
      const pending = submissions.list(handedOff.id, WORKSPACE_ID)[0]!;
      expect(pending.contentDelivery).toMatchObject({
        state: "PENDING",
        coreIntakeId: CORE_INTAKE_ID,
        requestJson: attempts[0]!.requestJson,
      });
      const recovered = await submitReadyPackageCoreContent(
        input,
        readyPackages,
        submissions,
        exporter,
        transport,
      );
      expect(exporterCalls).toBe(1);
      expect(attempts).toHaveLength(2);
      expect(attempts[1]).toEqual(attempts[0]);
      expect(recovered.deliveryReplayed).toBe(true);
      expect(recovered.transportResultReplayed).toBe(false);
      expect(recovered.coreContentResult).toEqual(expected);
      expect(recovered.submission.contentDelivery).toMatchObject({ state: "RESULT_RECORDED" });
    } finally {
      database.close();
    }
  });

  it("finalizes locally from persisted transport evidence without rebuilding or calling Core", async () => {
    const { database, readyPackages, handedOff, submissions, contentExport } = await fixture();
    try {
      const intakeSubmission = submissions.list(handedOff.id, WORKSPACE_ID)[0]!;
      const requestJson = serializeReadyPackageContentExportV1(contentExport);
      const exportSha256 = createHash("sha256").update(requestJson, "utf8").digest("hex");
      submissions.prepareContentDelivery(intakeSubmission.submissionId, WORKSPACE_ID, {
        coreIntakeId: CORE_INTAKE_ID,
        requestJson,
        requestSha256: exportSha256,
      });
      submissions.recordContentTransportResult(intakeSubmission.submissionId, WORKSPACE_ID, {
        intakeId: CORE_INTAKE_ID,
        readyPackageId: handedOff.id,
        status: "ACCEPTED",
        exportSha256,
      });
      const exporter = vi.fn(async () => {
        throw new Error("exporter must not run");
      });
      const transport = {
        submit: vi.fn(async () => {
          throw new Error("transport must not run");
        }),
      };
      const recovered = await submitReadyPackageCoreContent(
        {
          workspaceId: WORKSPACE_ID,
          readyPackageId: handedOff.id,
          expectedDigest: handedOff.evidence.digest,
          submit: true,
        },
        readyPackages,
        submissions,
        exporter,
        transport,
      );
      expect(exporter).not.toHaveBeenCalled();
      expect(transport.submit).not.toHaveBeenCalled();
      expect(recovered.transportResultReplayed).toBe(true);
      expect(recovered.submission.contentDelivery?.state).toBe("RESULT_RECORDED");
    } finally {
      database.close();
    }
  });

  it("replays an already finalized content delivery without another external side effect", async () => {
    const { database, readyPackages, handedOff, submissions, contentExport } = await fixture();
    try {
      const expected = resultFor(contentExport);
      await submitReadyPackageCoreContent(
        {
          workspaceId: WORKSPACE_ID,
          readyPackageId: handedOff.id,
          expectedDigest: handedOff.evidence.digest,
          submit: true,
        },
        readyPackages,
        submissions,
        async () => structuredClone(contentExport),
        { submit: async () => expected },
      );
      const exporter = vi.fn(async () => {
        throw new Error("exporter must not run");
      });
      const transport = { submit: vi.fn(async () => expected) };
      const replay = await submitReadyPackageCoreContent(
        {
          workspaceId: WORKSPACE_ID,
          readyPackageId: handedOff.id,
          expectedDigest: handedOff.evidence.digest,
          submit: true,
        },
        readyPackages,
        submissions,
        exporter,
        transport,
      );
      expect(exporter).not.toHaveBeenCalled();
      expect(transport.submit).not.toHaveBeenCalled();
      expect(replay.deliveryReplayed).toBe(true);
      expect(replay.transportResultReplayed).toBe(true);
      expect(replay.coreContentResult).toEqual(expected);
    } finally {
      database.close();
    }
  });
});
