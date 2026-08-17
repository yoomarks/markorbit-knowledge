import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getRepresentativeSourceLiveCanaries,
  type RepresentativeSourceLiveCanary,
} from "@markorbit/persistence/representative-source-live-canaries";

type CrawlSuccess = {
  protocolVersion: string;
  ok: true;
  artifacts: Array<{
    artifactKind: string;
    mimeType: string;
    sourceUri: string;
    canonicalUri: string;
    sizeBytes: number;
    sha256: string;
  }>;
  pagesAttempted: number;
  attachmentsAttempted: number;
  totalBytes: number;
};

type CrawlFailure = {
  protocolVersion: string;
  ok: false;
  error: { code: string; message: string; retryable: boolean };
};

type CrawlResponse = CrawlSuccess | CrawlFailure;

type CanaryObservation = {
  jurisdiction: string;
  displayName: string;
  profile: string;
  targetId: string;
  family: string;
  requestedUri: string;
  renderJavascript: boolean;
  elapsedMs: number;
  state: "PASS" | "FAIL";
  pagesAttempted: number;
  artifactCount: number;
  artifactKinds: string[];
  finalUris: string[];
  totalBytes: number;
  errorCode?: string;
  errorMessage?: string;
  stderrTail?: string;
};

function argument(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function boundedInteger(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Expected integer ${min}..${max}, got ${raw}`);
  }
  return value;
}

function selectedCanaries(): RepresentativeSourceLiveCanary[] {
  const jurisdiction = argument("--jurisdiction")?.trim().toUpperCase();
  const canaries = getRepresentativeSourceLiveCanaries();
  if (!jurisdiction) return canaries;
  const selected = canaries.filter((canary) => canary.jurisdiction === jurisdiction);
  if (selected.length === 0) throw new Error(`Unknown representative canary jurisdiction ${jurisdiction}`);
  return selected;
}

function crawlScriptPath(): string {
  const override = process.env.MARKORBIT_CRAWL4AI_SCRIPT?.trim();
  if (override) return override;
  return fileURLToPath(new URL("../../../workers/crawl4ai/acquire.py", import.meta.url));
}

function pythonExecutable(): string {
  return process.env.MARKORBIT_CRAWL4AI_PYTHON?.trim() || "python";
}

async function runSubprocess(
  canary: RepresentativeSourceLiveCanary,
  outputDirectory: string,
  timeoutSeconds: number,
): Promise<{ response: CrawlResponse; stderr: string; elapsedMs: number }> {
  const request = {
    protocolVersion: "1.0",
    outputDirectory,
    startUrls: [canary.canonicalUri],
    outputKinds: ["HTML", "MARKDOWN"],
    maxDepth: 0,
    maxItems: 1,
    renderJavascript: canary.renderJavascript,
    fetchAttachments: false,
    respectRobots: true,
    rateLimitPerMinute: 6,
    timeoutSeconds,
    includePatterns: [canary.canonicalUri],
    excludePatterns: [],
    locale: canary.languages[0] ?? "en",
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
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Crawl4AI canary timed out after ${timeoutSeconds + 30}s`));
    }, (timeoutSeconds + 30) * 1000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  if (exitCode !== 0) throw new Error(`Crawl4AI subprocess exited with ${exitCode}`);
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error("Crawl4AI subprocess emitted no JSON response");
  return {
    response: JSON.parse(trimmed) as CrawlResponse,
    stderr,
    elapsedMs: Date.now() - startedAt,
  };
}

function stderrTail(stderr: string): string | undefined {
  const normalized = stderr.trim();
  if (!normalized) return undefined;
  return normalized.slice(-1200);
}

