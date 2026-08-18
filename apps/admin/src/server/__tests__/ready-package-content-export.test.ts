import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  serializeReadyPackageContentExportV1_1,
  type RawArtifact,
  type ReadyPackage,
  type SourceDefinition,
  type StagingDocumentDescriptor,
} from "@markorbit/contracts";
import type { RawArtifactView } from "@markorbit/persistence/raw-artifacts";
import type { StagingDocumentRecord } from "@markorbit/persistence/staging-content";
import { buildReadyPackageContentExportV1 } from "../ready-package-content-export";

const WORKSPACE_ID = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const READY_PACKAGE_ID = "rdp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const SOURCE_ID = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const CONVERSION_RUN_ID = "cvr_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const STAGING_ID = "std_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const VERIFICATION_ID = "svr_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const CONVERTER = { converterId: "builtin-markdown-staging", version: "1.0.0" };

const directories: string[] = [];

afterEach(() => {
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true });
});

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

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

function sourceDefinition(): SourceDefinition {
  return {
    schemaVersion: "1.0",
    objectType: "SOURCE_DEFINITION",
    id: SOURCE_ID,
    workspaceId: WORKSPACE_ID,
    name: "Fixture source",
    slug: "fixture-source",
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    connectorConfig: {},
    entrypoints: [{ uri: "https://example.test/source" }],
    tags: [],
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
  };
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "markorbit-ready-package-export-"));
  directories.push(directory);
  const rawPath = join(directory, "source.pdf");
  const rawBytes = Buffer.from("immutable raw source bytes", "utf8");
  const stagingBytes = Buffer.from("# Canonical source\n\nFrozen body.\n", "utf8");
  writeFileSync(rawPath, rawBytes);
  const rawSha256 = sha256(rawBytes);
  const stagingSha256 = sha256(stagingBytes);
  const evidenceBase = {
    artifactIds: [ARTIFACT_ID],
    stagingDocumentId: STAGING_ID,
    sourceId: SOURCE_ID,
    conversionRunId: CONVERSION_RUN_ID,
    rawArtifactSha256: rawSha256,
    stagingSha256,
    verificationId: VERIFICATION_ID,
    verificationOutcome: "PASS" as const,
    converter: CONVERTER,
    capturedAt: "2026-08-11T01:00:00.000Z",
    legalTruthVerified: false as const,
  };
  const readyPackage: ReadyPackage = {
    id: READY_PACKAGE_ID,
    workspaceId: WORKSPACE_ID,
    status: "VERIFIED",
    evidence: { ...evidenceBase, digest: sha256(stable(evidenceBase)) },
    createdAt: "2026-08-11T01:10:00.000Z",
    verifiedAt: "2026-08-11T01:11:00.000Z",
  };
  const artifact = {
    artifact: {
      id: ARTIFACT_ID,
      workspaceId: WORKSPACE_ID,
      sourceId: SOURCE_ID,
      binaryHash: { algorithm: "SHA-256", value: rawSha256 },
      sizeBytes: rawBytes.byteLength,
      mimeType: "application/pdf",
      originalName: "source.pdf",
    } as RawArtifact,
    contentObject: {
      sha256: rawSha256,
      sizeBytes: rawBytes.byteLength,
    },
  } as RawArtifactView;
  const stagingRecord = {
    descriptor: {
      id: STAGING_ID,
      workspaceId: WORKSPACE_ID,
      sourceId: SOURCE_ID,
      rawArtifactId: ARTIFACT_ID,
      conversionRunId: CONVERSION_RUN_ID,
      outputFormat: "MARKDOWN",
      contentHash: { algorithm: "SHA-256", value: stagingSha256 },
      sizeBytes: stagingBytes.byteLength,
      converter: CONVERTER,
    } as StagingDocumentDescriptor,
  } as StagingDocumentRecord;
  const source = sourceDefinition();
  const repositories = {
    readyPackages: {
      getById: (id: string, workspaceId: string) =>
        id === READY_PACKAGE_ID && workspaceId === WORKSPACE_ID ? readyPackage : null,
    },
    rawArtifacts: {
      getArtifact: (id: string) => (id === ARTIFACT_ID ? artifact : null),
      contentPath: () => ({
        path: rawPath,
        mimeType: "application/pdf",
        originalName: "source.pdf",
        sizeBytes: rawBytes.byteLength,
      }),
    },
    staging: {
      getDocument: (id: string, workspaceId: string) =>
        id === STAGING_ID && workspaceId === WORKSPACE_ID ? stagingRecord : null,
      readContent: () => new Uint8Array(stagingBytes),
    },
    sources: {
      getById: (id: string) => (id === SOURCE_ID ? source : null),
    },
  };
  return { readyPackage, repositories, rawPath, stagingRecord, source };
}

const input = { workspaceId: WORKSPACE_ID, readyPackageId: READY_PACKAGE_ID };

