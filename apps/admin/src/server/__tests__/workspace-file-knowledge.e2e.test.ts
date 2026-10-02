import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CONVERSION_RUNTIME_VERSION,
  serializeReadyPackageContentExportV1_1,
  type ConversionOutputReadyReport,
  type ConversionStartedReport,
  type ConversionWorkerCapability,
  type WorkspacePrivateCaseEvidenceReadGrantV1,
} from "@markorbit/contracts";
import { SqliteCoreWorkspaceBindingRepository } from "@markorbit/persistence/core-workspace-bindings";
import { canonicalMarkdownFrontmatter } from "@markorbit/worker-runtime";
import { canonicalDocumentMetadata } from "../canonical-document-metadata";
import { ingestManualUpload } from "../manual-upload-ingestion";
import { ProductionConversionWorkerService } from "../production-conversion-worker-service";
import { buildConfiguredReadyPackageContentExportV1 } from "../ready-package-content-export";
import { authenticateWorkspacePrivateCaseEvidenceReadRequest } from "../workspace-private-case-evidence-read";
import {
  getConversionRunLedgerRepository,
  getConversionRuntimeRepository,
  getRawArtifactRepository,
  getReadyPackageRepository,
  getRegistryDatabase,
  getRetrievalIndexRepository,
  getSourceRepository,
  getWorkspaceRepository,
  getWorkerRegistryRepository,
} from "../source-registry";

const configuredRoot = process.env.MARKORBIT_WORKSPACE_PRIVATE_E2E_ROOT?.trim();
const tempRoot =
  configuredRoot ?? mkdtempSync(join(tmpdir(), "markorbit-workspace-file-knowledge-"));
const ownsTempRoot = configuredRoot === undefined;

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function* chunks(value: Uint8Array): AsyncIterable<Uint8Array> {
  yield value;
}

type CoreFixtureRepository = {
  create(input: Record<string, unknown>): Promise<unknown>;
};

type CoreFixtureModule = {
  InMemoryUserRepository: new () => CoreFixtureRepository;
  InMemoryWorkspaceRepository: new () => CoreFixtureRepository;
  InMemoryMembershipRepository: new (
    users: CoreFixtureRepository,
    workspaces: CoreFixtureRepository,
  ) => CoreFixtureRepository;
  MemoryKnowledgeIntakeRepository: new () => {
    createOrFind(input: Record<string, unknown>): Promise<unknown>;
  };
  MemoryKnowledgeReadyPackageContentRepository: new () => {
    createOrFind(input: Record<string, unknown>): Promise<unknown>;
  };
  MemoryWorkspacePrivateCaseEvidenceBindingRepository: new () => object;
  CurrentWorkspaceAuthorityService: new (input: Record<string, unknown>) => object;
  WorkspacePrivateCaseEvidenceService: new (input: Record<string, unknown>) => {
    suggest(
      principal: Record<string, unknown>,
      request: Record<string, unknown>,
    ): Promise<{ bindingId: string; version: number }>;
    decide(
      principal: Record<string, unknown>,
      request: Record<string, unknown>,
    ): Promise<{ bindingId: string; version: number }>;
    readGrant(
      principal: Record<string, unknown>,
      request: Record<string, unknown>,
    ): Promise<Record<string, unknown>>;
  };
};
beforeAll(() => {
  mkdirSync(tempRoot, { recursive: true });
  process.env.MARKORBIT_KNOWLEDGE_DB_PATH = join(tempRoot, "knowledge.sqlite");
  process.env.MARKORBIT_ARTIFACT_STORE_PATH = join(tempRoot, "artifacts");
  process.env.MARKORBIT_STAGING_STORE_PATH = join(tempRoot, "staging");
  process.env.MARKORBIT_MANUAL_UPLOAD_MAX_BYTES = String(1024 * 1024);
});

