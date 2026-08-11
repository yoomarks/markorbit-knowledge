import { createHash } from "node:crypto";
import {
  READY_PACKAGE_CONTENT_EXPORT_V2_OBJECT_TYPE,
  READY_PACKAGE_CONTENT_EXPORT_V2_VERSION,
  assertReadyPackageContentExportV2,
  type CanonicalDownstreamDocumentV1,
  type ReadyPackageContentExportV2,
  type ReadyPackageV2,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
} from "@markorbit/persistence";
import type { CanonicalDownstreamDocumentRepository } from "@markorbit/persistence/canonical-downstream-documents";
import type { ReadyPackageV2RegistryRepository } from "@markorbit/persistence/ready-packages-v2";
import type { VaultOriginStagingRepository } from "@markorbit/persistence/vault-import-executions";

export type ReadyPackageContentExportV2Input = {
  workspaceId: string;
  readyPackageId: string;
};

export type ReadyPackageContentExportV2Repositories = {
  readyPackages: Pick<ReadyPackageV2RegistryRepository, "getById">;
  canonical: Pick<CanonicalDownstreamDocumentRepository, "getById">;
  staging: Pick<VaultOriginStagingRepository, "readContent">;
};

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

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function required(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function evidenceBase(canonical: CanonicalDownstreamDocumentV1) {
  return {
    canonicalDocumentId: canonical.id,
    canonicalPromotedAt: canonical.promotedAt,
    origin: {
      ...canonical.origin,
      binding: { ...canonical.origin.binding },
    },
    content: { ...canonical.content },
    legalTruthVerified: false as const,
  };
}

function verifyReadyPackageAgainstCanonical(
  readyPackage: ReadyPackageV2,
  canonical: CanonicalDownstreamDocumentV1,
): void {
  if (readyPackage.status !== "VERIFIED" || canonical.status !== "READY") {
    throw new RegistryConflictError(
      "READY_PACKAGE_V2_CONTENT_EXPORT_NOT_READY",
      "Content Export V2 requires a VERIFIED ReadyPackage V2 over a READY canonical document",
    );
  }
  const base = evidenceBase(canonical);
  const expectedDigest = sha256(stable(base));
  const frozen = {
    canonicalDocumentId: readyPackage.evidence.canonicalDocumentId,
    canonicalPromotedAt: readyPackage.evidence.canonicalPromotedAt,
    origin: readyPackage.evidence.origin,
    content: readyPackage.evidence.content,
    legalTruthVerified: readyPackage.evidence.legalTruthVerified,
  };
  if (
    readyPackage.workspaceId !== canonical.workspaceId ||
    stable(frozen) !== stable(base) ||
    readyPackage.evidence.digest !== expectedDigest
  ) {
    throw new RegistryConflictError(
      "READY_PACKAGE_V2_CONTENT_EXPORT_EVIDENCE_MISMATCH",
      "ReadyPackage V2 no longer matches its authoritative canonical downstream document",
    );
  }
}

export function buildReadyPackageContentExportV2(
  input: ReadyPackageContentExportV2Input,
  repositories: ReadyPackageContentExportV2Repositories,
): ReadyPackageContentExportV2 {
  const workspaceId = required(input.workspaceId, "workspaceId");
  const readyPackageId = required(input.readyPackageId, "readyPackageId");
  const readyPackage = repositories.readyPackages.getById(workspaceId, readyPackageId);
  if (!readyPackage) {
    throw new RegistryError(
      "READY_PACKAGE_V2_NOT_FOUND",
      `ReadyPackage V2 ${readyPackageId} was not found`,
    );
  }

  const canonical = repositories.canonical.getById(
    workspaceId,
    readyPackage.evidence.canonicalDocumentId,
  );
  if (!canonical) {
    throw new RegistryConflictError(
      "READY_PACKAGE_V2_CANONICAL_DOCUMENT_MISSING",
      "ReadyPackage V2 authoritative canonical document is unavailable",
    );
  }
  verifyReadyPackageAgainstCanonical(readyPackage, canonical);

  const bytes = repositories.staging.readContent(
    workspaceId,
    canonical.origin.vaultStagingDocumentId,
  );
  if (bytes.byteLength !== canonical.content.sizeBytes || sha256(bytes) !== canonical.content.sha256) {
    throw new RegistryConflictError(
      "READY_PACKAGE_V2_CONTENT_EXPORT_BYTES_MISMATCH",
      "Canonical Markdown bytes no longer match the frozen ReadyPackage V2 evidence",
    );
  }

  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new RegistryConflictError(
      "READY_PACKAGE_V2_CONTENT_EXPORT_ENCODING_INVALID",
      "Canonical Markdown is not valid UTF-8",
    );
  }

  const exported: ReadyPackageContentExportV2 = {
    contractVersion: READY_PACKAGE_CONTENT_EXPORT_V2_VERSION,
    objectType: READY_PACKAGE_CONTENT_EXPORT_V2_OBJECT_TYPE,
    readyPackageId: readyPackage.id,
    knowledgeWorkspaceId: workspaceId,
    readyPackageDigest: readyPackage.evidence.digest,
    canonicalDocument: {
      documentId: canonical.id,
      promotedAt: canonical.promotedAt,
    },
    provenance: {
      origin: {
        ...canonical.origin,
        binding: { ...canonical.origin.binding },
      },
      legalTruthVerified: false,
    },
    content: {
      ...canonical.content,
      content,
    },
  };
  assertReadyPackageContentExportV2(exported);
  return exported;
}