describe("ReadyPackage Content Export V1.1 builder", () => {
  it("exports canonical Markdown plus a standard Source governance snapshot", async () => {
    const { readyPackage, repositories } = fixture();
    const verified = await buildReadyPackageContentExportV1(input, repositories);
    readyPackage.status = "HANDED_OFF";
    readyPackage.handedOffAt = "2026-08-11T01:20:00.000Z";
    const handedOff = await buildReadyPackageContentExportV1(input, repositories);

    expect(serializeReadyPackageContentExportV1_1(handedOff)).toBe(
      serializeReadyPackageContentExportV1_1(verified),
    );
    expect(handedOff.contractVersion).toBe("1.1");
    expect(handedOff.sourceGovernance).toEqual({
      snapshotVersion: "1.0",
      kind: "STANDARD_SOURCE",
      sourceId: SOURCE_ID,
    });
    expect(handedOff.provenance.legalTruthVerified).toBe(false);
    expect(handedOff.stagingDocument.content).toBe("# Canonical source\n\nFrozen body.\n");
  });

  it("freezes Global Reference governance from Source extensions and never from a live catalog lookup", async () => {
    const { repositories, source } = fixture();
    source.tags = ["global-reference-source"];
    source.extensions = {
      "x-markorbit-reference-protocol-version": "1.0",
      "x-markorbit-reference-role": "TM_PRACTICE_GUIDE",
      "x-markorbit-reference-authority-tier": "B_PLUS",
      "x-markorbit-reference-intended-uses": ["TRADEMARK_PROFILE"],
      "x-markorbit-reference-fact-eligibility": "SECONDARY",
      "x-markorbit-reference-verification-policy": "REQUIRED",
      "x-markorbit-reference-verify-official-source": true,
      "x-markorbit-reference-verification-source-ids": ["official-fixture"],
      "x-markorbit-reference-content-reuse-policy": "FACT_EXTRACTION_WITH_PROVENANCE",
    };

    const exported = await buildReadyPackageContentExportV1(input, repositories);
    expect(exported.sourceGovernance).toEqual({
      snapshotVersion: "1.0",
      kind: "GLOBAL_REFERENCE",
      sourceId: SOURCE_ID,
      referenceProtocolVersion: "1.0",
      sourceRole: "TM_PRACTICE_GUIDE",
      authorityTier: "B_PLUS",
      intendedUses: ["TRADEMARK_PROFILE"],
      factEligibility: "SECONDARY",
      verification: {
        policy: "REQUIRED",
        verifyAgainstSourceIds: ["official-fixture"],
        verifyAgainstJurisdictionOfficialSource: true,
      },
      contentReusePolicy: "FACT_EXTRACTION_WITH_PROVENANCE",
    });
  });

  it("fails closed when a tagged Global Reference Source has incomplete governance", async () => {
    const { repositories, source } = fixture();
    source.tags = ["global-reference-source"];
    source.extensions = {
      "x-markorbit-reference-protocol-version": "1.0",
      "x-markorbit-reference-role": "TM_PRACTICE_GUIDE",
    };
    await expect(buildReadyPackageContentExportV1(input, repositories)).rejects.toMatchObject({
      code: "GLOBAL_REFERENCE_SOURCE_GOVERNANCE_INVALID",
    });
  });

  it("fails closed when the frozen Source itself is unavailable", async () => {
    const { repositories } = fixture();
    repositories.sources.getById = () => null;
    await expect(buildReadyPackageContentExportV1(input, repositories)).rejects.toMatchObject({
      code: "READY_PACKAGE_CONTENT_EXPORT_SOURCE_MISSING",
    });
  });

  it("fails closed when raw artifact bytes drift from frozen evidence", async () => {
    const { repositories, rawPath } = fixture();
    writeFileSync(rawPath, "tampered raw source", "utf8");
    await expect(buildReadyPackageContentExportV1(input, repositories)).rejects.toMatchObject({
      code: "READY_PACKAGE_CONTENT_EXPORT_RAW_ARTIFACT_BYTES_MISMATCH",
    });
  });

  it("fails closed when staging bytes drift from frozen evidence", async () => {
    const { repositories } = fixture();
    repositories.staging.readContent = () => new Uint8Array(Buffer.from("# Tampered\n", "utf8"));
    await expect(buildReadyPackageContentExportV1(input, repositories)).rejects.toMatchObject({
      code: "READY_PACKAGE_CONTENT_EXPORT_STAGING_BYTES_MISMATCH",
    });
  });

  it("fails closed when frozen ReadyPackage evidence no longer matches its digest", async () => {
    const { readyPackage, repositories } = fixture();
    readyPackage.evidence.capturedAt = "2026-08-11T01:00:01.000Z";
    await expect(buildReadyPackageContentExportV1(input, repositories)).rejects.toMatchObject({
      code: "READY_PACKAGE_CONTENT_EXPORT_DIGEST_MISMATCH",
    });
  });
});