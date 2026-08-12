import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { ExecutionExecutor } from "@markorbit/contracts";
import {
  defaultApiResolver,
  defaultApiTransport,
  type ApiResolver,
  type ApiTransport,
  type ApiTransportResponse,
} from "./api-acquirer";
import {
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionContext,
  CollectionAcquisitionError,
  type CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";
import { isPublicNetworkAddress, normalizedUrlHostname } from "./public-network-policy";

export const RSS_CONNECTOR_ID = "rss-worker";
export const RSS_CONNECTOR_VERSION = "1.0.0";
export const RSS_EXECUTOR: ExecutionExecutor = {
  executorId: RSS_CONNECTOR_ID,
  version: RSS_CONNECTOR_VERSION,
  mode: "PRODUCTION",
};

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 100;
const MAX_ENTRIES = 500;
const MAX_FEED_URL_LENGTH = 4_096;
const MAX_QUERY_ENTRIES = 20;
const MAX_QUERY_VALUE_LENGTH = 2_048;
const MAX_XML_DEPTH = 64;
const MAX_XML_NODES = 25_000;
const MAX_ATTRIBUTES_PER_NODE = 100;
const MAX_XML_NAME_LENGTH = 256;
const MAX_XML_ATTRIBUTE_VALUE_LENGTH = 64 * 1024;
const MAX_TITLE_LENGTH = 4_096;
const MAX_ID_LENGTH = 16_384;
const MAX_LINK_LENGTH = 8_192;
const MAX_AUTHOR_LENGTH = 4_096;
const MAX_CATEGORY_LENGTH = 1_024;
const MAX_CATEGORIES = 100;
const MAX_ENTRY_TEXT_LENGTH = 256 * 1024;
const MAX_ENTRY_ENVELOPE_BYTES = 512 * 1024;
const MAX_TOTAL_ENTRY_BYTES = 50 * 1024 * 1024;

const SENSITIVE_QUERY_KEY =
  /(?:^|[-_.])(token|secret|password|passwd|credential|authorization|auth|api[-_.]?key|access[-_.]?key)(?:$|[-_.])/i;

const RSS_MIME_TYPES = new Set([
  "application/rss+xml",
  "application/atom+xml",
  "application/xml",
  "text/xml",
]);

type RssSourceConfig = {
  feedUrl: string;
  timeoutMs: number;
  maxResponseBytes: number;
  maxEntries: number;
};

type XmlNode = {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string[];
  segments: Array<string | XmlNode>;
};

type ParsedFeed = {
  format: "ATOM_1_0" | "RSS_2_0";
  title?: string;
  entries: ParsedFeedEntry[];
};

type ParsedFeedEntry = {
  id?: string;
  title?: string;
  link?: string;
  publishedText?: string;
  updatedText?: string;
  author?: string;
  categories: string[];
  summary?: string;
  content?: string;
};

export type RssEntryEnvelopeV1 = {
  schema: "RSS_ENTRY_ENVELOPE_V1";
  feedCanonicalUri: string;
  feedFormat: ParsedFeed["format"];
  feedTitle?: string;
  stableEntryId: string;
  title?: string;
  canonicalLink?: string;
  publishedAt?: string;
  updatedAt?: string;
  author?: string;
  categories: string[];
  summary?: string;
  content?: string;
};

export type RssArtifactAcquirerOptions = {
  resolver?: ApiResolver;
  transport?: ApiTransport;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  field: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new CollectionAcquisitionError(
      "RSS_CONFIG_INVALID",
      `RSS connectorConfig.${field} must be an integer between ${minimum} and ${maximum}`,
      false,
    );
  }
  return value as number;
}

