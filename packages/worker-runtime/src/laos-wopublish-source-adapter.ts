import { createHash } from "node:crypto";
import {
  defaultApiResolver,
  defaultApiTransport,
  type ApiResolver,
  type ApiTransport,
} from "./api-acquirer";
import { CollectionAcquisitionError } from "./artifact-backed-collection-executor";
import { isPublicNetworkAddress } from "./public-network-policy";
import type {
  SourceAdapter,
  SourceAdapterRequest,
  SourceAdapterResponse,
} from "./source-adapter-port";
import type { SourceAdapterRegistry } from "./source-adapter-registry";

export const LAOS_SOURCE_ID = "LA_DIPO_WOPUBLISH_TRADEMARKS";
export const LAOS_CONNECTOR_ID = "laos-wopublish-trademarks";
export const LAOS_CONNECTOR_VERSION = "1.0.0";
export const LAOS_ORIGIN = "https://online.dip.gov.la";
export const LAOS_LIST_URL = LAOS_ORIGIN + "/wopublish-search/public/trademarks?0";
export const LAOS_SOURCE_METADATA = {
  sourceId: LAOS_SOURCE_ID,
  name: "Lao DIP WoPublish public trademarks",
  country: "LA",
  providerKind: "TRADEMARK_OFFICE" as const,
  version: LAOS_CONNECTOR_VERSION,
  capabilities: ["WICKET_BOUNDED_PILOT", "SINGLE_DETAIL", "LOGO_EVIDENCE"],
};
const idPattern = /^LA\d{3,10}$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
export const laosSha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
const failure = (code: string, message: string, retryable = false) =>
  new CollectionAcquisitionError(code, message, retryable);
