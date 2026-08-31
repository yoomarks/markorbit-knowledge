import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertPathOutsideWorkingTree } from "./cnipa-live-acceptance";

const CNIPA_HOST = "pub.sbj.cnipa.gov.cn";
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const ALLOWED_PATH =
  /^\/toas-pub-prod\/pub-prod-api\/(?:pubnotice\/portal\/(?:tmsc|tmyy|tmps)Judgment\/(?:queryPageList|queryInfo|getTodayCount)|public\/web\/anncInfo\/(?:searchEsTmgg|searchEsTmggFile|maxIssue|queryTmggTypeDict)|public\/web\/portal\/fileAddr)$/;
const STATIC_APPLICATION_ASSET_PATH =
  /^\/toas-pub-prod\/portalui-pub-prod\/(?:[^/?#]+\/)*[^/?#]+\.(?:js|mjs|css)$/i;
const MAX_STATIC_APPLICATION_ASSET_PATHS = 200;
const HTTP_STATUS = /^HTTP\/\S+\s+([1-5][0-9]{2})(?:\s|$)/;

export type CnipaNetLogEndpointObservation = {
  host: string;
  path: string;
  method: string | null;
  url_event_count: number;
};

export type CnipaNetLogRequestObservation = {
  host: string;
  path: string;
  method: string;
  allowlisted_query_parameter_names: string[];
  http_status_codes: number[];
  response_status_event_indices_zero_based: number[];
  request_payload_fields: "NOT_OBSERVED";
  response_envelope: "NOT_OBSERVED";
};

export type CnipaNetLogSummary = {
  evidence_kind: "offline_netlog_allowlist_summary";
  source_sha256: string;
  source_bytes: number;
  capture_mode: "Default" | "IncludeSensitive" | "Everything" | "UNRECOGNIZED";
  event_count: number;
  url_parameter_event_count: number;
  cnipa_host_url_event_counts: Record<string, number>;
  candidate_endpoint_url_events: CnipaNetLogEndpointObservation[];
  observed_request_start_events: CnipaNetLogRequestObservation[];
  static_application_asset_path_count: number;
  static_application_asset_paths: string[];
  static_application_asset_paths_truncated: boolean;
  limitations: string[];
};

type JsonRecord = Record<string, unknown>;

type IndexedEvent = {
  index: number;
  event: JsonRecord;
};

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stringArray(value: unknown): string[] {
  if (typeof value === "string") return value.split(/\r?\n/);
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function sourceId(event: JsonRecord): string | null {
  const source = record(event.source);
  const value = source?.id;
  if (typeof value === "string" || typeof value === "number") return String(value);
  return null;
}

function eventNameMap(constants: JsonRecord | null): Map<string, string> {
  const eventTypes = record(constants?.logEventTypes);
  const result = new Map<string, string>();
  if (!eventTypes) return result;
  for (const [name, value] of Object.entries(eventTypes)) {
    if (typeof value === "number" || typeof value === "string") {
      result.set(String(value), name);
    }
  }
  return result;
}

function cnipaHost(host: string): boolean {
  return host === "cnipa.gov.cn" || host.endsWith(".cnipa.gov.cn");
}

function sortedRecord(counts: Map<string, number>): Record<string, number> {
  const entries = [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(entries);
}

function captureMode(constants: JsonRecord | null): CnipaNetLogSummary["capture_mode"] {
  const value = constants?.logCaptureMode;
  return value === "Default" || value === "IncludeSensitive" || value === "Everything"
    ? value
    : "UNRECOGNIZED";
}

export function summarizeCnipaNetLog(raw: Buffer): CnipaNetLogSummary {
  const parsed = JSON.parse(raw.toString("utf8")) as unknown;
  const document = record(parsed);
  if (!document) throw new Error("CNIPA NetLog root must be an object");

  const constants = record(document.constants);
  const eventNames = eventNameMap(constants);
  const rawEvents = Array.isArray(document.events) ? document.events : [];
  const events: IndexedEvent[] = [];
  for (const [index, value] of rawEvents.entries()) {
    const event = record(value);
    if (event) events.push({ index, event });
  }

  const bySource = new Map<string, IndexedEvent[]>();
  for (const indexed of events) {
    const id = sourceId(indexed.event);
    if (id === null) continue;
    const related = bySource.get(id) ?? [];
    related.push(indexed);
    bySource.set(id, related);
  }

  const hostCounts = new Map<string, number>();
  const endpointCounts = new Map<string, CnipaNetLogEndpointObservation>();
  const staticApplicationAssetPaths = new Set<string>();
  const requests: CnipaNetLogRequestObservation[] = [];
  let urlEventCount = 0;

  for (const { event } of events) {
    const params = record(event.params);
    if (!params || typeof params.url !== "string") continue;
    urlEventCount += 1;

    let url: URL;
    try {
      url = new URL(params.url);
    } catch {
      continue;
    }
    const host = url.hostname.toLowerCase();
    if (!cnipaHost(host)) continue;
    hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1);
    if (host === CNIPA_HOST && STATIC_APPLICATION_ASSET_PATH.test(url.pathname)) {
      staticApplicationAssetPaths.add(url.pathname);
    }
    if (host !== CNIPA_HOST || !ALLOWED_PATH.test(url.pathname)) continue;

    const method =
      typeof params.method === "string" && HTTP_METHODS.has(params.method) ? params.method : null;
    const endpointKey = `${host}\u0000${url.pathname}\u0000${method ?? ""}`;
    const existing = endpointCounts.get(endpointKey);
    if (existing) {
      existing.url_event_count += 1;
    } else {
      endpointCounts.set(endpointKey, {
        host,
        path: url.pathname,
        method,
        url_event_count: 1,
      });
    }

    const typeName = eventNames.get(String(event.type));
    if (typeName !== "URL_REQUEST_START_JOB" || !method) continue;

    const statuses: number[] = [];
    const evidenceIndices: number[] = [];
    const id = sourceId(event);
    if (id !== null) {
      for (const related of bySource.get(id) ?? []) {
        const relatedType = eventNames.get(String(related.event.type));
        if (relatedType !== "HTTP_TRANSACTION_READ_RESPONSE_HEADERS") continue;
        const relatedParams = record(related.event.params);
        for (const line of stringArray(relatedParams?.headers)) {
          const match = HTTP_STATUS.exec(line);
          if (!match) continue;
          statuses.push(Number(match[1]));
          evidenceIndices.push(related.index);
        }
      }
    }

    const rawQueryNames = [...url.searchParams.keys()];
    const allowlistedQueryNames = rawQueryNames.filter((name) => name === "id");
    const queryNames = [...new Set(allowlistedQueryNames)].sort();
    requests.push({
      host,
      path: url.pathname,
      method,
      allowlisted_query_parameter_names: queryNames,
      http_status_codes: statuses,
      response_status_event_indices_zero_based: evidenceIndices,
      request_payload_fields: "NOT_OBSERVED",
      response_envelope: "NOT_OBSERVED",
    });
  }

  const endpointEvents = [...endpointCounts.values()].sort((left, right) =>
    `${left.path}\u0000${left.method ?? ""}`.localeCompare(
      `${right.path}\u0000${right.method ?? ""}`,
    ),
  );
  const sortedStaticApplicationAssetPaths = [...staticApplicationAssetPaths].sort();
  const boundedStaticApplicationAssetPaths = sortedStaticApplicationAssetPaths.slice(
    0,
    MAX_STATIC_APPLICATION_ASSET_PATHS,
  );

  return {
    evidence_kind: "offline_netlog_allowlist_summary",
    source_sha256: createHash("sha256").update(raw).digest("hex"),
    source_bytes: raw.byteLength,
    capture_mode: captureMode(constants),
    event_count: rawEvents.length,
    url_parameter_event_count: urlEventCount,
    cnipa_host_url_event_counts: sortedRecord(hostCounts),
    candidate_endpoint_url_events: endpointEvents,
    observed_request_start_events: requests,
    static_application_asset_path_count: sortedStaticApplicationAssetPaths.length,
    static_application_asset_paths: boundedStaticApplicationAssetPaths,
    static_application_asset_paths_truncated:
      sortedStaticApplicationAssetPaths.length > boundedStaticApplicationAssetPaths.length,
    limitations: [
      "Counts are NetLog URL-parameter events, not unique HTTP requests.",
      "No headers, cookies, credentials, URL query strings or fragments are exported.",
      "Only fixed candidate paths are eligible for endpoint output; this is not an endpoint-migration detector.",
      "Static application asset paths record requested resource locations only; they do not establish asset contents, public accessibility or API semantics.",
      "Request payload schema, response envelope, identity and coverage are NOT VERIFIED.",
      "No matching event does not prove an endpoint or static asset is absent, migrated or inaccessible.",
      "Default capture mode is not a guarantee that the original log is free of secrets.",
    ],
  };
}

export async function sanitizeCnipaNetLog(options: {
  inputPath: string;
  outputPath: string;
  workingDirectory?: string;
}): Promise<CnipaNetLogSummary> {
  const workingDirectory = options.workingDirectory ?? process.cwd();
  const inputPath = assertPathOutsideWorkingTree(options.inputPath, workingDirectory);
  const outputPath = assertPathOutsideWorkingTree(options.outputPath, workingDirectory);
  if (path.resolve(inputPath) === path.resolve(outputPath)) {
    throw new Error("CNIPA NetLog input and sanitized output paths must be different");
  }

  const raw = await readFile(inputPath);
  const summary = summarizeCnipaNetLog(raw);
  const serialized = `${JSON.stringify(summary, null, 2)}\n`;
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, { flag: "wx" });
  return summary;
}
