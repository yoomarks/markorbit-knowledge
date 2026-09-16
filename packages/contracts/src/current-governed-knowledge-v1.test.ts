import { describe, expect, it } from "vitest";
import {
  CURRENT_GOVERNED_KNOWLEDGE_OBJECT_TYPE,
  CURRENT_GOVERNED_KNOWLEDGE_PROTOCOL_VERSION,
  KNOWLEDGE_RETRIEVAL_CORPUS_CAPABILITIES_V1,
  READY_PACKAGE_COMPATIBILITY_V1,
  isCurrentGovernedKnowledgeV1,
  type CurrentGovernedKnowledgeV1,
} from "./current-governed-knowledge-v1";

const base: CurrentGovernedKnowledgeV1 = {
  protocolVersion: CURRENT_GOVERNED_KNOWLEDGE_PROTOCOL_VERSION,
  objectType: CURRENT_GOVERNED_KNOWLEDGE_OBJECT_TYPE,
  workspaceId: "wsp_private",
  stagingDocumentId: "std_current",
  sourceId: "src_current",
  readyPackageId: "rdp_current",
  states: { current: true, verified: true, consumerAdmissible: true, delivered: false },
  reasonCodes: [],
};

describe("CurrentGovernedKnowledgeV1", () => {
  it("accepts independent current, verified, admissible and delivery states", () => {
    expect(isCurrentGovernedKnowledgeV1(base)).toBe(true);
    expect(
      isCurrentGovernedKnowledgeV1({
        ...base,
        states: { current: false, verified: true, consumerAdmissible: false, delivered: true },
        reasonCodes: ["CONTENT_NOT_CURRENT"],
      }),
    ).toBe(true);
  });

  it("rejects consumer admissibility when currentness, verification or reasons disagree", () => {
    expect(
      isCurrentGovernedKnowledgeV1({
        ...base,
        states: { ...base.states, current: false },
      }),
    ).toBe(false);
    expect(
      isCurrentGovernedKnowledgeV1({
        ...base,
        reasonCodes: ["SOURCE_ARCHIVED"],
      }),
    ).toBe(false);
  });

  it("freezes V1/V2 as adapters rather than currentness authorities", () => {
    expect(READY_PACKAGE_COMPATIBILITY_V1.V1).toMatchObject({
      role: "LEGACY_STAGING_RETRIEVAL_ADAPTER",
      currentnessAuthority: false,
      newDeliveryPolicy: "COMPATIBILITY_ONLY",
    });
    expect(READY_PACKAGE_COMPATIBILITY_V1.V2).toMatchObject({
      role: "CANONICAL_DOWNSTREAM_DELIVERY_ADAPTER",
      currentnessAuthority: false,
      newDeliveryPolicy: "PREFERRED",
    });
  });

  it("advertises retrieval corpus differences instead of silently changing membership", () => {
    expect(KNOWLEDGE_RETRIEVAL_CORPUS_CAPABILITIES_V1).toEqual({
      LEXICAL: { visibleCorpus: "WORKSPACE_PLUS_GLOBAL", globalOverlay: "SUPPORTED" },
      GRAPH: { visibleCorpus: "EXACT_WORKSPACE", globalOverlay: "UNSUPPORTED" },
      VECTOR: { visibleCorpus: "EXACT_WORKSPACE", globalOverlay: "UNSUPPORTED" },
    });
  });
});
