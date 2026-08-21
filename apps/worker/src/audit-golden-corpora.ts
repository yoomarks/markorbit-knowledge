import {
  GOLDEN_CORPORA,
  auditGoldenCorpora,
  type CorpusInventoryCandidate,
} from "./corpus-inventory";
import { DEFAULT_WORKSPACE_ID, parseCoverageTargets } from "./source-coverage-bootstrap";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown): string[] {
  return array(value).filter((item): item is string => typeof item === "string");
}

function argument(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function normalizedBaseUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Control-plane URL must use http or https");
  }
  return url.toString().replace(/\/$/, "");
}

async function getJson(baseUrl: string, path: string): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
}

function sourceFromEnvelope(value: unknown): JsonRecord | null {
  const outer = record(value);
  if (!outer) return null;
  const direct = record(outer.source);
  if (direct && typeof direct.id === "string") return direct;
  return record(direct?.source);
}

function candidateFromSource(source: JsonRecord): CorpusInventoryCandidate | null {
  if (typeof source.id !== "string" || typeof source.name !== "string") return null;
  const entrypoints = array(source.entrypoints)
    .map(record)
    .filter((entry): entry is JsonRecord => Boolean(entry))
    .map((entry) => entry.uri)
    .filter((uri): uri is string => typeof uri === "string");
  return {
    id: source.id,
    label: source.name,
    ...(typeof source.canonicalUri === "string" ? { canonicalUri: source.canonicalUri } : {}),
    entrypoints,
    tags: stringArray(source.tags),
  };
}

async function loadRegisteredSources(
  baseUrl: string,
  workspaceId: string,
): Promise<CorpusInventoryCandidate[]> {
  const payload = await getJson(
    baseUrl,
    `/api/sources?workspaceId=${encodeURIComponent(workspaceId)}&limit=100`,
  );
  return array(record(payload)?.items)
    .map(sourceFromEnvelope)
    .filter((source): source is JsonRecord => Boolean(source))
    .map(candidateFromSource)
    .filter((candidate): candidate is CorpusInventoryCandidate => Boolean(candidate));
}

async function loadCoverageCandidates(
  baseUrl: string,
  workspaceId: string,
): Promise<CorpusInventoryCandidate[]> {
  const result: CorpusInventoryCandidate[] = [];
  for (const jurisdiction of ["US", "WO"] as const) {
    const payload = await getJson(
      baseUrl,
      `/api/source-coverage?jurisdiction=${jurisdiction}&coverageTier=FOUNDATIONAL&catalogState=ACTIVE&workspaceId=${encodeURIComponent(workspaceId)}`,
    );
    for (const target of parseCoverageTargets(payload)) {
      result.push({
        id: target.id,
        label: target.displayName,
        canonicalUri: target.canonicalUri,
        entrypoints: target.entrypoints.map((entry) => entry.uri),
        tags: [target.family, target.coverageTier, target.authorityName],
      });
    }
  }
  return result;
}

function dedupe(candidates: CorpusInventoryCandidate[]): CorpusInventoryCandidate[] {
  const unique = new Map<string, CorpusInventoryCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.id}\n${candidate.canonicalUri ?? ""}`;
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()];
}

async function main(): Promise<void> {
  const baseUrl = normalizedBaseUrl(
    process.env.MARKORBIT_CONTROL_PLANE_URL?.trim() ||
      argument("--control-plane") ||
      "http://127.0.0.1:3000",
  );
  const workspaceId = argument("--workspace") || DEFAULT_WORKSPACE_ID;
  const [sources, coverage] = await Promise.all([
    loadRegisteredSources(baseUrl, workspaceId),
    loadCoverageCandidates(baseUrl, workspaceId),
  ]);
  const candidates = dedupe([...sources, ...coverage]);
  const audits = auditGoldenCorpora(candidates);

  process.stdout.write(
    `${JSON.stringify(
      {
        event: "corpus.coverage.audit",
        workspaceId,
        corpusCount: GOLDEN_CORPORA.length,
        candidateCount: candidates.length,
        acceptanceBoundary:
          "Inventory coverage only. CORPUS READY additionally requires acquisition completeness, content fidelity, and freshness evidence.",
        audits,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
