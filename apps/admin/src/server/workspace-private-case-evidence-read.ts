import { createHash } from "node:crypto";
import {
  assertWorkspacePrivateCaseEvidenceReadRequestV1,
  assertWorkspacePrivateCaseEvidenceReadGrantV1,
  serializeReadyPackageContentExportV1_1,
  type ReadyPackageContentExportV1_1,
  type WorkspacePrivateCaseEvidenceReadGrantV1,
  type WorkspacePrivateCaseEvidenceReadRequestV1,
  type WorkspacePrivateCaseEvidenceReadResultV1,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
} from "@markorbit/persistence";
import type { RetrievalIndexRepository } from "@markorbit/persistence/retrieval-index";
import {
  configuredCoreWorkspacePrivateCaseEvidenceGrantTransport,
  CoreWorkspacePrivateCaseEvidenceGrantTransportError,
  type CoreWorkspacePrivateCaseEvidenceGrantTransport,
} from "./core-workspace-private-case-evidence-grant-http";
import { CASE_PRODUCER_PRINCIPAL_HEADER } from "./case-producer-auth";
import { resolveKnowledgeWorkspaceAuthority } from "./knowledge-workspace-authority";
import {
  authenticateOperatorServicePrincipal,
  type OperatorServiceAccessOptions,
} from "./operator-service-api-access";
import { buildConfiguredReadyPackageContentExportV1 } from "./ready-package-content-export";
import { getRetrievalIndexRepository } from "./source-registry";

const CORE_READ_GRANT_TTL_MS = 60_000;

type RetrievalReader = Pick<
  RetrievalIndexRepository,
  "getCurrentDocumentByStagingDocumentId" | "listChunks"
>;

export type WorkspacePrivateCaseEvidenceReadOptions = OperatorServiceAccessOptions & {
  now?: () => Date;
  retrieval?: RetrievalReader;
  buildContentExport?: (
    input: Readonly<{ workspaceId: string; readyPackageId: string }>,
  ) => Promise<ReadyPackageContentExportV1_1>;
  grantTransport?: CoreWorkspacePrivateCaseEvidenceGrantTransport;
};

export class WorkspacePrivateCaseEvidenceReadError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: 403 | 404 | 409 | 503,
    message: string,
  ) {
    super(message);
    this.name = "WorkspacePrivateCaseEvidenceReadError";
  }
}

const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

function parseReadRequest(value: unknown): WorkspacePrivateCaseEvidenceReadRequestV1 {
  try {
    assertWorkspacePrivateCaseEvidenceReadRequestV1(value);
    return value;
  } catch {
    throw new WorkspacePrivateCaseEvidenceReadError(
      "WORKSPACE_PRIVATE_CASE_EVIDENCE_REQUEST_INVALID",
      403,
      "An exact Workspace-private Case evidence binding and version are required.",
    );
  }
}

async function currentGrant(
  readRequest: WorkspacePrivateCaseEvidenceReadRequestV1,
  request: Request,
  workspaceId: string,
  transport?: CoreWorkspacePrivateCaseEvidenceGrantTransport,
): Promise<WorkspacePrivateCaseEvidenceReadGrantV1> {
  const principalHeader = request.headers.get(CASE_PRODUCER_PRINCIPAL_HEADER);
  if (!principalHeader) {
    throw new WorkspacePrivateCaseEvidenceReadError(
      "WORKSPACE_PRIVATE_CASE_EVIDENCE_GRANT_FORBIDDEN",
      403,
      "A current Core Workspace Principal is required.",
    );
  }
  try {
    const grant = await (
      transport ?? configuredCoreWorkspacePrivateCaseEvidenceGrantTransport()
    ).issue(readRequest, principalHeader, workspaceId);
    assertWorkspacePrivateCaseEvidenceReadGrantV1(grant);
    return grant;
  } catch (error) {
    if (error instanceof CoreWorkspacePrivateCaseEvidenceGrantTransportError) {
      throw new WorkspacePrivateCaseEvidenceReadError(error.code, error.httpStatus, error.message);
    }
    throw new WorkspacePrivateCaseEvidenceReadError(
      "WORKSPACE_PRIVATE_CASE_EVIDENCE_SOURCE_UNAVAILABLE",
      503,
      "Core Workspace-private Case evidence authority is temporarily unavailable.",
    );
  }
}

function assertGrantLifetime(grant: WorkspacePrivateCaseEvidenceReadGrantV1, now: Date): void {
  const verifiedAt = Date.parse(grant.verifiedAt);
  const expiresAt = Date.parse(grant.expiresAt);
  if (
    verifiedAt > now.getTime() ||
    expiresAt <= now.getTime() ||
    expiresAt - verifiedAt > CORE_READ_GRANT_TTL_MS
  ) {
    throw new WorkspacePrivateCaseEvidenceReadError(
      "WORKSPACE_PRIVATE_CASE_EVIDENCE_GRANT_EXPIRED",
      403,
      "The Core Workspace-private Case evidence read grant is not currently valid.",
    );
  }
}

