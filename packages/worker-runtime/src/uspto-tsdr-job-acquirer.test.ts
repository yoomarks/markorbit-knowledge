import { describe, expect, it } from "vitest";
import type { ArtifactBackedExecutionContext } from "./artifact-backed-collection-executor";
import {
  USPTO_TSDR_JOB_CONNECTOR_ID,
  USPTO_TSDR_JOB_CONNECTOR_VERSION,
  UsptoTsdrJobArtifactAcquirer,
  usptoTsdrJobRuntimeDescriptor,
} from "./uspto-tsdr-job-acquirer";

const SECRET_REF = "sec_01ARZ3NDEKTSV4RRFFQ69G5FAV";

function context(
  connectorConfig: Record<string, unknown>,
  outputKinds: string[],
  rateLimitPerMinute: number,
): ArtifactBackedExecutionContext {
  return {
    job: {
      sourceSnapshot: {
        sourceType: "API",
        connector: {
          connectorId: USPTO_TSDR_JOB_CONNECTOR_ID,
          version: USPTO_TSDR_JOB_CONNECTOR_VERSION,
        },
        connectorConfig,
        secretRef: SECRET_REF,
        canonicalUri: "https://tsdrapi.uspto.gov",
      },
      planSnapshot: {
        policy: { rateLimitPerMinute },
        output: { artifactKinds: outputKinds },
      },
    },
  } as unknown as ArtifactBackedExecutionContext;
}

function selectedConfig() {
  return {
    intent: "SELECTED_DOCUMENT_BINARY",
    serialNumber: "90817045",
    format: "PDF",
    purpose: "LIVE_BUSINESS_EVENT",
    businessChain: "OA",
    document: {
      sourceIndexArtifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAW",
      sourceDocumentId: "OOA20250101120000",
      sourceDocumentType: "OFFICE ACTION",
      sourceDescription: "Non-final Office action",
      family: "OFFICE_ACTION",
      classifierIdentity: "uspto-tsdr-document-family",
      classifierVersion: "1.1.0",
    },
  };
}

describe("UsptoTsdrJobArtifactAcquirer", () => {
  it("derives index authority and rate budget from the immutable Job snapshots", async () => {
    const seen: Array<{ url: string; headers: Readonly<Record<string, string>> }> = [];
    const acquirer = new UsptoTsdrJobArtifactAcquirer({
      secretResolver: {
        resolve: async (secretRef) => {
          expect(secretRef).toBe(SECRET_REF);
          return "runtime-key";
        },
      },
      indexTransport: async (request) => {
        seen.push({ url: request.url, headers: request.headers });
        return {
          status: 200,
          contentType: "application/xml",
          body: new TextEncoder().encode("<documents />"),
        };
      },
    });

    const artifacts = await acquirer.acquire(
      context({ intent: "CASE_DOCUMENT_INDEX", serialNumber: "90817045" }, ["XML"], 30),
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("https://tsdrapi.uspto.gov/ts/cd/casedocs/bundle.xml?sn=90817045");
    expect(seen[0]?.headers["USPTO-API-KEY"]).toBe("runtime-key");
    expect(artifacts[0]).toMatchObject({ artifactKind: "XML" });
  });

  it("routes an admitted OA selection to the selected-document binary acquirer", async () => {
    const acquirer = new UsptoTsdrJobArtifactAcquirer({
      secretResolver: { resolve: async () => "runtime-key" },
      binaryTransport: async () => ({
        status: 200,
        contentType: "application/pdf",
        body: new TextEncoder().encode("%PDF-1.7\nreal-shaped-fixture"),
      }),
    });

    const artifacts = await acquirer.acquire(context(selectedConfig(), ["PDF"], 4));

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      artifactKind: "PDF",
      parentArtifactIds: ["art_01ARZ3NDEKTSV4RRFFQ69G5FAW"],
      sourceUri:
        "https://tsdrapi.uspto.gov/ts/cd/casedoc/sn90817045/OOA20250101120000/download.pdf",
    });
  });

  it("fails closed when a selected-binary CollectionPlan exceeds the TSDR binary budget", async () => {
    const acquirer = new UsptoTsdrJobArtifactAcquirer({
      secretResolver: { resolve: async () => "runtime-key" },
    });

    await expect(acquirer.acquire(context(selectedConfig(), ["PDF"], 5))).rejects.toMatchObject({
      code: "TSDR_RATE_LIMIT_EXCEEDED",
    });
  });

  it("rejects connectorConfig fields that could smuggle alternate authority", async () => {
    const acquirer = new UsptoTsdrJobArtifactAcquirer({
      secretResolver: { resolve: async () => "runtime-key" },
    });

    await expect(
      acquirer.acquire(
        context(
          {
            intent: "CASE_DOCUMENT_INDEX",
            serialNumber: "90817045",
            apiOrigin: "https://example.test",
          },
          ["XML"],
          30,
        ),
      ),
    ).rejects.toMatchObject({ code: "TSDR_JOB_CONFIG_INVALID" });
  });

  it("rejects a source that is not the governed USPTO TSDR connector identity", async () => {
    const input = context({ intent: "CASE_DOCUMENT_INDEX", serialNumber: "90817045" }, ["XML"], 30);
    input.job.sourceSnapshot.connector.connectorId = "generic-api";
    const acquirer = new UsptoTsdrJobArtifactAcquirer({
      secretResolver: { resolve: async () => "runtime-key" },
    });

    await expect(acquirer.acquire(input)).rejects.toMatchObject({
      code: "TSDR_SOURCE_BOUNDARY_INVALID",
    });
  });

  it("publishes a runtime descriptor that preserves the artifact-backed authority boundary", () => {
    expect(usptoTsdrJobRuntimeDescriptor()).toMatchObject({
      connectorId: "uspto-tsdr",
      officialOrigin: "https://tsdrapi.uspto.gov",
      requestDerivedFromImmutableJobSnapshot: true,
      rawSecretForbidden: true,
      artifactBackedIngestionRequired: true,
    });
  });
});