function normalizeFeedUrl(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_FEED_URL_LENGTH) {
    throw new CollectionAcquisitionError(
      "RSS_FEED_URL_INVALID",
      `RSS feedUrl must contain 1 to ${MAX_FEED_URL_LENGTH} characters`,
      false,
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CollectionAcquisitionError(
      "RSS_FEED_URL_INVALID",
      "RSS feedUrl is not a valid URL",
      false,
    );
  }
  if (url.protocol !== "https:") {
    throw new CollectionAcquisitionError(
      "RSS_FEED_URL_INVALID",
      "RSS Connector V1 requires an HTTPS feed URL",
      false,
    );
  }
  if (url.username || url.password || url.hash) {
    throw new CollectionAcquisitionError(
      "RSS_FEED_URL_INVALID",
      "RSS feedUrl cannot contain userinfo or a fragment",
      false,
    );
  }
  if (url.port && url.port !== "443") {
    throw new CollectionAcquisitionError(
      "RSS_FEED_URL_INVALID",
      "RSS Connector V1 permits only the default HTTPS port",
      false,
    );
  }
  const hostname = normalizedUrlHostname(url).toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new CollectionAcquisitionError(
      "RSS_NETWORK_TARGET_REJECTED",
      "RSS feedUrl cannot target localhost",
      false,
    );
  }
  const entries = [...url.searchParams.entries()];
  if (entries.length > MAX_QUERY_ENTRIES) {
    throw new CollectionAcquisitionError(
      "RSS_FEED_URL_INVALID",
      `RSS feedUrl may contain at most ${MAX_QUERY_ENTRIES} query entries`,
      false,
    );
  }
  for (const [key, queryValue] of entries) {
    if (
      !key ||
      SENSITIVE_QUERY_KEY.test(key) ||
      key.length > 100 ||
      /[\u0000-\u001f\u007f]/.test(key) ||
      queryValue.length > MAX_QUERY_VALUE_LENGTH ||
      /[\u0000\r\n]/.test(queryValue)
    ) {
      throw new CollectionAcquisitionError(
        "RSS_FEED_URL_INVALID",
        "RSS feedUrl contains an invalid or credential-like query parameter",
        false,
      );
    }
  }
  url.search = "";
  const sorted = new URLSearchParams(
    entries.sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey),
    ),
  );
  const query = sorted.toString();
  if (query.length > 4_096) {
    throw new CollectionAcquisitionError(
      "RSS_FEED_URL_INVALID",
      "RSS feedUrl query exceeds the v1 serialized bound",
      false,
    );
  }
  url.search = query;
  return url.toString();
}

function sourceConfig(context: ArtifactBackedExecutionContext): RssSourceConfig {
  const config = record(context.job.sourceSnapshot.connectorConfig);
  if (!config) {
    throw new CollectionAcquisitionError(
      "RSS_CONFIG_INVALID",
      "RSS source requires connectorConfig",
      false,
    );
  }
  const allowed = new Set(["feedUrl", "timeoutMs", "maxResponseBytes", "maxEntries"]);
  const unknown = Object.keys(config).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new CollectionAcquisitionError(
      "RSS_CONFIG_INVALID",
      `RSS connectorConfig contains unsupported fields: ${unknown.sort().join(", ")}`,
      false,
    );
  }
  return {
    feedUrl: normalizeFeedUrl(config.feedUrl),
    timeoutMs: safeInteger(
      config.timeoutMs,
      DEFAULT_TIMEOUT_MS,
      1_000,
      MAX_TIMEOUT_MS,
      "timeoutMs",
    ),
    maxResponseBytes: safeInteger(
      config.maxResponseBytes,
      DEFAULT_MAX_RESPONSE_BYTES,
      1,
      MAX_RESPONSE_BYTES,
      "maxResponseBytes",
    ),
    maxEntries: safeInteger(config.maxEntries, DEFAULT_MAX_ENTRIES, 1, MAX_ENTRIES, "maxEntries"),
  };
}

function normalizeMime(value: string): string {
  return value.split(";", 1)[0]!.trim().toLowerCase();
}

