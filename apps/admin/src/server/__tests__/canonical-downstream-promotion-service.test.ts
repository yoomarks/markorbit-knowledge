import { describe, expect, it } from "vitest";
import type { CanonicalDownstreamDocumentV1 } from "@markorbit/contracts";
import type { CanonicalDownstreamDocumentRepository } from "@markorbit/persistence/canonical-downstream-documents";
import type {
  VaultImportExecutionRepository,
  VaultOriginStagingRepository,
} from "@markorbit/persistence/vault-import-executions";
import type { VaultImportIntentRepository } from "@markorbit/persistence/vault-import-intents";
import type { VaultOriginStagingVerificationRepository } from "@markorbit/persistence/vault-origin-staging-verification";
import { CanonicalDownstreamPromotionService } from "../canonical-downstream-promotion-service";

const DOCUMENT: CanonicalDownstreamDocumentV1 = {
  contractVersion: "1.0",
  objectType: "CANONICAL_DOWNSTREAM_DOCUMENT",
  id: "cdd_01K12TEST000000000000000099",
  workspaceId: "wsp_01H00000000000000000000000",
  status: "READY",
  origin: {
    kind: "VAULT_IMPORT",
    inspectionRunId: "vin_01K12TEST000000000000000099",
    importIntentId: "vmi_01K12TEST000000000000000099",
    importExecutionId: "vie_01K12TEST000000000000000099",
    vaultStagingDocumentId: "vst_01K12TEST000000000000000099",
    verificationId: "vsv_01K12TEST000000000000000099",
    verificationOutcome: "PASS",
    finalizationId: "vsf_01K12TEST000000000000000099",
    rootFingerprintSha256: "a".repeat(64),
    binding: {
      bindingId: "vlt_01K12TEST000000000000000099",
      revision: 1,
      relativeRoot: "MarkOrbit/Review",
    },
    vaultRelativePath: "MarkOrbit/Review/existing.md",
    bindingRelativePath: "existing.md",
    observedAt: "2026-08-11T15:00:00.000Z",
    reviewedAt: "2026-08-11T15:01:00.000Z",
    importedAt: "2026-08-11T15:02:00.000Z",
    verifiedAt: "2026-08-11T15:03:00.000Z",
  },
  content: {
    sha256: "b".repeat(64),
    sizeBytes: 12,
    contentAddressedRef: `cas:sha256:${"b".repeat(64)}`,
    mediaType: "text/markdown",
    encoding: "utf-8",
  },
  legalTruthVerified: false,
  promotedAt: "2026-08-11T15:04:00.000Z",
};

describe("CanonicalDownstreamPromotionService", () => {
  it("replays an existing promotion before touching K08-K11 ledgers or CAS", () => {
    let casReads = 0;
    const canonical: CanonicalDownstreamDocumentRepository = {
      promoteVaultImport() {
        throw new Error("promotion should not run on replay");
      },
      getById() {
        return DOCUMENT;
      },
      getByVaultStagingDocument() {
        return DOCUMENT;
      },
      list() {
        return [DOCUMENT];
      },
    };
    const staging = {
      readContent() {
        casReads += 1;
        throw new Error("CAS should not be read on replay");
      },
    } as unknown as VaultOriginStagingRepository;

    const service = new CanonicalDownstreamPromotionService({
      intents: {} as VaultImportIntentRepository,
      executions: {} as VaultImportExecutionRepository,
      staging,
      verifications: {} as VaultOriginStagingVerificationRepository,
      canonical,
    });

    expect(service.promote(DOCUMENT.workspaceId, DOCUMENT.origin.vaultStagingDocumentId)).toEqual({
      document: DOCUMENT,
      replayed: true,
    });
    expect(casReads).toBe(0);
  });
});
