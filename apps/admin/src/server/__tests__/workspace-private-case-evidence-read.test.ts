import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  serializeReadyPackageContentExportV1_1,
  type ReadyPackageContentExportV1_1,
  type RetrievalChunk,
  type RetrievalDocument,
  type WorkspacePrivateCaseEvidenceReadGrantV1,
} from "@markorbit/contracts";
import {
  authenticateWorkspacePrivateCaseEvidenceReadRequest,
  WorkspacePrivateCaseEvidenceReadError,
  type WorkspacePrivateCaseEvidenceReadOptions,
} from "../workspace-private-case-evidence-read";

const now = new Date("2026-10-02T10:00:30.000Z");
const coreWorkspaceId = "018f0000-0000-7000-8000-000000000002";
const userId = "018f0000-0000-7000-8000-000000000003";
const membershipId = "018f0000-0000-7000-8000-000000000004";
const knowledgeWorkspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAW";
const secret = "workspace-private-test-internal-service-secret";
const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

const exported: ReadyPackageContentExportV1_1 = {
  contractVersion: "1.1",
  objectType: "READY_PACKAGE_CONTENT_EXPORT",
  readyPackageId: "rdp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  knowledgeWorkspaceId,
  readyPackageDigest: sha256("ready-package"),
  provenance: {
    sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    conversionRunId: "cvr_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    verificationId: "svr_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    verificationOutcome: "PASS",
    capturedAt: "2026-10-02T09:00:00.000Z",
    converter: { converterId: "builtin-text-markdown", version: "1.0.0" },
    legalTruthVerified: false,
  },
  rawArtifact: {
    artifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    sha256: sha256("raw"),
    sizeBytes: 3,
    mimeType: "text/plain",
    originalName: "private.txt",
  },
  stagingDocument: {
    documentId: "std_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    sha256: sha256("private canonical content"),
    sizeBytes: Buffer.byteLength("private canonical content"),
    mediaType: "text/markdown",
    encoding: "utf-8",
    content: "private canonical content",
  },
  sourceGovernance: {
    snapshotVersion: "1.0",
    kind: "STANDARD_SOURCE",
    sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  },
};

const document: RetrievalDocument = {
  protocolVersion: "1.0",
  objectType: "RETRIEVAL_DOCUMENT",
  documentId: "doc_private_001",
  workspaceId: knowledgeWorkspaceId,
  sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  stagingDocumentId: exported.stagingDocument.documentId,
  readyPackageId: exported.readyPackageId,
  rawArtifactId: exported.rawArtifact.artifactId,
  logicalDocumentId: "logical_private_001",
  artifactVersion: 3,
  title: "Private evidence",
  targetPath: "private/evidence.md",
  canonicalUri: null,
  sourceUri: "manual-upload://private.txt",
  sourceName: "Private evidence",
  sourceCategory: "USER_PROVIDED",
  authorityLevel: "UNKNOWN",
  jurisdictions: [],
  languages: ["en"],
  capturedAt: "2026-10-02T09:00:00.000Z",
  publishedAt: null,
  contentSha256: exported.stagingDocument.sha256,
  keywords: ["private"],
  chunkCount: 1,
  indexedAt: "2026-10-02T09:01:00.000Z",
  isCurrent: true,
};

const chunkBase = {
  protocolVersion: "1.0",
  objectType: "RETRIEVAL_CHUNK",
  chunkId: "",
  documentId: document.documentId,
  stagingDocumentId: document.stagingDocumentId,
  artifactVersion: document.artifactVersion,
  ordinal: 1,
  headingPath: ["Private evidence"],
  text: "private canonical content",
} as const;
const chunkSha256 = sha256(
  `${chunkBase.stagingDocumentId}\u0000${chunkBase.documentId}\u0000${chunkBase.artifactVersion}\u0000${chunkBase.ordinal}\u0000${chunkBase.headingPath.join("\u0000")}\u0000${chunkBase.text}`,
);
const chunk: RetrievalChunk = {
  ...chunkBase,
  headingPath: [...chunkBase.headingPath],
  chunkId: `rch_${chunkSha256.slice(0, 32)}`,
  contentSha256: chunkSha256,
};

const grant: WorkspacePrivateCaseEvidenceReadGrantV1 = {
  protocolVersion: "1.0",
  objectType: "WORKSPACE_PRIVATE_CASE_EVIDENCE_READ_GRANT",
  bindingId: "018f0000-0000-7000-8000-000000000001",
  bindingVersion: 2,
  workspaceId: coreWorkspaceId,
  userId,
  membershipId,
  knowledgeWorkspaceId,
  readyPackageId: exported.readyPackageId,
  readyPackageDigest: exported.readyPackageDigest,
  coreIntakeId: "intake_private_001",
  contentExportSha256: sha256(serializeReadyPackageContentExportV1_1(exported)),
  stagingDocumentId: exported.stagingDocument.documentId,
  stagingSha256: exported.stagingDocument.sha256,
  rawArtifactId: exported.rawArtifact.artifactId,
  rawArtifactSha256: exported.rawArtifact.sha256,
  caseId: "formal-matter_private_001",
  caseVersion: 1,
  caseSnapshotSha256: sha256("formal-matter"),
  sourceLocators: [chunk.chunkId],
  authoritySnapshot: { workspaceVersion: 1, userVersion: 1, membershipVersion: 1 },
  currentness: {
    workspaceAuthority: "CURRENT",
    formalMatter: "CURRENT",
    coreKnowledgeEvidence: "CURRENT",
    knowledgeRetrieval: "MUST_VERIFY",
  },
  consequences: {
    officialTruthCreated: false,
    filingAuthorized: false,
    externalActionAuthorized: false,
  },
  verifiedAt: "2026-10-02T10:00:00.000Z",
  expiresAt: "2026-10-02T10:01:00.000Z",
};
const readRequest = { bindingId: grant.bindingId, expectedVersion: grant.bindingVersion };