const text = (input: string) =>
  input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/[\u200b-\u200f\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function redactLaosResponse(body: Uint8Array): Uint8Array {
  return encoder.encode(
    decoder
      .decode(body)
      .replace(/;jsessionid=[^?"'<>\s&;]+/gi, ";jsessionid=[REDACTED]")
      .replace(/([?&](?:JSESSIONID|psusr|csrf|token)=)[^"'<>\s&]+/gi, "$1[REDACTED]"),
  );
}
export type LaosHttpRequest = {
  url: string;
  headers: Readonly<Record<string, string>>;
  maxBytes: number;
};
export type LaosHttpResponse = {
  status: number;
  body: Uint8Array;
  contentType: string;
  observedAt: string;
  headers?: Readonly<Record<string, string | string[] | undefined>>;
};
export interface LaosHttpTransport {
  get(request: LaosHttpRequest): Promise<LaosHttpResponse>;
  close?(): Promise<void>;
}

/** Uses the existing pinned HTTPS transport. Cookie values never leave this ephemeral instance. */
export class LaosHttpSession implements LaosHttpTransport {
  private readonly cookies = new Map<string, string>();
  constructor(
    private readonly resolve: ApiResolver = defaultApiResolver,
    private readonly transport: ApiTransport = defaultApiTransport,
  ) {}
  async get(input: LaosHttpRequest): Promise<LaosHttpResponse> {
    const url = new URL(input.url);
    if (
      url.origin !== LAOS_ORIGIN ||
      url.username ||
      url.password ||
      url.hash ||
      !/^\/wopublish-search\/(?:public\/(?:trademarks|detail\/trademarks)|service\/trademarks\/application\/LA\d{3,10}\/logo)(?:;jsessionid=[A-Za-z0-9]+)?$/.test(
        url.pathname,
      )
    ) {
      throw failure("LA_NETWORK_TARGET_REJECTED", "Request is outside official WoPublish routes");
    }
    const addresses = await this.resolve(url.hostname);
    if (!addresses.length || addresses.some((a) => !isPublicNetworkAddress(a.address, a.family))) {
      throw failure(
        "LA_NETWORK_TARGET_REJECTED",
        "Official source hostname is not exclusively public",
      );
    }
    const cookie = [...this.cookies].map(([k, v]) => k + "=" + v).join("; ");
    const response = await this.transport({
      hostname: url.hostname,
      resolvedAddress: addresses[0]!.address,
      family: addresses[0]!.family,
      port: 443,
      servername: url.hostname,
      hostHeader: url.hostname,
      path: url.pathname + url.search,
      timeoutMs: 25_000,
      maxResponseBytes: input.maxBytes,
      headers: { ...input.headers, ...(cookie ? { cookie } : {}) },
    });
    const setCookies = response.headers["set-cookie"];
    for (const item of Array.isArray(setCookies) ? setCookies : setCookies ? [setCookies] : []) {
      const match = /^(JSESSIONID|psusr)=([^;\r\n]+)/i.exec(item);
      if (match) this.cookies.set(match[1]!, match[2]!);
    }
    const mime = response.headers["content-type"];
    return {
      status: response.statusCode,
      body: response.body,
      contentType: (Array.isArray(mime) ? mime[0] : mime) ?? "application/octet-stream",
      observedAt: new Date().toISOString(),
      headers: response.headers,
    };
  }
}
export type LaosPage = {
  kind: "PAGE";
  page: 1 | 2;
  ids: string[];
  total: number;
  firstPageIdsSha256: string;
  rawSha256: string;
  redactedBody: Uint8Array;
  mime: string;
  observedAt: string;
  sourceUri: string;
};
export type LaosDetail = {
  kind: "DETAIL";
  id: string;
  markText: string;
  status: string;
  filingDate: string;
  applicant: string;
  niceClasses: number[];
  registrationNumber: string | null;
  logoUrl: string | null;
  logoBytes?: Uint8Array;
  logoMime?: string;
  rawSha256: string;
  redactedBody: Uint8Array;
  mime: string;
  observedAt: string;
  sourceUri: string;
};
export type LaosObservation = LaosPage | LaosDetail;

export function parseLaosList(body: Uint8Array): {
  ids: string[];
  total?: number;
  nextUrl?: string;
  baseUrl?: string;
} {
  const html = decoder.decode(body);
  if (
    /<(?:iframe|div)\b[^>]*(?:hcaptcha|g-recaptcha)|captcha\s*(?:required|challenge)/i.test(html)
  ) {
    throw failure("LA_ACCESS_CHALLENGE", "WoPublish presented an access challenge");
  }
  const ids: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)) {
    const href = (match[1] ?? match[2] ?? "").replace(/&amp;/gi, "&");
    let url: URL;
    try {
      url = new URL(href, LAOS_LIST_URL);
    } catch {
      continue;
    }
    const id = url.searchParams.get("id");
    if (
      url.origin === LAOS_ORIGIN &&
      /^\/wopublish-search\/public\/detail\/trademarks(?:;jsessionid=[A-Za-z0-9]+)?$/.test(
        url.pathname,
      ) &&
      url.searchParams.size === 1 &&
      id &&
      idPattern.test(id) &&
      !ids.includes(id)
    )
      ids.push(id);
  }
  if (ids.length > 50)
    throw failure("LA_PAGE_SIZE_DRIFT", "Page exceeds the 50-record pilot bound");
  const label =
    /class=["'][^"']*\bnavigatorLabel\b[^"']*["'][^>]*>[\s\S]*?<div[^>]*>([^<]*)<\/div>/i.exec(
      html,
    );
  const number = label?.[1]
    ?.match(/\d[\d,]*/g)
    ?.at(-1)
    ?.replaceAll(",", "");
  const total = number === undefined ? undefined : Number(number);
  if (total !== undefined && (!Number.isSafeInteger(total) || total < ids.length)) {
    throw failure("LA_TOTAL_DRIFT", "Source record count is inconsistent");
  }
  let nextUrl: string | undefined;
  for (const match of html.matchAll(/Wicket\.Ajax\.ajax\((\{[^)]{1,1500}\})\)/g)) {
    let item: Record<string, unknown>;
    try {
      item = JSON.parse(match[1] ?? "") as Record<string, unknown>;
    } catch {
      continue;
    }
    if (
      typeof item.u === "string" &&
      item.u.includes("dataTable") &&
      item.u.includes("navigator-next") &&
      (item.m === undefined || item.m === "GET")
    ) {
      nextUrl = item.u.replace(/&amp;/gi, "&");
      break;
    }
  }
  const baseUrl = /Wicket\.Ajax\.baseUrl\s*=\s*"([^"]{1,250})"/.exec(html)?.[1];
  return {
    ids,
    ...(total === undefined ? {} : { total }),
    ...(nextUrl ? { nextUrl } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  };
}
function divValue(html: string, start: number): string {
  const tag = /<\/?div\b[^>]*>/gi;
  tag.lastIndex = start;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(html)) !== null) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return text(html.slice(start, match.index));
  }
  throw failure("LA_DETAIL_SCHEMA_DRIFT", "Incomplete source detail markup");
}
export function parseLaosDetail(
  body: Uint8Array,
  id: string,
): Omit<
  LaosDetail,
  | "kind"
  | "rawSha256"
  | "redactedBody"
  | "mime"
  | "observedAt"
  | "sourceUri"
  | "logoBytes"
  | "logoMime"
