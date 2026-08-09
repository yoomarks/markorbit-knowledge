import { describe, expect, it } from "vitest";
import type { SourceIntelligencePolicyAuditEventV2 } from "@markorbit/contracts";
import {
  buildSourceIntelligencePolicyAuditExportV2,
  buildSourceIntelligencePolicyAuditQueryResultV2,
  normalizeSourceIntelligencePolicyAuditFiltersV2,
  normalizeSourceIntelligencePolicyAuditQueryV2,
  serializeSourceIntelligencePolicyAuditExportCsvV2,
  serializeSourceIntelligencePolicyAuditExportJsonV2,
} from "../src/source-intelligence-policy-audit-query";

function event(
  partial: Partial<SourceIntelligencePolicyAuditEventV2> &
    Pick<SourceIntelligencePolicyAuditEventV2, "eventId" | "scope" | "action" | "occurredAt">,
): SourceIntelligencePolicyAuditEventV2 {
  return {
    eventId: partial.eventId,
    scope: partial.scope,
    action: partial.action,
    actorLabel: partial.actorLabel ?? "ops-lead",
    occurredAt: partial.occurredAt,
    policyId: partial.policyId ?? null,
    cohortId: partial.cohortId ?? null,
    sourceId: partial.sourceId ?? null,
    changes: partial.changes ?? [],
    historicalCompleteness: partial.historicalCompleteness ?? "EVENT_SOURCED",
  };
}

const sameTimeEvents: SourceIntelligencePolicyAuditEventV2[] = [
  event({
    eventId: "sima_a",
    scope: "MEMBERSHIP",
    action: "MEMBERSHIP_ADDED",
    actorLabel: "ops-member",
    occurredAt: "2026-08-09T02:00:00.000Z",
    cohortId: "sic_alpha",
    sourceId: "src_uspto",
  }),
  event({
    eventId: "sica_b",
    scope: "COHORT",
    action: "COHORT_UPDATED",
    actorLabel: "ops-lead",
    occurredAt: "2026-08-09T02:00:00.000Z",
    cohortId: "sic_alpha",
  }),
  event({
    eventId: "sipa_c",
    scope: "GLOBAL_POLICY",
    action: "GLOBAL_POLICY_CHANGED",
    actorLabel: "ops-lead",
    occurredAt: "2026-08-09T02:00:00.000Z",
    policyId: "source-intelligence-review-workflow",
  }),
];

describe("D2.16 policy audit query", () => {
  it("normalizes explicit filters without identity or affected-source inference", () => {
    const filters = normalizeSourceIntelligencePolicyAuditFiltersV2({
      scopes: ["MEMBERSHIP", "COHORT", "MEMBERSHIP"],
      actions: ["MEMBERSHIP_ADDED", "MEMBERSHIP_ADDED"],
      actorLabels: [" ops-member ", "ops-member"],
      sourceIds: ["src_uspto", " src_uspto "],
      cohortIds: ["sic_alpha"],
      occurredFromInclusive: "2026-08-09T01:00:00Z",
      occurredToExclusive: "2026-08-10T00:00:00Z",
    });
    expect(filters).toEqual({
      scopes: ["COHORT", "MEMBERSHIP"],
      actions: ["MEMBERSHIP_ADDED"],
      actorLabels: ["ops-member"],
      sourceIds: ["src_uspto"],
      cohortIds: ["sic_alpha"],
      occurredFromInclusive: "2026-08-09T01:00:00.000Z",
      occurredToExclusive: "2026-08-10T00:00:00.000Z",
    });

    const query = normalizeSourceIntelligencePolicyAuditQueryV2({
      sourceIds: ["src_uspto"],
      pageSize: 25,
    });
    const result = buildSourceIntelligencePolicyAuditQueryResultV2({
      events: sameTimeEvents,
      query,
      generatedAt: "2026-08-09T03:00:00.000Z",
    });
    expect(result.events.map((item) => item.eventId)).toEqual(["sima_a"]);
    expect(result.semantics.sourceFilterDoesNotInferAffectedSources).toBe(true);
    expect(result.boundaries.auditStateMutated).toBe(false);
    expect(result.scheduling.policyStatus).toBe("NOT_AUTHORIZED_UNCALIBRATED");
  });

  it("uses occurredAt plus eventId as a deterministic keyset cursor without duplicates", () => {
    const firstQuery = normalizeSourceIntelligencePolicyAuditQueryV2({ pageSize: 2 });
    const first = buildSourceIntelligencePolicyAuditQueryResultV2({
      events: sameTimeEvents,
      query: firstQuery,
      generatedAt: "2026-08-09T03:00:00.000Z",
    });
    expect(first.events.map((item) => item.eventId)).toEqual(["sipa_c", "sica_b"]);
    expect(first.page.hasMore).toBe(true);
    expect(first.page.nextCursor).toBeTruthy();

    const secondQuery = normalizeSourceIntelligencePolicyAuditQueryV2({
      pageSize: 2,
      cursor: first.page.nextCursor,
    });
    const second = buildSourceIntelligencePolicyAuditQueryResultV2({
      events: sameTimeEvents,
      query: secondQuery,
      generatedAt: "2026-08-09T03:01:00.000Z",
    });
    expect(second.events.map((item) => item.eventId)).toEqual(["sima_a"]);
    expect(second.page.hasMore).toBe(false);
    expect(new Set([...first.events, ...second.events].map((item) => item.eventId)).size).toBe(3);
  });

  it("rejects invalid time windows and malformed cursors", () => {
    expect(() =>
      normalizeSourceIntelligencePolicyAuditQueryV2({
        occurredFromInclusive: "2026-08-10T00:00:00Z",
        occurredToExclusive: "2026-08-09T00:00:00Z",
      }),
    ).toThrow(/earlier/);
    expect(() =>
      normalizeSourceIntelligencePolicyAuditQueryV2({ cursor: "not-a-d2-16-cursor" }),
    ).toThrow(/cursor/);
  });

  it("produces deterministic JSON and fixed-schema CSV exports from the same filters", () => {
    const filters = normalizeSourceIntelligencePolicyAuditFiltersV2({ actorLabels: ["ops,\"lead\""] });
    const events = [
      event({
        eventId: "sica_export",
        scope: "COHORT",
        action: "COHORT_UPDATED",
        actorLabel: "ops,\"lead\"",
        occurredAt: "2026-08-09T04:00:00.000Z",
        cohortId: "sic_alpha",
        changes: [{ field: "priority", before: 10, after: 20 }],
      }),
    ];
    const first = buildSourceIntelligencePolicyAuditExportV2({ events, filters });
    const second = buildSourceIntelligencePolicyAuditExportV2({ events: [...events].reverse(), filters });
    const firstJson = serializeSourceIntelligencePolicyAuditExportJsonV2(first);
    const secondJson = serializeSourceIntelligencePolicyAuditExportJsonV2(second);
    expect(firstJson).toBe(secondJson);
    expect(firstJson).not.toContain("generatedAt");
    expect(first.semantics.deterministicForSameStoredEventsAndNormalizedFilters).toBe(true);
    expect(first.boundaries.exportDoesNotAuthorizeAction).toBe(true);

    const csv = serializeSourceIntelligencePolicyAuditExportCsvV2(first);
    expect(csv.split("\n")[0]).toBe(
      "eventId,occurredAt,scope,action,actorLabel,policyId,cohortId,sourceId,historicalCompleteness,changesJson",
    );
    expect(csv).toContain('"ops,""lead"""');
    expect(csv).toContain('"[{""field"":""priority"",""before"":10,""after"":20}]"');
  });
});
