import { createHash } from "node:crypto";
import {
  CNIPA_CANDIDATE_ENDPOINTS,
  CnipaAcquisitionError,
  type CnipaDocumentKind,
} from "./cnipa-trademark-judgment";

export const CNIPA_LIST_FACT_PROJECTION_VERSION = "cnipa-list-fact-projection-v1" as const;
export const CNIPA_KNOWLEDGE_DOCUMENT_SEED_VERSION = "cnipa-knowledge-document-seed-v1" as const;

type SourceScalar = string | number | boolean | null;

export type CnipaListFactProjectionV1 = {
  schemaVersion: typeof CNIPA_LIST_FACT_PROJECTION_VERSION;
  jurisdiction: "CN";
  sourceAuthority: "CNIPA";
  documentKind: CnipaDocumentKind;
  sourceRecordId: string;
  sourceFields: Readonly<Record<string, SourceScalar>>;
  sourceRowSha256: string;
};

export type CnipaKnowledgeDocumentSeedV1 = {
  schemaVersion: typeof CNIPA_KNOWLEDGE_DOCUMENT_SEED_VERSION;
  sourceAuthority: "CNIPA";
  documentKind: CnipaDocumentKind;
  sourceRecordId: string;
  logicalDocumentUri: string;
  detailCanonicalUri: string;
  title: string;
  decisionDate?: string;
  registrationNumber?: string;
  trademarkName?: string;
  sourceRowSha256: string;
  markdownBody: string;
};

export type CnipaListMaterializedRecordV1 = {
  sourceRecordId: string;
  factProjection: CnipaListFactProjectionV1;
  documentSeed: CnipaKnowledgeDocumentSeedV1 | null;
  detailCanonicalUri: string;
  warnings: readonly string[];
};

export type CnipaListPageMaterializationV1 = {
  documentKind: CnipaDocumentKind;
  recordCount: number;
  records: readonly CnipaListMaterializedRecordV1[];
};

type RowContract = {
  idField: string;
  titleField: string;
  dateField: string;
  registrationNumberField: string;
  trademarkNameField: string;
  projectedFields: readonly string[];
};

const ROW_CONTRACTS: Readonly<Record<CnipaDocumentKind, RowContract>> = {
  REGISTRATION_EXAMINATION: {
    idField: "adjuOpenId",
    titleField: "adjuTitle",
    dateField: "returnDateStr",
    registrationNumberField: "regNo",
    trademarkNameField: "tmName",
    projectedFields: [
      "adjuId",
      "adjuOpenId",
      "adjuTitle",
      "agentInstName",
      "applicantCnName",
      "applyNo",
      "citeTmRegNo",
      "openFlag",
      "regNo",
      "returnDate",
      "returnDateStr",
      "sendBarCode",
      "sendNo",
      "sendNoStr",
      "tmName",
      "validFlag",
    ],
  },
  OPPOSITION_DECISION: {
    idField: "adjuOpenId",
    titleField: "adjuTitle",
    dateField: "returnDateStr",
    registrationNumberField: "regNo",
    trademarkNameField: "tmName",
    projectedFields: [
      "adjuId",
      "adjuOpenId",
      "adjuTitle",
      "applyNo",
      "citeTms",
      "objenderAgentName",
      "objenderCnName",
      "objeperAgentName",
      "objeperCnName",
      "openFlag",
      "regNo",
      "returnDate",
      "returnDateStr",
      "snedNo",
      "snedNoStr",
      "tmName",
      "validFlag",
    ],
  },
  REVIEW_ADJUDICATION: {
    idField: "pubId",
    titleField: "fileTitle",
    dateField: "judgeDateStr",
    registrationNumberField: "regNo",
    trademarkNameField: "tmName",
    projectedFields: [
      "agentInstName",
      "applicantName",
      "applyNo",
      "fileTitle",
      "judgeDate",
      "judgeDateStr",
      "pubFlag",
      "pubId",
      "regNo",
      "respondentName",
      "sendDocNo",
      "tmName",
      "validFlag",
    ],
  },
};

function materializationError(message: string): never {
  throw new CnipaAcquisitionError("CNIPA_SCHEMA_CHANGED", message, false);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    materializationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function scalar(value: unknown, label: string): SourceScalar | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return materializationError(`${label} must be scalar when projected`);
}

function requiredString(value: unknown, label: string): string {
  const resolved = scalar(value, label);
  if (typeof resolved !== "string" || resolved.trim().length === 0) {
    return materializationError(`${label} must be a non-empty string`);
  }
  return resolved.trim();
}

