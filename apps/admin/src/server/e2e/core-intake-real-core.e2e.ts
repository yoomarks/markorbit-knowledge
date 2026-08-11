import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  serializeReadyPackageContentExportV1,
  type CoreIntakeRequest,
  type CoreIntakeResult,
  type ReadyPackageContentExportV1,
} from "@markorbit/contracts";
import { initializeRegistry } from "@markorbit/persistence";
import { SqliteReadyPackageCoreIntakeSubmissionRepository } from "@markorbit/persistence/ready-package-core-intake-submissions";
import { SqliteReadyPackageRegistryRepository } from "@markorbit/persistence/ready-packages";
import {
  HttpCoreContentTransport,
  type CoreContentTransport,
} from "../core-content-http-transport";
import { HttpCoreIntakeTransport, type CoreIntakeTransport } from "../core-intake-http-transport";
import { submitReadyPackageCoreContent } from "../ready-package-core-content-submit";
import { submitReadyPackageCoreIntake } from "../ready-package-core-intake-submit";

const KNOWLEDGE_WORKSPACE_ID = "wsp_01H00000000000000000000000";
const READY_PACKAGE_ID = "rdp_01H00000000000000000000001";
const MARKDOWN = "# Real Core E2E\n\nFrozen canonical content.\n";
const STAGING_SHA = createHash("sha256").update(MARKDOWN, "utf8").digest("hex");

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the real Core intake E2E test`);
  return value;
}

function createFixture() {
  const database = new DatabaseSync(":memory:");
  initializeRegistry(database);
  const readyPackages = new SqliteReadyPackageRegistryRepository(
    database,
    () => new Date("2026-08-11T01:30:00.000Z"),
    () => READY_PACKAGE_ID,
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
    stagingSha256: STAGING_SHA,
    verificationId: "svr_01H00000000000000000000000",
    verificationOutcome: "PASS",
    idempotencyKey: "ready-package:real-core:e2e",
  }).readyPackage;
  const submissions = new SqliteReadyPackageCoreIntakeSubmissionRepository(
    database,
    () => new Date("2026-08-11T01:31:00.000Z"),
    () => "cis_real_core_e2e",
  );
  return { database, readyPackages, readyPackage, submissions };
}

function contentExport(
  readyPackage: ReturnType<typeof createFixture>["readyPackage"],
): ReadyPackageContentExportV1 {
  return {
    contractVersion: "1.0",
    objectType: "READY_PACKAGE_CONTENT_EXPORT",
    readyPackageId: readyPackage.id,
    knowledgeWorkspaceId: KNOWLEDGE_WORKSPACE_ID,
    readyPackageDigest: readyPackage.evidence.digest,
    provenance: {
      sourceId: readyPackage.evidence.sourceId!,
      conversionRunId: readyPackage.evidence.conversionRunId!,
      verificationId: readyPackage.evidence.verificationId!,
      verificationOutcome: readyPackage.evidence.verificationOutcome!,
      capturedAt: readyPackage.evidence.capturedAt!,
      converter: readyPackage.evidence.converter!,
      legalTruthVerified: false,
    },
    rawArtifact: {
      artifactId: readyPackage.evidence.artifactIds[0]!,
      sha256: readyPackage.evidence.rawArtifactSha256!,
      sizeBytes: 11,
      mimeType: "text/plain",
      originalName: "source.txt",
    },
    stagingDocument: {
      documentId: readyPackage.evidence.stagingDocumentId,
      sha256: readyPackage.evidence.stagingSha256!,
      sizeBytes: Buffer.byteLength(MARKDOWN, "utf8"),
      mediaType: "text/markdown",
      encoding: "utf-8",
      content: MARKDOWN,
    },
  };
}

describe.sequential("Knowledge -> real Core ReadyPackage intake and content", () => {
  it("recovers both delivery stages by replaying their exact frozen requests", async () => {
    const intakeUrl = requiredEnvironment("MARKORBIT_CORE_INTAKE_URL");
    const internalSecret = requiredEnvironment("MARKORBIT_CORE_INTERNAL_SECRET");
    const coreWorkspaceId = requiredEnvironment("MARKORBIT_E2E_CORE_WORKSPACE_ID").toLowerCase();
    const { database, readyPackages, readyPackage, submissions } = createFixture();

    try {
      const realIntakeTransport = new HttpCoreIntakeTransport(
        intakeUrl,
        internalSecret,
        fetch,
        10_000,
      );
      const intakeAttempts: Array<{ request: CoreIntakeRequest; idempotencyKey: string }> = [];
      let firstCoreResult: CoreIntakeResult | null = null;
      const lossyIntakeTransport: CoreIntakeTransport = {
        async submit(request, idempotencyKey) {
          intakeAttempts.push({ request: structuredClone(request), idempotencyKey });
          const result = await realIntakeTransport.submit(request, idempotencyKey);
          if (!firstCoreResult) {
            firstCoreResult = result;
            throw new Error("E2E_SIMULATED_INTAKE_RESPONSE_LOSS_AFTER_CORE_COMMIT");
          }
          return result;
        },
      };
      const intakeInput = {
        workspaceId: readyPackage.workspaceId,
        coreWorkspaceId,
        readyPackageId: readyPackage.id,
        expectedDigest: readyPackage.evidence.digest,
        submit: true as const,
      };
      await expect(
        submitReadyPackageCoreIntake(intakeInput, readyPackages, submissions, lossyIntakeTransport),
      ).rejects.toThrow("E2E_SIMULATED_INTAKE_RESPONSE_LOSS_AFTER_CORE_COMMIT");
      const recoveredIntake = await submitReadyPackageCoreIntake(
        intakeInput,
        readyPackages,
        submissions,
        lossyIntakeTransport,
      );
      expect(intakeAttempts).toHaveLength(2);
      expect(intakeAttempts[1]).toEqual(intakeAttempts[0]);
      expect(recoveredIntake.coreIntakeResult).toEqual(firstCoreResult);
      expect(recoveredIntake.acknowledgment.readyPackage.status).toBe("HANDED_OFF");

      const frozenExport = contentExport(recoveredIntake.acknowledgment.readyPackage);
      const realContentTransport = new HttpCoreContentTransport(
        intakeUrl,
        internalSecret,
        fetch,
        10_000,
      );
      const contentAttempts: Array<{ intakeId: string; requestJson: string }> = [];
      let firstContentResult: Awaited<ReturnType<CoreContentTransport["submit"]>> | null = null;
      const lossyContentTransport: CoreContentTransport = {
        async submit(intakeId, requestJson, expected) {
          contentAttempts.push({ intakeId, requestJson });
          const result = await realContentTransport.submit(intakeId, requestJson, expected);
          if (!firstContentResult) {
            firstContentResult = result;
            throw new Error("E2E_SIMULATED_CONTENT_RESPONSE_LOSS_AFTER_CORE_COMMIT");
          }
          return result;
        },
      };
      let exporterCalls = 0;
      const contentInput = {
        workspaceId: readyPackage.workspaceId,
        readyPackageId: readyPackage.id,
        expectedDigest: readyPackage.evidence.digest,
        submit: true as const,
      };
      const exporter = async () => {
        exporterCalls += 1;
        return structuredClone(frozenExport);
      };
      await expect(
        submitReadyPackageCoreContent(
          contentInput,
          readyPackages,
          submissions,
          exporter,
          lossyContentTransport,
        ),
      ).rejects.toThrow("E2E_SIMULATED_CONTENT_RESPONSE_LOSS_AFTER_CORE_COMMIT");
      const pending = submissions.list(readyPackage.id, readyPackage.workspaceId)[0]!;
      expect(pending.contentDelivery).toMatchObject({
        state: "PENDING",
        coreIntakeId: recoveredIntake.coreIntakeResult.intakeId,
        requestJson: serializeReadyPackageContentExportV1(frozenExport),
      });
      const recoveredContent = await submitReadyPackageCoreContent(
        contentInput,
        readyPackages,
        submissions,
        exporter,
        lossyContentTransport,
      );
      expect(exporterCalls).toBe(1);
      expect(contentAttempts).toHaveLength(2);
      expect(contentAttempts[1]).toEqual(contentAttempts[0]);
      expect(recoveredContent.coreContentResult).toEqual(firstContentResult);
      expect(recoveredContent.coreContentResult.status).toBe("ACCEPTED");
      expect(recoveredContent.submission.contentDelivery?.state).toBe("RESULT_RECORDED");
    } finally {
      database.close();
    }
  });
});