afterAll(() => {
  getRegistryDatabase().close();
  delete (globalThis as typeof globalThis & { markorbitRegistries?: unknown }).markorbitRegistries;
  delete process.env.MARKORBIT_KNOWLEDGE_DB_PATH;
  delete process.env.MARKORBIT_ARTIFACT_STORE_PATH;
  delete process.env.MARKORBIT_STAGING_STORE_PATH;
  delete process.env.MARKORBIT_MANUAL_UPLOAD_MAX_BYTES;
  delete process.env.MO_INTERNAL_SERVICE_SECRET;
  if (ownsTempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

async function issueCoreGrant(input: {
  exported: Awaited<ReturnType<typeof buildConfiguredReadyPackageContentExportV1>>;
  coreWorkspaceId: string;
  userId: string;
  membershipId: string;
  sourceLocator: string;
  verifiedAt: Date;
}): Promise<WorkspacePrivateCaseEvidenceReadGrantV1> {
  const coreRoot = process.env.MARKORBIT_CORE_DIST_ROOT?.trim();
  if (!coreRoot) {
    return {
      protocolVersion: "1.0",
      objectType: "WORKSPACE_PRIVATE_CASE_EVIDENCE_READ_GRANT",
      bindingId: "018f0000-0000-7000-8000-000000000604",
      bindingVersion: 2,
      workspaceId: input.coreWorkspaceId,
      userId: input.userId,
      membershipId: input.membershipId,
      knowledgeWorkspaceId: input.exported.knowledgeWorkspaceId,
      readyPackageId: input.exported.readyPackageId,
      readyPackageDigest: input.exported.readyPackageDigest,
      coreIntakeId: "intake_workspace_private_e2e",
      contentExportSha256: sha256(
        Buffer.from(serializeReadyPackageContentExportV1_1(input.exported), "utf8"),
      ),
      stagingDocumentId: input.exported.stagingDocument.documentId,
      stagingSha256: input.exported.stagingDocument.sha256,
      rawArtifactId: input.exported.rawArtifact.artifactId,
      rawArtifactSha256: input.exported.rawArtifact.sha256,
      caseId: "formal-matter_workspace-private-e2e",
      caseVersion: 1,
      caseSnapshotSha256: sha256(Buffer.from("formal-matter-workspace-private-e2e")),
      sourceLocators: [input.sourceLocator],
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
      verifiedAt: input.verifiedAt.toISOString(),
      expiresAt: new Date(input.verifiedAt.getTime() + 60_000).toISOString(),
    } as const;
  }

  const core = (await import(
    pathToFileURL(join(coreRoot, "services/core/dist/index.js")).href
  )) as CoreFixtureModule;
  const contracts = (await import(
    pathToFileURL(join(coreRoot, "packages/contracts/dist/workspace-private-evidence.js")).href
  )) as {
    assertWorkspacePrivateCaseEvidenceReadGrantV1(value: unknown): void;
  };
  const users = new core.InMemoryUserRepository();
  const workspaces = new core.InMemoryWorkspaceRepository();
  const memberships = new core.InMemoryMembershipRepository(users, workspaces);
  await users.create({
    userId: input.userId,
    email: "private-read@example.test",
    displayName: "A",
  });
  await workspaces.create({
    workspaceId: input.coreWorkspaceId,
    name: "Private read",
    slug: "private-read",
  });
  await memberships.create({
    membershipId: input.membershipId,
    userId: input.userId,
    workspaceId: input.coreWorkspaceId,
    role: "WORKSPACE_ADMIN",
  });
  const intakes = new core.MemoryKnowledgeIntakeRepository();
  const contents = new core.MemoryKnowledgeReadyPackageContentRepository();
  const coreIntakeId = "intake_workspace_private_e2e";
  const contentExportSha256 = sha256(
    Buffer.from(serializeReadyPackageContentExportV1_1(input.exported), "utf8"),
  );
  await intakes.createOrFind({
    intakeId: coreIntakeId,
    idempotencyKey: "workspace-private-read-intake",
    request: {
      readyPackageId: input.exported.readyPackageId,
      workspaceId: input.coreWorkspaceId,
      digest: input.exported.readyPackageDigest,
      evidence: {
        artifactIds: [input.exported.rawArtifact.artifactId],
        stagingDocumentId: input.exported.stagingDocument.documentId,
      },
      submittedAt: input.verifiedAt.toISOString(),
    },
    requestSha256: sha256(Buffer.from("workspace-private-read-intake")),
    status: "ACCEPTED",
    receivedAt: input.verifiedAt.toISOString(),
  });
  await contents.createOrFind({
    intakeId: coreIntakeId,
    workspaceId: input.coreWorkspaceId,
    readyPackageId: input.exported.readyPackageId,
    export: input.exported,
    exportSha256: contentExportSha256,
    consumedAt: input.verifiedAt.toISOString(),
  });
  const caseSnapshotSha256 = sha256(Buffer.from("formal-matter-workspace-private-e2e"));
  const service = new core.WorkspacePrivateCaseEvidenceService({
    repository: new core.MemoryWorkspacePrivateCaseEvidenceBindingRepository(),
    currentWorkspaceAuthority: new core.CurrentWorkspaceAuthorityService({
      users,
      workspaces,
      memberships,
    }),
    knowledgeIntakes: intakes,
    knowledgeContents: contents,
    formalMatters: {
      async read() {
        return {
          workspaceId: input.coreWorkspaceId,
          formalMatterId: "formal-matter_workspace-private-e2e",
          version: 1,
          snapshotSha256: caseSnapshotSha256,
          status: "OPEN",
        };
      },
    },
    clock: () => input.verifiedAt,
    newId: () => "018f0000-0000-7000-8000-000000000604",
  });
  const principal = {
    kind: "WORKSPACE",
    sessionId: "session_workspace_private_e2e",
    userId: input.userId,
    workspaceId: input.coreWorkspaceId,
    membershipId: input.membershipId,
    role: "WORKSPACE_ADMIN",
    permissions: ["matter:read", "matter:manage"],
    sessionExpiresAt: "2030-01-01T00:00:00.000Z",
  };
  const suggested = await service.suggest(principal, {
    idempotencyKey: "suggest-workspace-private-read",
    formalMatterId: "formal-matter_workspace-private-e2e",
    expectedFormalMatterVersion: 1,
    expectedFormalMatterSnapshotSha256: caseSnapshotSha256,
    readyPackageId: input.exported.readyPackageId,
    expectedKnowledgeWorkspaceId: input.exported.knowledgeWorkspaceId,
    expectedReadyPackageDigest: input.exported.readyPackageDigest,
    expectedCoreIntakeId: coreIntakeId,
    expectedContentExportSha256: contentExportSha256,
    expectedStagingDocumentId: input.exported.stagingDocument.documentId,
    expectedStagingSha256: input.exported.stagingDocument.sha256,
    expectedRawArtifactId: input.exported.rawArtifact.artifactId,
    expectedRawArtifactSha256: input.exported.rawArtifact.sha256,
    sourceLocators: [input.sourceLocator],
    methodProvenanceRefs: ["method://workspace-private-exact-read-v1"],
  });
  const accepted = await service.decide(principal, {
    bindingId: suggested.bindingId,
    expectedVersion: suggested.version,
    idempotencyKey: "accept-workspace-private-read",
    decision: "ACCEPT",
  });
  const grant = await service.readGrant(principal, {
    bindingId: accepted.bindingId,
    expectedVersion: accepted.version,
  });
  contracts.assertWorkspacePrivateCaseEvidenceReadGrantV1(grant);
  return grant as WorkspacePrivateCaseEvidenceReadGrantV1;
}

async function startCoreGrantOwnerFixture(input: {
  grant: Awaited<ReturnType<typeof issueCoreGrant>>;
  principalHeader: string;
}): Promise<Server> {
  const configuredUrl = process.env.MARKORBIT_CORE_URL?.trim();
  const internalSecret = process.env.MARKORBIT_CORE_INTERNAL_SECRET?.trim();
  if (!configuredUrl || !internalSecret) {
    throw new Error(
      "MARKORBIT_CORE_URL and MARKORBIT_CORE_INTERNAL_SECRET are required for live HTTP E2E.",
    );
  }
  const baseUrl = new URL(configuredUrl);
  const port = Number(baseUrl.port || (baseUrl.protocol === "https:" ? 443 : 80));
  const expectedPath = `${baseUrl.pathname.replace(/\/+$/u, "")}/internal/v1/workspace-private-case-evidence/${encodeURIComponent(input.grant.bindingId)}/read-grants`;
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const writeJson = (statusCode: number, value: unknown) => {
      response.writeHead(statusCode, { "content-type": "application/json" });
      response.end(JSON.stringify(value));
    };
    if (
      request.method !== "POST" ||
      request.url !== expectedPath ||
      request.headers["x-markorbit-internal-authorization"] !== internalSecret ||
      request.headers["x-markorbit-workspace-id"] !== input.grant.workspaceId
    ) {
      writeJson(403, { code: "WORKSPACE_PRIVATE_CASE_EVIDENCE_GRANT_FORBIDDEN" });
      return;
    }
    if (request.headers["x-markorbit-principal"] !== input.principalHeader) {
      writeJson(403, { code: "WORKSPACE_PRIVATE_CASE_EVIDENCE_GRANT_FORBIDDEN" });
      return;
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      writeJson(403, { code: "WORKSPACE_PRIVATE_CASE_EVIDENCE_REQUEST_INVALID" });
      return;
    }
    const expectedVersion =
      typeof body === "object" && body !== null && "expectedVersion" in body
        ? (body as { expectedVersion?: unknown }).expectedVersion
        : undefined;
    if (expectedVersion !== input.grant.bindingVersion) {
      writeJson(409, { code: "WORKSPACE_PRIVATE_CASE_EVIDENCE_STALE" });
      return;
    }
    writeJson(200, input.grant);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, baseUrl.hostname, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}

async function stopServer(server: Server | undefined): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

describe("Workspace File Knowledge E2E", () => {
  it("turns a private uploaded file into Workspace-scoped Retrieval Knowledge", async () => {
    const workspace = getWorkspaceRepository().create({
      slug: `file-knowledge-${randomUUID()}`,
      name: "Private File Knowledge Workspace",
    });
    const body = Buffer.from(
      "OrbitPriceEvidence: private workspace agent price is USD 199 per class.",
      "utf8",
    );
    const uploaded = await ingestManualUpload({
      workspaceId: workspace.id,
      originalName: "workspace-pricing.txt",
      sourceName: "Workspace Pricing Evidence",
      mimeType: "text/plain",
      expectedSizeBytes: body.byteLength,
      expectedSha256: sha256(body),
      idempotencyKey: "workspace-file-knowledge-upload",
      chunks: chunks(body),
    });

    expect(uploaded.artifact.workspaceId).toBe(workspace.id);
    expect(uploaded.autoConversion.status).toBe("ENQUEUED");
    if (uploaded.autoConversion.status !== "ENQUEUED") {
      throw new Error("Expected Manual Upload to enqueue conversion");
    }

    const conversionRuns = getConversionRunLedgerRepository();
    const run = conversionRuns.list({
      workspaceId: workspace.id,
      rawArtifactId: uploaded.artifact.id,
      limit: 10,
    }).items[0];
    expect(run).toBeDefined();
    if (!run) return;
    const workers = getWorkerRegistryRepository();
    const worker = workers.create({
      workspaceId: workspace.id,
      displayName: "Workspace File Conversion Worker",
      desiredState: "ACTIVE",
      runtime: { runtimeId: "workspace-file-conversion", version: "1.0.0" },
      supportedJobTypes: ["LOCAL_FILE_SCAN"],
      connectorBindings: [
        { connectorId: "builtin-manual-upload", version: "1.0.0", capabilities: ["COLLECT"] },
      ],
      maxConcurrency: 1,
      labels: ["workspace-file-knowledge-e2e"],
    });
    workers.heartbeat(
      {
        workerId: worker.view.worker.id,
        observedAt: new Date().toISOString(),
        runtimeVersion: "1.0.0",
        health: "HEALTHY",
        activeLeaseIds: [],
      },
      worker.credential,
    );
    const runtime = getConversionRuntimeRepository();
    const capability: ConversionWorkerCapability = {
      contractVersion: CONVERSION_RUNTIME_VERSION,
      objectType: "CONVERSION_WORKER_CAPABILITY",
      id: "cwc_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      workerId: worker.view.worker.id,
      capabilityRevision: 1,
      supportedConverters: [
        { converterId: run.converter.converterId, versions: [run.converter.version] },
      ],
      acceptedArtifactKinds: ["TEXT"],
      acceptedMimePatterns: ["text/plain"],
      supportedOutputFormats: ["MARKDOWN"],
      runtime: { runtimeId: "workspace-file-conversion", version: "1.0.0" },
      createdAt: new Date().toISOString(),
    };
    runtime.registerCapability(capability);

    const service = new ProductionConversionWorkerService();
    const claim = service.claim(
      {
        contractVersion: CONVERSION_RUNTIME_VERSION,
        objectType: "CONVERSION_CLAIM_REQUEST",
        id: "ccr_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        workspaceId: workspace.id,
        workerId: worker.view.worker.id,
        workerCredentialId: "workspace-file-worker-credential",
        capabilityRevision: 1,
        supportedConverters: capability.supportedConverters,
        maxAcceptedWork: 1,
        idempotencyKey: "workspace-file-claim",
        requestedLeaseDurationSeconds: 120,
      },
      worker.credential,
    ).result;
    expect(claim.result).toBe("CLAIMED");
    const lease = claim.lease!;
    const readGrant = claim.rawArtifactReadGrant!;
    const uploadGrant = claim.stagingOutputUploadGrant!;

    const inputBytes = service.readInput(readGrant.id, worker.view.worker.id, worker.credential);
    expect(new TextDecoder().decode(inputBytes.bytes)).toBe(body.toString("utf8"));
    const reportBase = {
      contractVersion: CONVERSION_RUNTIME_VERSION,
      workspaceId: workspace.id,
      workerId: worker.view.worker.id,
      workerCredentialId: "workspace-file-worker-credential",
      conversionRunId: run.id,
      conversionAttemptId: lease.conversionAttemptId,
      conversionLeaseId: lease.id,
      leaseGeneration: lease.generation,
      leaseTokenReference: lease.tokenReference,
      leaseTokenDigest: lease.tokenDigest,
      occurredAt: new Date().toISOString(),
    } as const;
    const started: ConversionStartedReport = {
      ...reportBase,
      objectType: "CONVERSION_STARTED_REPORT",
      id: "csr_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      idempotencyKey: "workspace-file-started",
      expectedCurrentStatus: "PENDING",
      converter: run.converter,
    };
    expect(service.submitReport(started, worker.credential).run.status).toBe("RUNNING");
    const source = getSourceRepository().getById(uploaded.sourceId)!;
    const artifact = getRawArtifactRepository().getArtifact(run.rawArtifactId)!.artifact;
    const metadata = canonicalDocumentMetadata(run, artifact, source);
    const markdown = new TextEncoder().encode(
      `${canonicalMarkdownFrontmatter(metadata)}\n# Workspace Pricing Evidence\n\n${body.toString("utf8")}\n`,
    );
    const outputReady: ConversionOutputReadyReport = {
      ...reportBase,
      objectType: "CONVERSION_OUTPUT_READY_REPORT",
      id: "cor_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      idempotencyKey: "workspace-file-output-ready",
      expectedCurrentStatus: "RUNNING",
      output: {
        uploadGrantId: uploadGrant.id,
        targetPath: uploadGrant.normalizedTargetPath,
        sha256: sha256(markdown),
        sizeBytes: markdown.byteLength,
        mediaType: "text/markdown",
      },
    };
    expect(service.submitReport(outputReady, worker.credential).run.status).toBe("VERIFYING");
    const committed = service.commitStaging(
      {
        workspaceId: workspace.id,
        workerId: worker.view.worker.id,
        conversionRunId: run.id,
        conversionAttemptId: lease.conversionAttemptId,
        uploadGrantId: uploadGrant.id,
        idempotencyKey: "workspace-file-staging-commit",
        content: markdown,
      },
      worker.credential,
    );
    expect(committed.finalizationDecision).toBe("COMPLETED");
    expect(committed.readyPackageId).toBeTruthy();
    expect(getReadyPackageRepository().list(workspace.id)).toHaveLength(1);

    const retrieval = getRetrievalIndexRepository().search({
      workspaceId: workspace.id,
      query: "OrbitPriceEvidence",
      limit: 10,
    });
    expect(retrieval.items).toHaveLength(1);
    expect(retrieval.items[0]?.document.sourceId).toBe(uploaded.sourceId);
    expect(retrieval.items[0]?.document.workspaceId).toBe(workspace.id);

    const exact = retrieval.items[0];
    if (!exact || !committed.readyPackageId) throw new Error("Expected indexed ReadyPackage");
    const coreWorkspaceId = "018f0000-0000-7000-8000-000000000601";
    const userId = "018f0000-0000-7000-8000-000000000602";
    const membershipId = "018f0000-0000-7000-8000-000000000603";
    new SqliteCoreWorkspaceBindingRepository(getRegistryDatabase()).bind(
      workspace.id,
      coreWorkspaceId,
    );
    process.env.MO_INTERNAL_SERVICE_SECRET ??= "workspace-private-e2e-internal-service-secret";
    const exported = await buildConfiguredReadyPackageContentExportV1({
      workspaceId: workspace.id,
      readyPackageId: committed.readyPackageId,
    });
    const verifiedAt = new Date();
    const grant = await issueCoreGrant({
      exported,
      coreWorkspaceId,
      userId,
      membershipId,
      sourceLocator: exact.chunk.chunkId,
      verifiedAt,
    });
    const principalHeader = (overrides: Record<string, unknown> = {}) =>
      Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          principal: {
            kind: "WORKSPACE",
            sessionId: "session_workspace_private_e2e",
            userId,
            workspaceId: coreWorkspaceId,
            membershipId,
            role: "WORKSPACE_ADMIN",
            permissions: ["matter:read"],
            sessionExpiresAt: "2030-01-01T00:00:00.000Z",
            ...overrides,
          },
        }),
      ).toString("base64url");
    const headers = (principal = principalHeader()) => ({
      "content-type": "application/json",
      "x-markorbit-internal-authorization": process.env.MO_INTERNAL_SERVICE_SECRET!,
      "x-markorbit-principal": principal,
    });
    const readRequest = {
      bindingId: grant.bindingId,
      expectedVersion: grant.bindingVersion,
    };
    const liveUrl = process.env.MARKORBIT_WORKSPACE_PRIVATE_READ_URL?.trim();
    let result: Record<string, unknown>;
    if (liveUrl) {
      let coreFixture: Server | undefined;
      try {
        coreFixture = await startCoreGrantOwnerFixture({
          grant,
          principalHeader: principalHeader(),
        });
        const response = await fetch(liveUrl, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(readRequest),
        });
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        result = (await response.json()) as Record<string, unknown>;

        const wrongPrincipal = await fetch(liveUrl, {
          method: "POST",
          headers: headers(
            principalHeader({
              userId: "018f0000-0000-7000-8000-000000000699",
              membershipId: "018f0000-0000-7000-8000-000000000698",
            }),
          ),
          body: JSON.stringify(readRequest),
        });
        expect(wrongPrincipal.status).toBe(403);

        const staleVersion = await fetch(liveUrl, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            ...readRequest,
            expectedVersion: readRequest.expectedVersion + 1,
          }),
        });
        expect(staleVersion.status).toBe(409);
      } finally {
        await stopServer(coreFixture);
      }
    } else {
      result = (await authenticateWorkspacePrivateCaseEvidenceReadRequest(
        new Request("http://knowledge.local/api/internal/workspace-private-case-evidence/read", {
          method: "POST",
          headers: headers(),
        }),
        readRequest,
        {
          grantTransport: {
            async issue(request, forwardedPrincipal, workspaceId) {
              expect(request).toEqual(readRequest);
              expect(forwardedPrincipal).toBe(principalHeader());
              expect(workspaceId).toBe(coreWorkspaceId);
              return grant;
            },
          },
        },
      )) as unknown as Record<string, unknown>;
    }
    expect(result).toMatchObject({
      authority: {
        coreWorkspaceId,
        knowledgeWorkspaceId: workspace.id,
      },
      document: {
        documentId: exact.document.documentId,
        artifactVersion: exact.document.artifactVersion,
        stagingDocumentId: exact.document.stagingDocumentId,
        canonicalSha256: exact.document.contentSha256,
        stagingSha256: exact.document.contentSha256,
        documentSha256: exact.document.contentSha256,
      },
      chunks: [
        {
          locator: exact.chunk.chunkId,
          text: expect.stringContaining("OrbitPriceEvidence"),
          pageNumber: null,
          textStartOffset: null,
          textEndOffset: null,
        },
      ],
      locatorSemantics: {
        basis: "RETRIEVAL_CHUNK",
        pageNumbers: "UNAVAILABLE",
        textOffsets: "UNAVAILABLE",
      },
    });
  });
});
