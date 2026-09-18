import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { CNIPA_FAST_SOURCE_SPECS, type CnipaFastSourceSpec } from "./cnipa-fast-bootstrap-spec";
import {
  CNIPA_HISTORICAL_BACKFILL_VERSION,
  applyCnipaCoverageObservation,
  createCnipaHistoricalBackfillState,
  planNextCnipaBackfillWindow,
  type CnipaCoverageManifestForBackfill,
  type CnipaHistoricalBackfillCheckpoint,
  type CnipaHistoricalBackfillSourceState,
} from "./cnipa-historical-backfill";

const DEFAULT_STATE_PATH = ".markorbit/cnipa-historical-backfill.json";
const TERMINAL_RUN_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function items(value: unknown): unknown[] {
  const container = record(value);
  return Array.isArray(container?.items) ? container.items : [];
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function dateOnly(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must use YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a real calendar date`);
  }
  return value;
}

function normalizedBaseUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Control-plane URL must use http or https");
  }
  return url.toString().replace(/\/$/, "");
}

function authHeaders(): Record<string, string> {
  const cookie = process.env.MARKORBIT_ADMIN_COOKIE?.trim();
  return cookie ? { cookie } : {};
}

async function request(baseUrl: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(authHeaders())) headers.set(key, value);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${path}: HTTP ${response.status}${body ? ` — ${body.slice(0, 500)}` : ""}`);
  }
  return response;
}

async function requestJson(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await request(baseUrl, path, init);
  return response.json();
}

function jsonPost(body: unknown, idempotencyKey?: string): RequestInit {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  return { method: "POST", headers, body: JSON.stringify(body) };
}

async function discoverSourceAndPlan(
  baseUrl: string,
  spec: CnipaFastSourceSpec,
): Promise<{ sourceId: string; planId: string }> {
  const sources = await requestJson(
    baseUrl,
    `/api/sources?q=${encodeURIComponent(spec.slug)}&limit=100`,
  );
  const source = items(sources)
    .map(record)
    .find((candidate) => candidate?.slug === spec.slug);
  const sourceId = requiredString(source?.id, `${spec.key} sourceId`);

  const plans = await requestJson(
    baseUrl,
    `/api/plans?sourceId=${encodeURIComponent(sourceId)}&limit=100`,
  );
  const expectedName = `${spec.name} — FAST LIST`;
  const plan = items(plans)
    .map((candidate) => record(record(candidate)?.plan))
    .find((candidate) => candidate?.name === expectedName);
  return { sourceId, planId: requiredString(plan?.id, `${spec.key} planId`) };
}

function updatedCheckpoint(
  checkpoint: CnipaHistoricalBackfillCheckpoint,
  state: CnipaHistoricalBackfillSourceState,
): CnipaHistoricalBackfillCheckpoint {
  return {
    ...checkpoint,
    updatedAt: new Date().toISOString(),
    sources: checkpoint.sources.map((candidate) =>
      candidate.documentKind === state.documentKind ? state : candidate,
    ),
  };
}

