import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPriorityNationalSourceCoverageTargets } from "@markorbit/persistence/source-coverage";

type CrawlSuccess = {
  protocolVersion: string;
  ok: true;
  artifacts: Array<{
    artifactKind: string;
    canonicalUri: string;
    sizeBytes: number;
    sha256: string;
  }>;
  pagesAttempted: number;
  totalBytes: number;
};

type CrawlFailure = {
  protocolVersion: string;
  ok: false;
  error: { code: string; message: string; retryable: boolean };
};

type CrawlResponse = CrawlSuccess | CrawlFailure;

type Candidate = {
  id: string;
  label: string;
  uri: string;
  rationale: string;
};

type CandidateResult = {
  id: string;
  label: string;
  uri: string;
  rationale: string;
  state: "PASS" | "FAIL";
  pagesAttempted: number;
  artifactCount: number;
  artifactKinds: string[];
  finalUris: string[];
  totalBytes: number;
  elapsedMs: number;
  errorCode?: string;
  errorMessage?: string;
};

const CANDIDATES: readonly Candidate[] = [
  {
    id: "guidelines-root",
    label: "EUIPO Guidelines root",
    uri: "https://guidelines.euipo.europa.eu/",
    rationale:
      "Dedicated official Guidelines host; low-interaction authority content and preferable to the interactive trade-mark service shell when collectible.",
  },
  {
    id: "help-centre-fees",
    label: "EUIPO trade-mark fees FAQ",
    uri: "https://www.euipo.europa.eu/en/help-centre/tm/faq-fees-and-their-payment",
    rationale:
      "Official low-interaction trade-mark help content with durable operational value and no search/form interaction required.",
  },
] as const;

function argument(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function pythonExecutable(): string {
  return process.env.MARKORBIT_CRAWL4AI_PYTHON?.trim() || "python";
}

function crawlScriptPath(): string {
  const override = process.env.MARKORBIT_CRAWL4AI_SCRIPT?.trim();
  if (override) return override;
  return fileURLToPath(new URL("../../../workers/crawl4ai/acquire.py", import.meta.url));
}

function timeoutSeconds(): number {
  const raw = argument("--timeout-seconds") ?? process.env.MARKORBIT_LIVE_CANARY_TIMEOUT_SECONDS;
  if (!raw) return 75;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 15 || parsed > 180) {
    throw new Error(`timeout-seconds must be an integer between 15 and 180, got ${raw}`);
  }
  return parsed;
}

