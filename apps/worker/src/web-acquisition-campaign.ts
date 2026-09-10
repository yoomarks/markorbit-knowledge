import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { SqliteWebUrlCatalogRepository } from "@markorbit/persistence/web-url-catalog";

export const WEB_ACQUISITION_CAMPAIGN_VERSION = "1.0" as const;
export const CAMPAIGN_CONNECTOR_ID = "crawl4ai-web";
export const CAMPAIGN_CONNECTOR_VERSION = "1.3.0";
export const CAMPAIGN_MAX_START_URLS = 500;
const DEFAULT_REFRESH_INTERVAL_SECONDS: Record<WebAcquisitionSourceClass, number> = {
  OFFICIAL_AUTHORITY: 86_400,
  PEER_PROFESSIONAL: 604_800,
};

export type WebAcquisitionSourceClass = "OFFICIAL_AUTHORITY" | "PEER_PROFESSIONAL";
export type WebAcquisitionDiscoveryMode = "SITEMAP" | "LINK_CRAWL" | "EXACT_URL_LIST";

export type WebAcquisitionCampaignSourceV1 = {
  key: string;
  name: string;
  sourceClass: WebAcquisitionSourceClass;
  jurisdictions: string[];
  languages: string[];
  baseUrl: string;
  allowedHosts?: string[];
  discovery: {
    mode: WebAcquisitionDiscoveryMode;
    sitemapUrls?: string[];
    exactUrls?: string[];
    maxSitemaps?: number;
  };
  includePatterns?: string[];
  excludePatterns?: string[];
  maxPages: number;
  maxDepth: number;
  rateLimitPerMinute: number;
  refreshIntervalSeconds?: number;
  adaptiveRefreshCadence?: boolean;
  renderJavascript?: boolean;
};
export type WebAcquisitionCampaignManifestV1 = {
  version: typeof WEB_ACQUISITION_CAMPAIGN_VERSION;
  campaignId: string;
  name: string;
  workspaceId: string;
  globalConcurrency: number;
  sources: WebAcquisitionCampaignSourceV1[];
};

export type WebAcquisitionInventoryV1 = {
  sourceKey: string;
  baseUrl: string;
  requestedMode: WebAcquisitionDiscoveryMode;
  modeUsed: WebAcquisitionDiscoveryMode;
  robotsUrl: string;
  robotsStatus: number | null;
  sitemapUrls: string[];
  discoveredCount: number;
  selectedUrls: string[];
  catalogCount: number;
  eligibleCount: number;
  excludedCount: number;
  duplicateCount: number;
  errors: string[];
  inventorySha256: string;
  eligibleInventorySha256: string;
};

type WebAcquisitionInventoryInternal = WebAcquisitionInventoryV1 & {
  catalogUrls: string[];
  eligibleUrls: string[];
};

export type WebAcquisitionCampaignResultV1 = {
  campaignId: string;
  workspaceId: string;
  workerId: string | null;
  workerCredential: string | null;
  recommendedWorkerProcesses: number;
  sources: Array<{
    sourceKey: string;
    sourceId: string;
    planId: string;
    refreshPlanId: string;
    runId: string | null;
    conversionProfileId: string;
    inventory: WebAcquisitionInventoryV1;
  }>;
};
type JsonRecord = Record<string, unknown>;
type FetchLike = typeof fetch;

const TRACKING_PARAMETERS = new Set(["gclid", "fbclid", "mc_cid", "mc_eid", "msclkid", "ref"]);

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function integer(value: unknown, field: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${field} must be an integer in ${minimum}..${maximum}`);
  }
  return Number(value);
}

function stringArray(value: unknown, field: string): string[] {
  return array(value).map((item, index) => requiredString(item, `${field}[${index}]`));
}

function optionalBoolean(value: unknown, field: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function campaignSlug(value: string): string {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) {
    throw new Error("campaignId and source keys must be lowercase kebab-case");
  }
  return slug;
}
function privateIpv4(hostname: string): boolean {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((value) => value < 0 || value > 255)) return true;
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

export function assertPublicHttpUrl(raw: string, field = "url"): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${field} must be an absolute HTTP(S) URL`);
  }
  const hostname = url.hostname.toLowerCase();
  if (
    !["http:", "https:"].includes(url.protocol) ||
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname === "::1" ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    privateIpv4(hostname) ||
    url.username ||
    url.password
  ) {
    throw new Error(`${field} must remain on a public HTTP(S) origin without embedded credentials`);
  }
  return url;
}

export function canonicalizeCampaignUrl(raw: string): string {
  const url = assertPublicHttpUrl(raw);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    const normalized = key.toLowerCase();
    if (normalized.startsWith("utm_") || TRACKING_PARAMETERS.has(normalized)) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/{2,}/gu, "/");
  return url.toString();
}
function sourceClass(value: unknown, field: string): WebAcquisitionSourceClass {
  if (value === "OFFICIAL_AUTHORITY" || value === "PEER_PROFESSIONAL") return value;
  throw new Error(`${field} must be OFFICIAL_AUTHORITY or PEER_PROFESSIONAL`);
}

function discoveryMode(value: unknown, field: string): WebAcquisitionDiscoveryMode {
  if (value === "SITEMAP" || value === "LINK_CRAWL" || value === "EXACT_URL_LIST") return value;
  throw new Error(`${field} must be SITEMAP, LINK_CRAWL or EXACT_URL_LIST`);
}