function responseContentType(response: ApiTransportResponse): string {
  const raw = response.headers["content-type"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    throw new CollectionAcquisitionError(
      "RSS_CONTENT_TYPE_REQUIRED",
      "RSS response must declare an XML feed Content-Type",
      false,
    );
  }
  const mime = normalizeMime(value);
  if (!RSS_MIME_TYPES.has(mime) && !/^application\/[a-z0-9!#$&^_.+-]+\+xml$/.test(mime)) {
    throw new CollectionAcquisitionError(
      "RSS_CONTENT_TYPE_REJECTED",
      `RSS response MIME type ${mime} is outside the v1 XML feed allowlist`,
      false,
    );
  }
  return mime;
}

function normalizeTransportError(error: unknown): never {
  if (error instanceof CollectionAcquisitionError) {
    if (error.code === "API_TIMEOUT") {
      throw new CollectionAcquisitionError("RSS_TIMEOUT", "RSS feed request timed out", true);
    }
    if (error.code === "API_RESPONSE_TOO_LARGE") {
      throw new CollectionAcquisitionError(
        "RSS_RESPONSE_TOO_LARGE",
        error.message.replace(/^API /, "RSS "),
        false,
      );
    }
    throw new CollectionAcquisitionError(
      "RSS_TRANSPORT_FAILED",
      "RSS HTTPS transport failed",
      error.retryable,
    );
  }
  const code = record(error)?.code;
  const retryableCodes = new Set([
    "ECONNRESET",
    "ECONNREFUSED",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ETIMEDOUT",
  ]);
  throw new CollectionAcquisitionError(
    "RSS_TRANSPORT_FAILED",
    "RSS HTTPS transport failed before a governed response was obtained",
    typeof code === "string" ? retryableCodes.has(code) : true,
  );
}

function statusFailure(status: number): CollectionAcquisitionError {
  if (status >= 300 && status < 400) {
    return new CollectionAcquisitionError(
      "RSS_REDIRECT_REJECTED",
      "RSS Connector V1 does not follow redirects; configure the final HTTPS feed URL explicitly",
      false,
    );
  }
  const retryable = status === 408 || status === 425 || status === 429 || status >= 500;
  return new CollectionAcquisitionError(
    "RSS_HTTP_STATUS_REJECTED",
    `RSS endpoint returned HTTP ${status}`,
    retryable,
  );
}

function assertSupportedJob(context: ArtifactBackedExecutionContext): void {
  if (context.job.sourceSnapshot.sourceType !== "RSS") {
    throw new CollectionAcquisitionError(
      "SOURCE_TYPE_NOT_SUPPORTED",
      `RSS acquirer requires RSS sources, received ${context.job.sourceSnapshot.sourceType}`,
      false,
    );
  }
  if (context.job.jobType !== "WEB_CRAWL") {
    throw new CollectionAcquisitionError(
      "JOB_TYPE_NOT_SUPPORTED",
      `RSS acquirer requires WEB_CRAWL, received ${context.job.jobType}`,
      false,
    );
  }
  if (
    context.job.connector.connectorId !== RSS_CONNECTOR_ID ||
    context.job.connector.version !== RSS_CONNECTOR_VERSION
  ) {
    throw new CollectionAcquisitionError(
      "CONNECTOR_NOT_SUPPORTED",
      `RSS acquirer requires ${RSS_CONNECTOR_ID}@${RSS_CONNECTOR_VERSION}`,
      false,
    );
  }
}

function decodeXmlEntities(value: string): string {
  const invalid = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/;
  if (invalid.test(value)) {
    throw new CollectionAcquisitionError(
      "RSS_XML_INVALID",
      "RSS XML contains an unsupported or unterminated entity reference",
      false,
    );
  }
  return value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_match, entity: string) => {
    if (entity === "amp") return "&";
    if (entity === "lt") return "<";
    if (entity === "gt") return ">";
    if (entity === "quot") return '"';
    if (entity === "apos") return "'";
    const codePoint = entity.startsWith("#x")
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10);
    if (
      !Number.isInteger(codePoint) ||
      codePoint <= 0 ||
      codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      throw new CollectionAcquisitionError(
        "RSS_XML_INVALID",
        "RSS XML contains an invalid numeric entity reference",
        false,
      );
    }
    return String.fromCodePoint(codePoint);
  });
}

function tagEnd(xml: string, start: number): number {
  let quote: '"' | "'" | null = null;
  for (let index = start; index < xml.length; index += 1) {
    const char = xml[index]!;
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") return index;
  }
  return -1;
}