async function probe(candidate: Candidate, outputRoot: string): Promise<CandidateResult> {
  const candidateOutput = join(outputRoot, candidate.id);
  await mkdir(candidateOutput, { recursive: true });
  const timeout = timeoutSeconds();
  const request = {
    protocolVersion: "1.0",
    outputDirectory: candidateOutput,
    startUrls: [candidate.uri],
    outputKinds: ["HTML", "MARKDOWN"],
    maxDepth: 0,
    maxItems: 1,
    renderJavascript: false,
    fetchAttachments: false,
    respectRobots: true,
    rateLimitPerMinute: 4,
    timeoutSeconds: timeout,
    includePatterns: [candidate.uri],
    excludePatterns: [],
    locale: "en",
    maxArtifactBytes: 16 * 1024 * 1024,
    maxTotalBytes: 32 * 1024 * 1024,
    requireEgressProxy: false,
  };
  const startedAt = Date.now();
  const child = spawn(pythonExecutable(), [crawlScriptPath()], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  child.stdin.end(JSON.stringify(request));

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(
      () => {
        child.kill("SIGKILL");
        reject(new Error(`EUIPO baseline probe timed out after ${timeout + 30}s`));
      },
      (timeout + 30) * 1000,
    );
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  if (exitCode !== 0) {
    return {
      ...candidate,
      state: "FAIL",
      pagesAttempted: 0,
      artifactCount: 0,
      artifactKinds: [],
      finalUris: [],
      totalBytes: 0,
      elapsedMs: Date.now() - startedAt,
      errorCode: "PROBE_PROCESS_FAILED",
      errorMessage: `Crawl4AI exited with ${exitCode}: ${stderr.trim().slice(-800)}`,
    };
  }

  const trimmed = stdout.trim();
  if (!trimmed) {
    return {
      ...candidate,
      state: "FAIL",
      pagesAttempted: 0,
      artifactCount: 0,
      artifactKinds: [],
      finalUris: [],
      totalBytes: 0,
      elapsedMs: Date.now() - startedAt,
      errorCode: "PROBE_EMPTY_RESPONSE",
      errorMessage: stderr.trim().slice(-800) || "Crawl4AI returned no JSON response",
    };
  }

  const response = JSON.parse(trimmed) as CrawlResponse;
  if (!response.ok) {
    return {
      ...candidate,
      state: "FAIL",
      pagesAttempted: 0,
      artifactCount: 0,
      artifactKinds: [],
      finalUris: [],
      totalBytes: 0,
      elapsedMs: Date.now() - startedAt,
      errorCode: response.error.code,
      errorMessage: response.error.message,
    };
  }

  const artifactKinds = [...new Set(response.artifacts.map((artifact) => artifact.artifactKind))].sort();
  const finalUris = [...new Set(response.artifacts.map((artifact) => artifact.canonicalUri))].sort();
  const validHashes = response.artifacts.every((artifact) => /^[a-f0-9]{64}$/u.test(artifact.sha256));
  const passed =
    response.artifacts.length >= 2 &&
    artifactKinds.includes("HTML") &&
    artifactKinds.includes("MARKDOWN") &&
    validHashes;
  return {
    ...candidate,
    state: passed ? "PASS" : "FAIL",
    pagesAttempted: response.pagesAttempted,
    artifactCount: response.artifacts.length,
    artifactKinds,
    finalUris,
    totalBytes: response.totalBytes,
    elapsedMs: Date.now() - startedAt,
    ...(!passed
      ? {
          errorCode: "BASELINE_EVIDENCE_INCOMPLETE",
          errorMessage: "Expected governed HTML + MARKDOWN artifacts with valid SHA-256 evidence.",
        }
      : {}),
  };
}

function catalogMatches() {
  return getPriorityNationalSourceCoverageTargets()
    .filter((target) => target.jurisdiction === "EU")
    .filter(
      (target) =>
        target.canonicalUri.includes("guidelines.euipo.europa.eu") ||
        target.canonicalUri.includes("/help-centre/"),
    )
    .map((target) => ({
      targetId: target.id,
      family: target.family,
      displayName: target.displayName,
      canonicalUri: target.canonicalUri,
      coverageTier: target.coverageTier,
      catalogState: target.catalogState,
    }));
}

async function main(): Promise<void> {
  const requestedOutput = argument("--output-dir");
  const outputRoot = requestedOutput
    ? requestedOutput
    : await mkdtemp(join(tmpdir(), "markorbit-euipo-baseline-candidates-"));
  await mkdir(outputRoot, { recursive: true });

  const results: CandidateResult[] = [];
  for (const candidate of CANDIDATES) {
    process.stdout.write(
      `${JSON.stringify({ event: "euipo-baseline-candidate.start", ...candidate })}\n`,
    );
    const result = await probe(candidate, outputRoot);
    results.push(result);
    process.stdout.write(
      `${JSON.stringify({ event: "euipo-baseline-candidate.result", ...result })}\n`,
    );
  }

  const passing = results.filter((result) => result.state === "PASS");
  const summary = {
    version: "EUIPO_BASELINE_CANDIDATE_PROBE_V1",
    observedAt: new Date().toISOString(),
    candidateCount: results.length,
    passingCount: passing.length,
    catalogMatches: catalogMatches(),
    recommendation:
      passing.find((result) => result.id === "guidelines-root")?.uri ?? passing[0]?.uri ?? null,
    results,
  };
  await writeFile(join(outputRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ event: "euipo-baseline-candidate.summary", ...summary })}\n`);

  if (passing.length === 0) {
    throw new Error(
      "No EUIPO official baseline candidate produced governed HTML + MARKDOWN evidence; keep the current BLOCKED status and investigate a compliant adapter or different official surface.",
    );
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
