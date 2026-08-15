import { inflateRawSync } from "node:zlib";
import {
  AUTHORITY_LEVELS,
  SOURCE_CATEGORIES,
  type AuthorityLevel,
  type SourceCategory,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import type { DiscoveryIntakeDefaults } from "./discovery-service";

const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;
const MAX_CELL_LENGTH = 2_000;

export type DiscoveryImportRowStatus = "VALID" | "INVALID" | "DUPLICATE";

export type DiscoveryImportRow = {
  rowNumber: number;
  locator: string;
  origin?: string;
  status: DiscoveryImportRowStatus;
  issues: string[];
  intake: DiscoveryIntakeDefaults;
};

export type DiscoveryImportPreview = {
  fileName: string;
  format: "CSV" | "TSV" | "XLSX";
  sheetName?: string;
  rows: DiscoveryImportRow[];
  summary: {
    parsed: number;
    valid: number;
    invalid: number;
    duplicate: number;
    truncated: boolean;
  };
};

type Table = {
  format: DiscoveryImportPreview["format"];
  sheetName?: string;
  rows: string[][];
};

type ZipEntry = {
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

const URL_HEADERS = [
  "url",
  "locator",
  "website",
  "websiteurl",
  "sourceurl",
  "source",
  "网址",
  "网站",
  "网站地址",
];
const CATEGORY_HEADERS = ["category", "sourcecategory", "type", "来源分类", "分类"];
const AUTHORITY_HEADERS = ["authority", "authoritylevel", "sourceauthority", "权威等级", "权威"];
const JURISDICTION_HEADERS = [
  "jurisdiction",
  "jurisdictions",
  "country",
  "countries",
  "countrycode",
  "国家",
  "国家地区",
  "辖区",
];
const LANGUAGE_HEADERS = ["language", "languages", "lang", "语言"];
const NOTE_HEADERS = ["note", "notes", "remark", "remarks", "备注"];
const TAG_HEADERS = ["tag", "tags", "标签"];

function cleanCell(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .slice(0, MAX_CELL_LENGTH);
}

function normalizedHeader(value: string): string {
  return cleanCell(value)
    .toLowerCase()
    .replace(/[\s_\-/.]+/g, "");
}

function headerIndex(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizedHeader);
  const candidates = new Set(aliases.map(normalizedHeader));
  return normalized.findIndex((value) => candidates.has(value));
}

function splitList(value: string, uppercase = false): string[] {
  const values = cleanCell(value)
    .split(/[;,|\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (uppercase ? item.toUpperCase() : item));
  return [...new Set(values)].slice(0, 30);
}

function normalizedEnumToken(value: string): string {
  return cleanCell(value)
    .toUpperCase()
    .replace(/[\s\-/]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function parseCategory(value: string): { value?: SourceCategory; issue?: string } {
  const cell = cleanCell(value);
  if (!cell) return {};
  const aliases: Record<string, SourceCategory> = {
    OFFICIAL: "OFFICIAL_AUTHORITY",
    AUTHORITY: "OFFICIAL_AUTHORITY",
    OFFICIAL_AUTHORITY: "OFFICIAL_AUTHORITY",
    OFFICIAL_GUIDANCE: "OFFICIAL_GUIDANCE",
    GUIDANCE: "OFFICIAL_GUIDANCE",
    LAW_FIRM: "LAW_FIRM",
    LAW_FIRM_AGENCY: "LAW_FIRM",
    AGENCY: "LAW_FIRM",
    NEWS: "NEWS",
    RESEARCH: "RESEARCH",
    TECHNICAL: "TECHNICAL",
    INTERNAL: "INTERNAL",
    USER_PROVIDED: "USER_PROVIDED",
    OTHER: "OTHER",
    官方机构: "OFFICIAL_AUTHORITY",
    官方指南: "OFFICIAL_GUIDANCE",
    律所: "LAW_FIRM",
    代理机构: "LAW_FIRM",
    新闻: "NEWS",
    研究资料: "RESEARCH",
    技术资料: "TECHNICAL",
    内部资料: "INTERNAL",
    用户提供: "USER_PROVIDED",
    其他: "OTHER",
  };
  const token = normalizedEnumToken(cell);
  const mapped = aliases[token] ?? aliases[cell];
  if (mapped && SOURCE_CATEGORIES.includes(mapped)) return { value: mapped };
  if (SOURCE_CATEGORIES.includes(token as SourceCategory))
    return { value: token as SourceCategory };
  return { issue: `Unknown source category: ${cell}` };
}

function parseAuthority(value: string): { value?: AuthorityLevel; issue?: string } {
  const cell = cleanCell(value);
  if (!cell) return {};
  const aliases: Record<string, AuthorityLevel> = {
    PRIMARY: "PRIMARY_OFFICIAL",
    PRIMARY_OFFICIAL: "PRIMARY_OFFICIAL",
    SECONDARY: "SECONDARY_OFFICIAL",
    SECONDARY_OFFICIAL: "SECONDARY_OFFICIAL",
    PROFESSIONAL: "PROFESSIONAL",
    INDUSTRY: "INDUSTRY",
    COMMUNITY: "COMMUNITY",
    UNKNOWN: "UNKNOWN",
    一级官方: "PRIMARY_OFFICIAL",
    二级官方: "SECONDARY_OFFICIAL",
    专业来源: "PROFESSIONAL",
    行业来源: "INDUSTRY",
    社区来源: "COMMUNITY",
    未评估: "UNKNOWN",
  };
  const token = normalizedEnumToken(cell);
  const mapped = aliases[token] ?? aliases[cell];
  if (mapped && AUTHORITY_LEVELS.includes(mapped)) return { value: mapped };
  if (AUTHORITY_LEVELS.includes(token as AuthorityLevel)) return { value: token as AuthorityLevel };
  return { issue: `Unknown authority level: ${cell}` };
}

function websiteIdentity(url: URL): string {
  const hostname = url.hostname.toLowerCase();
  const canonicalHostname = hostname.startsWith("www.") && hostname.length > 4 ? hostname.slice(4) : hostname;
  const port = url.port ? `:${url.port}` : "";
  return `${url.protocol}//${canonicalHostname}${port}`;
}

function publicWebsite(locator: string): {
  locator?: string;
  origin?: string;
  identity?: string;
  issue?: string;
} {
  const raw = cleanCell(locator);
  if (!raw) return { issue: "Website URL is required" };
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { issue: "Website URL must use http or https" };
    }
    if (url.username || url.password) return { issue: "Website URL must not contain credentials" };
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname === "::1" ||
      /^127\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname)
    ) {
      return { issue: "Local or private website URLs are not allowed" };
    }
    const match172 = /^172\.(\d{1,3})\./.exec(hostname);
    if (match172) {
      const second = Number(match172[1]);
      if (second >= 16 && second <= 31) {
        return { issue: "Local or private website URLs are not allowed" };
      }
    }
    url.hash = "";
    url.hostname = hostname;
    return { locator: url.toString(), origin: url.origin, identity: websiteIdentity(url) };
  } catch {
    return { issue: `Invalid website URL: ${raw}` };
  }
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function chooseDelimiter(
  text: string,
  fileName: string,
): { delimiter: string; format: "CSV" | "TSV" } {
  if (fileName.toLowerCase().endsWith(".tsv")) return { delimiter: "\t", format: "TSV" };
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", "\t", ";"];
  let best = ",";
  let bestColumns = 0;
  for (const candidate of candidates) {
    const columns = parseDelimited(firstLine, candidate)[0]?.length ?? 0;
    if (columns > bestColumns) {
      bestColumns = columns;
      best = candidate;
    }
  }
  return { delimiter: best, format: best === "\t" ? "TSV" : "CSV" };
}

function xmlDecode(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function zipDirectory(buffer: Buffer): Map<string, ZipEntry> {
  const minimumEocd = 22;
  const start = Math.max(0, buffer.length - 65_557);
  let eocd = -1;
  for (let offset = buffer.length - minimumEocd; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new RegistryValidationError("Invalid XLSX: ZIP directory not found");
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map<string, ZipEntry>();
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new RegistryValidationError("Invalid XLSX: malformed ZIP directory");
    }
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    entries.set(name, { compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipEntry(buffer: Buffer, entry: ZipEntry): Buffer {
  const offset = entry.localHeaderOffset;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== 0x04034b50) {
    throw new RegistryValidationError("Invalid XLSX: malformed ZIP entry");
  }
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);
  let content: Buffer;
  if (entry.compressionMethod === 0) content = Buffer.from(compressed);
  else if (entry.compressionMethod === 8) content = inflateRawSync(compressed);
  else
    throw new RegistryValidationError(
      `Unsupported XLSX compression method: ${entry.compressionMethod}`,
    );
  if (entry.uncompressedSize > 0 && content.length !== entry.uncompressedSize) {
    throw new RegistryValidationError("Invalid XLSX: ZIP entry size mismatch");
  }
  return content;
}

function firstWorksheetPath(
  entries: Map<string, ZipEntry>,
  buffer: Buffer,
): { path: string; sheetName?: string } {
  const workbookEntry = entries.get("xl/workbook.xml");
  const relsEntry = entries.get("xl/_rels/workbook.xml.rels");
  if (workbookEntry && relsEntry) {
    const workbook = readZipEntry(buffer, workbookEntry).toString("utf8");
    const sheet = /<sheet\b[^>]*name="([^"]*)"[^>]*(?:r:id|id)="([^"]+)"[^>]*\/?\s*>/i.exec(
      workbook,
    );
    if (sheet) {
      const relationships = readZipEntry(buffer, relsEntry).toString("utf8");
      const relationPattern = /<Relationship\b([^>]*)\/?\s*>/gi;
      let relation: RegExpExecArray | null;
      while ((relation = relationPattern.exec(relationships)) !== null) {
        const attrs = relation[1] ?? "";
        const id = /\bId="([^"]+)"/i.exec(attrs)?.[1];
        const target = /\bTarget="([^"]+)"/i.exec(attrs)?.[1];
        if (id === sheet[2] && target) {
          const normalized = target.startsWith("/")
            ? target.replace(/^\//, "")
            : `xl/${target.replace(/^\.\//, "")}`;
          return { path: normalized.replace(/\/+/g, "/"), sheetName: xmlDecode(sheet[1] ?? "") };
        }
      }
    }
  }
  const fallback = [...entries.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))[0];
  if (!fallback) throw new RegistryValidationError("Invalid XLSX: no worksheet found");
  return { path: fallback };
}