function optionalString(value: unknown, label: string): string | undefined {
  const resolved = scalar(value, label);
  if (resolved === undefined || resolved === null || resolved === "") return undefined;
  if (typeof resolved === "string") return resolved.trim() || undefined;
  if (typeof resolved === "number") return String(resolved);
  return materializationError(`${label} must be string-like when present`);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function projectedFields(
  row: Record<string, unknown>,
  contract: RowContract,
): Readonly<Record<string, SourceScalar>> {
  const projection: Record<string, SourceScalar> = {};
  for (const field of contract.projectedFields) {
    const value = scalar(row[field], `CNIPA LIST field ${field}`);
    if (value !== undefined) projection[field] = value;
  }
  return projection;
}

function detailCanonicalUri(documentKind: CnipaDocumentKind, sourceRecordId: string): string {
  const url = new URL(
    CNIPA_CANDIDATE_ENDPOINTS[documentKind].detailPath,
    "https://pub.sbj.cnipa.gov.cn",
  );
  url.searchParams.set("id", sourceRecordId);
  return url.toString();
}

function logicalDocumentUri(documentKind: CnipaDocumentKind, sourceRecordId: string): string {
  return `cnipa://judgment/${documentKind}/${encodeURIComponent(sourceRecordId)}`;
}

function sourceTitle(
  row: Record<string, unknown>,
  contract: RowContract,
  documentKind: CnipaDocumentKind,
  sourceRecordId: string,
): string {
  return (
    optionalString(row[contract.titleField], `CNIPA LIST ${contract.titleField}`) ??
    optionalString(row.tmName, "CNIPA LIST tmName") ??
    `${documentKind} ${sourceRecordId}`
  ).replace(/[\r\n]+/g, " ");
}

function markdownBody(title: string, fileContent: string): string {
  const normalized = fileContent
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\s+$/u, "");
  return `# ${title}\n\n${normalized}\n`;
}

function documentSeed(
  documentKind: CnipaDocumentKind,
  sourceRecordId: string,
  row: Record<string, unknown>,
  contract: RowContract,
  rowSha256: string,
  detailUri: string,
): { seed: CnipaKnowledgeDocumentSeedV1 | null; warnings: string[] } {
  const rawContent = row.fileContent;
  if (rawContent === undefined || rawContent === null || rawContent === "") {
    return { seed: null, warnings: ["FILE_CONTENT_MISSING"] };
  }
  if (typeof rawContent !== "string") {
    return materializationError("CNIPA LIST fileContent must be a string when present");
  }
  const title = sourceTitle(row, contract, documentKind, sourceRecordId);
  const content = rawContent.replace(/\r\n?/g, "\n");
  if (!content.trim()) {
    return { seed: null, warnings: ["FILE_CONTENT_EMPTY"] };
  }

  const decisionDate = optionalString(row[contract.dateField], `CNIPA LIST ${contract.dateField}`);
  const registrationNumber = optionalString(
    row[contract.registrationNumberField],
    `CNIPA LIST ${contract.registrationNumberField}`,
  );
  const trademarkName = optionalString(
    row[contract.trademarkNameField],
    `CNIPA LIST ${contract.trademarkNameField}`,
  );

  return {
    seed: {
      schemaVersion: CNIPA_KNOWLEDGE_DOCUMENT_SEED_VERSION,
      sourceAuthority: "CNIPA",
      documentKind,
      sourceRecordId,
      logicalDocumentUri: logicalDocumentUri(documentKind, sourceRecordId),
      detailCanonicalUri: detailUri,
      title,
      ...(decisionDate ? { decisionDate } : {}),
      ...(registrationNumber ? { registrationNumber } : {}),
      ...(trademarkName ? { trademarkName } : {}),
      sourceRowSha256: rowSha256,
      markdownBody: markdownBody(title, content),
    },
    warnings: [],
  };
}

export function materializeCnipaListPage(
  documentKind: CnipaDocumentKind,
  value: unknown,
): CnipaListPageMaterializationV1 {
  const root = record(value, "CNIPA LIST response");
  if (root.code !== undefined && root.code !== 0) {
    return materializationError(
      `CNIPA LIST response code must be 0, received ${String(root.code)}`,
    );
  }
  const data = record(root.data, "CNIPA LIST data");
  if (!Array.isArray(data.list)) {
    return materializationError("CNIPA LIST data.list must be an array");
  }

  const contract = ROW_CONTRACTS[documentKind];
  const records = data.list.map((rawRow, index): CnipaListMaterializedRecordV1 => {
    const row = record(rawRow, `CNIPA LIST row ${index}`);
    const sourceRecordId = requiredString(
      row[contract.idField],
      `CNIPA LIST row ${index} ${contract.idField}`,
    );
    const rowSha256 = sha256(row);
    const detailUri = detailCanonicalUri(documentKind, sourceRecordId);
    const rendered = documentSeed(
      documentKind,
      sourceRecordId,
      row,
      contract,
      rowSha256,
      detailUri,
    );

    return {
      sourceRecordId,
      factProjection: {
        schemaVersion: CNIPA_LIST_FACT_PROJECTION_VERSION,
        jurisdiction: "CN",
        sourceAuthority: "CNIPA",
        documentKind,
        sourceRecordId,
        sourceFields: projectedFields(row, contract),
        sourceRowSha256: rowSha256,
      },
      documentSeed: rendered.seed,
      detailCanonicalUri: detailUri,
      warnings: rendered.warnings,
    };
  });

  return {
    documentKind,
    recordCount: records.length,
    records,
  };
}
