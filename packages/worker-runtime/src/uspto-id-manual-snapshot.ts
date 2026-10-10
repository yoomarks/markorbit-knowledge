import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type {
  RawArtifact,
  UsptoIdManualRowV1,
  UsptoIdManualSnapshotManifestV1,
  UsptoIdManualStatus,
} from "@markorbit/contracts";
import {
  USPTO_ID_MANUAL_COLUMNS,
  USPTO_ID_MANUAL_ROW_SCHEMA_V1,
  USPTO_ID_MANUAL_SNAPSHOT_SCHEMA_V1,
} from "@markorbit/contracts";

export const USPTO_ID_MANUAL_PARSER_ID = "markorbit-knowledge/uspto-id-manual-html" as const;
export const USPTO_ID_MANUAL_PARSER_VERSION = "1.0.0";

const CELL_COUNT = USPTO_ID_MANUAL_COLUMNS.length;
const STATUS_VALUES = new Set<UsptoIdManualStatus>(["A", "M", "X", "D"]);
const REQUIRED_VALUE_INDEXES = [0, 1, 2, 3, 4, 5, 8] as const;

export type ParsedUsptoIdManual = {
  rows: UsptoIdManualRowV1[];
  tableCount: number;
  nonEmptyTableCount: number;
  htmlRowCount: number;
  cellCount: number;
  distinctTermIdCount: number;
  duplicateTermIdCount: number;
  statusCounts: Record<UsptoIdManualStatus, number>;
  typeCounts: Record<string, number>;
};

export type WriteUsptoIdManualSnapshotInput = {
  bytes: Uint8Array;
  rawArtifact: RawArtifact;
  outputRoot: string;
  sourceUri: string;
  expectedRowCount?: number;
  expectedBinarySha256?: string;
  clock?: () => Date;
};

export type WrittenUsptoIdManualSnapshot = {
  directory: string;
  manifestPath: string;
  rowsPath: string;
  manifest: UsptoIdManualSnapshotManifestV1;
  replayed: boolean;
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function decodeHtmlText(value: string): string {
  const withoutTags = value.replace(/<br\s*\/?\s*>/giu, "\n").replace(/<[^>]+>/gu, "");
  return withoutTags.replace(
    /&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/giu,
    (_match, entity: string) => {
      const normalized = entity.toLowerCase();
      if (normalized === "amp") return "&";
      if (normalized === "lt") return "<";
      if (normalized === "gt") return ">";
      if (normalized === "quot") return '"';
      if (normalized === "apos") return "'";
      if (normalized === "nbsp") return "\u00a0";
      const radix = normalized.startsWith("#x") ? 16 : 10;
      const digits = normalized.slice(radix === 16 ? 2 : 1);
      const codePoint = Number.parseInt(digits, radix);
      return Number.isInteger(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : _match;
    },
  );
}

function cellValues(value: string, tag: "td" | "th"): string[] {
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "giu");
  return [...value.matchAll(pattern)].map((match) => decodeHtmlText(match[1] ?? ""));
}

function isoDate(value: string, ordinal: number): string {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/u);
  if (!match) throw new Error(`USPTO ID Manual row ${ordinal} has invalid date ${value}`);
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const observed = new Date(Date.UTC(year, month - 1, day));
  if (
    observed.getUTCFullYear() !== year ||
    observed.getUTCMonth() !== month - 1 ||
    observed.getUTCDate() !== day
  ) {
    throw new Error(`USPTO ID Manual row ${ordinal} has invalid date ${value}`);
  }
  return `${match[3]}-${match[1]}-${match[2]}`;
}

function rowHash(values: readonly string[]): string {
  return sha256(values.join("\0"));
}