export function parseWebAcquisitionCampaignManifest(
  payload: unknown,
): WebAcquisitionCampaignManifestV1 {
  const root = record(payload);
  if (!root) throw new Error("Campaign manifest must be an object");
  if (root.version !== WEB_ACQUISITION_CAMPAIGN_VERSION) {
    throw new Error(`Campaign manifest version must be ${WEB_ACQUISITION_CAMPAIGN_VERSION}`);
  }
  const campaignId = campaignSlug(requiredString(root.campaignId, "campaignId"));
  const sources = array(root.sources).map((raw, index): WebAcquisitionCampaignSourceV1 => {
    const value = record(raw);
    const discovery = record(value?.discovery);
    if (!value || !discovery) throw new Error(`sources[${index}] is invalid`);
    const key = campaignSlug(requiredString(value.key, `sources[${index}].key`));
    const baseUrl = canonicalizeCampaignUrl(
      requiredString(value.baseUrl, `sources[${index}].baseUrl`),
    );
    const mode = discoveryMode(discovery.mode, `sources[${index}].discovery.mode`);
    const parsedSourceClass = sourceClass(value.sourceClass, `sources[${index}].sourceClass`);
    const exactUrls = stringArray(discovery.exactUrls, `sources[${index}].discovery.exactUrls`);
    if (mode === "EXACT_URL_LIST" && exactUrls.length === 0) {
      throw new Error(`sources[${index}] EXACT_URL_LIST requires exactUrls`);
    }
    return {
      key,
      name: requiredString(value.name, `sources[${index}].name`),
      sourceClass: parsedSourceClass,
      jurisdictions: stringArray(value.jurisdictions, `sources[${index}].jurisdictions`),
      languages: stringArray(value.languages, `sources[${index}].languages`),
      baseUrl,
      allowedHosts: stringArray(value.allowedHosts, `sources[${index}].allowedHosts`),
      discovery: {
        mode,
        sitemapUrls: stringArray(discovery.sitemapUrls, `sources[${index}].discovery.sitemapUrls`),
        exactUrls,
        maxSitemaps: integer(
          discovery.maxSitemaps ?? 20,
          `sources[${index}].discovery.maxSitemaps`,
          1,
          100,
        ),
      },
      includePatterns: stringArray(value.includePatterns, `sources[${index}].includePatterns`),
      excludePatterns: stringArray(value.excludePatterns, `sources[${index}].excludePatterns`),
      maxPages: integer(value.maxPages, `sources[${index}].maxPages`, 1, CAMPAIGN_MAX_START_URLS),
      maxDepth: integer(value.maxDepth, `sources[${index}].maxDepth`, 0, 5),
      rateLimitPerMinute: integer(
        value.rateLimitPerMinute,
        `sources[${index}].rateLimitPerMinute`,
        1,
        600,
      ),
      refreshIntervalSeconds: integer(
        value.refreshIntervalSeconds ?? DEFAULT_REFRESH_INTERVAL_SECONDS[parsedSourceClass],
        `sources[${index}].refreshIntervalSeconds`,
        300,
        2_592_000,
      ),
      adaptiveRefreshCadence: optionalBoolean(
        value.adaptiveRefreshCadence,
        `sources[${index}].adaptiveRefreshCadence`,
      ),
      renderJavascript: value.renderJavascript === true,
    };
  });
  if (sources.length === 0) throw new Error("Campaign manifest requires at least one source");
  if (sources.length > 100)
    throw new Error("Campaign manifest supports at most 100 sources per wave");
  const keys = new Set<string>();
  for (const source of sources) {
    if (keys.has(source.key)) throw new Error(`Duplicate source key ${source.key}`);
    keys.add(source.key);
    if (source.jurisdictions.length === 0) throw new Error(`${source.key} requires jurisdictions`);
    if (source.languages.length === 0) throw new Error(`${source.key} requires languages`);
  }
  return {
    version: WEB_ACQUISITION_CAMPAIGN_VERSION,
    campaignId,
    name: requiredString(root.name, "name"),
    workspaceId: requiredString(root.workspaceId, "workspaceId"),
    globalConcurrency: integer(root.globalConcurrency ?? 4, "globalConcurrency", 1, 32),
    sources,
  };
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function xmlLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/giu)]
    .map((match) => decodeXml(match[1]!.trim()))
    .filter(Boolean);
}

function robotsSitemaps(text: string): string[] {
  return text
    .split(/\r?\n/u)
    .map((line) => line.match(/^\s*Sitemap\s*:\s*(\S+)\s*$/iu)?.[1])
    .filter((value): value is string => Boolean(value));
}

function inventoryHash(urls: readonly string[]): string {
  return createHash("sha256").update(urls.join("\n"), "utf8").digest("hex");
}
function stableObjectHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}
function patternRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`^${escaped.replaceAll("*", ".*")}$`, "u");
}

function matchesPatterns(
  url: string,
  include: readonly string[],
  exclude: readonly string[],
): boolean {
  const included =
    include.length === 0 || include.some((pattern) => patternRegex(pattern).test(url));
  const excluded = exclude.some((pattern) => patternRegex(pattern).test(url));
  return included && !excluded;
}

function allowedPageHost(source: WebAcquisitionCampaignSourceV1, url: URL): boolean {
  const base = new URL(source.baseUrl);
  const allowed = new Set([
    base.hostname.toLowerCase(),
    ...(source.allowedHosts ?? []).map((value) => value.toLowerCase()),
  ]);
  return allowed.has(url.hostname.toLowerCase());
}