function assertGrantPrincipal(
  grant: WorkspacePrivateCaseEvidenceReadGrantV1,
  principal: Readonly<{ workspaceId: string; userId: string; membershipId: string }>,
): void {
  if (
    grant.workspaceId.toLowerCase() !== principal.workspaceId.toLowerCase() ||
    grant.userId.toLowerCase() !== principal.userId.toLowerCase() ||
    grant.membershipId.toLowerCase() !== principal.membershipId.toLowerCase()
  ) {
    throw new WorkspacePrivateCaseEvidenceReadError(
      "WORKSPACE_PRIVATE_CASE_EVIDENCE_GRANT_PRINCIPAL_MISMATCH",
      403,
      "The read grant does not belong to the authenticated Workspace Principal.",
    );
  }
}

function stale(message: string): never {
  throw new WorkspacePrivateCaseEvidenceReadError(
    "WORKSPACE_PRIVATE_CASE_EVIDENCE_STALE",
    409,
    message,
  );
}

async function currentExport(
  grant: WorkspacePrivateCaseEvidenceReadGrantV1,
  build: NonNullable<WorkspacePrivateCaseEvidenceReadOptions["buildContentExport"]>,
): Promise<ReadyPackageContentExportV1_1> {
  try {
    return await build({
      workspaceId: grant.knowledgeWorkspaceId,
      readyPackageId: grant.readyPackageId,
    });
  } catch (error) {
    if (error instanceof RegistryConflictError) {
      throw new WorkspacePrivateCaseEvidenceReadError(error.code, 409, error.message);
    }
    if (error instanceof RegistryError && error.code === "READY_PACKAGE_NOT_FOUND") {
      throw new WorkspacePrivateCaseEvidenceReadError(
        "WORKSPACE_PRIVATE_CASE_EVIDENCE_NOT_FOUND",
        404,
        "The exact Workspace-private Knowledge evidence was not found.",
      );
    }
    if (error instanceof RegistryValidationError) {
      return stale("The read grant no longer identifies valid Knowledge evidence.");
    }
    throw new WorkspacePrivateCaseEvidenceReadError(
      "WORKSPACE_PRIVATE_CASE_EVIDENCE_SOURCE_UNAVAILABLE",
      503,
      "Workspace-private Knowledge evidence is temporarily unavailable.",
    );
  }
}

function assertExportMatchesGrant(
  grant: WorkspacePrivateCaseEvidenceReadGrantV1,
  exported: ReadyPackageContentExportV1_1,
): string {
  const serialized = serializeReadyPackageContentExportV1_1(exported);
  const canonicalSha256 = sha256(exported.stagingDocument.content);
  if (
    exported.knowledgeWorkspaceId !== grant.knowledgeWorkspaceId ||
    exported.readyPackageId !== grant.readyPackageId ||
    exported.readyPackageDigest !== grant.readyPackageDigest ||
    sha256(serialized) !== grant.contentExportSha256 ||
    exported.stagingDocument.documentId !== grant.stagingDocumentId ||
    exported.stagingDocument.sha256 !== grant.stagingSha256 ||
    canonicalSha256 !== grant.stagingSha256 ||
    exported.rawArtifact.artifactId !== grant.rawArtifactId ||
    exported.rawArtifact.sha256 !== grant.rawArtifactSha256
  ) {
    return stale("The Core grant no longer matches current exact Knowledge evidence.");
  }
  return canonicalSha256;
}

function verifiedChunks(
  grant: WorkspacePrivateCaseEvidenceReadGrantV1,
  document: NonNullable<ReturnType<RetrievalReader["getCurrentDocumentByStagingDocumentId"]>>,
  retrieval: RetrievalReader,
): WorkspacePrivateCaseEvidenceReadResultV1["chunks"] {
  let chunks;
  try {
    chunks = retrieval.listChunks(document.stagingDocumentId, document.workspaceId);
  } catch {
    throw new WorkspacePrivateCaseEvidenceReadError(
      "WORKSPACE_PRIVATE_CASE_EVIDENCE_SOURCE_UNAVAILABLE",
      503,
      "Workspace-private Knowledge retrieval is temporarily unavailable.",
    );
  }
  if (chunks.length !== document.chunkCount || chunks.length === 0) {
    return stale("Current Knowledge retrieval chunks are incomplete.");
  }
  const byId = new Map<string, (typeof chunks)[number]>();
  for (const chunk of chunks) {
    const expectedSha256 = sha256(
      `${chunk.stagingDocumentId}\u0000${chunk.documentId}\u0000${chunk.artifactVersion}\u0000${chunk.ordinal}\u0000${chunk.headingPath.join("\u0000")}\u0000${chunk.text}`,
    );
    if (
      chunk.documentId !== document.documentId ||
      chunk.stagingDocumentId !== document.stagingDocumentId ||
      chunk.artifactVersion !== document.artifactVersion ||
      chunk.contentSha256 !== expectedSha256 ||
      byId.has(chunk.chunkId)
    ) {
      return stale("Current Knowledge retrieval chunk lineage is inconsistent.");
    }
    byId.set(chunk.chunkId, chunk);
  }
  if (new Set(grant.sourceLocators).size !== grant.sourceLocators.length) {
    return stale("The Core grant contains duplicate Knowledge source locators.");
  }
  return grant.sourceLocators.map((locator) => {
    const chunk = byId.get(locator);
    if (!chunk) {
      return stale("A Core-granted source locator is not present in current Knowledge retrieval.");
    }
    return {
      locator,
      chunkId: chunk.chunkId,
      ordinal: chunk.ordinal,
      headingPath: [...chunk.headingPath],
      text: chunk.text,
      contentSha256: chunk.contentSha256,
      contentKind: "CANONICAL_MARKDOWN_CHUNK",
      pageNumber: null,
      textStartOffset: null,
      textEndOffset: null,
    };
  });
}