function normalizedNclVersion(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

function parseRow(values: string[], ordinal: number): UsptoIdManualRowV1 {
  if (values.length !== CELL_COUNT) {
    throw new Error(
      `USPTO ID Manual row ${ordinal} has ${values.length} cells; expected ${CELL_COUNT}`,
    );
  }
  for (const index of REQUIRED_VALUE_INDEXES) {
    if (!values[index]?.trim()) {
      throw new Error(
        `USPTO ID Manual row ${ordinal} has an empty required ${USPTO_ID_MANUAL_COLUMNS[index]} cell`,
      );
    }
  }

  const [termId, classCode, description, rawStatus, rawDate, typeRaw, notes, tm5Raw, nclRaw] =
    values as [string, string, string, string, string, string, string, string, string];
  if (!STATUS_VALUES.has(rawStatus as UsptoIdManualStatus)) {
    throw new Error(`USPTO ID Manual row ${ordinal} has unknown status ${rawStatus}`);
  }
  if (!/^(?:\d{3}|A|B)$/u.test(classCode)) {
    throw new Error(`USPTO ID Manual row ${ordinal} has invalid class ${classCode}`);
  }
  if (!new Set(["GOODS", "SERVICES", "SERVICE"]).has(typeRaw)) {
    throw new Error(`USPTO ID Manual row ${ordinal} has unknown type ${typeRaw}`);
  }
  if (tm5Raw !== "" && tm5Raw !== "T") {
    throw new Error(`USPTO ID Manual row ${ordinal} has unknown TM5 value ${tm5Raw}`);
  }

  return {
    schemaVersion: USPTO_ID_MANUAL_ROW_SCHEMA_V1,
    ordinal,
    termId,
    classCode,
    description,
    status: rawStatus as UsptoIdManualStatus,
    startEffectiveDateRaw: rawDate,
    startEffectiveDate: isoDate(rawDate, ordinal),
    typeRaw,
    typeNormalized: typeRaw === "GOODS" ? "GOODS" : "SERVICES",
    notes,
    tm5Raw,
    tm5: tm5Raw === "T",
    nclVersionRaw: nclRaw,
    nclVersion: normalizedNclVersion(nclRaw),
    rowSha256: rowHash(values),
  };
}

export function parseUsptoIdManualHtml(bytes: Uint8Array): ParsedUsptoIdManual {
  const html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!/^\s*<html\b/iu.test(html) || !/<meta\s+charset=["']?UTF-8["']?/iu.test(html)) {
    throw new Error("USPTO ID Manual input must be UTF-8 HTML, regardless of its .xls filename");
  }

  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/giu)];
  if (tables.length === 0) throw new Error("USPTO ID Manual input contains no HTML tables");

  const rows: UsptoIdManualRowV1[] = [];
  let nonEmptyTableCount = 0;
  let htmlRowCount = 0;
  let observedCellCount = 0;

  for (const tableMatch of tables) {
    const table = tableMatch[1] ?? "";
    const tableRows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)];
    if (tableRows.length === 0) continue;
    nonEmptyTableCount += 1;
    const headers = cellValues(table, "th");
    const hasExpectedHeader =
      headers.length === CELL_COUNT &&
      headers.every((header, index) => header === USPTO_ID_MANUAL_COLUMNS[index]);
    const headerIsRequired = nonEmptyTableCount === 1;
    if (
      (headerIsRequired && !hasExpectedHeader) ||
      (!headerIsRequired && headers.length > 0 && !hasExpectedHeader)
    ) {
      throw new Error(`USPTO ID Manual table ${nonEmptyTableCount} has an unexpected header`);
    }
    for (const rowMatch of tableRows) {
      const values = cellValues(rowMatch[1] ?? "", "td");
      htmlRowCount += 1;
      observedCellCount += values.length;
      rows.push(parseRow(values, rows.length + 1));
    }
  }

  if (rows.length === 0) throw new Error("USPTO ID Manual input contains no data rows");
  if (htmlRowCount !== rows.length || observedCellCount !== rows.length * CELL_COUNT) {
    throw new Error("USPTO ID Manual row/cell accounting did not reconcile");
  }

  const statusCounts: Record<UsptoIdManualStatus, number> = { A: 0, M: 0, X: 0, D: 0 };
  const typeCounts: Record<string, number> = {};
  const termIds = new Set<string>();
  for (const row of rows) {
    statusCounts[row.status] += 1;
    typeCounts[row.typeRaw] = (typeCounts[row.typeRaw] ?? 0) + 1;
    termIds.add(row.termId);
  }

  return {
    rows,
    tableCount: tables.length,
    nonEmptyTableCount,
    htmlRowCount,
    cellCount: observedCellCount,
    distinctTermIdCount: termIds.size,
    duplicateTermIdCount: rows.length - termIds.size,
    statusCounts,
    typeCounts,
  };
}

function safeChild(root: string, child: string): string {
  const absoluteRoot = resolve(root);
  const absoluteChild = resolve(absoluteRoot, child);
  const relation = relative(absoluteRoot, absoluteChild);
  if (!relation || relation.startsWith("..") || isAbsolute(relation)) {
    throw new Error("USPTO ID Manual snapshot path escaped its configured output root");
  }
  return absoluteChild;
}