function request(principalOverrides: Record<string, unknown> = {}): Request {
  const principal = {
    kind: "WORKSPACE",
    sessionId: "session_private_001",
    userId,
    workspaceId: coreWorkspaceId,
    membershipId,
    role: "WORKSPACE_ADMIN",
    permissions: ["matter:read"],
    sessionExpiresAt: "2030-01-01T00:00:00.000Z",
    ...principalOverrides,
  };
  return new Request("http://knowledge.local/api/internal/workspace-private-case-evidence/read", {
    method: "POST",
    headers: {
      "x-markorbit-internal-authorization": secret,
      "x-markorbit-principal": Buffer.from(
        JSON.stringify({ schemaVersion: 1, principal }),
      ).toString("base64url"),
    },
  });
}

function options(
  overrides: Partial<WorkspacePrivateCaseEvidenceReadOptions> = {},
): WorkspacePrivateCaseEvidenceReadOptions {
  return {
    internalServiceSecret: secret,
    now: () => now,
    workspaceBindings: {
      getByCoreWorkspaceId: () => ({
        coreWorkspaceId,
        knowledgeWorkspaceId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }),
      getByKnowledgeWorkspaceId: () => ({
        coreWorkspaceId,
        knowledgeWorkspaceId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }),
    },
    assertKnowledgeWorkspaceActive: () => undefined,
    grantTransport: { issue: async () => grant },
    buildContentExport: async () => exported,
    retrieval: {
      getCurrentDocumentByStagingDocumentId: () => document,
      listChunks: () => [chunk],
    },
    ...overrides,
  };
}

describe("Workspace-private exact Case evidence read", () => {
  it("returns only the exact granted current chunk and explicit no-page semantics", async () => {
    const result = await authenticateWorkspacePrivateCaseEvidenceReadRequest(
      request(),
      readRequest,
      options(),
    );
    expect(result).toMatchObject({
      authority: { coreWorkspaceId, knowledgeWorkspaceId },
      document: {
        documentId: document.documentId,
        artifactVersion: document.artifactVersion,
        canonicalSha256: grant.stagingSha256,
        stagingSha256: grant.stagingSha256,
        documentSha256: grant.stagingSha256,
      },
      currentness: { knowledgeRetrieval: "CURRENT", documentVersion: "CURRENT" },
      locatorSemantics: {
        basis: "RETRIEVAL_CHUNK",
        pageNumbers: "UNAVAILABLE",
        textOffsets: "UNAVAILABLE",
      },
      consequences: grant.consequences,
    });
    expect(result.chunks).toEqual([
      expect.objectContaining({
        locator: chunk.chunkId,
        text: chunk.text,
        pageNumber: null,
        textStartOffset: null,
        textEndOffset: null,
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("canonicalMarkdown");
  });

  it("uses 403 for expired or another-principal grants", async () => {
    await expect(
      authenticateWorkspacePrivateCaseEvidenceReadRequest(
        request(),
        readRequest,
        options({
          grantTransport: {
            issue: async () => ({ ...grant, expiresAt: now.toISOString() }),
          },
        }),
      ),
    ).rejects.toMatchObject({ httpStatus: 403 });
    await expect(
      authenticateWorkspacePrivateCaseEvidenceReadRequest(
        request({ userId: "018f0000-0000-7000-8000-000000000099" }),
        readRequest,
        options(),
      ),
    ).rejects.toMatchObject({
      code: "WORKSPACE_PRIVATE_CASE_EVIDENCE_GRANT_PRINCIPAL_MISMATCH",
      httpStatus: 403,
    });
  });

  it("uses 404 for a missing exact retrieval document", async () => {
    await expect(
      authenticateWorkspacePrivateCaseEvidenceReadRequest(
        request(),
        readRequest,
        options({
          retrieval: {
            getCurrentDocumentByStagingDocumentId: () => null,
            listChunks: () => [],
          },
        }),
      ),
    ).rejects.toMatchObject({ httpStatus: 404 });
  });

  it("uses 409 for hash or exact locator drift", async () => {
    await expect(
      authenticateWorkspacePrivateCaseEvidenceReadRequest(
        request(),
        readRequest,
        options({
          grantTransport: {
            issue: async () => ({ ...grant, sourceLocators: ["rch_missing"] }),
          },
        }),
      ),
    ).rejects.toMatchObject({ httpStatus: 409 });
    await expect(
      authenticateWorkspacePrivateCaseEvidenceReadRequest(
        request(),
        readRequest,
        options({
          grantTransport: {
            issue: async () => ({ ...grant, stagingSha256: "f".repeat(64) }),
          },
        }),
      ),
    ).rejects.toMatchObject({ httpStatus: 409 });
  });

  it("uses 503 for retrieval owner failure without logging private content", async () => {
    await expect(
      authenticateWorkspacePrivateCaseEvidenceReadRequest(
        request(),
        readRequest,
        options({
          retrieval: {
            getCurrentDocumentByStagingDocumentId() {
              throw new Error("database unavailable");
            },
            listChunks: () => [],
          },
        }),
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<WorkspacePrivateCaseEvidenceReadError>>({
        code: "WORKSPACE_PRIVATE_CASE_EVIDENCE_SOURCE_UNAVAILABLE",
        httpStatus: 503,
      }),
    );
  });
});
