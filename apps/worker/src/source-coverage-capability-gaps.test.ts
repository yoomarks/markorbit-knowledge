import { describe, expect, it } from "vitest";
import type { CoverageTarget } from "./source-coverage-bootstrap";
import {
  assertFoundationalTargetDispatchable,
  foundationalSupplyCapabilityGaps,
  supplyCapabilityRemediation,
  webCapturableArtifactKinds,
} from "./source-coverage-capability-gaps";

function target(input: {
  id: string;
  expectedArtifactKinds: string[];
  fetchAttachmentsHint?: boolean;
}): CoverageTarget {
  return {
    id: input.id,
    jurisdiction: "CN",
    authorityName: "Official Authority",
    authorityBasis: "EXPLICIT_CURATED",
    family: "SEARCH",
    displayName: input.id,
    canonicalUri: "https://example.test/search",
    entrypoints: [{ uri: "https://example.test/search" }],
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    languages: ["en"],
    coverageTier: "FOUNDATIONAL",
    catalogState: "ACTIVE",
    acquisition: {
      mode: "MIXED",
      renderJavascriptHint: true,
      fetchAttachmentsHint: input.fetchAttachmentsHint ?? false,
      expectedArtifactKinds: input.expectedArtifactKinds,
    },
    protocolVersion: "1.0",
  };
}

describe("foundational web artifact capability gaps", () => {
  it("classifies structured gaps into governed API remediation without authorizing collection", () => {
    const cnipa = target({
      id: "cn-cnipa-trademark-search",
      expectedArtifactKinds: ["HTML", "JSON", "XML"],
    });

    expect(webCapturableArtifactKinds(cnipa)).toEqual(["HTML", "MARKDOWN"]);
    expect(foundationalSupplyCapabilityGaps([cnipa])).toEqual([
      {
        targetId: "cn-cnipa-trademark-search",
        code: "STRUCTURED_ENDPOINT_NOT_CAPTURED",
        expectedArtifactKinds: ["JSON", "XML"],
        remediation: {
          automaticExecution: false,
          collectionAuthorization: "NONE",
          apiBinding: {
            connectorId: "api-worker",
            connectorVersion: "1.0.0",
            sourceType: "API",
            jobType: "API_COLLECTION",
            endpointBindingRequired: true,
            artifactKinds: ["JSON", "XML"],
          },
          webAttachments: null,
          unsupportedArtifactKinds: [],
        },
      },
    ]);
    expect(() => assertFoundationalTargetDispatchable(cnipa)).toThrow(
      /STRUCTURED_ENDPOINT_NOT_CAPTURED/u,
    );
  });

  it("allows page-only targets and supported attachment artifact kinds", () => {
    const pageOnly = target({
      id: "gb-ukipo-register-trademark",
      expectedArtifactKinds: ["HTML", "MARKDOWN"],
    });
    const attachments = target({
      id: "example-downloads",
      expectedArtifactKinds: ["HTML", "PDF", "JSON", "IMAGE", "TEXT"],
      fetchAttachmentsHint: true,
    });

    expect(foundationalSupplyCapabilityGaps([pageOnly, attachments])).toEqual([]);
    expect(() => assertFoundationalTargetDispatchable(pageOnly)).not.toThrow();
    expect(() => assertFoundationalTargetDispatchable(attachments)).not.toThrow();
  });

  it("separates attachment enablement from unsupported connector capability review", () => {
    expect(supplyCapabilityRemediation(["PDF", "DOCX", "PARQUET"])).toEqual({
      automaticExecution: false,
      collectionAuthorization: "NONE",
      apiBinding: null,
      webAttachments: {
        fetchAttachmentsRequired: true,
        artifactKinds: ["PDF", "DOCX"],
      },
      unsupportedArtifactKinds: ["PARQUET"],
    });

    const unsupported = target({
      id: "example-unsupported-artifact",
      expectedArtifactKinds: ["HTML", "PARQUET"],
      fetchAttachmentsHint: true,
    });
    expect(foundationalSupplyCapabilityGaps([unsupported])[0]?.remediation).toMatchObject({
      apiBinding: null,
      webAttachments: null,
      unsupportedArtifactKinds: ["PARQUET"],
    });
    expect(() => assertFoundationalTargetDispatchable(unsupported)).toThrow(/PARQUET/u);
  });
});
