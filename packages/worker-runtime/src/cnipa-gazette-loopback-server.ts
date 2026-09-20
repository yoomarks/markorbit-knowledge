import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  cnipaGazetteBrowserStreamSessionFingerprint,
  createCnipaGazetteBrowserStreamSession,
  type CnipaGazetteBrowserStreamSession,
  type CnipaGazetteBrowserStreamState,
} from "./cnipa-gazette-browser-stream";
import type {
  CnipaGazetteBrowserCheckpointStream,
  CnipaGazetteBrowserPageCommit,
} from "./cnipa-gazette-browser-checkpoint-stream";
import type { CnipaGazetteBrowserCheckpointRangePlan } from "./cnipa-gazette-browser-checkpoint-plan";

export const CNIPA_GAZETTE_LOOPBACK_PROTOCOL_VERSION = "MO_CNIPA_GAZETTE_LOOPBACK_V1" as const;
export const CNIPA_GAZETTE_LOOPBACK_SESSION_START_SCHEMA =
  "MO_CNIPA_GAZETTE_LOOPBACK_SESSION_START_V1" as const;
export const CNIPA_GAZETTE_LOOPBACK_SESSION_ACK_SCHEMA =
  "MO_CNIPA_GAZETTE_LOOPBACK_SESSION_ACK_V1" as const;
export const CNIPA_GAZETTE_LOOPBACK_PAGE_ACK_SCHEMA =
  "MO_CNIPA_GAZETTE_LOOPBACK_PAGE_ACK_V1" as const;

const LOOPBACK_HOST = "127.0.0.1" as const;
const DEFAULT_MAX_BODY_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_SESSIONS = 4;
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/u;

type JsonRecord = Record<string, unknown>;

type LoopbackCheckpointStream = Pick<
  CnipaGazetteBrowserCheckpointStream,
  "acceptSourcePage" | "snapshot" | "checkpointPlans"
>;

type PageAck = {
  schemaVersion: typeof CNIPA_GAZETTE_LOOPBACK_PAGE_ACK_SCHEMA;
  protocolVersion: typeof CNIPA_GAZETTE_LOOPBACK_PROTOCOL_VERSION;
  sessionId: string;
  sessionFingerprintSha256: string;
  sourcePageIndex: number;
  nextSourcePageIndex: number;
  completed: boolean;
  checkpoint: null | {
    logicalRange: { startPage: number; endPage: number };
    sourceRange: { startPage: number; endPage: number };
    terminal: boolean;
    rowCount: number;
    sourceDatasetSha256: string;
    chunkRequestCanonicalUri: string;
  };
};

type ActiveSession = {
  session: CnipaGazetteBrowserStreamSession;
  fingerprint: string;
  stream: LoopbackCheckpointStream;
  lastAck: null | {
    pageIndex: number;
    rawSha256: string;
    ack: PageAck;
  };
};

class LoopbackHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "LoopbackHttpError";
  }
}
function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LoopbackHttpError(400, `${label} must be an object`);
  }
  return value as JsonRecord;
}

function requireOnlyKeys(value: JsonRecord, allowed: readonly string[], label: string): void {
  const keys = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !keys.has(key));
  if (unexpected.length > 0) {
    throw new LoopbackHttpError(
      400,
      `${label} contains unsupported fields: ${unexpected.join(", ")}`,
    );
  }
}

function header(request: IncomingMessage, name: string, required = true): string | null {
  const value = request.headers[name.toLowerCase()];
  const normalized = Array.isArray(value) ? value[0] : value;
  if (typeof normalized === "string" && normalized.trim()) {
    return normalized.trim();
  }
  if (required) {
    throw new LoopbackHttpError(400, `missing ${name} header`);
  }
  return null;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function jsonResponse(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  origin?: string,
): void {
  const body = Buffer.from(JSON.stringify(payload));
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json;charset=UTF-8");
  response.setHeader("Content-Length", body.byteLength);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.end(body);
}
function errorResponse(response: ServerResponse, error: unknown, origin?: string): void {
  const statusCode = error instanceof LoopbackHttpError ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : "loopback bridge request failed";
  jsonResponse(
    response,
    statusCode,
    {
      schemaVersion: "MO_CNIPA_GAZETTE_LOOPBACK_ERROR_V1",
      error: message,
    },
    origin,
  );
}

function parsePort(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 65535) {
    throw new TypeError("loopback port must be an integer from 0 to 65535");
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new LoopbackHttpError(400, `${label} must be a positive integer`);
  }
  return value;
}