async function observeCanary(
  canary: RepresentativeSourceLiveCanary,
  root: string,
  timeoutSeconds: number,
): Promise<CanaryObservation> {
  const outputDirectory = join(root, canary.jurisdiction.toLowerCase());
  await mkdir(outputDirectory, { recursive: true });
  const startedAt = Date.now();
  try {
    const { response, stderr, elapsedMs } = await runSubprocess(
      canary,
      outputDirectory,
      timeoutSeconds,
    );
    const tail = stderrTail(stderr);
    if (!response.ok) {
      return {
        jurisdiction: canary.jurisdiction,
        displayName: canary.displayName,
        profile: canary.profile,
        targetId: canary.targetId,
        family: canary.family,
        requestedUri: canary.canonicalUri,
        renderJavascript: canary.renderJavascript,
        elapsedMs,
        state: "FAIL",
        pagesAttempted: 0,
        artifactCount: 0,
        artifactKinds: [],
        finalUris: [],
        totalBytes: 0,
        errorCode: response.error.code,
        errorMessage: response.error.message,
        ...(tail ? { stderrTail: tail } : {}),
      };
    }
    const artifactKinds = [...new Set(response.artifacts.map((artifact) => artifact.artifactKind))].sort();
    const finalUris = [...new Set(response.artifacts.map((artifact) => artifact.canonicalUri))].sort();
    const hasHtml = artifactKinds.includes("HTML");
    const hasMarkdown = artifactKinds.includes("MARKDOWN");
    const validHashes = response.artifacts.every((artifact) => /^[a-f0-9]{64}$/u.test(artifact.sha256));
    const passed = response.artifacts.length >= 2 && hasHtml && hasMarkdown && validHashes;
    return {
      jurisdiction: canary.jurisdiction,
      displayName: canary.displayName,
      profile: canary.profile,
      targetId: canary.targetId,
      family: canary.family,
      requestedUri: canary.canonicalUri,
      renderJavascript: canary.renderJavascript,
      elapsedMs,
      state: passed ? "PASS" : "FAIL",
      pagesAttempted: response.pagesAttempted,
      artifactCount: response.artifacts.length,
      artifactKinds,
      finalUris,
      totalBytes: response.totalBytes,
      ...(!passed
        ? {
            errorCode: "CANARY_EVIDENCE_INCOMPLETE",
            errorMessage: "Expected governed HTML + MARKDOWN artifacts with valid SHA-256 evidence.",
          }
        : {}),
      ...(tail ? { stderrTail: tail } : {}),
    };
  } catch (error) {
    return {
      jurisdiction: canary.jurisdiction,
      displayName: canary.displayName,
      profile: canary.profile,
      targetId: canary.targetId,
      family: canary.family,
      requestedUri: canary.canonicalUri,
      renderJavascript: canary.renderJavascript,
      elapsedMs: Date.now() - startedAt,
      state: "FAIL",
      pagesAttempted: 0,
      artifactCount: 0,
      artifactKinds: [],
      finalUris: [],
      totalBytes: 0,
      errorCode: "CANARY_RUNNER_FAILED",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

function markdownReport(observations: CanaryObservation[]): string {
  const passed = observations.filter((item) => item.state === "PASS").length;
  const failed = observations.length - passed;
  const lines = [
    "# MarkOrbit Representative Source Live Canary",
    "",
    `Observed: ${new Date().toISOString()}`,
    `Result: ${passed}/${observations.length} PASS, ${failed} FAIL`,
    "",
    "| Jurisdiction | Profile | Target | JS | State | Artifacts | Time | Signal |",
    "|---|---|---|---:|---|---:|---:|---|",
  ];
  for (const item of observations) {
    const signal =
      item.state === "PASS"
        ? item.finalUris.join("<br>")
        : `${item.errorCode ?? "FAILED"}: ${(item.errorMessage ?? "").replaceAll("|", "\\|")}`;
    lines.push(
      `| ${item.jurisdiction} | ${item.profile} | ${item.targetId} | ${item.renderJavascript ? "yes" : "no"} | ${item.state} | ${item.artifactCount} | ${(item.elapsedMs / 1000).toFixed(1)}s | ${signal} |`,
    );
  }
  lines.push(
    "",
    "Failures are observations of the real external source boundary; they do not mutate Source Registry or start production collection.",
    "",
  );
  return lines.join("\n");
}

async function main(): Promise<void> {
  const timeoutSeconds = boundedInteger(
    argument("--timeout-seconds") ?? process.env.MARKORBIT_LIVE_CANARY_TIMEOUT_SECONDS,
    75,
    15,
    180,
  );
  const strict = process.argv.includes("--strict") || process.env.MARKORBIT_LIVE_CANARY_STRICT === "1";
  const requestedOutput = argument("--output-dir") ?? process.env.MARKORBIT_LIVE_CANARY_OUTPUT_DIR;
  const outputRoot = requestedOutput
    ? requestedOutput
    : await mkdtemp(join(tmpdir(), "markorbit-live-canary-"));
  await mkdir(outputRoot, { recursive: true });

  const observations: CanaryObservation[] = [];
  for (const canary of selectedCanaries()) {
    process.stdout.write(
      `${JSON.stringify({ event: "representative-live-canary.start", jurisdiction: canary.jurisdiction, targetId: canary.targetId, uri: canary.canonicalUri })}\n`,
    );
    const observation = await observeCanary(canary, outputRoot, timeoutSeconds);
    observations.push(observation);
    process.stdout.write(`${JSON.stringify({ event: "representative-live-canary.result", ...observation })}\n`);
  }

  const summary = {
    version: "REPRESENTATIVE_SOURCE_LIVE_CANARY_RESULT_V1",
    observedAt: new Date().toISOString(),
    strict,
    total: observations.length,
    passed: observations.filter((item) => item.state === "PASS").length,
    failed: observations.filter((item) => item.state === "FAIL").length,
    observations,
  };
  const jsonPath = join(outputRoot, "summary.json");
  const markdownPath = join(outputRoot, "summary.md");
  await writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, markdownReport(observations), "utf8");
  process.stdout.write(
    `${JSON.stringify({ event: "representative-live-canary.summary", jsonPath, markdownPath, ...summary })}\n`,
  );

  if (strict && summary.failed > 0) process.exitCode = 1;

  await readFile(jsonPath, "utf8");
  await readFile(markdownPath, "utf8");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