async function atomicWriteCheckpoint(
  statePath: string,
  checkpoint: CnipaHistoricalBackfillCheckpoint,
): Promise<void> {
  await mkdir(dirname(statePath), { recursive: true });
  const temporary = `${statePath}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
  await rename(temporary, statePath);
}

function parseCheckpoint(value: unknown): CnipaHistoricalBackfillCheckpoint {
  const root = record(value);
  if (
    root?.schemaVersion !== CNIPA_HISTORICAL_BACKFILL_VERSION ||
    typeof root.updatedAt !== "string" ||
    !Array.isArray(root.sources)
  ) {
    throw new Error("Invalid CNIPA historical backfill checkpoint");
  }
  return value as CnipaHistoricalBackfillCheckpoint;
}

async function loadOrCreateCheckpoint(input: {
  baseUrl: string;
  statePath: string;
  throughDate: string | undefined;
  floorDate: string;
}): Promise<CnipaHistoricalBackfillCheckpoint> {
  try {
    return parseCheckpoint(JSON.parse(await readFile(input.statePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  if (!input.throughDate) {
    throw new Error(
      "MARKORBIT_CNIPA_BACKFILL_THROUGH_DATE is required when creating the initial checkpoint",
    );
  }
  const sources: CnipaHistoricalBackfillSourceState[] = [];
  for (const spec of CNIPA_FAST_SOURCE_SPECS) {
    const ids = await discoverSourceAndPlan(input.baseUrl, spec);
    sources.push(
      createCnipaHistoricalBackfillState({
        ...ids,
        documentKind: spec.documentKind,
        floorDate: input.floorDate,
        throughDate: input.throughDate,
      }),
    );
  }
  const checkpoint: CnipaHistoricalBackfillCheckpoint = {
    schemaVersion: CNIPA_HISTORICAL_BACKFILL_VERSION,
    updatedAt: new Date().toISOString(),
    sources,
  };
  await atomicWriteCheckpoint(input.statePath, checkpoint);
  return checkpoint;
}

async function dispatchWindow(
  baseUrl: string,
  state: CnipaHistoricalBackfillSourceState,
): Promise<string> {
  if (!state.pendingWindow) throw new Error("Cannot dispatch without a pending CNIPA window");
  const window = state.pendingWindow;
  const body = await requestJson(
    baseUrl,
    "/api/runs",
    jsonPost(
      {
        planId: state.planId,
        extensions: {
          "x-markorbit.cnipa-query": {
            mode: "DATE_RANGE",
            fromDate: window.fromDate,
            toDate: window.toDate,
            documentKinds: [state.documentKind],
          },
        },
      },
      window.idempotencyKey,
    ),
  );
  const runId = record(record(body)?.record)?.run;
  return requiredString(record(runId)?.id, "dispatched run.id");
}

async function getRunStatus(baseUrl: string, runId: string): Promise<string> {
  const body = await requestJson(baseUrl, `/api/runs/${encodeURIComponent(runId)}`);
  const status = record(record(record(body)?.run)?.run)?.status;
  return requiredString(status, `run ${runId} status`);
}

async function waitForTerminalRun(baseUrl: string, runId: string, pollMs: number): Promise<string> {
  for (;;) {
    const status = await getRunStatus(baseUrl, runId);
    if (TERMINAL_RUN_STATUSES.has(status)) return status;
    if (status !== "PENDING" && status !== "RUNNING") {
      throw new Error(`Unknown CollectionRun status: ${status}`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, pollMs));
  }
}

type CoverageArtifact = { id: string; sha256: string };

async function findCoverageArtifact(
  baseUrl: string,
  state: CnipaHistoricalBackfillSourceState,
  runId: string,
): Promise<CoverageArtifact> {
  const coverageUriPrefix = `cnipa://collection-coverage/${state.documentKind}/`;
  const body = await requestJson(
    baseUrl,
    `/api/artifacts?runId=${encodeURIComponent(runId)}&artifactKind=JSON&q=${encodeURIComponent(coverageUriPrefix)}&limit=100`,
  );
  const matches = items(body)
    .map((item) => record(record(item)?.artifact))
    .filter((artifact) => {
      const uri = artifact?.canonicalUri;
      return typeof uri === "string" && uri.startsWith(coverageUriPrefix);
    });

  if (matches.length !== 1) {
    throw new Error(
      `Run ${runId} must expose exactly one ${state.documentKind} coverage manifest; found ${matches.length}`,
    );
  }
  const artifact = matches[0]!;
  const hash = record(artifact.binaryHash)?.value;
  return {
    id: requiredString(artifact.id, "coverage artifact id"),
    sha256: requiredString(hash, "coverage artifact sha256"),
  };
}

async function readCoverageManifest(
  baseUrl: string,
  artifactId: string,
): Promise<CnipaCoverageManifestForBackfill> {
  const response = await request(
    baseUrl,
    `/api/artifacts/${encodeURIComponent(artifactId)}/content`,
  );
  return JSON.parse(await response.text()) as CnipaCoverageManifestForBackfill;
}