function parseHttpStatus(value: string): number {
  if (!/^\d{3}$/u.test(value)) {
    throw new LoopbackHttpError(400, "X-MO-Source-HTTP-Status must be a 3-digit integer");
  }
  const status = Number(value);
  if (status < 100 || status > 599) {
    throw new LoopbackHttpError(400, "X-MO-Source-HTTP-Status is outside the HTTP status range");
  }
  return status;
}

function parseObservedAt(value: string): string {
  if (Number.isNaN(Date.parse(value))) {
    throw new LoopbackHttpError(400, "X-MO-Observed-At must be an ISO-8601 instant");
  }
  return value;
}

function safeTokenEqual(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

function sourceMimeType(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length > 256 ||
    !/^[\w.+-]+\/[\w.+-]+(?:\s*;\s*[\w!#$&^_.+-]+=[\w!#$&^_.+-]+)*$/u.test(normalized)
  ) {
    throw new LoopbackHttpError(400, "X-MO-Source-Content-Type must be a valid bounded MIME type");
  }
  return normalized;
}

async function readBody(request: IncomingMessage, maximumBytes: number): Promise<Uint8Array> {
  const contentLength = request.headers["content-length"];
  if (
    typeof contentLength === "string" &&
    /^\d+$/u.test(contentLength) &&
    Number(contentLength) > maximumBytes
  ) {
    throw new LoopbackHttpError(413, "loopback request body is too large");
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maximumBytes) {
      throw new LoopbackHttpError(413, "loopback request body is too large");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total);
}
function sessionAck(active: ActiveSession): {
  schemaVersion: typeof CNIPA_GAZETTE_LOOPBACK_SESSION_ACK_SCHEMA;
  protocolVersion: typeof CNIPA_GAZETTE_LOOPBACK_PROTOCOL_VERSION;
  sessionId: string;
  sessionFingerprintSha256: string;
  nextSourcePageIndex: number;
  sourcePages: number;
  checkpointPlans: readonly CnipaGazetteBrowserCheckpointRangePlan[];
} {
  return {
    schemaVersion: CNIPA_GAZETTE_LOOPBACK_SESSION_ACK_SCHEMA,
    protocolVersion: CNIPA_GAZETTE_LOOPBACK_PROTOCOL_VERSION,
    sessionId: active.session.sessionId,
    sessionFingerprintSha256: active.fingerprint,
    nextSourcePageIndex: active.stream.snapshot().nextSourcePageIndex,
    sourcePages: active.session.sourcePages,
    checkpointPlans: active.stream.checkpointPlans(),
  };
}

function pageAck(active: ActiveSession, commit: CnipaGazetteBrowserPageCommit): PageAck {
  return {
    schemaVersion: CNIPA_GAZETTE_LOOPBACK_PAGE_ACK_SCHEMA,
    protocolVersion: CNIPA_GAZETTE_LOOPBACK_PROTOCOL_VERSION,
    sessionId: active.session.sessionId,
    sessionFingerprintSha256: active.fingerprint,
    sourcePageIndex: commit.sourcePageIndex,
    nextSourcePageIndex: commit.state.nextSourcePageIndex,
    completed: commit.completed,
    checkpoint: commit.checkpoint
      ? {
          logicalRange: commit.checkpoint.rangePlan.logicalRange,
          sourceRange: commit.checkpoint.rangePlan.sourceRange,
          terminal: commit.checkpoint.rangePlan.terminal,
          rowCount: commit.checkpoint.rowCount,
          sourceDatasetSha256: commit.checkpoint.sourceDatasetSha256,
          chunkRequestCanonicalUri: commit.checkpoint.chunkRequestArtifact.canonicalUri,
        }
      : null,
  };
}

export function createCnipaGazetteLoopbackToken(): string {
  return randomBytes(32).toString("base64url");
}

export type CnipaGazetteLoopbackServerOptions = {
  bridgeToken: string;
  allowedExtensionOrigins: readonly string[];
  createStream: (session: CnipaGazetteBrowserStreamSession) => LoopbackCheckpointStream;
  maxBodyBytes?: number;
  maxSessions?: number;
};

export class CnipaGazetteLoopbackServer {
  private readonly server: Server;
  private readonly sessions = new Map<string, ActiveSession>();
  private readonly allowedOrigins: ReadonlySet<string>;
  private readonly maximumBodyBytes: number;
  private readonly maximumSessions: number;
  private listeningPort: number | null = null;

  constructor(private readonly options: CnipaGazetteLoopbackServerOptions) {
    if (
      typeof options.bridgeToken !== "string" ||
      !/^[A-Za-z0-9._~-]{32,256}$/u.test(options.bridgeToken)
    ) {
      throw new TypeError("bridgeToken must contain 32 to 256 header-safe characters");
    }
    if (
      options.allowedExtensionOrigins.length === 0 ||
      options.allowedExtensionOrigins.some((origin) => !EXTENSION_ORIGIN.test(origin))
    ) {
      throw new TypeError("allowedExtensionOrigins must contain explicit Chrome extension origins");
    }
    this.allowedOrigins = new Set(options.allowedExtensionOrigins);
    this.maximumBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    if (
      !Number.isSafeInteger(this.maximumBodyBytes) ||
      this.maximumBodyBytes < 1024 ||
      this.maximumBodyBytes > 64 * 1024 * 1024
    ) {
      throw new TypeError("maxBodyBytes must be an integer from 1024 to 67108864");
    }
    this.maximumSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    if (
      !Number.isSafeInteger(this.maximumSessions) ||
      this.maximumSessions < 1 ||
      this.maximumSessions > 32
    ) {
      throw new TypeError("maxSessions must be an integer from 1 to 32");
    }
    this.server = createServer((request, response) => {
      void this.handle(request, response);
    });
    this.server.requestTimeout = 30_000;
    this.server.headersTimeout = 10_000;
    this.server.keepAliveTimeout = 5_000;
    this.server.maxHeadersCount = 32;
  }

  private validateHost(request: IncomingMessage): void {
    const host = header(request, "Host");
    let parsed: URL;
    try {
      parsed = new URL(`http://${host}`);
    } catch {
      throw new LoopbackHttpError(400, "invalid Host header");
    }
    if (parsed.hostname !== LOOPBACK_HOST) {
      throw new LoopbackHttpError(403, "loopback bridge accepts only the 127.0.0.1 Host");
    }
  }

  private validateOrigin(request: IncomingMessage): string {
    const origin = header(request, "Origin");
    if (!this.allowedOrigins.has(origin!)) {
      throw new LoopbackHttpError(403, "request Origin is not authorized for the loopback bridge");
    }
    return origin!;
  }

  private validateAuthorization(request: IncomingMessage): void {
    const value = header(request, "Authorization");
    const match = /^Bearer ([A-Za-z0-9._~-]+)$/u.exec(value!);
    if (!match || !safeTokenEqual(match[1]!, this.options.bridgeToken)) {
      throw new LoopbackHttpError(401, "invalid loopback bridge authorization");
    }
  }

  private handleOptions(request: IncomingMessage, response: ServerResponse, origin: string): void {
    const requestedMethod = header(request, "Access-Control-Request-Method", false);
    if (requestedMethod !== "POST" && requestedMethod !== "DELETE") {
      throw new LoopbackHttpError(405, "loopback preflight permits POST or DELETE only");
    }
    response.statusCode = 204;
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "POST, DELETE");
    response.setHeader(
      "Access-Control-Allow-Headers",
      [
        "Authorization",
        "Content-Type",
        "X-MO-Session-Fingerprint",
        "X-MO-Observed-At",
        "X-MO-Source-HTTP-Status",
        "X-MO-Source-Content-Type",
      ].join(", "),
    );
    if (header(request, "Access-Control-Request-Private-Network", false) === "true") {
      response.setHeader("Access-Control-Allow-Private-Network", "true");
    }
    response.setHeader("Access-Control-Max-Age", "300");
    response.end();
  }

  private async handleSessionStart(
    request: IncomingMessage,
    response: ServerResponse,
    origin: string,
  ): Promise<void> {
    const contentType = header(request, "Content-Type");
    if (!/^application\/json(?:\s*;|$)/iu.test(contentType!)) {
      throw new LoopbackHttpError(415, "session start requires application/json");
    }
    const bytes = await readBody(request, Math.min(this.maximumBodyBytes, 64 * 1024));
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      throw new LoopbackHttpError(400, "session start body must be valid UTF-8 JSON");
    }
    const body = record(parsed, "session start body");
    requireOnlyKeys(
      body,
      [
        "schemaVersion",
        "sessionId",
        "announcementIssue",
        "sourceUrl",
        "capturedQuery",
        "sourceTotal",
        "sourcePages",
        "announcementDate",
        "startedAt",
      ],
      "session start body",
    );
    if (body.schemaVersion !== CNIPA_GAZETTE_LOOPBACK_SESSION_START_SCHEMA) {
      throw new LoopbackHttpError(400, "session start schemaVersion is invalid");
    }

    let session: CnipaGazetteBrowserStreamSession;
    try {
      session = createCnipaGazetteBrowserStreamSession({
        sessionId: String(body.sessionId ?? ""),
        announcementIssue: positiveInteger(body.announcementIssue, "announcementIssue"),
        sourceUrl: String(body.sourceUrl ?? ""),
        capturedQuery: body.capturedQuery,
        sourceTotal: typeof body.sourceTotal === "number" ? body.sourceTotal : Number.NaN,
        sourcePages: typeof body.sourcePages === "number" ? body.sourcePages : Number.NaN,
        announcementDate:
          body.announcementDate === null ? null : String(body.announcementDate ?? ""),
        startedAt: String(body.startedAt ?? ""),
      });
    } catch (error) {
      throw new LoopbackHttpError(
        400,
        error instanceof Error ? error.message : "invalid browser stream session",
      );
    }

    const fingerprint = cnipaGazetteBrowserStreamSessionFingerprint(session);
    const existing = this.sessions.get(session.sessionId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new LoopbackHttpError(
          409,
          "sessionId is already bound to a different browser stream",
        );
      }
      jsonResponse(response, 200, sessionAck(existing), origin);
      return;
    }
    if (this.sessions.size >= this.maximumSessions) {
      throw new LoopbackHttpError(429, "loopback bridge has reached its active session limit");
    }
    const active: ActiveSession = {
      session,
      fingerprint,
      stream: this.options.createStream(session),
      lastAck: null,
    };
    this.sessions.set(session.sessionId, active);
    jsonResponse(response, 201, sessionAck(active), origin);
  }

  private async handlePage(
    request: IncomingMessage,
    response: ServerResponse,
    origin: string,
    sessionId: string,
    pageIndex: number,
  ): Promise<void> {
    const active = this.sessions.get(sessionId);
    if (!active) {
      throw new LoopbackHttpError(404, "browser stream session was not found");
    }
    const fingerprint = header(request, "X-MO-Session-Fingerprint");
    if (fingerprint !== active.fingerprint) {
      throw new LoopbackHttpError(409, "browser stream session fingerprint mismatch");
    }
    const bridgeContentType = header(request, "Content-Type");
    if (!/^application\/octet-stream(?:\s*;|$)/iu.test(bridgeContentType!)) {
      throw new LoopbackHttpError(415, "browser page transfer requires application/octet-stream");
    }
    const observedAt = parseObservedAt(header(request, "X-MO-Observed-At")!);
    const sourceHttpStatus = parseHttpStatus(header(request, "X-MO-Source-HTTP-Status")!);
    const sourceContentType = sourceMimeType(header(request, "X-MO-Source-Content-Type")!);
    const rawBody = await readBody(request, this.maximumBodyBytes);
    if (rawBody.byteLength === 0) {
      throw new LoopbackHttpError(400, "browser source page body cannot be empty");
    }
    const rawSha256 = sha256(rawBody);
    const nextPage = active.stream.snapshot().nextSourcePageIndex;
    if (pageIndex === nextPage - 1 && active.lastAck?.pageIndex === pageIndex) {
      if (active.lastAck.rawSha256 !== rawSha256) {
        throw new LoopbackHttpError(409, "already-committed page was retried with different bytes");
      }
      jsonResponse(response, 200, active.lastAck.ack, origin);
      return;
    }
    if (pageIndex !== nextPage) {
      throw new LoopbackHttpError(409, `expected source page ${nextPage}, received ${pageIndex}`);
    }

    let commit: CnipaGazetteBrowserPageCommit;
    try {
      commit = await active.stream.acceptSourcePage({
        requestedPageIndex: pageIndex,
        observedAt,
        httpStatus: sourceHttpStatus,
        rawBody,
        contentType: sourceContentType,
      });
    } catch (error) {
      throw new LoopbackHttpError(
        422,
        error instanceof Error ? error.message : "browser source page was rejected",
      );
    }
    const ack = pageAck(active, commit);
    active.lastAck = { pageIndex, rawSha256, ack };
    jsonResponse(response, 200, ack, origin);
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    let origin: string | undefined;
    try {
      this.validateHost(request);
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/healthz") {
        jsonResponse(response, 200, {
          protocolVersion: CNIPA_GAZETTE_LOOPBACK_PROTOCOL_VERSION,
          status: "ok",
        });
        return;
      }
      origin = this.validateOrigin(request);
      if (request.method === "OPTIONS") {
        this.handleOptions(request, response, origin);
        return;
      }
      this.validateAuthorization(request);
      if (request.method === "POST" && url.pathname === "/v1/cnipa-gazette/sessions") {
        await this.handleSessionStart(request, response, origin);
        return;
      }
      const sessionMatch = /^\/v1\/cnipa-gazette\/sessions\/([^/]+)$/u.exec(url.pathname);
      if (request.method === "DELETE" && sessionMatch) {
        const sessionId = decodeURIComponent(sessionMatch[1]!);
        const active = this.sessions.get(sessionId);
        if (!active) {
          throw new LoopbackHttpError(404, "browser stream session was not found");
        }
        if (header(request, "X-MO-Session-Fingerprint") !== active.fingerprint) {
          throw new LoopbackHttpError(409, "browser stream session fingerprint mismatch");
        }
        this.sessions.delete(sessionId);
        response.statusCode = 204;
        response.setHeader("Access-Control-Allow-Origin", origin);
        response.setHeader("Vary", "Origin");
        response.setHeader("Cache-Control", "no-store");
        response.end();
        return;
      }

      const pageMatch = /^\/v1\/cnipa-gazette\/sessions\/([^/]+)\/pages\/(\d+)$/u.exec(
        url.pathname,
      );
      if (request.method === "POST" && pageMatch) {
        const sessionId = decodeURIComponent(pageMatch[1]!);
        await this.handlePage(
          request,
          response,
          origin,
          sessionId,
          positiveInteger(Number(pageMatch[2]!), "pageIndex"),
        );
        return;
      }
      throw new LoopbackHttpError(404, "loopback route was not found");
    } catch (error) {
      errorResponse(response, error, origin);
    }
  }
  async listen(port = 0): Promise<{
    host: typeof LOOPBACK_HOST;
    port: number;
    baseUrl: string;
  }> {
    if (this.listeningPort !== null) {
      throw new TypeError("loopback server is already listening");
    }
    const requestedPort = parsePort(port);
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        this.server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.server.off("error", onError);
        resolve();
      };
      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen({
        host: LOOPBACK_HOST,
        port: requestedPort,
        exclusive: true,
      });
    });
    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new Error("loopback server did not expose a TCP address");
    }
    this.listeningPort = address.port;
    return {
      host: LOOPBACK_HOST,
      port: address.port,
      baseUrl: `http://${LOOPBACK_HOST}:${address.port}`,
    };
  }

  async close(): Promise<void> {
    if (this.listeningPort === null) return;
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    this.listeningPort = null;
    this.sessions.clear();
  }
}
