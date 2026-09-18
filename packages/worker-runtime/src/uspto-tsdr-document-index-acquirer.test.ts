import { describe, expect, it } from "vitest";
import {
  UsptoTsdrDocumentIndexAcquirer,
  usptoTsdrDocumentIndexRuntimeDescriptor,
} from "./uspto-tsdr-document-index-acquirer";

const request = {
  intent: "CASE_DOCUMENT_INDEX" as const,
  serialNumber: "75008897",
  secretRef: "sec_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  requestsPerMinute: 30,
  coverageClaim: "TARGET_SERIAL_ONLY" as const,
  legalEffectClaim: false as const,
};

describe("UsptoTsdrDocumentIndexAcquirer", () => {
  it("fetches the official single-serial XML index with the API key header", async () => {
    const seen: Array<{ url: string; headers: Readonly<Record<string, string>> }> = [];
    const acquirer = new UsptoTsdrDocumentIndexAcquirer({
      request,
      secretResolver: { resolve: async () => "test-api-key" },
      transport: async (input) => {
        seen.push({ url: input.url, headers: input.headers });
        return {
          status: 200,
          contentType: "application/xml; charset=UTF-8",
          body: new TextEncoder().encode("<documents><document /></documents>"),
        };
      },
    });

    const artifacts = await acquirer.acquire({} as never);

    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe("https://tsdrapi.uspto.gov/ts/cd/casedocs/bundle.xml?sn=75008897");
    expect(seen[0]!.headers["USPTO-API-KEY"]).toBe("test-api-key");
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      artifactKind: "XML",
      mimeType: "application/xml",
      originalName: "uspto-tsdr-75008897-document-index.xml",
      canonicalUri: "https://tsdrapi.uspto.gov/ts/cd/casedocs/bundle.xml?sn=75008897",
    });
  });

  it("fails closed on rate limits", async () => {
    const acquirer = new UsptoTsdrDocumentIndexAcquirer({
      request,
      secretResolver: { resolve: async () => "test-api-key" },
      transport: async () => ({
        status: 429,
        contentType: "application/xml",
        body: new Uint8Array(),
      }),
    });

    await expect(acquirer.acquire({} as never)).rejects.toMatchObject({
      code: "TSDR_RATE_LIMITED",
      retryable: true,
    });
  });

  it("rejects non-XML provider responses", async () => {
    const acquirer = new UsptoTsdrDocumentIndexAcquirer({
      request,
      secretResolver: { resolve: async () => "test-api-key" },
      transport: async () => ({
        status: 200,
        contentType: "text/html",
        body: new TextEncoder().encode("<html>gateway</html>"),
      }),
    });

    await expect(acquirer.acquire({} as never)).rejects.toMatchObject({
      code: "TSDR_RESPONSE_TYPE_INVALID",
      retryable: false,
    });
  });

  it("reports selected-document binary execution as implemented", () => {
    expect(usptoTsdrDocumentIndexRuntimeDescriptor()).toMatchObject({
      intent: "CASE_DOCUMENT_INDEX",
      immutableRawArtifactRequired: true,
      selectedDocumentBinaryImplemented: true,
    });
  });
});
