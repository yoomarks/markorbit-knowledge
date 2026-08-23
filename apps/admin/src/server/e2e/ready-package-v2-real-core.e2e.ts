import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { CanonicalDownstreamDocumentV1 } from "@markorbit/contracts";
import { DEFAULT_WORKSPACE, openRegistryDatabase } from "@markorbit/persistence";
import { SqliteCanonicalDownstreamDocumentRepository } from "@markorbit/persistence/canonical-downstream-documents";
import { SqliteCoreWorkspaceBindingRepository } from "@markorbit/persistence/core-workspace-bindings";
import {
  SqliteReadyPackageV2DeliverySubmissionRepository,
  type ReadyPackageV2DeliverySubmissionRepository,
} from "@markorbit/persistence/ready-package-v2-deliveries";
import { SqliteReadyPackageV2RegistryRepository } from "@markorbit/persistence/ready-packages-v2";
import {
  HttpReadyPackageV2DeliveryTransport,
  type ReadyPackageV2DeliveryTransport,
} from "../ready-package-v2-delivery-http-transport";
import { ReadyPackageV2DeliveryService } from "../ready-package-v2-delivery-service";

const MARKDOWN = "# Knowledge/Core KV2 WP05\n\nDurable cross-repo acceptance evidence.\n";
const CONTENT = new TextEncoder().encode(MARKDOWN);
const CONTENT_SHA = createHash("sha256").update(CONTENT).digest("hex");
const CANONICAL_ID = "cdd_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const STAGING_ID = "vst_01ARZ3NDEKTSV4RRFFQ69G5FAV";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the ReadyPackage V2 real Core E2E test`);
  return value;
}

function canonicalDocument(): CanonicalDownstreamDocumentV1 {
  return {
    contractVersion: "1.0",
    objectType: "CANONICAL_DOWNSTREAM_DOCUMENT",
    id: CANONICAL_ID,
    workspaceId: DEFAULT_WORKSPACE.id,
    status: "READY",
    origin: {
      kind: "VAULT_IMPORT",
      inspectionRunId: "vin_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      importIntentId: "vmi_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      importExecutionId: "vie_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      vaultStagingDocumentId: STAGING_ID,
      verificationId: "vsv_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      verificationOutcome: "PASS",
      finalizationId: "vsf_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      rootFingerprintSha256: "b".repeat(64),
      binding: {
        bindingId: "vlt_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        revision: 1,
        relativeRoot: "MarkOrbit/Review",
      },
      vaultRelativePath: "MarkOrbit/Review/kv2-wp05.md",
      bindingRelativePath: "kv2-wp05.md",
      observedAt: "2026-08-23T05:00:00.000Z",
      reviewedAt: "2026-08-23T05:01:00.000Z",
      importedAt: "2026-08-23T05:02:00.000Z",
      verifiedAt: "2026-08-23T05:03:00.000Z",
    },
    content: {
      sha256: CONTENT_SHA,
      sizeBytes: CONTENT.byteLength,
      contentAddressedRef: `cas:sha256:${CONTENT_SHA}`,
      mediaType: "text/markdown",
      encoding: "utf-8",
    },
    legalTruthVerified: false,
    promotedAt: "2026-08-23T05:04:00.000Z",
  };
}