export async function authenticateWorkspacePrivateCaseEvidenceReadRequest(
  request: Request,
  value: unknown,
  options: WorkspacePrivateCaseEvidenceReadOptions = {},
): Promise<WorkspacePrivateCaseEvidenceReadResultV1> {
  const principal = authenticateOperatorServicePrincipal(request, options);
  const readRequest = parseReadRequest(value);
  const grant = await currentGrant(
    readRequest,
    request,
    principal.workspaceId,
    options.grantTransport,
  );
  assertGrantPrincipal(grant, principal);
  assertGrantLifetime(grant, (options.now ?? (() => new Date()))());
  const authority = resolveKnowledgeWorkspaceAuthority(
    principal,
    grant.knowledgeWorkspaceId,
    options,
  );
  const exported = await currentExport(
    grant,
    options.buildContentExport ?? buildConfiguredReadyPackageContentExportV1,
  );
  const canonicalSha256 = assertExportMatchesGrant(grant, exported);
  const retrieval = options.retrieval ?? getRetrievalIndexRepository();
  let document;
  try {
    document = retrieval.getCurrentDocumentByStagingDocumentId(
      authority.workspaceId,
      grant.stagingDocumentId,
    );
  } catch {
    throw new WorkspacePrivateCaseEvidenceReadError(
      "WORKSPACE_PRIVATE_CASE_EVIDENCE_SOURCE_UNAVAILABLE",
      503,
      "Workspace-private Knowledge retrieval is temporarily unavailable.",
    );
  }
  if (!document) {
    throw new WorkspacePrivateCaseEvidenceReadError(
      "WORKSPACE_PRIVATE_CASE_EVIDENCE_NOT_FOUND",
      404,
      "The exact Workspace-private Knowledge retrieval document was not found.",
    );
  }
  if (
    document.workspaceId !== authority.workspaceId ||
    document.stagingDocumentId !== grant.stagingDocumentId ||
    document.readyPackageId !== grant.readyPackageId ||
    document.rawArtifactId !== grant.rawArtifactId ||
    document.contentSha256 !== grant.stagingSha256 ||
    !document.isCurrent
  ) {
    return stale("The exact Knowledge retrieval document is no longer current.");
  }
  const chunks = verifiedChunks(grant, document, retrieval);
  return {
    protocolVersion: "1.0",
    objectType: "WORKSPACE_PRIVATE_CASE_EVIDENCE_READ_RESULT",
    binding: {
      bindingId: grant.bindingId,
      bindingVersion: grant.bindingVersion,
      caseId: grant.caseId,
      caseVersion: grant.caseVersion,
      caseSnapshotSha256: grant.caseSnapshotSha256,
    },
    authority: {
      coreWorkspaceId: authority.coreWorkspaceId,
      knowledgeWorkspaceId: authority.workspaceId,
      userId: principal.userId,
      membershipId: principal.membershipId,
      verifiedAt: grant.verifiedAt,
      expiresAt: grant.expiresAt,
    },
    lineage: {
      readyPackageId: grant.readyPackageId,
      readyPackageDigest: grant.readyPackageDigest,
      coreIntakeId: grant.coreIntakeId,
      contentExportSha256: grant.contentExportSha256,
      rawArtifactId: grant.rawArtifactId,
      rawArtifactSha256: grant.rawArtifactSha256,
    },
    document: {
      documentId: document.documentId,
      artifactVersion: document.artifactVersion,
      stagingDocumentId: document.stagingDocumentId,
      canonicalSha256,
      stagingSha256: grant.stagingSha256,
      documentSha256: document.contentSha256,
      indexedAt: document.indexedAt,
    },
    currentness: {
      workspaceAuthority: "CURRENT",
      formalMatter: "CURRENT",
      coreKnowledgeEvidence: "CURRENT",
      knowledgeRetrieval: "CURRENT",
      documentVersion: "CURRENT",
    },
    locatorSemantics: {
      basis: "RETRIEVAL_CHUNK",
      pageNumbers: "UNAVAILABLE",
      textOffsets: "UNAVAILABLE",
    },
    chunks,
    consequences: {
      officialTruthCreated: false,
      filingAuthorized: false,
      externalActionAuthorized: false,
    },
  };
}
