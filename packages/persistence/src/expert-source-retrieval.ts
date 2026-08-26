import { DatabaseSync } from "node:sqlite";
import {
  EXPERT_SOURCE_RETRIEVAL_PROTOCOL_VERSION,
  EXPERT_SOURCE_RETRIEVAL_RESULT_OBJECT_TYPE,
  isExpertSourceRecordV1,
  type ExpertSourceRecordV1,
  type ExpertSourceRetrievalRequestV1,
  type ExpertSourceRetrievalResultV1,
} from "@markorbit/contracts";
import { RegistryValidationError } from "./index";
import { ensureExpertSourceRegistry } from "./expert-source-registry";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export type ExpertSourceRetrievalScope = {
  taskIds: readonly string[];
};

function optionalText(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized) throw new RegistryValidationError(`${field} must not be empty`);
  return normalized;
}

function optionalTimestamp(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized || Number.isNaN(Date.parse(normalized))) {
    throw new RegistryValidationError(`${field} must be a valid timestamp`);
  }
  return new Date(normalized).toISOString();
}

function pagination(value: number | undefined, field: "limit" | "offset"): number {
  if (value === undefined) return field === "limit" ? DEFAULT_LIMIT : 0;
  if (!Number.isInteger(value) || value < (field === "limit" ? 1 : 0)) {
    throw new RegistryValidationError(
      field === "limit"
        ? "limit must be a positive integer"
        : "offset must be a non-negative integer",
    );
  }
  if (field === "limit" && value > MAX_LIMIT) {
    throw new RegistryValidationError(`limit must not exceed ${MAX_LIMIT}`);
  }
  return value;
}

function parseSourceRecord(value: string): ExpertSourceRecordV1 {
  const parsed = JSON.parse(value) as unknown;
  if (!isExpertSourceRecordV1(parsed)) {
    throw new RegistryValidationError("Stored Expert source record is invalid");
  }
  return parsed;
}

function includesRef(values: readonly string[], expected: string | undefined): boolean {
  return expected === undefined || values.includes(expected);
}

export class SqliteExpertSourceRetrievalRepository {
  constructor(private readonly database: DatabaseSync) {
    ensureExpertSourceRegistry(database);
  }

  search(
    input: ExpertSourceRetrievalRequestV1 = {},
    scope?: ExpertSourceRetrievalScope,
  ): ExpertSourceRetrievalResultV1 {
    const jurisdiction = optionalText(input.jurisdiction, "jurisdiction");
    const topic = optionalText(input.topic, "topic");
    const expertRef = optionalText(input.expertRef, "expertRef");
    const organizationRef = optionalText(input.organizationRef, "organizationRef");
    const relatedSourceRef = optionalText(input.relatedSourceRef, "relatedSourceRef");
    const relatedCaseRef = optionalText(input.relatedCaseRef, "relatedCaseRef");
    const receivedFrom = optionalTimestamp(input.receivedFrom, "receivedFrom");
    const receivedTo = optionalTimestamp(input.receivedTo, "receivedTo");
    if (receivedFrom && receivedTo && receivedFrom > receivedTo) {
      throw new RegistryValidationError("receivedFrom must not be after receivedTo");
    }
    const limit = pagination(input.limit, "limit");
    const offset = pagination(input.offset, "offset");
    const allowedTaskIds = scope ? new Set(scope.taskIds) : undefined;

    const clauses: string[] = [];
    const values: string[] = [];
    if (receivedFrom) {
      clauses.push("received_at >= ?");
      values.push(receivedFrom);
    }
    if (receivedTo) {
      clauses.push("received_at <= ?");
      values.push(receivedTo);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.database
      .prepare(
        `SELECT document_json
         FROM expert_source_records
         ${where}
         ORDER BY received_at DESC, source_record_id ASC`,
      )
      .all(...values) as { document_json: string }[];

    const matched = rows
      .map((row) => parseSourceRecord(row.document_json))
      .filter(
        (record) =>
          (allowedTaskIds === undefined || allowedTaskIds.has(record.taskId)) &&
          (jurisdiction === undefined || record.jurisdiction === jurisdiction) &&
          (topic === undefined || record.topic === topic) &&
          (expertRef === undefined || record.expertRef === expertRef) &&
          (organizationRef === undefined || record.organizationRef === organizationRef) &&
          includesRef(record.relatedSourceRefs, relatedSourceRef) &&
          includesRef(record.relatedCaseRefs, relatedCaseRef),
      );

    const filters: ExpertSourceRetrievalResultV1["filters"] = {
      ...(jurisdiction ? { jurisdiction } : {}),
      ...(topic ? { topic } : {}),
      ...(expertRef ? { expertRef } : {}),
      ...(organizationRef ? { organizationRef } : {}),
      ...(receivedFrom ? { receivedFrom } : {}),
      ...(receivedTo ? { receivedTo } : {}),
      ...(relatedSourceRef ? { relatedSourceRef } : {}),
      ...(relatedCaseRef ? { relatedCaseRef } : {}),
    };

    return {
      protocolVersion: EXPERT_SOURCE_RETRIEVAL_PROTOCOL_VERSION,
      objectType: EXPERT_SOURCE_RETRIEVAL_RESULT_OBJECT_TYPE,
      filters,
      items: matched.slice(offset, offset + limit),
      total: matched.length,
      limit,
      offset,
    };
  }
}
