import {
  CROSS_SOURCE_PARENT_ARTIFACT_IDS_EXTENSION,
  type SourceDefinition,
} from "@markorbit/contracts";
import {
  GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_ID,
  GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
  GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_SOURCE,
} from "@markorbit/worker-runtime";
import { describe, expect, it } from "vitest";
import { deriveGlobalTrademarkPublisherRunExtensions } from "./global-trademark-publisher-run-grant";

const ARTIFACT_ID = "art_01M3R6BKPTZ1G41VTZV8VHTFW6";

function publisherSource(overrides: Partial<SourceDefinition> = {}): SourceDefinition {
  return {
    schemaVersion: "1.0",
    objectType: "SOURCE_DEFINITION",
    id: "src_01M3R74KQ5FFDZ7T6CJRSVABP4",
    workspaceId: "wsp_01M3R3BDT3M4V1JWZ8WMX4Z3ZA",
    name: "Global Trademark Fact Admission Requests - Laos Pilot",
    slug: "global-trademark-fact-admission-laos-pilot",
    sourceType: "DATABASE",
    category: "INTERNAL",
    authorityLevel: "INTERNAL",
    status: "ACTIVE",
    jurisdictions: ["LA"],
    languages: ["en-US"],
    connector: {
      connectorId: GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_ID,
      version: GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_CONNECTOR_VERSION,
    },
    connectorConfig: {
      intent: "PUBLISH_DURABLE_REQUEST",
      requestArtifactRef: {
        artifactId: ARTIFACT_ID,
        canonicalUri: "la-dipo://wopublish/trademarks/list/page/1/fact-admission-request",
        sha256: "a".repeat(64),
        sizeBytes: 123,
      },
    },
    canonicalUri: GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_SOURCE,
    entrypoints: [
      {
        uri: GLOBAL_TRADEMARK_FACT_ADMISSION_JOB_SOURCE,
        label: "Durable Knowledge requests",
      },
    ],
    tags: ["internal", "global-trademark", "fact-admission"],
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("global trademark publisher manual Run grant", () => {
  it("derives the exact frozen request artifact grant", () => {
    expect(
      deriveGlobalTrademarkPublisherRunExtensions({
        source: publisherSource(),
        rawExtensions: undefined,
      }),
    ).toEqual({
      [CROSS_SOURCE_PARENT_ARTIFACT_IDS_EXTENSION]: [ARTIFACT_ID],
    });
  });

  it("rejects caller-supplied publisher extensions", () => {
    expect(() =>
      deriveGlobalTrademarkPublisherRunExtensions({
        source: publisherSource(),
        rawExtensions: {
          [CROSS_SOURCE_PARENT_ARTIFACT_IDS_EXTENSION]: [ARTIFACT_ID],
        },
      }),
    ).toThrowError(/derived from the frozen Source/u);
  });

  it("rejects a malformed publisher Source or immutable request reference", () => {
    expect(() =>
      deriveGlobalTrademarkPublisherRunExtensions({
        source: publisherSource({ canonicalUri: "markorbit://wrong" }),
        rawExtensions: undefined,
      }),
    ).toThrowError(/Source boundary/u);

    expect(() =>
      deriveGlobalTrademarkPublisherRunExtensions({
        source: publisherSource({
          connectorConfig: {
            intent: "PUBLISH_DURABLE_REQUEST",
            requestArtifactRef: {
              artifactId: "art_bad",
              canonicalUri: "la-dipo://wopublish/trademarks/list/page/1/fact-admission-request",
              sha256: "a".repeat(64),
              sizeBytes: 123,
            },
          },
        }),
        rawExtensions: undefined,
      }),
    ).toThrowError(/requestArtifactRef/u);
  });

  it("leaves non-publisher Sources to the existing manual extension parser", () => {
    expect(
      deriveGlobalTrademarkPublisherRunExtensions({
        source: publisherSource({
          connector: { connectorId: "crawl4ai", version: "1.0.0" },
        }),
        rawExtensions: undefined,
      }),
    ).toBeNull();
  });
});
