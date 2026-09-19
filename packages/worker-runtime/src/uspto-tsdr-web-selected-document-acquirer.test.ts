import { describe, expect, it } from "vitest";
import type { ArtifactBackedExecutionContext } from "./artifact-backed-collection-executor";
import {
  UsptoTsdrWebSelectedDocumentAcquirer,
  normalizeUsptoTsdrWebSelectedDocumentSelection,
  usptoTsdrWebSelectedDocumentRuntimeDescriptor,
} from "./uspto-tsdr-web-selected-document-acquirer";

const document = {
  sourceIndexArtifactId: "art_01M2X01M8RS5MNFC953RM7N6Y3",
  sourceIndexArtifactSha256: "3544fddfc90f59b94603e908857ddb0208b80920c0e517b4c7d59cf46e91b837",
  sourceDocumentId: "FREF20260722103245",
  sourceDocumentType: "Final Action",
  sourceDescription: "Final Action",
  sourceDisplayDate: "Jul. 22, 2026",
  sourcePageCount: 1,
  family: "OFFICE_ACTION" as const,
  classifierIdentity: "uspto-tsdr-document-family" as const,
  classifierVersion: "1.1.0" as const,
  downloadUrl:
    "https://tsdrsec.uspto.gov/ts/cd/tmcasedoc/downloadproxy?url=/api/casedoc/cms/case/99047647/office-action/OfficeAction8740681.pdf",
};

function context(): ArtifactBackedExecutionContext {
  const sourceUrl = "https://tsdr.uspto.gov/documentviewer?caseId=sn99047647";
  return {
    job: {
      jobType: "WEB_CRAWL",
      sourceSnapshot: {
        sourceType: "WEB",
        connector: { connectorId: "crawl4ai-web", version: "1.3.0" },
        canonicalUri: sourceUrl,
        entrypoints: [{ uri: sourceUrl }],
      },
      planSnapshot: {
        extensions: {
          "x-markorbit-tsdr-web-acceptance-stage": "SELECTED_DOCUMENT",
          "x-markorbit-tsdr-web-robots-policy":
            "RFC9309_4XX_UNAVAILABLE_ALLOW_5XX_UNREACHABLE_FAIL_V1",
          "x-markorbit-tsdr-web-selected-parent-artifact-id": document.sourceIndexArtifactId,
          "x-markorbit-tsdr-web-selected-parent-sha256": document.sourceIndexArtifactSha256,
          "x-markorbit-tsdr-web-selected-document-id": document.sourceDocumentId,
        },
        policy: {
          maxDepth: 0,
          maxItems: 1,
          renderJavascript: false,
          fetchAttachments: false,
          respectRobots: true,
          rateLimitPerMinute: 4,
          timeoutSeconds: 120,
        },
        output: { artifactKinds: ["PDF"] },
      },
    },
  } as unknown as ArtifactBackedExecutionContext;
}

const resolver = async () => [{ address: "8.8.8.8", family: 4 as const }];

describe("USPTO TSDR selected Web document acquirer", () => {
  it("normalizes the live Final Action label and official index-derived URL", () => {
    expect(normalizeUsptoTsdrWebSelectedDocumentSelection("99047647", document)).toMatchObject({
      family: "OFFICE_ACTION",
      classifierVersion: "1.1.0",
      sourceDocumentId: "FREF20260722103245",
    });
  });

  it("fetches the selected PDF through pinned HTTPS with immutable parent lineage", async () => {
    const calls: string[] = [];
    const acquirer = new UsptoTsdrWebSelectedDocumentAcquirer({
      serialNumber: "99047647",
      document,
      resolver,
      transport: async (url) => {
        calls.push(url.toString());
        return url.pathname === "/robots.txt"
          ? {
              statusCode: 404,
              headers: { "content-type": "text/html" },
              body: new Uint8Array(),
            }
          : {
              statusCode: 200,
              headers: { "content-type": "application/pdf" },
              body: new TextEncoder().encode("%PDF-1.7\nselected-office-action"),
            };
      },
    });

    const [artifact] = await acquirer.acquire(context());

    expect(calls).toEqual(["https://tsdrsec.uspto.gov/robots.txt", document.downloadUrl]);
    expect(artifact).toMatchObject({
      artifactKind: "PDF",
      mimeType: "application/pdf",
      canonicalUri: document.downloadUrl,
      parentArtifactIds: [document.sourceIndexArtifactId],
    });
    expect(usptoTsdrWebSelectedDocumentRuntimeDescriptor()).toMatchObject({
      transientViewerAuthorizationRequired: false,
      sourceIndexLineageRequired: true,
    });
  });

  it("rejects an alternate host or non-index-shaped Office Action path", () => {
    expect(() =>
      normalizeUsptoTsdrWebSelectedDocumentSelection("99047647", {
        ...document,
        downloadUrl:
          "https://example.test/ts/cd/tmcasedoc/downloadproxy?url=/api/casedoc/cms/case/99047647/office-action/OfficeAction8740681.pdf",
      }),
    ).toThrow(/official TSDR document boundary/u);

    expect(() =>
      normalizeUsptoTsdrWebSelectedDocumentSelection("99047647", {
        ...document,
        downloadUrl:
          "https://tsdrsec.uspto.gov/ts/cd/tmcasedoc/downloadproxy?url=/api/casedoc/cms/case/90817045/office-action/OfficeAction8740681.pdf",
      }),
    ).toThrow(/frozen serial Office Action PDF/u);
  });

  it("fails closed on robots denial and non-PDF content", async () => {
    const denied = new UsptoTsdrWebSelectedDocumentAcquirer({
      serialNumber: "99047647",
      document,
      resolver,
      transport: async () => ({
        statusCode: 200,
        headers: { "content-type": "text/plain" },
        body: new TextEncoder().encode("User-agent: *\nDisallow: /ts/cd/tmcasedoc"),
      }),
    });
    await expect(denied.acquire(context())).rejects.toMatchObject({
      code: "TSDR_WEB_SELECTED_ROBOTS_DISALLOWED",
    });

    const missingMime = new UsptoTsdrWebSelectedDocumentAcquirer({
      serialNumber: "99047647",
      document,
      resolver,
      transport: async (url) =>
        url.pathname === "/robots.txt"
          ? {
              statusCode: 404,
              headers: { "content-type": "text/html" },
              body: new Uint8Array(),
            }
          : {
              statusCode: 200,
              headers: {},
              body: new TextEncoder().encode("%PDF-1.7\nselected-office-action"),
            },
    });
    await expect(missingMime.acquire(context())).rejects.toMatchObject({
      code: "TSDR_WEB_SELECTED_CONTENT_TYPE_REJECTED",
    });

    const invalidPdf = new UsptoTsdrWebSelectedDocumentAcquirer({
      serialNumber: "99047647",
      document,
      resolver,
      transport: async (url) =>
        url.pathname === "/robots.txt"
          ? {
              statusCode: 404,
              headers: { "content-type": "text/html" },
              body: new Uint8Array(),
            }
          : {
              statusCode: 200,
              headers: { "content-type": "application/pdf" },
              body: new TextEncoder().encode("<html>not pdf</html>"),
            },
    });
    await expect(invalidPdf.acquire(context())).rejects.toMatchObject({
      code: "TSDR_WEB_SELECTED_PDF_SIGNATURE_INVALID",
    });
  });
});
