import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  CanonicalDownstreamDocumentV1,
  ReadyPackageV2,
} from "@markorbit/contracts";
import {
  buildReadyPackageContentExportV2,
  type ReadyPackageContentExportV2Repositories,
} from "../ready-package-content-export-v2";

const CONTENT = new TextEncoder().encode("# K13\nVault origin\n");
const CONTENT_SHA = createHash("sha256").update(CONTENT).digest("hex");

function stable(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function canonical(): CanonicalDownstreamDocumentV1 {
  return {
    contractVersion: "1.0",
    objectType: "CANONICAL_DOWNSTREAM_DOCUMENT",
    id: "cdd_01K13TEST000000000000000001",
    workspaceId: "wsp_01K13TEST000000000000000001",
    status: "READY",
    origin: {
      kind: "VAULT_IMPORT",
      inspectionRunId: "vin_01K13TEST000000000000000001",
      importIntentId: "vmi_01K13TEST000000000000000001",
      importExecutionId: "vie_01K13TEST000000000000000001",
      vaultStagingDocumentId: "vst_01K13TEST000000000000000001",
      verificationId: "vsv_01K13TEST000000000000000001",
      verificationOutcome: "PASS_WITH_WARNINGS",
      finalizationId: "vsf_01K13TEST000000000000000001",
      rootFingerprintSha256: "b".repeat(64),
      binding: {
        bindingId: "vlt_01K13TEST000000000000000001",
        revision: 2,
        relativeRoot: "MarkOrbit/Review",
      },
      vaultRelativePath: "MarkOrbit/Review/incoming/k13.md",
      bindingRelativePath: "incoming/k13.md",
      observedAt: "2026-08-11T15:00:00.000Z",
      reviewedAt: "2026-08-11T15:05:00.000Z",
      importedAt: "2026-08-11T15:10:00.000Z",
      verifiedAt: "2026-08-11T15:15:00.000Z",
    },
    content: {
      sha256: CONTENT_SHA,
      sizeBytes: CONTENT.byteLength,
      contentAddressedRef: `cas:sha256:${CONTENT_SHA}`,
      mediaType: "text/markdown",
      encoding: "utf-8",
    },
    legalTruthVerified: false,
    promotedAt: "2026-08-11T15:20:00.000Z",
  };
}

function readyPackage(document = canonical()): ReadyPackageV2 {
  const base = {
    canonicalDocumentId: document.id,
    canonicalPromotedAt: document.promotedAt,
    origin: document.origin,
    content: document.content,
    legalTruthVerified: false as const,
  };
  return {
    contractVersion: "2.0",
    objectType: "READY_PACKAGE",
    id: "rdp_01K13TEST000000000000000001",
    workspaceId: document.workspaceId,
    status: "VERIFIED",
    evidence: {
      ...base,
      digest: createHash("sha256").update(stable(base)).digest("hex"),
    },
    createdAt: "2026-08-11T15:25:00.000Z",
  };
}

function repositories(
  document = canonical(),
  pkg = readyPackage(document),
  content = CONTENT,
): ReadyPackageContentExportV2Repositories {
  return {
    readyPackages: {
      getById: (workspaceId, readyPackageId) =>
        workspaceId === pkg.workspaceId && readyPackageId === pkg.id ? pkg : null,
    },
    canonical: {
      getById: (workspaceId, documentId) =>
        workspaceId === document.workspaceId && documentId === document.id ? document : null,
    },
    staging: {
      readContent: (workspaceId, documentId) => {
        if (
          workspaceId !== document.workspaceId ||
          documentId !== document.origin.vaultStagingDocumentId
        ) {
          throw new Error("unexpected Staging lookup");
        }
        return content;
      },
    },
  };
}

describe("ReadyPackage Content Export V2", () => {
  it("exports the exact Vault provenance and verified Markdown without conversion fields", () => {
    const document = canonical();
    const pkg = readyPackage(document);
    const exported = buildReadyPackageContentExportV2(
      { workspaceId: document.workspaceId, readyPackageId: pkg.id },
      repositories(document, pkg),
    );

    expect(exported.contractVersion).toBe("2.0");
    expect(exported.readyPackageDigest).toBe(pkg.evidence.digest);
    expect(exported.canonicalDocument.documentId).toBe(document.id);
    expect(exported.provenance.origin).toEqual(document.origin);
    expect(exported.content.content).toBe(new TextDecoder().decode(CONTENT));
    expect(JSON.stringify(exported)).not.toMatch(
      /sourceId|rawArtifactId|conversionRunId|workerId|converterId/u,
    );
  });

  it("rejects package evidence drift from the authoritative canonical document", () => {
    const document = canonical();
    const pkg = readyPackage(document);
    const tampered: ReadyPackageV2 = {
      ...pkg,
      evidence: {
        ...pkg.evidence,
        canonicalPromotedAt: "2026-08-11T15:21:00.000Z",
      },
    };
    expect(() =>
      buildReadyPackageContentExportV2(
        { workspaceId: document.workspaceId, readyPackageId: pkg.id },
        repositories(document, tampered),
      ),
    ).toThrowError(/no longer matches its authoritative canonical/u);
  });

  it("rejects CAS bytes that no longer match the frozen canonical content hash", () => {
    const document = canonical();
    const pkg = readyPackage(document);
    expect(() =>
      buildReadyPackageContentExportV2(
        { workspaceId: document.workspaceId, readyPackageId: pkg.id },
        repositories(document, pkg, new TextEncoder().encode("changed")),
      ),
    ).toThrowError(/bytes no longer match/u);
  });

  it("rejects cross-workspace package lookup", () => {
    const document = canonical();
    const pkg = readyPackage(document);
    expect(() =>
      buildReadyPackageContentExportV2(
        { workspaceId: "wsp_other", readyPackageId: pkg.id },
        repositories(document, pkg),
      ),
    ).toThrowError(/was not found/u);
  });
});