function parseOpeningTag(raw: string): {
  name: string;
  attributes: Record<string, string>;
  selfClosing: boolean;
} {
  let input = raw.trim();
  const selfClosing = input.endsWith("/");
  if (selfClosing) input = input.slice(0, -1).trimEnd();
  const nameMatch = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(input);
  if (!nameMatch) {
    throw new CollectionAcquisitionError(
      "RSS_XML_INVALID",
      "RSS XML contains an invalid element name",
      false,
    );
  }
  const name = nameMatch[0];
  if (name.length > MAX_XML_NAME_LENGTH) {
    throw new CollectionAcquisitionError(
      "RSS_XML_LIMIT_EXCEEDED",
      `RSS XML element name exceeds the ${MAX_XML_NAME_LENGTH}-character bound`,
      false,
    );
  }
  let offset = name.length;
  const attributes: Record<string, string> = {};
  let attributeCount = 0;
  while (offset < input.length) {
    while (/\s/.test(input[offset] ?? "")) offset += 1;
    if (offset >= input.length) break;
    const attributeMatch = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(input.slice(offset));
    if (!attributeMatch) {
      throw new CollectionAcquisitionError(
        "RSS_XML_INVALID",
        "RSS XML contains an invalid attribute name",
        false,
      );
    }
    const attributeName = attributeMatch[0];
    if (attributeName.length > MAX_XML_NAME_LENGTH) {
      throw new CollectionAcquisitionError(
        "RSS_XML_LIMIT_EXCEEDED",
        `RSS XML attribute name exceeds the ${MAX_XML_NAME_LENGTH}-character bound`,
        false,
      );
    }
    offset += attributeName.length;
    while (/\s/.test(input[offset] ?? "")) offset += 1;
    if (input[offset] !== "=") {
      throw new CollectionAcquisitionError(
        "RSS_XML_INVALID",
        "RSS XML attribute is missing '='",
        false,
      );
    }
    offset += 1;
    while (/\s/.test(input[offset] ?? "")) offset += 1;
    const quote = input[offset];
    if (quote !== '"' && quote !== "'") {
      throw new CollectionAcquisitionError(
        "RSS_XML_INVALID",
        "RSS XML attribute must be quoted",
        false,
      );
    }
    offset += 1;
    const end = input.indexOf(quote, offset);
    if (end < 0) {
      throw new CollectionAcquisitionError(
        "RSS_XML_INVALID",
        "RSS XML attribute quote is unterminated",
        false,
      );
    }
    if (Object.prototype.hasOwnProperty.call(attributes, attributeName)) {
      throw new CollectionAcquisitionError(
        "RSS_XML_INVALID",
        "RSS XML contains a duplicate attribute",
        false,
      );
    }
    const rawAttributeValue = input.slice(offset, end);
    if (rawAttributeValue.length > MAX_XML_ATTRIBUTE_VALUE_LENGTH) {
      throw new CollectionAcquisitionError(
        "RSS_XML_LIMIT_EXCEEDED",
        `RSS XML attribute value exceeds the ${MAX_XML_ATTRIBUTE_VALUE_LENGTH}-character bound`,
        false,
      );
    }
    attributes[attributeName] = decodeXmlEntities(rawAttributeValue);
    attributeCount += 1;
    if (attributeCount > MAX_ATTRIBUTES_PER_NODE) {
      throw new CollectionAcquisitionError(
        "RSS_XML_LIMIT_EXCEEDED",
        `RSS XML element exceeds the ${MAX_ATTRIBUTES_PER_NODE}-attribute bound`,
        false,
      );
    }
    offset = end + 1;
  }
  return { name, attributes, selfClosing };
}

