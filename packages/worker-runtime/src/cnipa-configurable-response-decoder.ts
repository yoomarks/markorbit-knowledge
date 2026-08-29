import {
  CnipaAcquisitionError,
  type CnipaDecodedDetail,
  type CnipaDecodedListPage,
  type CnipaDocumentKind,
  type CnipaJudgmentResponseDecoder,
  type CnipaPartyRole,
} from "./cnipa-trademark-judgment";

export type CnipaResponsePath = readonly string[];

export type CnipaListResponseSchema = {
  recordsPath: CnipaResponsePath;
  sourceRecordIdField: string;
  totalPath?: CnipaResponsePath;
  hasMorePath?: CnipaResponsePath;
};

export type CnipaDetailFieldSchema = {
  registrationNumber?: string;
  trademarkName?: string;
  decisionDate?: string;
  documentNumber?: string;
  contentHtml?: string;
  contentText?: string;
};

export type CnipaPartyFieldSchema = {
  field: string;
  role: CnipaPartyRole;
};

export type CnipaDetailResponseSchema = {
  rootPath?: CnipaResponsePath;
  sourceRecordIdField?: string;
  fields?: CnipaDetailFieldSchema;
  parties?: Partial<Record<CnipaDocumentKind, readonly CnipaPartyFieldSchema[]>>;
};

export type CnipaResponseSchemaConfig = {
  list: CnipaListResponseSchema;
  detail: CnipaDetailResponseSchema;
};

const PARTY_ROLES = new Set<CnipaPartyRole>([
  "APPLICANT",
  "RESPONDENT",
  "OPPOSER",
  "OPPOSED_PARTY",
  "UNVERIFIED",
]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function schemaError(message: string): never {
  throw new CnipaAcquisitionError("CNIPA_SCHEMA_UNVERIFIED", message, false);
}

function responseError(message: string): never {
  throw new CnipaAcquisitionError("CNIPA_SCHEMA_CHANGED", message, false);
}

function fieldName(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return schemaError(`${label} must be a bounded source field name`);
  }
  return value.trim();
}

function responsePath(value: unknown, label: string, allowEmpty = false): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.length > 12) {
    return schemaError(`${label} must be ${allowEmpty ? "an" : "a non-empty"} array of path keys`);
  }
  return value.map((item, index) => fieldName(item, `${label}[${index}]`));
}

function optionalPath(value: unknown, label: string): string[] | undefined {
  return value === undefined ? undefined : responsePath(value, label, true);
}

function detailFields(value: unknown): CnipaDetailFieldSchema | undefined {
  if (value === undefined) return undefined;
  const input = record(value);
  if (!input) return schemaError("responseSchema.detail.fields must be an object");
  const allowed = new Set([
    "registrationNumber",
    "trademarkName",
    "decisionDate",
    "documentNumber",
    "contentHtml",
    "contentText",
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    return schemaError("responseSchema.detail.fields contains an unsupported canonical field");
  }
  const result: CnipaDetailFieldSchema = {};
  for (const key of allowed) {
    const raw = input[key];
    if (raw !== undefined) {
      (result as Record<string, string>)[key] = fieldName(
        raw,
        `responseSchema.detail.fields.${key}`,
      );
    }
  }
  return result;
}

function partySchemas(
  value: unknown,
): Partial<Record<CnipaDocumentKind, readonly CnipaPartyFieldSchema[]>> | undefined {
  if (value === undefined) return undefined;
  const input = record(value);
  if (!input) return schemaError("responseSchema.detail.parties must be an object");
  const allowedKinds = new Set<CnipaDocumentKind>([
    "REGISTRATION_EXAMINATION",
    "OPPOSITION_DECISION",
    "REVIEW_ADJUDICATION",
  ]);
  const result: Partial<Record<CnipaDocumentKind, readonly CnipaPartyFieldSchema[]>> = {};
  for (const [kind, rawMappings] of Object.entries(input)) {
    const documentKind = kind as CnipaDocumentKind;
    if (!allowedKinds.has(documentKind)) {
      return schemaError(`Unsupported CNIPA document kind in party schema: ${kind}`);
    }
    if (!Array.isArray(rawMappings) || rawMappings.length > 10) {
      return schemaError(`${kind} party schema must be an array with at most 10 entries`);
    }
    const mappings = rawMappings.map((rawMapping, index) => {
      const mapping = record(rawMapping);
      if (!mapping) return schemaError(`${kind} party mapping ${index} must be an object`);
      const role = mapping.role;
      if (typeof role !== "string" || !PARTY_ROLES.has(role as CnipaPartyRole)) {
        return schemaError(`${kind} party mapping ${index} has an unsupported role`);
      }
      if (documentKind === "OPPOSITION_DECISION" && role !== "UNVERIFIED") {
        return schemaError(
          "OPPOSITION_DECISION party roles must remain UNVERIFIED until Phase 3 authenticates the source-field semantics",
        );
      }
      return {
        field: fieldName(mapping.field, `${kind} party mapping ${index}.field`),
        role: role as CnipaPartyRole,
      };
    });
    result[documentKind] = mappings;
  }
  return result;
}

export function parseCnipaResponseSchemaConfig(value: unknown): CnipaResponseSchemaConfig {
  const input = record(value);
  if (!input)
    return schemaError("CNIPA responseSchema is required before authenticated collection");
  const list = record(input.list);
  const detail = record(input.detail);
  if (!list || !detail) {
    return schemaError("CNIPA responseSchema requires list and detail objects");
  }
  return {
    list: {
      recordsPath: responsePath(list.recordsPath, "responseSchema.list.recordsPath"),
      sourceRecordIdField: fieldName(
        list.sourceRecordIdField,
        "responseSchema.list.sourceRecordIdField",
      ),
      ...(optionalPath(list.totalPath, "responseSchema.list.totalPath")
        ? { totalPath: optionalPath(list.totalPath, "responseSchema.list.totalPath") }
        : {}),
      ...(optionalPath(list.hasMorePath, "responseSchema.list.hasMorePath")
        ? { hasMorePath: optionalPath(list.hasMorePath, "responseSchema.list.hasMorePath") }
        : {}),
    },
    detail: {
      ...(optionalPath(detail.rootPath, "responseSchema.detail.rootPath")
        ? { rootPath: optionalPath(detail.rootPath, "responseSchema.detail.rootPath") }
        : {}),
      ...(detail.sourceRecordIdField !== undefined
        ? {
            sourceRecordIdField: fieldName(
              detail.sourceRecordIdField,
              "responseSchema.detail.sourceRecordIdField",
            ),
          }
        : {}),
      ...(detailFields(detail.fields) ? { fields: detailFields(detail.fields) } : {}),
      ...(partySchemas(detail.parties) ? { parties: partySchemas(detail.parties) } : {}),
    },
  };
}

function valueAtPath(value: unknown, path: CnipaResponsePath, label: string): unknown {
  let current = value;
  for (const key of path) {
    const container = record(current);
    if (!container || !(key in container))
      return responseError(`${label} path is missing at ${key}`);
    current = container[key];
  }
  return current;
}

function scalarString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return responseError(`${label} must be a string or finite number when present`);
}

