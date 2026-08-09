import {
  SOURCE_INTELLIGENCE_POLICY_AUDIT_EXPORT_MAX_EVENTS,
  SOURCE_INTELLIGENCE_POLICY_AUDIT_QUERY_PROTOCOL_VERSION,
  type SourceIntelligencePolicyAuditAction,
  type SourceIntelligencePolicyAuditCursorV2,
  type SourceIntelligencePolicyAuditEventV2,
  type SourceIntelligencePolicyAuditExportV2,
  type SourceIntelligencePolicyAuditQueryFiltersV2,
  type SourceIntelligencePolicyAuditQueryResultV2,
  type SourceIntelligencePolicyAuditQueryV2,
  type SourceIntelligencePolicyAuditScope,
} from "@markorbit/contracts";

export const SOURCE_INTELLIGENCE_POLICY_AUDIT_QUERY_DEFAULT_PAGE_SIZE = 25;
export const SOURCE_INTELLIGENCE_POLICY_AUDIT_QUERY_MAX_PAGE_SIZE = 100;

const SCOPE_ORDER = new Set<SourceIntelligencePolicyAuditScope>([
  "GLOBAL_POLICY",
  "COHORT",
  "MEMBERSHIP",
]);
const ACTION_ORDER = new Set<SourceIntelligencePolicyAuditAction>([
  "SNAPSHOT_BACKFILL",
  "GLOBAL_POLICY_CHANGED",
  "COHORT_CREATED",
  "COHORT_UPDATED",
  "MEMBERSHIP_ADDED",
  "MEMBERSHIP_REMOVED",
]);

function normalizedStrings(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
}

function normalizedEnumValues<T extends string>(
  values: T[] | undefined,
  allowed: ReadonlySet<T>,
  field: string,
): T[] {
  const normalized = normalizedStrings(values) as T[];
  for (const value of normalized) {
    if (!allowed.has(value)) throw new Error(`${field} contains unsupported value: ${value}`);
  }
  return normalized;
}