async function tickSource(input: {
  baseUrl: string;
  statePath: string;
  checkpoint: CnipaHistoricalBackfillCheckpoint;
  state: CnipaHistoricalBackfillSourceState;
  pollMs: number;
}): Promise<CnipaHistoricalBackfillCheckpoint> {
  let { checkpoint, state } = input;
  if (state.completionState !== "ACTIVE") return checkpoint;

  if (!state.pendingWindow) {
    const pendingWindow = planNextCnipaBackfillWindow(state);
    if (!pendingWindow) {
      state = { ...state, completionState: "COMPLETE", blockReason: null };
      checkpoint = updatedCheckpoint(checkpoint, state);
      await atomicWriteCheckpoint(input.statePath, checkpoint);
      return checkpoint;
    }
    state = { ...state, pendingWindow, replayRequired: false };
    checkpoint = updatedCheckpoint(checkpoint, state);
    await atomicWriteCheckpoint(input.statePath, checkpoint);
  }

  if (!state.activeRunId) {
    const runId = await dispatchWindow(input.baseUrl, state);
    state = { ...state, activeRunId: runId };
    checkpoint = updatedCheckpoint(checkpoint, state);
    await atomicWriteCheckpoint(input.statePath, checkpoint);
  }

  const runId = state.activeRunId!;
  const status = await waitForTerminalRun(input.baseUrl, runId, input.pollMs);
  if (status !== "COMPLETED") {
    state = {
      ...state,
      activeRunId: null,
      lastRunId: runId,
      completionState: "BLOCKED",
      blockReason: `RUN_${status}`,
    };
    checkpoint = updatedCheckpoint(checkpoint, state);
    await atomicWriteCheckpoint(input.statePath, checkpoint);
    return checkpoint;
  }

  const artifact = await findCoverageArtifact(input.baseUrl, state, runId);
  const manifest = await readCoverageManifest(input.baseUrl, artifact.id);
  state = applyCnipaCoverageObservation({
    state,
    runId,
    artifactId: artifact.id,
    artifactSha256: artifact.sha256,
    manifest,
  });
  checkpoint = updatedCheckpoint(checkpoint, state);
  await atomicWriteCheckpoint(input.statePath, checkpoint);
  return checkpoint;
}

function summary(checkpoint: CnipaHistoricalBackfillCheckpoint) {
  return checkpoint.sources.map((source) => ({
    documentKind: source.documentKind,
    cursorDate: source.cursorDate,
    throughDate: source.throughDate,
    windowDays: source.currentWindowDays,
    completionState: source.completionState,
    blockReason: source.blockReason,
    activeRunId: source.activeRunId,
    lastRunId: source.lastRunId,
    lastObservation: source.lastObservation,
    lastAcceptedWindow: source.lastAcceptedWindow,
  }));
}

async function main(): Promise<void> {
  const baseUrl = normalizedBaseUrl(
    process.env.MARKORBIT_CONTROL_PLANE_URL?.trim() || "http://localhost:3000",
  );
  const statePath = resolve(
    process.env.MARKORBIT_CNIPA_BACKFILL_STATE_PATH?.trim() || DEFAULT_STATE_PATH,
  );
  const throughDate = process.env.MARKORBIT_CNIPA_BACKFILL_THROUGH_DATE?.trim();
  const floorDate = dateOnly(
    process.env.MARKORBIT_CNIPA_BACKFILL_FLOOR_DATE?.trim() || "2016-01-01",
    "MARKORBIT_CNIPA_BACKFILL_FLOOR_DATE",
  );
  if (throughDate) dateOnly(throughDate, "MARKORBIT_CNIPA_BACKFILL_THROUGH_DATE");
  const pollMs = Number(process.env.MARKORBIT_CNIPA_BACKFILL_POLL_MS || "5000");
  if (!Number.isSafeInteger(pollMs) || pollMs < 250 || pollMs > 60000) {
    throw new Error("MARKORBIT_CNIPA_BACKFILL_POLL_MS must be an integer in 250..60000");
  }
  const continuous = process.argv.includes("--continuous");

  let checkpoint = await loadOrCreateCheckpoint({
    baseUrl,
    statePath,
    throughDate,
    floorDate,
  });

  do {
    let activeBefore = 0;
    for (const snapshot of checkpoint.sources) {
      const current = checkpoint.sources.find(
        (candidate) => candidate.documentKind === snapshot.documentKind,
      )!;
      if (current.completionState !== "ACTIVE") continue;
      activeBefore += 1;
      checkpoint = await tickSource({
        baseUrl,
        statePath,
        checkpoint,
        state: current,
        pollMs,
      });
    }

    process.stdout.write(
      `${JSON.stringify({ statePath, sources: summary(checkpoint) }, null, 2)}\n`,
    );
    const activeAfter = checkpoint.sources.filter(
      (source) => source.completionState === "ACTIVE",
    ).length;
    if (!continuous || activeAfter === 0 || activeBefore === 0) break;
  } while (true);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