async function existingSnapshot(
  directory: string,
  expectedBinarySha256: string,
  expected: Pick<WriteUsptoIdManualSnapshotInput, "rawArtifact" | "sourceUri">,
): Promise<WrittenUsptoIdManualSnapshot | null> {
  const manifestPath = join(directory, "manifest.json");
  const rowsPath = join(directory, "rows.ndjson");
  try {
    const manifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as UsptoIdManualSnapshotManifestV1;
    const rowsBytes = await readFile(rowsPath);
    if (
      manifest.schemaVersion !== USPTO_ID_MANUAL_SNAPSHOT_SCHEMA_V1 ||
      manifest.artifact.binarySha256 !== expectedBinarySha256 ||
      manifest.artifact.rawArtifactId !== expected.rawArtifact.id ||
      manifest.artifact.sourceUri !== expected.sourceUri ||
      manifest.artifact.storageUri !== expected.rawArtifact.storage.uri ||
      manifest.parser.id !== USPTO_ID_MANUAL_PARSER_ID ||
      manifest.parser.version !== USPTO_ID_MANUAL_PARSER_VERSION ||
      sha256(rowsBytes) !== manifest.rows.sha256
    ) {
      throw new Error("Existing USPTO ID Manual snapshot does not match its immutable identity");
    }
    return { directory, manifestPath, rowsPath, manifest, replayed: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeUsptoIdManualSnapshot(
  input: WriteUsptoIdManualSnapshotInput,
): Promise<WrittenUsptoIdManualSnapshot> {
  const binarySha256 = sha256(input.bytes);
  if (input.expectedBinarySha256 && binarySha256 !== input.expectedBinarySha256.toLowerCase()) {
    throw new Error(
      `USPTO ID Manual SHA-256 mismatch: expected ${input.expectedBinarySha256}, observed ${binarySha256}`,
    );
  }
  if (
    input.rawArtifact.binaryHash.value !== binarySha256 ||
    input.rawArtifact.sizeBytes !== input.bytes.byteLength
  ) {
    throw new Error(
      "Knowledge RawArtifact identity does not match the parsed USPTO ID Manual bytes",
    );
  }

  const parsed = parseUsptoIdManualHtml(input.bytes);
  if (input.expectedRowCount !== undefined && parsed.rows.length !== input.expectedRowCount) {
    throw new Error(
      `USPTO ID Manual row count mismatch: expected ${input.expectedRowCount}, observed ${parsed.rows.length}`,
    );
  }

  const outputRoot = resolve(input.outputRoot);
  const directory = safeChild(outputRoot, binarySha256);
  await mkdir(outputRoot, { recursive: true });
  const replay = await existingSnapshot(directory, binarySha256, input);
  if (replay) return replay;

  const rowsContent = `${parsed.rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
  const rowsSha256 = sha256(rowsContent);
  const createdAt = (input.clock ?? (() => new Date()))().toISOString();
  const manifest: UsptoIdManualSnapshotManifestV1 = {
    schemaVersion: USPTO_ID_MANUAL_SNAPSHOT_SCHEMA_V1,
    dataset: "USPTO_ID_MANUAL",
    jurisdiction: "US",
    authority: "USPTO",
    artifact: {
      rawArtifactId: input.rawArtifact.id,
      originalName: input.rawArtifact.originalName,
      detectedMediaType: "text/html",
      sizeBytes: input.rawArtifact.sizeBytes,
      binarySha256,
      sourceUri: input.sourceUri,
      storageUri: input.rawArtifact.storage.uri,
      capturedAt: input.rawArtifact.capturedAt,
    },
    parser: { id: USPTO_ID_MANUAL_PARSER_ID, version: USPTO_ID_MANUAL_PARSER_VERSION },
    rows: {
      path: "rows.ndjson",
      sha256: rowsSha256,
      count: parsed.rows.length,
      distinctTermIdCount: parsed.distinctTermIdCount,
      duplicateTermIdCount: parsed.duplicateTermIdCount,
      columns: USPTO_ID_MANUAL_COLUMNS,
      statusCounts: parsed.statusCounts,
      typeCounts: parsed.typeCounts,
    },
    validation: {
      status: "PASS",
      tableCount: parsed.tableCount,
      nonEmptyTableCount: parsed.nonEmptyTableCount,
      htmlRowCount: parsed.htmlRowCount,
      cellCount: parsed.cellCount,
      requiredCellsPresent: true,
      datesValid: true,
    },
    createdAt,
  };

  const tempDirectory = safeChild(outputRoot, `${binarySha256}.tmp-${process.pid}`);
  await rm(tempDirectory, { recursive: true, force: true });
  await mkdir(tempDirectory, { recursive: true });
  try {
    await writeFile(join(tempDirectory, "rows.ndjson"), rowsContent, "utf8");
    await writeFile(join(tempDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(tempDirectory, directory);
  } catch (error) {
    await rm(tempDirectory, { recursive: true, force: true });
    const raced = await existingSnapshot(directory, binarySha256, input);
    if (raced) return raced;
    throw error;
  }

  return {
    directory,
    manifestPath: join(directory, "manifest.json"),
    rowsPath: join(directory, "rows.ndjson"),
    manifest,
    replayed: false,
  };
}