function normalizedInstant(value: string | null | undefined, field: string): string | null {
  if (value === null || value === undefined || !value.trim()) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${field} must be a valid timestamp`);
  return date.toISOString();
}

export function normalizeSourceIntelligencePolicyAuditFiltersV2(input: {
  scopes?: SourceIntelligencePolicyAuditScope[];
  actions?: SourceIntelligencePolicyAuditAction[];
  actorLabels?: string[];
  sourceIds?: string[];
  cohortIds?: string[];
  occurredFromInclusive?: string | null;
  occurredToExclusive?: string | null;
}): SourceIntelligencePolicyAuditQueryFiltersV2 {
  const occurredFromInclusive = normalizedInstant(
    input.occurredFromInclusive,
    "occurredFromInclusive",
  );
  const occurredToExclusive = normalizedInstant(input.occurredToExclusive, "occurredToExclusive");
  if (
    occurredFromInclusive &&
    occurredToExclusive &&
    Date.parse(occurredFromInclusive) >= Date.parse(occurredToExclusive)
  ) {
    throw new Error("occurredFromInclusive must be earlier than occurredToExclusive");
  }
  return {
    scopes: normalizedEnumValues(input.scopes, SCOPE_ORDER, "scopes"),
    actions: normalizedEnumValues(input.actions, ACTION_ORDER, "actions"),
    actorLabels: normalizedStrings(input.actorLabels),
    sourceIds: normalizedStrings(input.sourceIds),
    cohortIds: normalizedStrings(input.cohortIds),
    occurredFromInclusive,
    occurredToExclusive,
  };
}

export function normalizeSourceIntelligencePolicyAuditQueryV2(
  input: Parameters<typeof normalizeSourceIntelligencePolicyAuditFiltersV2>[0] & {
    pageSize?: number;
    cursor?: string | null;
  },
): SourceIntelligencePolicyAuditQueryV2 {
  const pageSize = input.pageSize ?? SOURCE_INTELLIGENCE_POLICY_AUDIT_QUERY_DEFAULT_PAGE_SIZE;
  if (
    !Number.isInteger(pageSize) ||
    pageSize <= 0 ||
    pageSize > SOURCE_INTELLIGENCE_POLICY_AUDIT_QUERY_MAX_PAGE_SIZE
  ) {
    throw new Error(
      `pageSize must be an integer between 1 and ${SOURCE_INTELLIGENCE_POLICY_AUDIT_QUERY_MAX_PAGE_SIZE}`,
    );
  }
  const cursor = input.cursor?.trim() || null;
  if (cursor) decodeSourceIntelligencePolicyAuditCursorV2(cursor);
  return {
    ...normalizeSourceIntelligencePolicyAuditFiltersV2(input),
    pageSize,
    cursor,
  };
}

export function encodeSourceIntelligencePolicyAuditCursorV2(
  cursor: SourceIntelligencePolicyAuditCursorV2,
): string {
  return Buffer.from(JSON.stringify([cursor.occurredAt, cursor.eventId]), "utf8").toString("base64url");
}

export function decodeSourceIntelligencePolicyAuditCursorV2(
  encoded: string,
): SourceIntelligencePolicyAuditCursorV2 {
  try {
    const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
    if (
      !Array.isArray(decoded) ||
      decoded.length !== 2 ||
      typeof decoded[0] !== "string" ||
      typeof decoded[1] !== "string" ||
      !decoded[1]
    ) {
      throw new Error("invalid cursor payload");
    }
    const occurredAt = normalizedInstant(decoded[0], "cursor.occurredAt");
    if (!occurredAt) throw new Error("cursor.occurredAt is required");
    return { occurredAt, eventId: decoded[1] };
  } catch (error) {
    throw new Error(
      `cursor must be a D2.16 audit cursor${error instanceof Error ? `: ${error.message}` : ""}`,
    );
  }
}

export function compareSourceIntelligencePolicyAuditEventsNewestFirst(
  left: SourceIntelligencePolicyAuditEventV2,
  right: SourceIntelligencePolicyAuditEventV2,
): number {
  const time = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
  if (time !== 0) return time;
  return right.eventId.localeCompare(left.eventId);
}

function matchesFilters(
  event: SourceIntelligencePolicyAuditEventV2,
  filters: SourceIntelligencePolicyAuditQueryFiltersV2,
): boolean {
  if (filters.scopes.length && !filters.scopes.includes(event.scope)) return false;
  if (filters.actions.length && !filters.actions.includes(event.action)) return false;
  if (filters.actorLabels.length && !filters.actorLabels.includes(event.actorLabel)) return false;
  if (filters.sourceIds.length && (!event.sourceId || !filters.sourceIds.includes(event.sourceId))) {
    return false;
  }
  if (filters.cohortIds.length && (!event.cohortId || !filters.cohortIds.includes(event.cohortId))) {
    return false;
  }
  if (
    filters.occurredFromInclusive &&
    Date.parse(event.occurredAt) < Date.parse(filters.occurredFromInclusive)
  ) {
    return false;
  }
  if (
    filters.occurredToExclusive &&
    Date.parse(event.occurredAt) >= Date.parse(filters.occurredToExclusive)
  ) {
    return false;
  }
  return true;
}

function isOlderThanCursor(
  event: SourceIntelligencePolicyAuditEventV2,
  cursor: SourceIntelligencePolicyAuditCursorV2,
): boolean {
  const eventTime = Date.parse(event.occurredAt);
  const cursorTime = Date.parse(cursor.occurredAt);
  if (eventTime !== cursorTime) return eventTime < cursorTime;
  return event.eventId.localeCompare(cursor.eventId) < 0;
}

function uniqueSortedEvents(
  events: SourceIntelligencePolicyAuditEventV2[],
): SourceIntelligencePolicyAuditEventV2[] {
  const byId = new Map<string, SourceIntelligencePolicyAuditEventV2>();
  for (const event of events) byId.set(event.eventId, event);
  return [...byId.values()].sort(compareSourceIntelligencePolicyAuditEventsNewestFirst);
}

const boundaries: SourceIntelligencePolicyAuditQueryResultV2["boundaries"] = {
  queryDoesNotAuthorizeAction: true,
  exportDoesNotAuthorizeAction: true,
  auditStateMutated: false,
  effectivePolicyMutated: false,
  automaticCohortAssignmentApplied: false,
  automaticRoutingApplied: false,
  automaticEscalationApplied: false,
  automaticNotificationApplied: false,
  automaticCollectionApplied: false,
  operatorIdentityVerified: false,
  permissionsInferred: false,
  legalTruthVerified: false,
  authorityInferred: false,
  professionalQualityVerified: false,
  crossSourceIdentityResolved: false,
  autoScheduleApplied: false,
  grantsCollectionAuthority: false,
  grantsMgsnQualification: false,
};

export function buildSourceIntelligencePolicyAuditQueryResultV2(input: {
  events: SourceIntelligencePolicyAuditEventV2[];
  query: SourceIntelligencePolicyAuditQueryV2;
  generatedAt: string;
}): SourceIntelligencePolicyAuditQueryResultV2 {
  const cursor = input.query.cursor
    ? decodeSourceIntelligencePolicyAuditCursorV2(input.query.cursor)
    : null;
  const matching = uniqueSortedEvents(input.events).filter(
    (event) => matchesFilters(event, input.query) && (!cursor || isOlderThanCursor(event, cursor)),
  );
  const visible = matching.slice(0, input.query.pageSize);
  const hasMore = matching.length > visible.length;
  const last = visible.at(-1);
  return {
    protocolVersion: SOURCE_INTELLIGENCE_POLICY_AUDIT_QUERY_PROTOCOL_VERSION,
    objectType: "SOURCE_INTELLIGENCE_POLICY_AUDIT_QUERY_RESULT",
    generatedAt: input.generatedAt,
    query: input.query,
    events: visible,
    page: {
      eventCount: visible.length,
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeSourceIntelligencePolicyAuditCursorV2({
              occurredAt: last.occurredAt,
              eventId: last.eventId,
            })
          : null,
    },
    semantics: {
      filtersMatchStoredAuditFieldsOnly: true,
      sourceFilterDoesNotInferAffectedSources: true,
      actorFilterMatchesRecordedLabelExactly: true,
      occurredFromIsInclusive: true,
      occurredToIsExclusive: true,
      cursorUsesOccurredAtAndEventIdOrdering: true,
      paginationIsReadOnly: true,
      exportUsesSameNormalizedFilters: true,
    },
    scheduling: { policyStatus: "NOT_AUTHORIZED_UNCALIBRATED" },
    boundaries,
  };
}

export function buildSourceIntelligencePolicyAuditExportV2(input: {
  events: SourceIntelligencePolicyAuditEventV2[];
  filters: SourceIntelligencePolicyAuditQueryFiltersV2;
}): SourceIntelligencePolicyAuditExportV2 {
  const matching = uniqueSortedEvents(input.events).filter((event) => matchesFilters(event, input.filters));
  const truncated = matching.length > SOURCE_INTELLIGENCE_POLICY_AUDIT_EXPORT_MAX_EVENTS;
  const events = matching.slice(0, SOURCE_INTELLIGENCE_POLICY_AUDIT_EXPORT_MAX_EVENTS);
  return {
    protocolVersion: SOURCE_INTELLIGENCE_POLICY_AUDIT_QUERY_PROTOCOL_VERSION,
    objectType: "SOURCE_INTELLIGENCE_POLICY_AUDIT_EXPORT",
    filters: input.filters,
    eventCount: events.length,
    truncated,
    maxEvents: SOURCE_INTELLIGENCE_POLICY_AUDIT_EXPORT_MAX_EVENTS,
    events,
    semantics: {
      deterministicForSameStoredEventsAndNormalizedFilters: true,
      generatedAtExcludedFromExportPayload: true,
      newestFirstOrdering: true,
      sourceFilterMatchesEventSourceIdOnly: true,
      actorLabelsAreRecordedWorkflowLabelsNotAuthenticatedIdentities: true,
    },
    scheduling: { policyStatus: "NOT_AUTHORIZED_UNCALIBRATED" },
    boundaries,
  };
}

export function serializeSourceIntelligencePolicyAuditExportJsonV2(
  value: SourceIntelligencePolicyAuditExportV2,
): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function csvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

export function serializeSourceIntelligencePolicyAuditExportCsvV2(
  value: SourceIntelligencePolicyAuditExportV2,
): string {
  const rows = [
    [
      "eventId",
      "occurredAt",
      "scope",
      "action",
      "actorLabel",
      "policyId",
      "cohortId",
      "sourceId",
      "historicalCompleteness",
      "changesJson",
    ],
    ...value.events.map((event) => [
      event.eventId,
      event.occurredAt,
      event.scope,
      event.action,
      event.actorLabel,
      event.policyId ?? "",
      event.cohortId ?? "",
      event.sourceId ?? "",
      event.historicalCompleteness,
      JSON.stringify(event.changes),
    ]),
  ];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}