async function fetchText(
  fetchImpl: FetchLike,
  rawUrl: string,
): Promise<{ status: number; text: string }> {
  const url = assertPublicHttpUrl(rawUrl);
  const response = await fetchImpl(url, {
    headers: { "user-agent": "MarkOrbit-Knowledge/0.1 governed-web-acquisition" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  return { status: response.status, text };
}

function selectedUrls(
  source: WebAcquisitionCampaignSourceV1,
  discovered: readonly string[],
): {
  batchUrls: string[];
  catalogUrls: string[];
  eligibleUrls: string[];
  excludedCount: number;
  duplicateCount: number;
} {
  const canonical = discovered.map(canonicalizeCampaignUrl);
  const ranked = [...new Set(canonical)];
  ranked.sort((left, right) => {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    const leftDepth = leftUrl.pathname.split("/").filter(Boolean).length;
    const rightDepth = rightUrl.pathname.split("/").filter(Boolean).length;
    if (leftDepth !== rightDepth) return leftDepth - rightDepth;
    if (leftUrl.pathname.length !== rightUrl.pathname.length)
      return leftUrl.pathname.length - rightUrl.pathname.length;
    return left.localeCompare(right);
  });
  const catalogUrls = ranked.filter((raw) => allowedPageHost(source, assertPublicHttpUrl(raw)));
  const eligibleUrls = catalogUrls.filter((raw) =>
    matchesPatterns(raw, source.includePatterns ?? [], source.excludePatterns ?? []),
  );
  return {
    batchUrls: eligibleUrls.slice(0, source.maxPages),
    catalogUrls,
    eligibleUrls,
    excludedCount: ranked.length - eligibleUrls.length,
    duplicateCount: canonical.length - ranked.length,
  };
}

export async function discoverWebAcquisitionInventory(
  source: WebAcquisitionCampaignSourceV1,
  fetchImpl: FetchLike = fetch,
): Promise<WebAcquisitionInventoryInternal> {
  const base = new URL(source.baseUrl);
  const robotsUrl = new URL("/robots.txt", base.origin).toString();
  const errors: string[] = [];
  let robotsStatus: number | null = null;
  const sitemapUrls = [...(source.discovery.sitemapUrls ?? [])];

  if (source.discovery.mode === "EXACT_URL_LIST") {
    const selected = selectedUrls(source, source.discovery.exactUrls ?? []);
    if (selected.batchUrls.length === 0)
      throw new Error(`${source.key} exact URL inventory is empty`);
    return {
      sourceKey: source.key,
      baseUrl: source.baseUrl,
      requestedMode: source.discovery.mode,
      modeUsed: "EXACT_URL_LIST",
      robotsUrl,
      robotsStatus,
      sitemapUrls: [],
      discoveredCount: (source.discovery.exactUrls ?? []).length,
      selectedUrls: selected.batchUrls,
      catalogCount: selected.catalogUrls.length,
      eligibleCount: selected.eligibleUrls.length,
      catalogUrls: selected.catalogUrls,
      eligibleUrls: selected.eligibleUrls,
      excludedCount: selected.excludedCount,
      duplicateCount: selected.duplicateCount,
      errors,
      inventorySha256: inventoryHash(selected.catalogUrls),
      eligibleInventorySha256: inventoryHash(selected.eligibleUrls),
    };
  }

  if (source.discovery.mode === "SITEMAP") {
    try {
      const robots = await fetchText(fetchImpl, robotsUrl);
      robotsStatus = robots.status;
      if (robots.status >= 200 && robots.status < 300)
        sitemapUrls.push(...robotsSitemaps(robots.text));
    } catch (error) {
      errors.push(`robots:${error instanceof Error ? error.message : String(error)}`);
    }
    if (sitemapUrls.length === 0) sitemapUrls.push(new URL("/sitemap.xml", base.origin).toString());
  }
  const discovered: string[] = [];
  const visitedSitemaps = new Set<string>();
  const queue: string[] = [];
  for (const rawSitemapUrl of sitemapUrls) {
    try {
      const candidate = canonicalizeCampaignUrl(rawSitemapUrl);
      if (!allowedPageHost(source, new URL(candidate))) {
        errors.push(`sitemap-host-not-allowed:${candidate}`);
        continue;
      }
      if (!queue.includes(candidate)) queue.push(candidate);
    } catch (error) {
      errors.push(`sitemap-url:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const maxSitemaps = source.discovery.maxSitemaps ?? 20;
  while (queue.length > 0 && visitedSitemaps.size < maxSitemaps) {
    const current = queue.shift()!;
    if (visitedSitemaps.has(current)) continue;
    visitedSitemaps.add(current);
    try {
      const response = await fetchText(fetchImpl, current);
      if (response.status < 200 || response.status >= 300) {
        errors.push(`sitemap:${current}:HTTP_${response.status}`);
        continue;
      }
      const locs = xmlLocs(response.text);
      if (/<sitemapindex\b/iu.test(response.text)) {
        for (const loc of locs) {
          try {
            const candidate = canonicalizeCampaignUrl(loc);
            if (!allowedPageHost(source, new URL(candidate))) {
              errors.push(`sitemap-host-not-allowed:${candidate}`);
              continue;
            }
            if (!visitedSitemaps.has(candidate) && !queue.includes(candidate))
              queue.push(candidate);
          } catch (error) {
            errors.push(`sitemap-loc:${error instanceof Error ? error.message : String(error)}`);
          }
        }
      } else {
        discovered.push(...locs);
      }
    } catch (error) {
      errors.push(`sitemap:${current}:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (source.discovery.mode === "LINK_CRAWL" || discovered.length === 0) {
    const selected = selectedUrls(source, [source.baseUrl]);
    return {
      sourceKey: source.key,
      baseUrl: source.baseUrl,
      requestedMode: source.discovery.mode,
      modeUsed: "LINK_CRAWL",
      robotsUrl,
      robotsStatus,
      sitemapUrls: [...visitedSitemaps],
      discoveredCount: discovered.length,
      selectedUrls: selected.batchUrls,
      catalogCount: selected.catalogUrls.length,
      eligibleCount: selected.eligibleUrls.length,
      catalogUrls: selected.catalogUrls,
      eligibleUrls: selected.eligibleUrls,
      excludedCount: selected.excludedCount,
      duplicateCount: selected.duplicateCount,
      errors,
      inventorySha256: inventoryHash(selected.catalogUrls),
      eligibleInventorySha256: inventoryHash(selected.eligibleUrls),
    };
  }
  const selected = selectedUrls(source, discovered);
  if (selected.batchUrls.length === 0) {
    errors.push("sitemap-approved-empty:fallback-link-crawl");
    const fallback = selectedUrls(source, [source.baseUrl]);
    const fallbackCatalogUrls = [...new Set([...selected.catalogUrls, ...fallback.catalogUrls])];
    return {
      sourceKey: source.key,
      baseUrl: source.baseUrl,
      requestedMode: source.discovery.mode,
      modeUsed: "LINK_CRAWL",
      robotsUrl,
      robotsStatus,
      sitemapUrls: [...visitedSitemaps],
      discoveredCount: discovered.length,
      selectedUrls: fallback.batchUrls,
      catalogCount: fallbackCatalogUrls.length,
      eligibleCount: fallback.eligibleUrls.length,
      catalogUrls: fallbackCatalogUrls,
      eligibleUrls: fallback.eligibleUrls,
      excludedCount: selected.excludedCount,
      duplicateCount: selected.duplicateCount,
      errors,
      inventorySha256: inventoryHash(fallbackCatalogUrls),
      eligibleInventorySha256: inventoryHash(fallback.eligibleUrls),
    };
  }
  return {
    sourceKey: source.key,
    baseUrl: source.baseUrl,
    requestedMode: source.discovery.mode,
    modeUsed: "SITEMAP",
    robotsUrl,
    robotsStatus,
    sitemapUrls: [...visitedSitemaps],
    discoveredCount: discovered.length,
    selectedUrls: selected.batchUrls,
    catalogCount: selected.catalogUrls.length,
    eligibleCount: selected.eligibleUrls.length,
    catalogUrls: selected.catalogUrls,
    eligibleUrls: selected.eligibleUrls,
    excludedCount: selected.excludedCount,
    duplicateCount: selected.duplicateCount,
    errors,
    inventorySha256: inventoryHash(selected.catalogUrls),
    eligibleInventorySha256: inventoryHash(selected.eligibleUrls),
  };
}

function publicInventory(inventory: WebAcquisitionInventoryInternal): WebAcquisitionInventoryV1 {
  const { catalogUrls, eligibleUrls, ...publicView } = inventory;
  void catalogUrls;
  void eligibleUrls;
  return publicView;
}

export function selectWebAcquisitionBatch(
  discoveredBatch: readonly string[],
  catalogBatch: readonly string[] | null,
): string[] {
  return catalogBatch === null ? [...discoveredBatch] : [...catalogBatch];
}

function classMetadata(source: WebAcquisitionCampaignSourceV1) {
  return source.sourceClass === "OFFICIAL_AUTHORITY"
    ? { category: "OFFICIAL_AUTHORITY", authorityLevel: "PRIMARY_OFFICIAL", tag: "official" }
    : { category: "LAW_FIRM", authorityLevel: "PROFESSIONAL", tag: "peer-professional" };
}

function sourceSlug(campaignId: string, key: string): string {
  return `campaign-${campaignId}-${key}`;
}

function planName(campaignId: string, key: string): string {
  return `Bulk Web ${campaignId} — ${key}`;
}

function refreshPlanName(campaignId: string, key: string): string {
  return `Bulk Web ${campaignId} Refresh — ${key}`;
}

function jsonPost(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}

function jsonPatch(body: unknown): RequestInit {
  return {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
class CampaignControlPlaneClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly sessionToken: string | null;
  private csrfToken: string | null = null;
  private sessionWorkspaceId: string | null = null;

  constructor(baseUrl: string, fetchImpl: FetchLike = fetch) {
    this.baseUrl = new URL(baseUrl).toString().replace(/\/$/u, "");
    this.fetchImpl = fetchImpl;
    this.sessionToken =
      process.env.MARKORBIT_ADMIN_SESSION_TOKEN?.trim() ||
      process.env.MARKORBIT_CI_ADMIN_SESSION_TOKEN?.trim() ||
      process.env.MARKORBIT_CALIBRATION_SESSION_TOKEN?.trim() ||
      null;
  }

  private async ensureBrowserSession(): Promise<void> {
    if (!this.sessionToken || this.csrfToken) return;
    const response = await this.fetchImpl(`${this.baseUrl}/api/admin-session`, {
      headers: { cookie: `mo_session=${encodeURIComponent(this.sessionToken)}` },
    });
    const body = record(await response.json());
    if (!response.ok || body?.authenticated !== true) {
      throw new Error("Configured Admin session token is not accepted by the control plane");
    }
    this.csrfToken = requiredString(body.csrfToken, "adminSession.csrfToken");
    const workspaces = array(body.workspaces).map(record).filter(Boolean);
    this.sessionWorkspaceId = requiredString(
      workspaces[0]?.workspaceId,
      "adminSession.workspaceId",
    );
  }

  private async headers(method: string, workspaceId?: string): Promise<Record<string, string>> {
    await this.ensureBrowserSession();
    if (!this.sessionToken) return {};
    if (workspaceId && this.sessionWorkspaceId && workspaceId !== this.sessionWorkspaceId) {
      throw new Error(
        `Admin session workspace ${this.sessionWorkspaceId} does not match ${workspaceId}`,
      );
    }
    return {
      cookie: `mo_session=${encodeURIComponent(this.sessionToken)}`,
      ...(workspaceId ? { "x-markorbit-workspace-id": workspaceId } : {}),
      ...(method !== "GET" && this.csrfToken ? { "x-markorbit-csrf-token": this.csrfToken } : {}),
      ...(method !== "GET" ? { origin: new URL(this.baseUrl).origin } : {}),
    };
  }
  async request(
    path: string,
    init: RequestInit = {},
    workspaceId?: string,
    allowedStatuses: readonly number[] = [],
  ): Promise<{ status: number; body: unknown }> {
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    for (const [key, value] of Object.entries(await this.headers(method, workspaceId))) {
      headers.set(key, value);
    }
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok && !allowedStatuses.includes(response.status)) {
      const error = record(record(body)?.error);
      const message =
        typeof error?.message === "string" ? error.message : `HTTP ${response.status}`;
      throw new Error(`${path}: ${message}`);
    }
    return { status: response.status, body };
  }
}

async function ensureCampaignConnector(
  client: CampaignControlPlaneClient,
  workspaceId: string,
): Promise<void> {
  const existing = await client.request(
    `/api/connectors/${CAMPAIGN_CONNECTOR_ID}/${CAMPAIGN_CONNECTOR_VERSION}`,
    {},
    workspaceId,
    [404],
  );
  if (existing.status !== 404) return;
  await client.request(
    "/api/connectors",
    jsonPost({
      connectorId: CAMPAIGN_CONNECTOR_ID,
      displayName: "Crawl4AI Web Connector — Production Pages + Attachments",
      version: CAMPAIGN_CONNECTOR_VERSION,
      sourceTypes: ["WEB"],
      runtime: "PYTHON",
      capabilities: [
        "COLLECT",
        "CHECK_UPDATE",
        "DEEP_CRAWL",
        "RENDER_JAVASCRIPT",
        "FETCH_ATTACHMENTS",
      ],
      supportedJobTypes: ["WEB_CRAWL", "PAGE_UPDATE_CHECK"],
      configurationSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          renderJavascript: { type: "boolean" },
          maxDepth: { type: "integer", minimum: 0, maximum: 5 },
        },
      },
      secretSchema: { type: "object", properties: {} },
      outputArtifactKinds: [
        "HTML",
        "MARKDOWN",
        "PDF",
        "DOCX",
        "XLSX",
        "CSV",
        "JSON",
        "XML",
        "EMAIL",
        "IMAGE",
        "TEXT",
      ],
      healthCheck: { mode: "WORKER_PROBE", timeoutSeconds: 30 },
      status: "ACTIVE",
      extensions: {
        "x-markorbit-production-provider": true,
        "x-markorbit-crawl4ai-version": "0.9.2",
        "x-markorbit-evidence-boundary": "raw-pages-and-authorized-attachments",
      },
    }),
    workspaceId,
  );
}
async function ensureCampaignSource(
  client: CampaignControlPlaneClient,
  manifest: WebAcquisitionCampaignManifestV1,
  source: WebAcquisitionCampaignSourceV1,
  inventory: WebAcquisitionInventoryV1,
  preserveExistingBatch = false,
): Promise<string> {
  const slug = sourceSlug(manifest.campaignId, source.key);
  const metadata = classMetadata(source);
  const entrypoints = inventory.selectedUrls.map((uri, index) => ({
    uri,
    label: `${source.key} ${String(index + 1).padStart(3, "0")}`,
  }));
  const campaignExtensions = {
    "x-markorbit-campaign-id": manifest.campaignId,
    "x-markorbit-campaign-source-key": source.key,
    "x-markorbit-source-class": source.sourceClass,
    "x-markorbit-discovery-mode": inventory.modeUsed,
    "x-markorbit-inventory-sha256": inventory.inventorySha256,
    "x-markorbit-batch-sha256": inventoryHash(inventory.selectedUrls),
    "x-markorbit-source-config-sha256": stableObjectHash({
      renderJavascript: source.renderJavascript === true,
      maxDepth: inventory.modeUsed === "LINK_CRAWL" ? source.maxDepth : 0,
    }),
    "x-markorbit-inventory-count": inventory.catalogCount,
    "x-markorbit-eligible-count": inventory.eligibleCount,
    "x-markorbit-eligible-inventory-sha256": inventory.eligibleInventorySha256,
    "x-markorbit-batch-count": inventory.selectedUrls.length,
    "x-markorbit-discovered-count": inventory.discoveredCount,
    "x-markorbit-excluded-count": inventory.excludedCount,
    "x-markorbit-duplicate-count": inventory.duplicateCount,
    "x-markorbit-inventory-error-count": inventory.errors.length,
  };
  const connectorConfig = {
    renderJavascript: source.renderJavascript === true,
    maxDepth: inventory.modeUsed === "LINK_CRAWL" ? source.maxDepth : 0,
  };
  const tags = [
    metadata.tag,
    "bulk-web",
    manifest.campaignId,
    ...source.jurisdictions.map((value) => value.toLowerCase()),
  ];
  const listed = await client.request(
    `/api/sources?workspaceId=${encodeURIComponent(manifest.workspaceId)}&q=${encodeURIComponent(slug)}&limit=100`,
    {},
    manifest.workspaceId,
  );
  for (const item of array(record(listed.body)?.items)) {
    const candidate = record(item);
    if (candidate?.slug !== slug) continue;
    const extensions = record(candidate.extensions);
    const candidateConnector = record(candidate.connector);
    if (
      candidate.canonicalUri !== source.baseUrl ||
      candidate.category !== metadata.category ||
      candidate.authorityLevel !== metadata.authorityLevel ||
      (candidateConnector !== null && candidateConnector.connectorId !== CAMPAIGN_CONNECTOR_ID) ||
      extensions?.["x-markorbit-campaign-id"] !== manifest.campaignId ||
      extensions?.["x-markorbit-campaign-source-key"] !== source.key ||
      extensions?.["x-markorbit-source-class"] !== source.sourceClass
    ) {
      throw new Error(`Existing Source ${slug} drifted from the governed campaign identity`);
    }
    const sourceId = requiredString(candidate.id, "source.id");
    if (preserveExistingBatch) return sourceId;
    const connectorNeedsUpgrade =
      candidateConnector?.connectorId !== CAMPAIGN_CONNECTOR_ID ||
      candidateConnector?.version !== CAMPAIGN_CONNECTOR_VERSION;
    if (
      connectorNeedsUpgrade ||
      Object.entries(campaignExtensions).some(([key, value]) => extensions?.[key] !== value)
    ) {
      await client.request(
        `/api/sources/${encodeURIComponent(sourceId)}`,
        jsonPatch({
          expectedUpdatedAt: requiredString(candidate.updatedAt, "source.updatedAt"),
          name: source.name,
          jurisdictions: source.jurisdictions,
          languages: source.languages,
          connector: { connectorId: CAMPAIGN_CONNECTOR_ID, version: CAMPAIGN_CONNECTOR_VERSION },
          connectorConfig,
          entrypoints,
          tags,
          extensions: { ...extensions, ...campaignExtensions },
        }),
        manifest.workspaceId,
      );
    }
    return sourceId;
  }

  if (preserveExistingBatch) {
    throw new Error(`No existing Source ${slug} is available for an exhausted URL catalog`);
  }
  const created = await client.request(
    "/api/sources",
    jsonPost({
      workspaceId: manifest.workspaceId,
      name: source.name,
      slug,
      sourceType: "WEB",
      category: metadata.category,
      authorityLevel: metadata.authorityLevel,
      status: "ACTIVE",
      jurisdictions: source.jurisdictions,
      languages: source.languages,
      connector: { connectorId: CAMPAIGN_CONNECTOR_ID, version: CAMPAIGN_CONNECTOR_VERSION },
      connectorConfig,
      canonicalUri: source.baseUrl,
      entrypoints,
      tags,
      extensions: campaignExtensions,
    }),
    manifest.workspaceId,
  );
  const createdSource = record(record(created.body)?.source);
  return requiredString(createdSource?.id, "source.id");
}
async function ensureCampaignPlan(
  client: CampaignControlPlaneClient,
  manifest: WebAcquisitionCampaignManifestV1,
  source: WebAcquisitionCampaignSourceV1,
  inventory: WebAcquisitionInventoryV1,
  sourceId: string,
  preserveExistingBatch = false,
): Promise<string> {
  const name = planName(manifest.campaignId, source.key);
  const includePatterns =
    source.includePatterns && source.includePatterns.length > 0
      ? source.includePatterns
      : [`${source.baseUrl.replace(/\/$/u, "")}*`];
  const maxDepth = inventory.modeUsed === "LINK_CRAWL" ? source.maxDepth : 0;
  const maxItems =
    inventory.modeUsed === "LINK_CRAWL" ? source.maxPages : inventory.selectedUrls.length;
  const policy = {
    includePatterns,
    excludePatterns: source.excludePatterns ?? [],
    maxDepth,
    maxItems,
    renderJavascript: source.renderJavascript === true,
    fetchAttachments: false,
    respectRobots: true,
    rateLimitPerMinute: source.rateLimitPerMinute,
    timeoutSeconds: 60,
    retry: { maxAttempts: 2, backoffSeconds: 10 },
    locale: source.languages[0],
  };
  const output = { artifactKinds: ["MARKDOWN"] };
  const planPolicySha256 = stableObjectHash(policy);
  const planOutputSha256 = stableObjectHash(output);
  const extensions = {
    "x-markorbit-campaign-id": manifest.campaignId,
    "x-markorbit-campaign-source-key": source.key,
    "x-markorbit-plan-role": "INITIAL_COLLECTION",
    "x-markorbit-inventory-sha256": inventory.inventorySha256,
    "x-markorbit-plan-policy-sha256": planPolicySha256,
    "x-markorbit-plan-output-sha256": planOutputSha256,
    "x-markorbit-discovery-mode": inventory.modeUsed,
  };
  const listed = await client.request(
    `/api/plans?sourceId=${encodeURIComponent(sourceId)}&limit=100`,
    {},
    manifest.workspaceId,
  );
  for (const item of array(record(listed.body)?.items)) {
    const plan = record(record(item)?.plan);
    if (plan?.name !== name) continue;
    const currentExtensions = record(plan.extensions);
    const planId = requiredString(plan.id, "plan.id");
    if (preserveExistingBatch) return planId;
    if (Object.entries(extensions).some(([key, value]) => currentExtensions?.[key] !== value)) {
      await client.request(
        `/api/plans/${encodeURIComponent(planId)}`,
        jsonPatch({
          expectedUpdatedAt: requiredString(plan.updatedAt, "plan.updatedAt"),
          schedule: { mode: "MANUAL" },
          priority: source.sourceClass === "OFFICIAL_AUTHORITY" ? "HIGH" : "NORMAL",
          policy,
          output,
          extensions: { ...currentExtensions, ...extensions },
        }),
        manifest.workspaceId,
      );
    }
    return planId;
  }

  if (preserveExistingBatch) {
    throw new Error(`No existing initial plan ${name} is available for an exhausted URL catalog`);
  }
  const created = await client.request(
    "/api/plans",
    jsonPost({
      sourceId,
      name,
      status: "ACTIVE",
      schedule: { mode: "MANUAL" },
      priority: source.sourceClass === "OFFICIAL_AUTHORITY" ? "HIGH" : "NORMAL",
      policy,
      output,
      extensions,
    }),
    manifest.workspaceId,
  );
  const createdRecord = record(record(created.body)?.plan);
  return requiredString(record(createdRecord?.plan)?.id, "plan.id");
}

async function ensureCampaignRefreshPlan(
  client: CampaignControlPlaneClient,
  manifest: WebAcquisitionCampaignManifestV1,
  source: WebAcquisitionCampaignSourceV1,
  inventory: WebAcquisitionInventoryV1,
  sourceId: string,
  preserveExistingBatch = false,
): Promise<string> {
  const name = refreshPlanName(manifest.campaignId, source.key);
  const refreshIntervalSeconds =
    source.refreshIntervalSeconds ?? DEFAULT_REFRESH_INTERVAL_SECONDS[source.sourceClass];
  const includePatterns =
    source.includePatterns && source.includePatterns.length > 0
      ? source.includePatterns
      : [`${source.baseUrl.replace(/\/$/u, "")}*`];
  const linkCrawlRefresh = inventory.modeUsed === "LINK_CRAWL";
  const policy = {
    includePatterns,
    excludePatterns: source.excludePatterns ?? [],
    maxDepth: linkCrawlRefresh ? source.maxDepth : 0,
    maxItems: linkCrawlRefresh ? source.maxPages : inventory.selectedUrls.length,
    renderJavascript: source.renderJavascript === true,
    fetchAttachments: false,
    respectRobots: true,
    rateLimitPerMinute: source.rateLimitPerMinute,
    timeoutSeconds: 60,
    retry: { maxAttempts: 2, backoffSeconds: 10 },
    locale: source.languages[0],
  };
  const output = { artifactKinds: ["MARKDOWN"] };
  const planPolicySha256 = stableObjectHash(policy);
  const planOutputSha256 = stableObjectHash(output);
  const extensions = {
    "x-markorbit-campaign-id": manifest.campaignId,
    "x-markorbit-campaign-source-key": source.key,
    "x-markorbit-plan-role": "REFRESH_WATCH",
    "x-markorbit-inventory-sha256": inventory.inventorySha256,
    "x-markorbit-plan-policy-sha256": planPolicySha256,
    "x-markorbit-plan-output-sha256": planOutputSha256,
    "x-markorbit-refresh-interval-seconds": refreshIntervalSeconds,
    "x-markorbit-adaptive-refresh-cadence": source.adaptiveRefreshCadence === true,
  };
  const listed = await client.request(
    `/api/plans?sourceId=${encodeURIComponent(sourceId)}&limit=100`,
    {},
    manifest.workspaceId,
  );
  for (const item of array(record(listed.body)?.items)) {
    const plan = record(record(item)?.plan);
    if (plan?.name !== name) continue;
    const currentExtensions = record(plan.extensions);
    const planId = requiredString(plan.id, "refreshPlan.id");
    if (preserveExistingBatch) return planId;
    const currentSchedule = record(plan.schedule);
    const adaptiveWasEnabled = currentExtensions?.["x-markorbit-adaptive-refresh-cadence"] === true;
    const baselineChanged =
      currentExtensions?.["x-markorbit-refresh-interval-seconds"] !== refreshIntervalSeconds;
    const preserveAdaptiveSchedule =
      source.adaptiveRefreshCadence === true &&
      adaptiveWasEnabled &&
      !baselineChanged &&
      currentSchedule?.mode === "CHANGE_WATCH" &&
      Number.isInteger(currentSchedule.pollIntervalSeconds);
    const effectiveRefreshIntervalSeconds = preserveAdaptiveSchedule
      ? Number(currentSchedule.pollIntervalSeconds)
      : refreshIntervalSeconds;
    const scheduleChanged =
      currentSchedule?.mode !== "CHANGE_WATCH" ||
      currentSchedule?.pollIntervalSeconds !== effectiveRefreshIntervalSeconds;
    if (
      scheduleChanged ||
      Object.entries(extensions).some(([key, value]) => currentExtensions?.[key] !== value)
    ) {
      await client.request(
        `/api/plans/${encodeURIComponent(planId)}`,
        jsonPatch({
          expectedUpdatedAt: requiredString(plan.updatedAt, "refreshPlan.updatedAt"),
          schedule: {
            mode: "CHANGE_WATCH",
            pollIntervalSeconds: effectiveRefreshIntervalSeconds,
          },
          priority: source.sourceClass === "OFFICIAL_AUTHORITY" ? "HIGH" : "NORMAL",
          policy,
          output,
          extensions: { ...currentExtensions, ...extensions },
        }),
        manifest.workspaceId,
      );
    }
    return planId;
  }

  if (preserveExistingBatch) {
    throw new Error(`No existing refresh plan ${name} is available for an exhausted URL catalog`);
  }
  const created = await client.request(
    "/api/plans",
    jsonPost({
      sourceId,
      name,
      status: "ACTIVE",
      schedule: { mode: "CHANGE_WATCH", pollIntervalSeconds: refreshIntervalSeconds },
      priority: source.sourceClass === "OFFICIAL_AUTHORITY" ? "HIGH" : "NORMAL",
      policy,
      output,
      extensions,
    }),
    manifest.workspaceId,
  );
  const createdRecord = record(record(created.body)?.plan);
  return requiredString(record(createdRecord?.plan)?.id, "refreshPlan.id");
}

const MARKDOWN_CONVERTER = { converterId: "builtin-markdown-staging", version: "1.0.0" } as const;

async function ensureMarkdownConverter(
  client: CampaignControlPlaneClient,
  workspaceId: string,
): Promise<void> {
  const listed = await client.request(
    `/api/converters?q=${encodeURIComponent(MARKDOWN_CONVERTER.converterId)}&limit=100`,
    {},
    workspaceId,
  );
  const exists = array(record(listed.body)?.items).some((item) => {
    const manifest = record(record(item)?.manifest);
    return (
      manifest?.converterId === MARKDOWN_CONVERTER.converterId &&
      manifest?.version === MARKDOWN_CONVERTER.version
    );
  });
  if (exists) return;
  await client.request(
    "/api/converters",
    jsonPost({
      converterId: MARKDOWN_CONVERTER.converterId,
      displayName: "Built-in Markdown Staging — Production",
      version: MARKDOWN_CONVERTER.version,
      runtime: "BUILT_IN",
      capabilities: ["CONVERT", "PRESERVE_LINKS"],
      inputs: { artifactKinds: ["MARKDOWN"], mimePatterns: ["text/markdown"] },
      outputFormat: "MARKDOWN",
      deterministic: true,
      configurationSchema: {},
      resourceHints: { maxInputBytes: 4_500_000, timeoutSeconds: 60 },
      status: "ACTIVE",
    }),
    workspaceId,
  );
}

async function ensureCampaignConversionProfile(
  client: CampaignControlPlaneClient,
  manifest: WebAcquisitionCampaignManifestV1,
  source: WebAcquisitionCampaignSourceV1,
  sourceId: string,
): Promise<string> {
  const name = `Bulk Web ${manifest.campaignId} Markdown Auto — ${source.key}`;
  const listed = await client.request(
    `/api/conversion-profiles?workspaceId=${encodeURIComponent(manifest.workspaceId)}&sourceId=${encodeURIComponent(sourceId)}&converterId=${encodeURIComponent(MARKDOWN_CONVERTER.converterId)}&status=ACTIVE&limit=100`,
    {},
    manifest.workspaceId,
  );
  for (const item of array(record(listed.body)?.items)) {
    const profile = record(item);
    if (profile?.name === name && profile.autoConvert === true) {
      return requiredString(profile.id, "conversionProfile.id");
    }
  }
  const created = await client.request(
    "/api/conversion-profiles",
    jsonPost({
      workspaceId: manifest.workspaceId,
      sourceId,
      name,
      status: "ACTIVE",
      converter: MARKDOWN_CONVERTER,
      input: { artifactKinds: ["MARKDOWN"], mimePatterns: ["text/markdown"] },
      outputFormat: "MARKDOWN",
      targetPathTemplate: `sources/web/${manifest.campaignId}/${source.key}/{artifactId}.md`,
      configuration: {},
      precedence: source.sourceClass === "OFFICIAL_AUTHORITY" ? 120 : 80,
      autoConvert: true,
    }),
    manifest.workspaceId,
  );
  return requiredString(
    record(created.body)?.profile &&
      record(created.body)!.profile &&
      record(record(created.body)!.profile)?.id,
    "conversionProfile.id",
  );
}
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeBase32(value: bigint, length: number): string {
  let output = "";
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    output = CROCKFORD[Number(remaining & 31n)] + output;
    remaining >>= 5n;
  }
  return output;
}

function capabilityId(): string {
  const timestamp = encodeBase32(BigInt(Date.now()), 10);
  const randomValue = BigInt(
    `0x${createHash("sha256").update(`${Date.now()}:${Math.random()}`).digest("hex").slice(0, 20)}`,
  );
  return `cwc_${timestamp}${encodeBase32(randomValue, 16)}`;
}

async function ensureCampaignWorker(
  client: CampaignControlPlaneClient,
  manifest: WebAcquisitionCampaignManifestV1,
  createIfMissing: boolean,
): Promise<{ workerId: string; credential: string | null } | null> {
  const label = `bulk-web-${manifest.campaignId}`;
  const listed = await client.request(
    `/api/workers?label=${encodeURIComponent(label)}&limit=100`,
    {},
    manifest.workspaceId,
  );
  for (const item of array(record(listed.body)?.items)) {
    const worker = record(record(item)?.worker);
    if (!worker) continue;
    if (createIfMissing && Number(worker.maxConcurrency) < manifest.globalConcurrency) {
      throw new Error(
        `Existing campaign Worker concurrency is below ${manifest.globalConcurrency}`,
      );
    }
    const desiredBinding = {
      connectorId: CAMPAIGN_CONNECTOR_ID,
      version: CAMPAIGN_CONNECTOR_VERSION,
      capabilities: [
        "COLLECT",
        "CHECK_UPDATE",
        "DEEP_CRAWL",
        "RENDER_JAVASCRIPT",
        "FETCH_ATTACHMENTS",
      ],
    };
    const currentJobTypes = array(worker.supportedJobTypes);
    const currentBindings = array(worker.connectorBindings);
    const currentCampaignBinding = currentBindings
      .map((binding) => record(binding))
      .find((binding) => binding?.connectorId === CAMPAIGN_CONNECTOR_ID);
    const bindingCapabilities = array(currentCampaignBinding?.capabilities);
    const needsRefreshUpgrade =
      !currentJobTypes.includes("PAGE_UPDATE_CHECK") ||
      currentCampaignBinding?.version !== CAMPAIGN_CONNECTOR_VERSION ||
      !bindingCapabilities.includes("CHECK_UPDATE");
    if (needsRefreshUpgrade) {
      const otherBindings = currentBindings.filter(
        (binding) => record(binding)?.connectorId !== CAMPAIGN_CONNECTOR_ID,
      );
      await client.request(
        `/api/workers/${encodeURIComponent(requiredString(worker.id, "worker.id"))}`,
        jsonPatch({
          expectedUpdatedAt: requiredString(worker.updatedAt, "worker.updatedAt"),
          supportedJobTypes: [...new Set([...currentJobTypes, "WEB_CRAWL", "PAGE_UPDATE_CHECK"])],
          connectorBindings: [...otherBindings, desiredBinding],
        }),
        manifest.workspaceId,
      );
    }
    return { workerId: requiredString(worker.id, "worker.id"), credential: null };
  }
  if (!createIfMissing) return null;
  const created = await client.request(
    "/api/workers",
    jsonPost({
      displayName: `Bulk Web Acquisition — ${manifest.name}`,
      desiredState: "ACTIVE",
      runtime: { runtimeId: "crawl4ai-worker", version: "1.0.0" },
      supportedJobTypes: ["WEB_CRAWL", "PAGE_UPDATE_CHECK"],
      connectorBindings: [
        {
          connectorId: CAMPAIGN_CONNECTOR_ID,
          version: CAMPAIGN_CONNECTOR_VERSION,
          capabilities: [
            "COLLECT",
            "CHECK_UPDATE",
            "DEEP_CRAWL",
            "RENDER_JAVASCRIPT",
            "FETCH_ATTACHMENTS",
          ],
        },
      ],
      maxConcurrency: manifest.globalConcurrency,
      labels: ["production", "crawl4ai", "bulk-web", label],
      extensions: { "x-markorbit-campaign-id": manifest.campaignId },
    }),
    manifest.workspaceId,
  );
  const view = record(record(created.body)?.view);
  const worker = record(view?.worker);
  return {
    workerId: requiredString(worker?.id, "worker.id"),
    credential: requiredString(record(created.body)?.credential, "worker.credential"),
  };
}
async function ensureCampaignConversionCapability(
  client: CampaignControlPlaneClient,
  manifest: WebAcquisitionCampaignManifestV1,
  workerId: string,
): Promise<number> {
  const listed = await client.request(
    `/api/conversion-runtime/capabilities?workerId=${encodeURIComponent(workerId)}&workspaceId=${encodeURIComponent(manifest.workspaceId)}&active=true&limit=100`,
    {},
    manifest.workspaceId,
  );
  for (const item of array(record(listed.body)?.items)) {
    const capability = record(record(item)?.capability);
    const supported = array(capability?.supportedConverters).some((raw) => {
      const converter = record(raw);
      return (
        converter?.converterId === MARKDOWN_CONVERTER.converterId &&
        array(converter.versions).includes(MARKDOWN_CONVERTER.version)
      );
    });
    if (supported && Number.isInteger(capability?.capabilityRevision)) {
      return Number(capability!.capabilityRevision);
    }
  }
  const revision = 1;
  await client.request(
    "/api/conversion-runtime/capabilities",
    jsonPost({
      contractVersion: "1.0",
      objectType: "CONVERSION_WORKER_CAPABILITY",
      id: capabilityId(),
      workerId,
      capabilityRevision: revision,
      supportedConverters: [
        { converterId: MARKDOWN_CONVERTER.converterId, versions: [MARKDOWN_CONVERTER.version] },
      ],
      acceptedArtifactKinds: ["MARKDOWN"],
      acceptedMimePatterns: ["text/markdown"],
      supportedOutputFormats: ["MARKDOWN"],
      runtime: { runtimeId: "markorbit-production-markdown-staging", version: "1.0.0" },
      createdAt: new Date().toISOString(),
    }),
    manifest.workspaceId,
  );
  return revision;
}

async function dispatchCampaignPlan(
  client: CampaignControlPlaneClient,
  manifest: WebAcquisitionCampaignManifestV1,
  sourceKey: string,
  planId: string,
  runKey: string,
  batchSha256: string,
): Promise<string> {
  const response = await client.request(
    "/api/runs",
    jsonPost(
      { planId },
      {
        "Idempotency-Key": `bulk-web:${manifest.campaignId}:${sourceKey}:${runKey}:${batchSha256.slice(0, 16)}`,
      },
    ),
    manifest.workspaceId,
  );
  const recordBody = record(record(response.body)?.record);
  return requiredString(record(recordBody?.run)?.id, "run.id");
}
async function mapWithLimit<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

export type RunWebAcquisitionCampaignOptions = {
  controlPlaneUrl: string;
  dispatch?: boolean;
  runKey?: string;
  fetchImpl?: FetchLike;
};

export async function runWebAcquisitionCampaign(
  manifest: WebAcquisitionCampaignManifestV1,
  options: RunWebAcquisitionCampaignOptions,
): Promise<WebAcquisitionCampaignResultV1> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const client = new CampaignControlPlaneClient(options.controlPlaneUrl, fetchImpl);
  await ensureCampaignConnector(client, manifest.workspaceId);
  await ensureMarkdownConverter(client, manifest.workspaceId);

  const catalogDatabasePath = process.env.MARKORBIT_KNOWLEDGE_DB_PATH?.trim();
  const catalogDatabase = catalogDatabasePath
    ? new DatabaseSync(catalogDatabasePath, { timeout: 5000 })
    : null;
  if (catalogDatabase) {
    catalogDatabase.exec("PRAGMA foreign_keys = ON;");
    catalogDatabase.exec("PRAGMA journal_mode = WAL;");
  }
  const urlCatalog = catalogDatabase ? new SqliteWebUrlCatalogRepository(catalogDatabase) : null;

  const inventories = await mapWithLimit(manifest.sources, manifest.globalConcurrency, (source) =>
    discoverWebAcquisitionInventory(source, fetchImpl),
  );
  const prepared = await mapWithLimit(
    manifest.sources,
    manifest.globalConcurrency,
    async (source, index): Promise<WebAcquisitionCampaignResultV1["sources"][number]> => {
      const discoveredInventory = inventories[index]!;
      if (urlCatalog) {
        urlCatalog.upsertDiscovered({
          workspaceId: manifest.workspaceId,
          campaignId: manifest.campaignId,
          sourceKey: source.key,
          discoveryMode: discoveredInventory.modeUsed,
          urls: discoveredInventory.catalogUrls,
          eligibleUrls: discoveredInventory.eligibleUrls,
        });
        urlCatalog.reconcile({
          workspaceId: manifest.workspaceId,
          campaignId: manifest.campaignId,
          sourceKey: source.key,
        });
      }
      const nextBatch = urlCatalog
        ? urlCatalog.nextBatch({
            workspaceId: manifest.workspaceId,
            campaignId: manifest.campaignId,
            sourceKey: source.key,
            limit: source.maxPages,
          })
        : discoveredInventory.selectedUrls;
      const inventory: WebAcquisitionInventoryInternal = {
        ...discoveredInventory,
        selectedUrls: urlCatalog ? nextBatch : discoveredInventory.selectedUrls,
      };
      const preserveExistingBatch = Boolean(urlCatalog && inventory.selectedUrls.length === 0);
      const sourceId = await ensureCampaignSource(
        client,
        manifest,
        source,
        inventory,
        preserveExistingBatch,
      );
      urlCatalog?.bindSource({
        workspaceId: manifest.workspaceId,
        campaignId: manifest.campaignId,
        sourceKey: source.key,
        sourceId,
      });
      const planId = await ensureCampaignPlan(
        client,
        manifest,
        source,
        inventory,
        sourceId,
        preserveExistingBatch,
      );
      const refreshPlanId = await ensureCampaignRefreshPlan(
        client,
        manifest,
        source,
        inventory,
        sourceId,
        preserveExistingBatch,
      );
      const conversionProfileId = await ensureCampaignConversionProfile(
        client,
        manifest,
        source,
        sourceId,
      );
      return {
        sourceKey: source.key,
        sourceId,
        planId,
        refreshPlanId,
        runId: null,
        conversionProfileId,
        inventory: publicInventory(inventory),
      };
    },
  );

  const dispatchable = prepared.filter((item) => item.inventory.selectedUrls.length > 0);
  const shouldDispatch = options.dispatch === true && dispatchable.length > 0;
  const preparedWorker = await ensureCampaignWorker(client, manifest, shouldDispatch);
  const worker = shouldDispatch ? preparedWorker : null;
  if (shouldDispatch) {
    if (!worker) throw new Error("Campaign Worker provisioning did not return a Worker");
    await ensureCampaignConversionCapability(client, manifest, worker.workerId);
    const runKey = options.runKey?.trim() || new Date().toISOString().slice(0, 10);
    await mapWithLimit(dispatchable, manifest.globalConcurrency, async (item) => {
      item.runId = await dispatchCampaignPlan(
        client,
        manifest,
        item.sourceKey,
        item.planId,
        runKey,
        inventoryHash(item.inventory.selectedUrls),
      );
      if (urlCatalog) {
        urlCatalog.markQueued({
          workspaceId: manifest.workspaceId,
          campaignId: manifest.campaignId,
          sourceKey: item.sourceKey,
          runId: item.runId,
          urls: item.inventory.selectedUrls,
        });
      }
      return item.runId;
    });
  }

  catalogDatabase?.close();

  return {
    campaignId: manifest.campaignId,
    workspaceId: manifest.workspaceId,
    workerId: worker?.workerId ?? null,
    workerCredential: worker?.credential ?? null,
    recommendedWorkerProcesses: shouldDispatch ? manifest.globalConcurrency : 0,
    sources: prepared,
  };
}