function sharedStrings(entries: Map<string, ZipEntry>, buffer: Buffer): string[] {
  const entry = entries.get("xl/sharedStrings.xml");
  if (!entry) return [];
  const xml = readZipEntry(buffer, entry).toString("utf8");
  const result: string[] = [];
  const itemPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
  let item: RegExpExecArray | null;
  while ((item = itemPattern.exec(xml)) !== null) {
    const texts: string[] = [];
    const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/gi;
    let text: RegExpExecArray | null;
    while ((text = textPattern.exec(item[1] ?? "")) !== null) texts.push(xmlDecode(text[1] ?? ""));
    result.push(texts.join(""));
  }
  return result;
}

function columnIndex(reference: string): number {
  const letters = /^([A-Z]+)/i.exec(reference)?.[1]?.toUpperCase() ?? "A";
  let value = 0;
  for (const char of letters) value = value * 26 + (char.charCodeAt(0) - 64);
  return Math.max(0, value - 1);
}

function worksheetRows(xml: string, strings: string[]): string[][] {
  const rows: string[][] = [];
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(xml)) !== null && rows.length <= MAX_IMPORT_ROWS) {
    const row: string[] = [];
    const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
    let cell: RegExpExecArray | null;
    while ((cell = cellPattern.exec(rowMatch[1] ?? "")) !== null) {
      const attrs = cell[1] ?? "";
      const body = cell[2] ?? "";
      const reference = /\br="([A-Z]+\d+)"/i.exec(attrs)?.[1] ?? `A${rows.length + 1}`;
      const type = /\bt="([^"]+)"/i.exec(attrs)?.[1] ?? "n";
      let value = "";
      if (type === "inlineStr") {
        const texts = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((match) =>
          xmlDecode(match[1] ?? ""),
        );
        value = texts.join("");
      } else {
        const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(body)?.[1] ?? "";
        if (type === "s") value = strings[Number(raw)] ?? "";
        else if (type === "b") value = raw === "1" ? "TRUE" : "FALSE";
        else value = xmlDecode(raw);
      }
      row[columnIndex(reference)] = cleanCell(value);
    }
    rows.push(row);
  }
  return rows;
}