function optionalField(
  container: Record<string, unknown>,
  field: string | undefined,
  label: string,
) {
  if (!field) return undefined;
  return scalarString(container[field], label);
}

export class CnipaConfigurableResponseDecoder implements CnipaJudgmentResponseDecoder {
  constructor(private readonly schema: CnipaResponseSchemaConfig) {}

  decodeList(_documentKind: CnipaDocumentKind, value: unknown): CnipaDecodedListPage {
    const rows = valueAtPath(value, this.schema.list.recordsPath, "CNIPA list records");
    if (!Array.isArray(rows))
      return responseError("CNIPA list records path did not resolve to an array");
    const sourceRecordIds = rows.map((row, index) => {
      const container = record(row);
      if (!container) return responseError(`CNIPA list record ${index} is not an object`);
      const id = scalarString(
        container[this.schema.list.sourceRecordIdField],
        `CNIPA list record ${index} source id`,
      );
      if (!id) return responseError(`CNIPA list record ${index} source id is empty`);
      return id;
    });

    let total: number | undefined;
    if (this.schema.list.totalPath) {
      const rawTotal = valueAtPath(value, this.schema.list.totalPath, "CNIPA list total");
      if (!Number.isSafeInteger(rawTotal) || (rawTotal as number) < 0) {
        return responseError("CNIPA list total must be a non-negative integer");
      }
      total = rawTotal as number;
    }

    let hasMore: boolean | undefined;
    if (this.schema.list.hasMorePath) {
      const rawHasMore = valueAtPath(value, this.schema.list.hasMorePath, "CNIPA list hasMore");
      if (typeof rawHasMore !== "boolean")
        return responseError("CNIPA list hasMore must be boolean");
      hasMore = rawHasMore;
    }

    return {
      sourceRecordIds,
      ...(total !== undefined ? { total } : {}),
      ...(hasMore !== undefined ? { hasMore } : {}),
    };
  }

  decodeDetail(
    documentKind: CnipaDocumentKind,
    sourceRecordId: string,
    value: unknown,
  ): CnipaDecodedDetail {
    const root = this.schema.detail.rootPath
      ? valueAtPath(value, this.schema.detail.rootPath, "CNIPA detail root")
      : value;
    const container = record(root);
    if (!container) return responseError("CNIPA detail root is not an object");

    if (this.schema.detail.sourceRecordIdField) {
      const observedId = scalarString(
        container[this.schema.detail.sourceRecordIdField],
        "CNIPA detail source id",
      );
      if (!observedId || observedId !== sourceRecordId) {
        return responseError(`CNIPA detail source id does not match ${sourceRecordId}`);
      }
    }

    const fields = this.schema.detail.fields ?? {};
    const parties = (this.schema.detail.parties?.[documentKind] ?? []).flatMap((mapping) => {
      const name = scalarString(container[mapping.field], `${documentKind}.${mapping.field}`);
      return name ? [{ role: mapping.role, name, sourceField: mapping.field }] : [];
    });

    return {
      sourceRecordId,
      ...(optionalField(container, fields.registrationNumber, "CNIPA registration number")
        ? {
            registrationNumber: optionalField(
              container,
              fields.registrationNumber,
              "CNIPA registration number",
            ),
          }
        : {}),
      ...(optionalField(container, fields.trademarkName, "CNIPA trademark name")
        ? { trademarkName: optionalField(container, fields.trademarkName, "CNIPA trademark name") }
        : {}),
      ...(optionalField(container, fields.decisionDate, "CNIPA decision date")
        ? { decisionDate: optionalField(container, fields.decisionDate, "CNIPA decision date") }
        : {}),
      ...(optionalField(container, fields.documentNumber, "CNIPA document number")
        ? {
            documentNumber: optionalField(
              container,
              fields.documentNumber,
              "CNIPA document number",
            ),
          }
        : {}),
      ...(optionalField(container, fields.contentHtml, "CNIPA content html")
        ? { contentHtml: optionalField(container, fields.contentHtml, "CNIPA content html") }
        : {}),
      ...(optionalField(container, fields.contentText, "CNIPA content text")
        ? { contentText: optionalField(container, fields.contentText, "CNIPA content text") }
        : {}),
      parties,
    };
  }
}