function parseXml(xml: string): XmlNode {
  if (/<!DOCTYPE/i.test(xml) || /<!ENTITY/i.test(xml)) {
    throw new CollectionAcquisitionError(
      "RSS_XML_DTD_REJECTED",
      "RSS Connector V1 rejects DTD and entity declarations",
      false,
    );
  }
  const declaration = /^\uFEFF?\s*<\?xml\s+([^?]+)\?>/i.exec(xml);
  if (declaration) {
    const encoding = /\bencoding\s*=\s*["']([^"']+)["']/i.exec(declaration[1] ?? "")?.[1];
    if (encoding && !/^(?:utf-?8|us-ascii)$/i.test(encoding)) {
      throw new CollectionAcquisitionError(
        "RSS_XML_ENCODING_REJECTED",
        `RSS Connector V1 accepts UTF-8 XML only, received ${encoding}`,
        false,
      );
    }
  }

  const documentRoot: XmlNode = {
    name: "#document",
    attributes: {},
    children: [],
    text: [],
    segments: [],
  };
  const stack: XmlNode[] = [documentRoot];
  let nodeCount = 0;
  let cursor = 0;
  while (cursor < xml.length) {
    const opening = xml.indexOf("<", cursor);
    if (opening < 0) {
      const tail = xml.slice(cursor);
      if (tail.trim()) {
        const decoded = decodeXmlEntities(tail);
        stack[stack.length - 1]!.text.push(decoded);
        stack[stack.length - 1]!.segments.push(decoded);
      }
      cursor = xml.length;
      break;
    }
    if (opening > cursor) {
      const text = xml.slice(cursor, opening);
      if (text) {
        const decoded = decodeXmlEntities(text);
        stack[stack.length - 1]!.text.push(decoded);
        stack[stack.length - 1]!.segments.push(decoded);
      }
    }
    if (xml.startsWith("<!--", opening)) {
      const end = xml.indexOf("-->", opening + 4);
      if (end < 0)
        throw new CollectionAcquisitionError(
          "RSS_XML_INVALID",
          "RSS XML comment is unterminated",
          false,
        );
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", opening)) {
      const end = xml.indexOf("]]>", opening + 9);
      if (end < 0)
        throw new CollectionAcquisitionError(
          "RSS_XML_INVALID",
          "RSS XML CDATA is unterminated",
          false,
        );
      const cdata = xml.slice(opening + 9, end);
      stack[stack.length - 1]!.text.push(cdata);
      stack[stack.length - 1]!.segments.push(cdata);
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<?", opening)) {
      const end = xml.indexOf("?>", opening + 2);
      if (end < 0) {
        throw new CollectionAcquisitionError(
          "RSS_XML_INVALID",
          "RSS XML processing instruction is unterminated",
          false,
        );
      }
      cursor = end + 2;
      continue;
    }
    if (xml.startsWith("<!", opening)) {
      throw new CollectionAcquisitionError(
        "RSS_XML_DECLARATION_REJECTED",
        "RSS XML contains an unsupported declaration",
        false,
      );
    }
    const end = tagEnd(xml, opening + 1);
    if (end < 0)
      throw new CollectionAcquisitionError("RSS_XML_INVALID", "RSS XML tag is unterminated", false);
    const raw = xml.slice(opening + 1, end);
    if (raw.startsWith("/")) {
      const closingName = raw.slice(1).trim();
      if (
        closingName.length > MAX_XML_NAME_LENGTH ||
        !/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(closingName) ||
        stack.length <= 1
      ) {
        throw new CollectionAcquisitionError(
          "RSS_XML_INVALID",
          "RSS XML contains an invalid closing tag",
          false,
        );
      }
      const current = stack.pop()!;
      if (current.name !== closingName) {
        throw new CollectionAcquisitionError(
          "RSS_XML_INVALID",
          `RSS XML closing tag ${closingName} does not match ${current.name}`,
          false,
        );
      }
      cursor = end + 1;
      continue;
    }
    const parsed = parseOpeningTag(raw);
    const node: XmlNode = {
      name: parsed.name,
      attributes: parsed.attributes,
      children: [],
      text: [],
      segments: [],
    };
    stack[stack.length - 1]!.children.push(node);
    stack[stack.length - 1]!.segments.push(node);
    nodeCount += 1;
    if (nodeCount > MAX_XML_NODES) {
      throw new CollectionAcquisitionError(
        "RSS_XML_LIMIT_EXCEEDED",
        `RSS XML exceeds the ${MAX_XML_NODES}-node bound`,
        false,
      );
    }
    if (!parsed.selfClosing) {
      stack.push(node);
      if (stack.length - 1 > MAX_XML_DEPTH) {
        throw new CollectionAcquisitionError(
          "RSS_XML_LIMIT_EXCEEDED",
          `RSS XML exceeds the ${MAX_XML_DEPTH}-level nesting bound`,
          false,
        );
      }
    }
    cursor = end + 1;
  }
  if (stack.length !== 1) {
    throw new CollectionAcquisitionError(
      "RSS_XML_INVALID",
      "RSS XML contains unclosed elements",
      false,
    );
  }
  if (documentRoot.children.length !== 1) {
    throw new CollectionAcquisitionError(
      "RSS_XML_INVALID",
      "RSS XML must contain exactly one document element",
      false,
    );
  }
  return documentRoot.children[0]!;
}

function localName(name: string): string {
  return (name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : name).toLowerCase();
}

function children(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((child) => localName(child.name) === name);
}

function child(node: XmlNode, name: string): XmlNode | undefined {
  return children(node, name)[0];
}

