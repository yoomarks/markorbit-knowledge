import { describe, expect, it } from "vitest";
import {
  isContentEdgeV1,
  isContentFacetV1,
  normalizeContentFacetValue,
  type ContentObjectRefV1,
} from "./content-relationship-v1";

const left: ContentObjectRefV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_OBJECT_REF",
  objectId: "web:article:1",
  objectKind: "WEB_CONTENT",
  workspaceId: "workspace-a",
};

const right: ContentObjectRefV1 = {
  protocolVersion: "1.0",
  objectType: "CONTENT_OBJECT_REF",
  objectId: "expert:source:1",
  objectKind: "EXPERT_SOURCE",
  workspaceId: "workspace-a",
};

describe("content relationship v1", () => {
  it("normalizes objective facets deterministically", () => {
    expect(normalizeContentFacetValue("  US   Trademark Assignment ")).toBe(
      "us trademark assignment",
    );
    expect(
      isContentFacetV1({
        protocolVersion: "1.0",
        objectType: "CONTENT_FACET",
        content: left,
        facetType: "TOPIC",
        value: "US Trademark Assignment",
        normalizedValue: "us trademark assignment",
        origin: "SYSTEM_DERIVED",
      }),
    ).toBe(true);
  });

  it("requires machine-derived content similarity to identify its algorithm", () => {
    expect(
      isContentEdgeV1({
        protocolVersion: "1.0",
        objectType: "CONTENT_EDGE",
        from: left,
        relationType: "SIMILAR_TO",
        to: right,
        origin: "MACHINE_DERIVED",
      }),
    ).toBe(false);

    expect(
      isContentEdgeV1({
        protocolVersion: "1.0",
        objectType: "CONTENT_EDGE",
        from: left,
        relationType: "SIMILAR_TO",
        to: right,
        origin: "MACHINE_DERIVED",
        algorithm: { id: "content-embedding", version: "1.0.0" },
      }),
    ).toBe(true);
  });

  it("rejects cross-workspace graph edges and unsupported inference relations", () => {
    expect(
      isContentEdgeV1({
        protocolVersion: "1.0",
        objectType: "CONTENT_EDGE",
        from: left,
        relationType: "CITES",
        to: { ...right, workspaceId: "workspace-b" },
        origin: "EXPLICIT_SOURCE",
      }),
    ).toBe(false);

    expect(
      isContentEdgeV1({
        protocolVersion: "1.0",
        objectType: "CONTENT_EDGE",
        from: left,
        relationType: "RELATED_TO_CUSTOMER_CASE",
        to: right,
        origin: "SYSTEM_DERIVED",
      }),
    ).toBe(false);
  });
});
