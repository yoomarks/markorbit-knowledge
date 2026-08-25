import { describe, expect, it } from "vitest";
import schemaJson from "../schemas/case-candidate-v1.schema.json" with { type: "json" };
import {
  CASE_CANDIDATE_ACCESS_CLASSIFICATIONS,
  CASE_CANDIDATE_ID_PATTERN,
  CASE_CANDIDATE_OBJECT_TYPE,
  CASE_CANDIDATE_PROTOCOL_VERSION,
  CASE_CANDIDATE_SNAPSHOT_SHA256_PATTERN,
  CASE_CANDIDATE_SOURCE_SYSTEM,
  isCaseCandidateV1,
  MARKREG_FORMAL_MATTER_ID_PATTERN,
  type CaseCandidateV1,
} from "./case-candidate-v1";

type PortableSchema = {
  type?: string;
  const?: unknown;
  enum?: readonly unknown[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  required?: readonly string[];
  additionalProperties?: boolean;
  properties?: Record<string, PortableSchema>;
  "x-markorbit-date-parseable"?: boolean;
};

const schema = schemaJson as PortableSchema;
const snapshotSha = "a".repeat(64);

function candidate(overrides: Partial<CaseCandidateV1> = {}): CaseCandidateV1 {
  return {
    protocolVersion: "1.0",
    objectType: "CASE_CANDIDATE",
    candidateId: "case-candidate_wire_01",
    sourceSystem: "MARKREG",
    sourceMatterId: "formal-matter_550e8400-e29b-41d4-a716-446655440000",
    sourceMatterVersion: 1,
    sourceSnapshotSha256: snapshotSha,
    sourceRetrievalRef: "/v1/formal-matters/formal-matter_550e8400-e29b-41d4-a716-446655440000",
    promotedBy: "user:operator:wire",
    promotedAt: "2026-08-25T11:15:00.000Z",
    accessScope: {
      sourceWorkspaceId: "550e8400-e29b-41d4-a716-446655440001",
      classification: "CONFIDENTIAL",
    },
    idempotencyKey: "promotion:wire:550e8400",
    ...overrides,
  };
}

function conforms(value: unknown, rule: PortableSchema): boolean {
  if (rule.const !== undefined && value !== rule.const) return false;
  if (rule.enum !== undefined && !rule.enum.some((candidateValue) => candidateValue === value)) {
    return false;
  }

  if (rule.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const item = value as Record<string, unknown>;
    const properties = rule.properties ?? {};
    for (const requiredKey of rule.required ?? []) {
      if (!(requiredKey in item)) return false;
    }
    if (
      rule.additionalProperties === false &&
      Object.keys(item).some((key) => !(key in properties))
    ) {
      return false;
    }
    return Object.entries(item).every(([key, child]) => {
      const childRule = properties[key];
      return childRule === undefined || conforms(child, childRule);
    });
  }

  if (rule.type === "string") {
    if (typeof value !== "string") return false;
    if (rule.minLength !== undefined && value.length < rule.minLength) return false;
    if (rule.maxLength !== undefined && value.length > rule.maxLength) return false;
    if (rule.pattern !== undefined && !new RegExp(rule.pattern, "u").test(value)) return false;
    if (rule["x-markorbit-date-parseable"] === true && Number.isNaN(Date.parse(value))) {
      return false;
    }
  }

  if (rule.type === "integer") {
    if (typeof value !== "number" || !Number.isInteger(value)) return false;
    if (rule.minimum !== undefined && value < rule.minimum) return false;
    if (rule.maximum !== undefined && value > rule.maximum) return false;
  }

  return true;
}

function expectSameDecision(value: unknown): void {
  expect(conforms(value, schema)).toBe(isCaseCandidateV1(value));
}

describe("CaseCandidateV1 portable wire schema", () => {
  it("locks protocol constants, patterns and access enum to the runtime contract", () => {
    const properties = schema.properties ?? {};
    expect(properties.protocolVersion?.const).toBe(CASE_CANDIDATE_PROTOCOL_VERSION);
    expect(properties.objectType?.const).toBe(CASE_CANDIDATE_OBJECT_TYPE);
    expect(properties.sourceSystem?.const).toBe(CASE_CANDIDATE_SOURCE_SYSTEM);
    expect(properties.candidateId?.pattern).toBe(CASE_CANDIDATE_ID_PATTERN);
    expect(properties.sourceMatterId?.pattern).toBe(MARKREG_FORMAL_MATTER_ID_PATTERN);
    expect(properties.sourceSnapshotSha256?.pattern).toBe(CASE_CANDIDATE_SNAPSHOT_SHA256_PATTERN);
    expect(properties.sourceMatterVersion?.maximum).toBe(Number.MAX_SAFE_INTEGER);
    expect(properties.accessScope?.properties?.classification?.enum).toEqual([
      ...CASE_CANDIDATE_ACCESS_CLASSIFICATIONS,
    ]);
    expect(properties.promotedAt?.["x-markorbit-date-parseable"]).toBe(true);
  });

  it("keeps optional promotion notes optional and all other wire fields required", () => {
    expect(schema.required).toEqual([
      "protocolVersion",
      "objectType",
      "candidateId",
      "sourceSystem",
      "sourceMatterId",
      "sourceMatterVersion",
      "sourceSnapshotSha256",
      "sourceRetrievalRef",
      "promotedBy",
      "promotedAt",
      "accessScope",
      "idempotencyKey",
    ]);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties?.accessScope?.additionalProperties).toBe(false);
    expect(conforms(candidate(), schema)).toBe(true);
    expect(conforms(candidate({ operatorCaseValueNote: "Evidence-rich matter." }), schema)).toBe(
      true,
    );
  });

  it("matches the authoritative MarkReg FormalMatterId prefix contract without inventing a suffix length", () => {
    const minimal = candidate({
      sourceMatterId: "formal-matter_a",
      sourceRetrievalRef: "/v1/formal-matters/formal-matter_a",
    });
    expectSameDecision(minimal);
    expect(isCaseCandidateV1(minimal)).toBe(true);

    const emptySuffix = candidate({ sourceMatterId: "formal-matter_" });
    expectSameDecision(emptySuffix);
    expect(isCaseCandidateV1(emptySuffix)).toBe(false);
  });

  it("makes the portable schema and runtime validator agree on producer boundaries", () => {
    const valid = candidate();
    const invalidCases: unknown[] = [
      { ...valid, protocolVersion: "2.0" },
      { ...valid, candidateId: "candidate_01" },
      { ...valid, sourceMatterId: "matter_123" },
      { ...valid, sourceMatterVersion: 0 },
      { ...valid, sourceMatterVersion: Number.MAX_SAFE_INTEGER + 1 },
      { ...valid, sourceSnapshotSha256: "A".repeat(64) },
      { ...valid, sourceRetrievalRef: "   " },
      { ...valid, promotedBy: "\t" },
      { ...valid, promotedAt: "not-a-date" },
      { ...valid, operatorCaseValueNote: "   " },
      { ...valid, idempotencyKey: "short" },
      { ...valid, recommendation: "Do this next" },
      {
        ...valid,
        accessScope: {
          sourceWorkspaceId: "   ",
          classification: "CONFIDENTIAL",
        },
      },
      {
        ...valid,
        accessScope: {
          sourceWorkspaceId: valid.accessScope.sourceWorkspaceId,
          classification: "PUBLIC",
        },
      },
      {
        ...valid,
        accessScope: {
          ...valid.accessScope,
          authorityScore: 1,
        },
      },
    ];

    expectSameDecision(valid);
    for (const invalid of invalidCases) {
      expectSameDecision(invalid);
      expect(isCaseCandidateV1(invalid)).toBe(false);
    }
  });
});