function nodeText(node: XmlNode): string {
  const parts = node.segments.map((segment) =>
    typeof segment === "string" ? segment : nodeText(segment),
  );
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function boundedText(node: XmlNode | undefined, field: string, max: number): string | undefined {
  if (!node) return undefined;
  const value = nodeText(node);
  if (!value) return undefined;
  if (value.length > max) {
    throw new CollectionAcquisitionError(
      "RSS_ENTRY_FIELD_TOO_LARGE",
      `RSS entry ${field} exceeds the ${max}-character bound`,
      false,
    );
  }
  return value;
}

function attribute(node: XmlNode, name: string): string | undefined {
  for (const [key, value] of Object.entries(node.attributes)) {
    if (localName(key) === name) return value;
  }
  return undefined;
}

function boundedAttribute(
  node: XmlNode,
  name: string,
  field: string,
  max: number,
): string | undefined {
  const value = attribute(node, name)?.trim();
  if (!value) return undefined;
  if (value.length > max) {
    throw new CollectionAcquisitionError(
      "RSS_ENTRY_FIELD_TOO_LARGE",
      `RSS entry ${field} exceeds the ${max}-character bound`,
      false,
    );
  }
  return value;
}

function parseCategories(nodes: XmlNode[], atom = false): string[] {
  const values: string[] = [];
  for (const node of nodes) {
    const raw = atom
      ? boundedAttribute(node, "term", "category", MAX_CATEGORY_LENGTH)
      : nodeText(node);
    const value = raw?.trim();
    if (!value) continue;
    if (value.length > MAX_CATEGORY_LENGTH) {
      throw new CollectionAcquisitionError(
        "RSS_ENTRY_FIELD_TOO_LARGE",
        `RSS entry category exceeds the ${MAX_CATEGORY_LENGTH}-character bound`,
        false,
      );
    }
    values.push(value);
    if (values.length > MAX_CATEGORIES) {
      throw new CollectionAcquisitionError(
        "RSS_ENTRY_FIELD_TOO_LARGE",
        `RSS entry exceeds the ${MAX_CATEGORIES}-category bound`,
        false,
      );
    }
  }
  return [...new Set(values)].sort();
}

function atomLink(entry: XmlNode): string | undefined {
  const links = children(entry, "link");
  const preferred = links.find((node) => {
    const rel = boundedAttribute(node, "rel", "link rel", 256)?.toLowerCase();
    return !rel || rel === "alternate";
  });
  return preferred ? boundedAttribute(preferred, "href", "link href", MAX_LINK_LENGTH) : undefined;
}

function parseRss(root: XmlNode): ParsedFeed {
  const channel = child(root, "channel");
  if (!channel) {
    throw new CollectionAcquisitionError(
      "RSS_FORMAT_INVALID",
      "RSS document is missing channel",
      false,
    );
  }
  const entries = children(channel, "item").map((item) => ({
    id: boundedText(child(item, "guid"), "guid", MAX_ID_LENGTH),
    title: boundedText(child(item, "title"), "title", MAX_TITLE_LENGTH),
    link: boundedText(child(item, "link"), "link", MAX_LINK_LENGTH),
    publishedText: boundedText(child(item, "pubdate"), "pubDate", MAX_ID_LENGTH),
    updatedText: boundedText(child(item, "updated"), "updated", MAX_ID_LENGTH),
    author:
      boundedText(child(item, "creator"), "author", MAX_AUTHOR_LENGTH) ??
      boundedText(child(item, "author"), "author", MAX_AUTHOR_LENGTH),
    categories: parseCategories(children(item, "category")),
    summary: boundedText(child(item, "description"), "description", MAX_ENTRY_TEXT_LENGTH),
    content: boundedText(child(item, "encoded"), "content", MAX_ENTRY_TEXT_LENGTH),
  }));
  return {
    format: "RSS_2_0",
    title: boundedText(child(channel, "title"), "feed title", MAX_TITLE_LENGTH),
    entries,
  };
}

function parseAtom(root: XmlNode): ParsedFeed {
  const entries = children(root, "entry").map((entry) => {
    const authorNode = child(entry, "author");
    return {
      id: boundedText(child(entry, "id"), "id", MAX_ID_LENGTH),
      title: boundedText(child(entry, "title"), "title", MAX_TITLE_LENGTH),
      link: atomLink(entry),
      publishedText: boundedText(child(entry, "published"), "published", MAX_ID_LENGTH),
      updatedText: boundedText(child(entry, "updated"), "updated", MAX_ID_LENGTH),
      author: authorNode
        ? (boundedText(child(authorNode, "name"), "author", MAX_AUTHOR_LENGTH) ??
          boundedText(authorNode, "author", MAX_AUTHOR_LENGTH))
        : undefined,
      categories: parseCategories(children(entry, "category"), true),
      summary: boundedText(child(entry, "summary"), "summary", MAX_ENTRY_TEXT_LENGTH),
      content: boundedText(child(entry, "content"), "content", MAX_ENTRY_TEXT_LENGTH),
    };
  });
  return {
    format: "ATOM_1_0",
    title: boundedText(child(root, "title"), "feed title", MAX_TITLE_LENGTH),
    entries,
  };
}

function parseFeed(xml: string): ParsedFeed {
  const root = parseXml(xml);
  const name = localName(root.name);
  if (name === "rss") {
    if (root.attributes.version?.trim() !== "2.0") {
      throw new CollectionAcquisitionError(
        "RSS_FORMAT_UNSUPPORTED",
        'RSS Connector V1 requires an RSS 2.0 root with version="2.0"',
        false,
      );
    }
    return parseRss(root);
  }
  if (name === "feed") {
    const separator = root.name.indexOf(":");
    const prefix = separator >= 0 ? root.name.slice(0, separator) : null;
    const namespaceUri = prefix ? root.attributes[`xmlns:${prefix}`] : root.attributes.xmlns;
    if (namespaceUri?.trim() !== "http://www.w3.org/2005/Atom") {
      throw new CollectionAcquisitionError(
        "RSS_FORMAT_UNSUPPORTED",
        "RSS Connector V1 requires the Atom 1.0 namespace on the feed root",
        false,
      );
    }
    return parseAtom(root);
  }
  if (name === "rdf") {
    throw new CollectionAcquisitionError(
      "RSS_FORMAT_UNSUPPORTED",
      "RSS 1.0/RDF is outside RSS Connector V1; use RSS 2.0 or Atom 1.0",
      false,
    );
  }
  throw new CollectionAcquisitionError(
    "RSS_FORMAT_UNSUPPORTED",
    "RSS Connector V1 accepts RSS 2.0 or Atom 1.0 document roots",
    false,
  );
}

function normalizedDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function normalizeEntryLink(value: string | undefined, feedUrl: string): string | undefined {
  if (!value || value.length > MAX_LINK_LENGTH) return undefined;
  try {
    const url = new URL(value, feedUrl);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
      return undefined;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function stableEntryId(
  entry: ParsedFeedEntry,
  canonicalLink: string | undefined,
  format: ParsedFeed["format"],
): string {
  if (entry.id?.trim()) return `${format === "ATOM_1_0" ? "atom-id" : "guid"}:${entry.id.trim()}`;
  if (canonicalLink) return `link:${canonicalLink}`;
  const fallback = JSON.stringify([
    entry.title ?? "",
    entry.publishedText ?? "",
    entry.updatedText ?? "",
    entry.summary ?? "",
    entry.content ?? "",
  ]);
  if (fallback === '["","","","",""]') {
    throw new CollectionAcquisitionError(
      "RSS_ENTRY_IDENTITY_MISSING",
      "RSS entry lacks id, link, and bounded content fields needed for deterministic identity",
      false,
    );
  }
  return `fallback:${digest(fallback)}`;
}

function envelopeFor(
  entry: ParsedFeedEntry,
  feed: ParsedFeed,
  feedUrl: string,
  feedCanonicalUri: string,
): RssEntryEnvelopeV1 {
  const canonicalLink = normalizeEntryLink(entry.link, feedUrl);
  const stableId = stableEntryId(entry, canonicalLink, feed.format);
  const publishedAt = normalizedDate(entry.publishedText);
  const updatedAt = normalizedDate(entry.updatedText);
  return {
    schema: "RSS_ENTRY_ENVELOPE_V1",
    feedCanonicalUri,
    feedFormat: feed.format,
    ...(feed.title ? { feedTitle: feed.title } : {}),
    stableEntryId: stableId,
    ...(entry.title ? { title: entry.title } : {}),
    ...(canonicalLink ? { canonicalLink } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(entry.author ? { author: entry.author } : {}),
    categories: entry.categories,
    ...(entry.summary ? { summary: entry.summary } : {}),
    ...(entry.content ? { content: entry.content } : {}),
  };
}

function decodeFeedBody(body: Uint8Array): string {
  if (body.byteLength === 0) {
    throw new CollectionAcquisitionError(
      "RSS_EMPTY_RESPONSE",
      "RSS endpoint returned an empty feed",
      false,
    );
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new CollectionAcquisitionError(
      "RSS_XML_ENCODING_REJECTED",
      "RSS Connector V1 requires a valid UTF-8 feed body",
      false,
    );
  }
}

export class RssArtifactAcquirer implements CollectionArtifactAcquirer {
  readonly executor = RSS_EXECUTOR;
  private readonly resolver: ApiResolver;
  private readonly transport: ApiTransport;

  constructor(options: RssArtifactAcquirerOptions = {}) {
    this.resolver = options.resolver ?? defaultApiResolver;
    this.transport = options.transport ?? defaultApiTransport;
  }

  async acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]> {
    assertSupportedJob(context);
    const config = sourceConfig(context);
    const endpoint = new URL(config.feedUrl);
    const endpointHostname = normalizedUrlHostname(endpoint);
    let resolved;
    try {
      resolved = await this.resolver(endpointHostname);
    } catch (error) {
      return normalizeTransportError(error);
    }
    if (
      resolved.length === 0 ||
      resolved.some((item) => !isPublicNetworkAddress(item.address, item.family))
    ) {
      throw new CollectionAcquisitionError(
        "RSS_NETWORK_TARGET_REJECTED",
        "RSS feed resolution did not produce an exclusively public address set",
        false,
      );
    }
    const selected = resolved[0]!;
    let response: ApiTransportResponse;
    try {
      response = await this.transport({
        hostname: endpointHostname,
        resolvedAddress: selected.address,
        family: selected.family,
        port: 443,
        ...(isIP(endpointHostname) ? {} : { servername: endpointHostname }),
        path: `${endpoint.pathname}${endpoint.search}`,
        hostHeader: endpoint.host,
        headers: {
          accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
          "user-agent": "MarkOrbit-Knowledge-RSS-Worker/1.0",
        },
        timeoutMs: config.timeoutMs,
        maxResponseBytes: config.maxResponseBytes,
      });
    } catch (error) {
      return normalizeTransportError(error);
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw statusFailure(response.statusCode);
    }
    if (response.body.byteLength > config.maxResponseBytes) {
      throw new CollectionAcquisitionError(
        "RSS_RESPONSE_TOO_LARGE",
        `RSS response exceeded the ${config.maxResponseBytes}-byte bound`,
        false,
      );
    }
    const mimeType = responseContentType(response);
    const xml = decodeFeedBody(response.body);
    const feed = parseFeed(xml);
    if (feed.entries.length > config.maxEntries) {
      throw new CollectionAcquisitionError(
        "RSS_ENTRY_LIMIT_EXCEEDED",
        `RSS feed contains ${feed.entries.length} entries, exceeding the configured ${config.maxEntries}-entry bound`,
        false,
      );
    }

    const feedDigest = digest(config.feedUrl);
    const feedCanonicalUri = `rss://${feedDigest}/feed`;
    const artifacts: AcquiredCollectionArtifact[] = [
      {
        artifactKind: "XML",
        mimeType,
        originalName: `rss-feed-${feedDigest.slice(0, 16)}.xml`,
        sourceUri: config.feedUrl,
        canonicalUri: feedCanonicalUri,
        content: response.body,
      },
    ];
    const seen = new Set<string>();
    const entryArtifacts: AcquiredCollectionArtifact[] = [];
    let totalEntryBytes = 0;
    for (const entry of feed.entries) {
      const envelope = envelopeFor(entry, feed, config.feedUrl, feedCanonicalUri);
      const entryDigest = digest(envelope.stableEntryId);
      const canonicalUri = `rss://${feedDigest}/entry/${entryDigest}`;
      if (seen.has(canonicalUri)) {
        throw new CollectionAcquisitionError(
          "RSS_DUPLICATE_ENTRY_ID",
          "RSS feed contains duplicate stable entry identities",
          false,
        );
      }
      seen.add(canonicalUri);
      const content = Buffer.from(`${JSON.stringify(envelope)}\n`, "utf8");
      if (content.byteLength > MAX_ENTRY_ENVELOPE_BYTES) {
        throw new CollectionAcquisitionError(
          "RSS_ENTRY_TOO_LARGE",
          `RSS entry envelope exceeds the ${MAX_ENTRY_ENVELOPE_BYTES}-byte bound`,
          false,
        );
      }
      totalEntryBytes += content.byteLength;
      if (totalEntryBytes > MAX_TOTAL_ENTRY_BYTES) {
        throw new CollectionAcquisitionError(
          "RSS_ENTRY_TOTAL_TOO_LARGE",
          `RSS entry envelopes exceed the ${MAX_TOTAL_ENTRY_BYTES}-byte aggregate bound`,
          false,
        );
      }
      entryArtifacts.push({
        artifactKind: "JSON",
        mimeType: "application/json",
        originalName: `rss-entry-${entryDigest.slice(0, 16)}.json`,
        sourceUri: canonicalUri,
        canonicalUri,
        ...(envelope.publishedAt ? { publishedAt: envelope.publishedAt } : {}),
        content,
      });
    }
    entryArtifacts.sort((left, right) => left.canonicalUri!.localeCompare(right.canonicalUri!));
    artifacts.push(...entryArtifacts);
    return artifacts;
  }
}
