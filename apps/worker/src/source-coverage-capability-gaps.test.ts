import { describe, expect, it } from "vitest";
import type { CoverageTarget } from "./source-coverage-bootstrap";
import {
  assertFoundationalTargetDispatchable,
  foundationalSupplyCapabilityGaps,
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

describe("foundational structured supply capability gaps", () => {
  it("fails closed before dispatch when JSON is expected but no structured capture path exists", () => {
    const cnipa = target({
      id: "cn-cnipa-trademark-search",
      expectedArtifactKinds: ["HTML", "JSON"],
    });

    expect(foundationalSupplyCapabilityGaps([cnipa])).toEqual([
      {
        targetId: "cn-cnipa-trademark-search",
        code: "STRUCTURED_ENDPOINT_NOT_CAPTURED",
        expectedArtifactKinds: ["JSON"],
      },
    ]);
    expect(() => assertFoundationalTargetDispatchable(cnipa)).toThrow(
      /STRUCTURED_ENDPOINT_NOT_CAPTURED/u,
    );
  });

  it("allows page-only and attachment-backed targets to dispatch", () => {
    const pageOnly = target({
      id: "gb-ukipo-register-trademark",
      expectedArtifactKinds: ["HTML", "MARKDOWN"],
    });
    const jsonAttachment = target({
      id: "example-json-download",
      expectedArtifactKinds: ["HTML", "JSON"],
      fetchAttachmentsHint: true,
    });

    expect(foundationalSupplyCapabilityGaps([pageOnly, jsonAttachment])).toEqual([]);
    expect(() => assertFoundationalTargetDispatchable(pageOnly)).not.toThrow();
    expect(() => assertFoundationalTargetDispatchable(jsonAttachment)).not.toThrow();
  });
});