function seedCanonicalDocument(
  database: DatabaseSync,
  canonical: SqliteCanonicalDownstreamDocumentRepository,
): CanonicalDownstreamDocumentV1 {
  const existing = canonical.getById(DEFAULT_WORKSPACE.id, CANONICAL_ID);
  if (existing) return existing;
  const document = canonicalDocument();
  database
    .prepare(
      `INSERT INTO canonical_downstream_documents
       (id, workspace_id, origin_kind, vault_staging_document_id, import_intent_id,
        verification_id, finalization_id, content_sha256, frozen_digest, status,
        document_json, promoted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      document.id,
      document.workspaceId,
      document.origin.kind,
      document.origin.vaultStagingDocumentId,
      document.origin.importIntentId,
      document.origin.verificationId,
      document.origin.finalizationId,
      document.content.sha256,
      createHash("sha256").update(JSON.stringify(document)).digest("hex"),
      document.status,
      JSON.stringify(document),
      document.promotedAt,
    );
  return document;
}

type Harness = {
  database: DatabaseSync;
  readyPackageId: string;
  deliveries: ReadyPackageV2DeliverySubmissionRepository;
  service: ReadyPackageV2DeliveryService;
};

function openHarness(
  databasePath: string,
  coreWorkspaceId: string,
  transport: ReadyPackageV2DeliveryTransport,
): Harness {
  const database = openRegistryDatabase(databasePath);
  const canonical = new SqliteCanonicalDownstreamDocumentRepository(database);
  const document = seedCanonicalDocument(database, canonical);
  const readyPackages = new SqliteReadyPackageV2RegistryRepository(database, canonical);
  const readyPackage = readyPackages.createFromCanonical({
    workspaceId: DEFAULT_WORKSPACE.id,
    canonicalDocumentId: document.id,
  }).readyPackage;
  const bindings = new SqliteCoreWorkspaceBindingRepository(database);
  bindings.bind(DEFAULT_WORKSPACE.id, coreWorkspaceId);
  const deliveries = new SqliteReadyPackageV2DeliverySubmissionRepository(database);
  const staging = {
    readContent(workspaceId: string, documentId: string) {
      if (workspaceId !== DEFAULT_WORKSPACE.id || documentId !== STAGING_ID) {
        throw new Error("Unexpected WP05 staging lookup");
      }
      return CONTENT;
    },
  };
  const service = new ReadyPackageV2DeliveryService({
    readyPackages,
    canonical,
    staging,
    bindings,
    deliveries,
    transport,
  });
  return { database, readyPackageId: readyPackage.id, deliveries, service };
}

function realTransport(): {
  transport: HttpReadyPackageV2DeliveryTransport;
  coreWorkspaceId: string;
} {
  const deliveryUrl = requiredEnvironment("MARKORBIT_CORE_V2_DELIVERY_URL");
  const secret = requiredEnvironment("MARKORBIT_CORE_INTERNAL_SECRET");
  requiredEnvironment("MARKORBIT_CORE_V2_PROTOCOL_VERSION");
  const coreWorkspaceId = requiredEnvironment("MARKORBIT_E2E_CORE_WORKSPACE_ID").toLowerCase();
  return {
    transport: new HttpReadyPackageV2DeliveryTransport(deliveryUrl, secret, fetch, 10_000),
    coreWorkspaceId,
  };
}

function temporaryDatabase(): { directory: string; databasePath: string } {
  const directory = mkdtempSync(join(tmpdir(), "markorbit-kv2-wp05-"));
  return { directory, databasePath: join(directory, "knowledge.sqlite") };
}

describe.sequential("Knowledge ReadyPackage V2 -> real Core", () => {
  it("E2E-01 durably accepts a valid V2 delivery and replays it without another network call", async () => {
    const { directory, databasePath } = temporaryDatabase();
    const { transport, coreWorkspaceId } = realTransport();
    let harness: Harness | null = null;
    try {
      harness = openHarness(databasePath, coreWorkspaceId, transport);
      harness.service.prepare(DEFAULT_WORKSPACE.id, harness.readyPackageId);
      const accepted = await harness.service.submit(DEFAULT_WORKSPACE.id, harness.readyPackageId);
      expect(accepted.transportUsed).toBe(true);
      expect(accepted.submission.state).toBe("RESULT_RECORDED");
      expect(accepted.submission.result?.status).toBe("ACCEPTED");

      const persistedRequestSha = accepted.submission.requestSha256;
      harness.database.close();
      harness = openHarness(databasePath, coreWorkspaceId, transport);
      const replayed = await harness.service.submit(DEFAULT_WORKSPACE.id, harness.readyPackageId);
      expect(replayed.transportUsed).toBe(false);
      expect(replayed.replayed).toBe(true);
      expect(replayed.submission.requestSha256).toBe(persistedRequestSha);
      expect(replayed.submission.result?.status).toBe("ACCEPTED");
    } finally {
      harness?.database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("E2E-02 restarts after durable Core acceptance and finalizes locally without network", async () => {
    const { directory, databasePath } = temporaryDatabase();
    const { transport, coreWorkspaceId } = realTransport();
    let harness: Harness | null = null;
    try {
      harness = openHarness(databasePath, coreWorkspaceId, transport);
      const prepared = harness.service.prepare(DEFAULT_WORKSPACE.id, harness.readyPackageId).submission;
      const attempted = harness.deliveries.markTransportAttempt(
        DEFAULT_WORKSPACE.id,
        prepared.submissionId,
      );
      const coreResult = await transport.submit(attempted.requestJson, attempted.idempotencyKey);
      expect(coreResult.status).toBe("ACCEPTED");
      const transportRecorded = harness.deliveries.recordTransportResult(
        DEFAULT_WORKSPACE.id,
        attempted.submissionId,
        coreResult,
      );
      expect(transportRecorded.state).toBe("PENDING");
      expect(transportRecorded.transportResult?.status).toBe("ACCEPTED");
      expect(transportRecorded.result).toBeUndefined();

      harness.database.close();
      const forbiddenTransport: ReadyPackageV2DeliveryTransport = {
        async submit() {
          throw new Error("E2E-02 must finalize locally without network after restart");
        },
      };
      harness = openHarness(databasePath, coreWorkspaceId, forbiddenTransport);
      const finalized = await harness.service.submit(DEFAULT_WORKSPACE.id, harness.readyPackageId);
      expect(finalized.transportUsed).toBe(false);
      expect(finalized.replayed).toBe(true);
      expect(finalized.submission.state).toBe("RESULT_RECORDED");
      expect(finalized.submission.result?.status).toBe("ACCEPTED");
    } finally {
      harness?.database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("E2E-03 retries the exact frozen request after the first Core response is lost", async () => {
    const { directory, databasePath } = temporaryDatabase();
    const { transport: real, coreWorkspaceId } = realTransport();
    const attempts: Array<{ requestJson: string; idempotencyKey: string }> = [];
    let firstCoreStatus: string | null = null;
    const lossyTransport: ReadyPackageV2DeliveryTransport = {
      async submit(requestJson, idempotencyKey) {
        attempts.push({ requestJson, idempotencyKey });
        const result = await real.submit(requestJson, idempotencyKey);
        if (firstCoreStatus === null) {
          firstCoreStatus = result.status;
          throw new Error("E2E_SIMULATED_V2_RESPONSE_LOSS_AFTER_CORE_COMMIT");
        }
        return result;
      },
    };
    let harness: Harness | null = null;
    try {
      harness = openHarness(databasePath, coreWorkspaceId, lossyTransport);
      harness.service.prepare(DEFAULT_WORKSPACE.id, harness.readyPackageId);
      await expect(
        harness.service.submit(DEFAULT_WORKSPACE.id, harness.readyPackageId),
      ).rejects.toThrow("E2E_SIMULATED_V2_RESPONSE_LOSS_AFTER_CORE_COMMIT");

      const recovered = await harness.service.submit(DEFAULT_WORKSPACE.id, harness.readyPackageId);
      expect(firstCoreStatus).toBe("ACCEPTED");
      expect(attempts).toHaveLength(2);
      expect(attempts[1]).toEqual(attempts[0]);
      expect(recovered.submission.result?.status).toBe("ACCEPTED");
      expect(recovered.submission.transportAttempts).toBe(2);
    } finally {
      harness?.database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