> {
  const html = decoder.decode(body);
  const header = /class=["'][^"']*\bapplication-number\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(
    html,
  );
  const actualId = text(header?.[1] ?? "")
    .replace(/\s+/g, "")
    .match(/LA\d{3,10}/)?.[0];
  if (actualId !== id)
    throw failure("LA_DETAIL_ID_MISMATCH", "Detail does not match source record ID");
  const values = new Map<string, string>();
  const field =
    /<div\b[^>]*class=["'][^"']*\bproduct-form-label\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*class=["'][^"']*\bproduct-form-details\b[^"']*["'][^>]*>/gi;
  for (const match of html.matchAll(field)) {
    const key = text(match[1] ?? "").replace(/[\s:：]/g, "");
    values.set(key, divValue(html, match.index + match[0].length));
  }
  const find = (label: string) => [...values].find(([key]) => key.includes(label))?.[1] ?? "";
  const status = find("ສະຖານະ");
  const filingDate = find("ມື້ຍື່ນຄຳຮ້ອງ").match(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/)?.[0] ?? "";
  const applicant = find("ຜູ້ຍື່ນຄຳຮ້ອງ");
  const classes = find("ການຈັດໝວດNice").match(/^\d{1,2}(?:\s*[,;/]\s*\d{1,2})*/)?.[0] ?? "";
  const niceClasses = [...new Set((classes.match(/\d{1,2}/g) ?? []).map(Number))];
  if (!status || !filingDate || !applicant || !niceClasses.length) {
    throw failure("LA_DETAIL_SCHEMA_DRIFT", "Required source detail fields are absent");
  }
  const imageTag = (html.match(/<img\b[^>]*>/gi) ?? []).find((tag) => /\bdetail-img\b/.test(tag));
  const source = imageTag && /\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')/i.exec(imageTag);
  let logoUrl: string | null = null;
  if (source) {
    const url = new URL((source[1] ?? source[2] ?? "").replace(/&amp;/gi, "&"), LAOS_ORIGIN);
    if (
      url.origin !== LAOS_ORIGIN ||
      url.pathname !== "/wopublish-search/service/trademarks/application/" + id + "/logo" ||
      [...url.searchParams.keys()].some((key) => key !== "noLogo")
    ) {
      throw failure("LA_LOGO_URL_INVALID", "Source logo URL is outside official record");
    }
    logoUrl = url.toString();
  }
  return {
    id,
    markText: find("ເຄື່ອງໝາຍ"),
    status,
    filingDate,
    applicant,
    niceClasses,
    registrationNumber: find("ເລກທີການຈົດທະບຽນ") || null,
    logoUrl,
  };
}
export type LaosAdapterOptions = {
  transportFactory?: () => LaosHttpTransport;
  sleep?: (milliseconds: number) => Promise<void>;
  intervalMs?: number;
};
export class LaosWopublishSourceAdapter implements SourceAdapter<LaosObservation> {
  readonly sourceId = LAOS_SOURCE_ID;
  private readonly factory: () => LaosHttpTransport;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly interval: number;
  constructor(options: LaosAdapterOptions = {}) {
    this.factory = options.transportFactory ?? (() => new LaosHttpSession());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.interval = options.intervalMs ?? 1_250;
    if (!Number.isSafeInteger(this.interval) || this.interval < 0 || this.interval > 60_000) {
      throw failure("LA_RATE_INVALID", "Invalid WoPublish request interval");
    }
  }
  async fetch(input: SourceAdapterRequest): Promise<SourceAdapterResponse<LaosObservation>> {
    if (input.sourceId !== this.sourceId) throw failure("LA_SOURCE_MISMATCH", "Unknown source");
    const params = input.params ?? {};
    if (params.mode === "PAGE") {
      if (
        Object.keys(params).some(
          (key) => !["mode", "expectedFirstPageIdsSha256", "expectedSourceTotal"].includes(key),
        )
      ) {
        throw failure("LA_CONFIG_INVALID", "Unsupported bounded pilot parameter");
      }
      const page =
        input.cursor === undefined || input.cursor === "1" ? 1 : input.cursor === "2" ? 2 : null;
      if (!page) throw failure("LA_PILOT_BOUND_EXCEEDED", "Only pages 1 and 2 are authorized");
      if (
        page === 2 &&
        (!/^[a-f0-9]{64}$/.test(params.expectedFirstPageIdsSha256 ?? "") ||
          !/^\d+$/.test(params.expectedSourceTotal ?? ""))
      ) {
        throw failure("LA_RESUME_PROOF_MISSING", "Page 2 requires prior page identity and total");
      }
      if (
        page === 1 &&
        (params.expectedFirstPageIdsSha256 !== undefined ||
          params.expectedSourceTotal !== undefined)
      )
        throw failure("LA_CONFIG_INVALID", "Unexpected resume proof");
      for (let attempt = 0; attempt < 2; attempt++) {
        const transport = this.factory();
        try {
          const item = await this.page(transport, page, params);
          return {
            sourceId: this.sourceId,
            items: [item],
            ...(page === 1 && item.total > 50 ? { nextCursor: "2" } : {}),
          };
        } catch (cause) {
          if (
            !(cause instanceof CollectionAcquisitionError) ||
            cause.code !== "LA_SESSION_EXPIRED" ||
            attempt === 1
          )
            throw cause;
        } finally {
          await transport.close?.();
        }
      }
    }
    if (params.mode === "DETAIL") {
      if (
        input.cursor !== undefined ||
        Object.keys(params).some((key) => !["mode", "sourceRecordId"].includes(key)) ||
        !idPattern.test(params.sourceRecordId ?? "")
      ) {
        throw failure("LA_DETAIL_CONFIG_INVALID", "Detail requires one explicit source record ID");
      }
      const transport = this.factory();
      try {
        const item = await this.detail(transport, params.sourceRecordId!);
        return { sourceId: this.sourceId, items: [item] };
      } finally {
        await transport.close?.();
      }
    }
    throw failure("LA_CONFIG_INVALID", "Only a bounded pilot page or one detail may be fetched");
  }
  private async get(
    transport: LaosHttpTransport,
    url: string,
    headers: Record<string, string>,
    maxBytes = 2_000_000,
  ): Promise<LaosHttpResponse> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (this.interval) await this.sleep(this.interval);
      let response: LaosHttpResponse;
      try {
        response = await transport.get({ url, headers, maxBytes });
      } catch (cause) {
        if (cause instanceof CollectionAcquisitionError && !cause.retryable) throw cause;
        if (attempt === 3)
          throw failure("LA_TRANSPORT_FAILED", "Bounded source transport failed", true);
        await this.sleep(attempt * 1_000);
        continue;
      }
      if ([301, 302, 303, 307, 308, 401, 419, 440].includes(response.status)) {
        throw failure("LA_SESSION_EXPIRED", "WoPublish session expired or redirected");
      }
      if (response.status === 403) throw failure("LA_ACCESS_CHALLENGE", "WoPublish denied access");
      if (response.status === 429 || response.status >= 500) {
        if (attempt === 3)
          throw failure("LA_TEMPORARY_FAILURE", "Source unavailable after bounded retry", true);
        const retry = response.headers?.["retry-after"];
        const seconds = Array.isArray(retry) ? retry[0] : retry;
        await this.sleep(
          seconds && /^\d+$/.test(seconds)
            ? Math.min(Number(seconds) * 1_000, 60_000)
            : attempt * 2_000,
        );
        continue;
      }
      if (response.status !== 200)
        throw failure("LA_HTTP_REJECTED", "WoPublish returned HTTP " + response.status);
      if (!response.body.length || response.body.length > maxBytes) {
        throw failure("LA_RESPONSE_SIZE_INVALID", "Source response empty or too large");
      }
      return response;
    }
    throw failure("LA_TEMPORARY_FAILURE", "Bounded retries exhausted", true);
  }
  private async page(
    transport: LaosHttpTransport,
    page: 1 | 2,
    params: Record<string, string>,
  ): Promise<LaosPage> {
    const headers = {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "MarkOrbitKnowledge-LA-BoundedPilot/1.0",
    };
    const firstResponse = await this.get(transport, LAOS_LIST_URL, headers);
    if (!firstResponse.contentType.toLowerCase().includes("html")) {
      throw failure("LA_MIME_DRIFT", "First page was not HTML");
    }
    const first = parseLaosList(firstResponse.body);
    if (
      first.ids.length !== 50 ||
      first.total === undefined ||
      (first.total > 50 && !first.nextUrl)
    ) {
      throw failure(
        "LA_PAGE_SCHEMA_DRIFT",
        "First page lacks 50 IDs, total, or Wicket next callback",
      );
    }
    const firstHash = laosSha256(encoder.encode(first.ids.join("\n")));
    if (
      page === 2 &&
      (firstHash !== params.expectedFirstPageIdsSha256 ||
        first.total !== Number(params.expectedSourceTotal))
    ) {
      throw failure("LA_RESUME_DRIFT", "First page changed since the saved checkpoint");
    }
    let response = firstResponse;
    let observed = first;
    if (page === 2) {
      const ajax = new URL(first.nextUrl!, LAOS_LIST_URL);
      if (
        ajax.origin !== LAOS_ORIGIN ||
        !/^\/wopublish-search\/public\/trademarks(?:;jsessionid=[A-Za-z0-9]+)?$/.test(
          ajax.pathname,
        ) ||
        !/^[0-9A-Za-z._~-]{1,320}$/.test(ajax.search.slice(1)) ||
        !ajax.search.includes("navigator-next")
      ) {
        throw failure("LA_AJAX_URL_INVALID", "Next callback is not the official Wicket navigator");
      }
      const base = first.baseUrl ?? "public/trademarks?0";
      if (!/^public\/trademarks\?\d{1,2}$/.test(base)) {
        throw failure("LA_AJAX_BASE_INVALID", "Unexpected Wicket base URL");
      }
      response = await this.get(transport, ajax.toString(), {
        accept: "text/xml,application/xml,*/*;q=0.8",
        "user-agent": "MarkOrbitKnowledge-LA-BoundedPilot/1.0",
        "wicket-ajax": "true",
        "wicket-ajax-baseurl": base,
        "x-requested-with": "XMLHttpRequest",
        referer: LAOS_LIST_URL,
      });
      if (
        !/^(?:text|application)\/xml\b/i.test(response.contentType) ||
        !/^\s*(?:<\?xml[^>]*>\s*)?<ajax-response\b/i.test(decoder.decode(response.body))
      ) {
        throw failure("LA_AJAX_SCHEMA_DRIFT", "Second page is not Wicket AJAX XML");
      }
      observed = parseLaosList(response.body);
    }
    if (
      observed.ids.length !== 50 ||
      (observed.total !== undefined && observed.total !== first.total) ||
      (page === 2 && observed.ids.some((id) => first.ids.includes(id)))
    ) {
      throw failure("LA_PAGE_SCHEMA_DRIFT", "Page count, total, or identity drift");
    }
    return {
      kind: "PAGE",
      page,
      ids: observed.ids,
      total: first.total,
      firstPageIdsSha256: firstHash,
      rawSha256: laosSha256(response.body),
      redactedBody: redactLaosResponse(response.body),
      mime: response.contentType,
      observedAt: response.observedAt,
      sourceUri: LAOS_LIST_URL,
    };
  }
  private async detail(transport: LaosHttpTransport, id: string): Promise<LaosDetail> {
    const uri = LAOS_ORIGIN + "/wopublish-search/public/detail/trademarks?id=" + id;
    const response = await this.get(transport, uri, {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "MarkOrbitKnowledge-LA-BoundedPilot/1.0",
    });
    if (!response.contentType.toLowerCase().includes("html")) {
      throw failure("LA_DETAIL_MIME_DRIFT", "Detail was not HTML");
    }
    const parsed = parseLaosDetail(response.body, id);
    let logoBytes: Uint8Array | undefined;
    let logoMime: string | undefined;
    if (parsed.logoUrl) {
      const logo = await this.get(transport, parsed.logoUrl, {
        accept: "image/png,image/jpeg,image/webp,image/gif,image/svg+xml",
        "user-agent": "MarkOrbitKnowledge-LA-BoundedPilot/1.0",
        referer: uri,
      });
      if (!logo.contentType.toLowerCase().startsWith("image/")) {
        throw failure("LA_LOGO_MIME_DRIFT", "Logo URL did not return image content");
      }
      logoBytes = logo.body;
      logoMime = logo.contentType;
    }
    return {
      kind: "DETAIL",
      ...parsed,
      ...(logoBytes ? { logoBytes } : {}),
      ...(logoMime ? { logoMime } : {}),
      rawSha256: laosSha256(response.body),
      redactedBody: redactLaosResponse(response.body),
      mime: response.contentType,
      observedAt: response.observedAt,
      sourceUri: uri,
    };
  }
}
export function registerLaosAdapter(
  registry: SourceAdapterRegistry,
  adapter: LaosWopublishSourceAdapter,
): void {
  registry.register({
    metadata: LAOS_SOURCE_METADATA,
    collect: (input) => adapter.fetch(input as SourceAdapterRequest),
  });
}