function parseXlsx(buffer: Buffer): Table {
  const entries = zipDirectory(buffer);
  const worksheet = firstWorksheetPath(entries, buffer);
  const entry = entries.get(worksheet.path);
  if (!entry)
    throw new RegistryValidationError(`Invalid XLSX: worksheet ${worksheet.path} not found`);
  const strings = sharedStrings(entries, buffer);
  const xml = readZipEntry(buffer, entry).toString("utf8");
  return { format: "XLSX", sheetName: worksheet.sheetName, rows: worksheetRows(xml, strings) };
}

function parseTable(fileName: string, content: Buffer): Table {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx")) return parseXlsx(content);
  if (!lower.endsWith(".csv") && !lower.endsWith(".tsv") && !lower.endsWith(".txt")) {
    throw new RegistryValidationError("Import file must be .csv, .tsv, or .xlsx");
  }
  const text = content.toString("utf8");
  const { delimiter, format } = chooseDelimiter(text, fileName);
  return { format, rows: parseDelimited(text, delimiter) };
}

function rowValue(row: string[], index: number): string {
  return index >= 0 ? cleanCell(row[index] ?? "") : "";
}

function buildRows(tableRows: string[][]): { rows: DiscoveryImportRow[]; truncated: boolean } {
  const meaningful = tableRows.filter((row) => row.some((cell) => cleanCell(cell).length > 0));
  if (meaningful.length === 0) throw new RegistryValidationError("Import file is empty");
  const headers = meaningful[0]!.map(cleanCell);
  const urlIndex = headerIndex(headers, URL_HEADERS);
  if (urlIndex < 0) {
    throw new RegistryValidationError(
      "Import file needs a URL column (url, website, locator, source_url, 网站地址)",
    );
  }
  const categoryIndex = headerIndex(headers, CATEGORY_HEADERS);
  const authorityIndex = headerIndex(headers, AUTHORITY_HEADERS);
  const jurisdictionIndex = headerIndex(headers, JURISDICTION_HEADERS);
  const languageIndex = headerIndex(headers, LANGUAGE_HEADERS);
  const noteIndex = headerIndex(headers, NOTE_HEADERS);
  const tagIndex = headerIndex(headers, TAG_HEADERS);
  const dataRows = meaningful.slice(1);
  const truncated = dataRows.length > MAX_IMPORT_ROWS;
  const seenWebsiteIdentities = new Set<string>();
  const rows: DiscoveryImportRow[] = [];

  for (let index = 0; index < Math.min(dataRows.length, MAX_IMPORT_ROWS); index += 1) {
    const sourceRow = dataRows[index]!;
    const website = publicWebsite(rowValue(sourceRow, urlIndex));
    const category = parseCategory(rowValue(sourceRow, categoryIndex));
    const authority = parseAuthority(rowValue(sourceRow, authorityIndex));
    const issues = [website.issue, category.issue, authority.issue].filter(
      (value): value is string => Boolean(value),
    );
    const intake: DiscoveryIntakeDefaults = {
      ...(category.value ? { category: category.value } : {}),
      ...(authority.value ? { authorityLevel: authority.value } : {}),
      ...(jurisdictionIndex >= 0
        ? { jurisdictions: splitList(rowValue(sourceRow, jurisdictionIndex), true) }
        : {}),
      ...(languageIndex >= 0 ? { languages: splitList(rowValue(sourceRow, languageIndex)) } : {}),
      ...(noteIndex >= 0 && rowValue(sourceRow, noteIndex)
        ? { note: rowValue(sourceRow, noteIndex) }
        : {}),
      ...(tagIndex >= 0 ? { tags: splitList(rowValue(sourceRow, tagIndex)) } : {}),
    };

    let status: DiscoveryImportRowStatus = issues.length > 0 ? "INVALID" : "VALID";
    if (status === "VALID" && website.identity) {
      if (seenWebsiteIdentities.has(website.identity)) status = "DUPLICATE";
      else seenWebsiteIdentities.add(website.identity);
    }
    rows.push({
      rowNumber: index + 2,
      locator: website.locator ?? rowValue(sourceRow, urlIndex),
      ...(website.origin ? { origin: website.origin } : {}),
      status,
      issues:
        status === "DUPLICATE"
          ? [`Duplicate website origin in this file: ${website.origin}`]
          : issues,
      intake,
    });
  }
  return { rows, truncated };
}

export function parseDiscoveryImport(input: {
  fileName: string;
  content: Uint8Array;
}): DiscoveryImportPreview {
  const fileName = input.fileName.trim();
  if (!fileName) throw new RegistryValidationError("Import file name is required");
  if (input.content.byteLength === 0) throw new RegistryValidationError("Import file is empty");
  if (input.content.byteLength > MAX_IMPORT_BYTES) {
    throw new RegistryValidationError("Import file must be 8 MB or smaller");
  }
  const table = parseTable(fileName, Buffer.from(input.content));
  const built = buildRows(table.rows);
  return {
    fileName,
    format: table.format,
    ...(table.sheetName ? { sheetName: table.sheetName } : {}),
    rows: built.rows,
    summary: {
      parsed: built.rows.length,
      valid: built.rows.filter((row) => row.status === "VALID").length,
      invalid: built.rows.filter((row) => row.status === "INVALID").length,
      duplicate: built.rows.filter((row) => row.status === "DUPLICATE").length,
      truncated: built.truncated,
    },
  };
}