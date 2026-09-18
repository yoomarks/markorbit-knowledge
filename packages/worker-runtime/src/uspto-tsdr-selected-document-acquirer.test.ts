import { describe, expect, it } from "vitest";
import type {
  ArtifactIngestionReceipt,
  ArtifactIngestionSession,
  ArtifactUploadDescriptor,
  ExecutionAttempt,
} from "@markorbit/contracts";
import {
  ArtifactBackedCollectionExecutor,
  type ArtifactBackedExecutionClient,
  type ArtifactBackedExecutionContext,
} from "./artifact-backed-collection-executor";
import {
  UsptoTsdrSelectedDocumentAcquirer,
  usptoTsdrSelectedDocumentRuntimeDescriptor,
} from "./uspto-tsdr-selected-document-acquirer";

const SECRET_REF = "sec_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const INDEX_ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAW";

function request() {
  return {
    intent: "SELECTED_DOCUMENT_BINARY" as const,
    serialNumber: "90817045",
    secretRef: SECRET_REF,
    requestsPerMinute: 4,
    coverageClaim: "TARGET_SERIAL_ONLY" as const,
    legalEffectClaim: false as const,
    format: "PDF" as const,
    purpose: "LIVE_BUSINESS_EVENT" as const,
    businessChain: "OA" as const,
    document: {
      sourceIndexArtifactId: INDEX_ARTIFACT_ID,
      sourceDocumentId: "OOA20250101120000",
      sourceDocumentType: "OFFICE ACTION",
      sourceDescription: "Non-final Office action",
      family: "OFFICE_ACTION" as const,
      classifierIdentity: "uspto-tsdr-document-family",
      classifierVersion: "1.0.0",
    },
  };
}

function pdfBytes(): Uint8Array {
  return new TextEncoder().encode("%PDF-1.7\nfixture");
}

function context(): ArtifactBackedExecutionContext {
  return {
    workerId: "wrk_tsdr",
    leaseToken: "lease-token",
    lease: { id: "lse_tsdr" },
    job: {
      jobType: "WEB_CRAWL",
      planSnapshot: { output: { artifactKinds: ["PDF"] } },
    },
  } as unknown as ArtifactBackedExecutionContext;
}

describe("USPTO TSDR selected-document acquirer", () => {
  it("uses the official single-document API endpoint and immutable index lineage", async () => {
    const seen: Array<{
      url: string;
      headers: Readonly<Record<string, string>>;
    }> = [];
    const acquirer = new UsptoTsdrSelectedDocumentAcquirer({
      request: request(),
      secretResolver: { resolve: async () => "test-api-key" },
      transport: async (input) => {
        seen.push({ url: input.url, headers: input.headers });
        return {
          status: 200,
          contentType: "application/pdf",
          body: pdfBytes(),
        };
      },
    });

    const artifacts = await acquirer.acquire(context());

    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe(
      "https://tsdrapi.uspto.gov/ts/cd/casedoc/sn90817045/OOA20250101120000/download.pdf",
    );
    expect(seen[0]!.headers["USPTO-API-KEY"]).toBe("test-api-key");
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      artifactKind: "PDF",
      mimeType: "application/pdf",
      parentArtifactIds: [INDEX_ARTIFACT_ID],
    });
    expect(usptoTsdrSelectedDocumentRuntimeDescriptor()).toMatchObject({
      intent: "SELECTED_DOCUMENT_BINARY",
      transientViewerAuthorizationRequired: false,
      sourceIndexLineageRequired: true,
    });
  });

  it("fails closed on provider rate limiting", async () => {
    const acquirer = new UsptoTsdrSelectedDocumentAcquirer({
      request: request(),
      secretResolver: { resolve: async () => "test-api-key" },
      transport: async () => ({
        status: 429,
        contentType: "text/plain",
        body: new Uint8Array(),
      }),
    });

    await expect(acquirer.acquire(context())).rejects.toMatchObject({
      code: "TSDR_RATE_LIMITED",
      retryable: true,
    });
  });

  it("rejects a non-PDF body even when the provider says application/pdf", async () => {
    const acquirer = new UsptoTsdrSelectedDocumentAcquirer({
      request: request(),
      secretResolver: { resolve: async () => "test-api-key" },
      transport: async () => ({
        status: 200,
        contentType: "application/pdf",
        body: new TextEncoder().encode("<html>gateway</html>"),
      }),
    });

    await expect(acquirer.acquire(context())).rejects.toMatchObject({
      code: "TSDR_BINARY_SIGNATURE_INVALID",
      retryable: false,
    });
  });

  it("hands the selected PDF to immutable RawArtifact ingestion with source-index lineage", async () => {
    const descriptors: ArtifactUploadDescriptor[] = [];
    let uploadedText = "";
    const client: ArtifactBackedExecutionClient = {
      async start() {
        return {} as ExecutionAttempt;
      },
      async uploading() {},
      async createArtifactSession(_context, descriptor) {
        descriptors.push(descriptor);
        return { id: "session-tsdr" } as ArtifactIngestionSession;
      },
      async uploadArtifactContent(_context, _sessionId, content) {
        uploadedText = new TextDecoder().decode(content);
      },
      async finalizeArtifact() {
        return {
          id: "receipt-tsdr",
          artifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAX",
        } as ArtifactIngestionReceipt;
      },
      async verifying() {},
      async complete() {},
      async fail() {},
    };

    const acquirer = new UsptoTsdrSelectedDocumentAcquirer({
      request: request(),
      secretResolver: { resolve: async () => "test-api-key" },
      transport: async () => ({
        status: 200,
        contentType: "application/pdf",
        body: pdfBytes(),
      }),
    });
    const receipt = await new ArtifactBackedCollectionExecutor(acquirer, client).execute(context());

    expect(receipt?.metadataOnly).toBe(false);
    if (!receipt || receipt.metadataOnly) {
      throw new Error("Expected artifact-backed binary receipt");
    }
    expect(receipt.artifactReceiptIds).toEqual(["receipt-tsdr"]);
    expect(descriptors).toHaveLength(1);
    expect(descriptors[0]).toMatchObject({
      artifactKind: "PDF",
      mimeType: "application/pdf",
      parentArtifactIds: [INDEX_ARTIFACT_ID],
      sourceUri:
        "https://tsdrapi.uspto.gov/ts/cd/casedoc/sn90817045/OOA20250101120000/download.pdf",
    });
    expect(uploadedText).toBe(new TextDecoder().decode(pdfBytes()));
  });
});
