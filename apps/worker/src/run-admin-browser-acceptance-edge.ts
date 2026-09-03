import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createWriteStream,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONVERSION_EXECUTION_VERSION,
  SCHEMA_V1_VERSION,
  isRawArtifact,
  isStagingDocumentDescriptor,
  type RawArtifact,
  type StagingDocumentDescriptor,
} from "@markorbit/contracts";
import {
  DEFAULT_WORKSPACE,
  SqliteSourceRepository,
  openRegistryDatabase,
} from "@markorbit/persistence";
import { SqliteRawArtifactRepository } from "@markorbit/persistence/raw-artifacts";
import { SqliteStagingContentRegistryRepository } from "@markorbit/persistence/staging-content";
import { chromium } from "playwright-core";

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const ADMIN_PORT = 3318;
const AUTH_PORT = 4318;
const ADMIN_ORIGIN = `http://127.0.0.1:${ADMIN_PORT}`;
const AUTH_ORIGIN = `http://127.0.0.1:${AUTH_PORT}`;
const WORKSPACE_ID = DEFAULT_WORKSPACE.id;
const SOURCE_ID = "src_01ARZ3NDEKTSV4RRFFQ69G5FB1";
const ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FB1";
const STAGING_ID = "std_01ARZ3NDEKTSV4RRFFQ69G5FB1";
const CONVERSION_RUN_ID = "cvr_01ARZ3NDEKTSV4RRFFQ69G5FB1";
const FIXED_TIME = "2026-09-03T12:15:00.000Z";
const SESSION_TOKEN = "browser-acceptance-edge-session-token";
const INTERNAL_SECRET = "browser-acceptance-edge-internal-secret-0000000000001";
const CSRF_SECRET = "browser-acceptance-edge-csrf-secret-00000000000000001";
const FIXTURE_TITLE = "Browser Acceptance Evidence Guide";
const FIXTURE_SOURCE_NAME = "MO Browser Acceptance Evidence Source";
const FIXTURE_PROVENANCE = "https://acceptance.example/source/evidence-guide";
const RAW_MARKER = "browser-acceptance-original-evidence-marker";

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function pnpmExecutable(): string {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function spawnLogged(
  command: string,
  args: string[],
  logPath: string,
  env: NodeJS.ProcessEnv,
): ChildProcess {
  const output = createWriteStream(logPath, { flags: "a" });
  const child = spawn(command, args, {
    cwd: REPOSITORY_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.pipe(output);
  child.stderr?.pipe(output);
  child.once("exit", (code, signal) => {
    output.end(`process.exit code=${String(code)} signal=${String(signal)}\n`);
  });
  return child;
}

async function waitForHttp(url: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastResult = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
      lastResult = String(response.status);
      if (response.ok) return;
    } catch (error) {
      lastResult = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`Timed out waiting for ${url}; last result: ${lastResult}`);
}

async function stopProcess(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolvePromise) => child.once("exit", () => resolvePromise())),
    new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 3_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

function seedFixture(databasePath: string, artifactStore: string, stagingStore: string): void {
  const database = openRegistryDatabase(databasePath);
  const clock = () => new Date(FIXED_TIME);
  const sources = new SqliteSourceRepository(database, clock, () => SOURCE_ID);
  sources.create({
    workspaceId: WORKSPACE_ID,
    name: FIXTURE_SOURCE_NAME,
    slug: "browser-acceptance-evidence-source",
    sourceType: "WEB",
    category: "OFFICIAL_GUIDANCE",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["NL"],
    languages: ["en-US"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    connectorConfig: {},
    canonicalUri: FIXTURE_PROVENANCE,
    entrypoints: [{ uri: FIXTURE_PROVENANCE, label: "Acceptance evidence source" }],
    tags: ["browser-acceptance"],
  });

  new SqliteRawArtifactRepository(database, artifactStore, clock);
  new SqliteStagingContentRegistryRepository(database, stagingStore, clock);

  const rawBytes = Buffer.from(`<html><body>${RAW_MARKER}</body></html>`, "utf8");
  const rawDigest = sha256(rawBytes);
  const rawRelativePath = join(
    "objects",
    "sha256",
    rawDigest.slice(0, 2),
    rawDigest.slice(2, 4),
    rawDigest,
  ).replaceAll("\\", "/");
  const rawPath = join(artifactStore, rawRelativePath);
  mkdirSync(dirname(rawPath), { recursive: true });
  writeFileSync(rawPath, rawBytes);

  const rawArtifact: RawArtifact = {
    schemaVersion: SCHEMA_V1_VERSION,
    objectType: "RAW_ARTIFACT",
    id: ARTIFACT_ID,
    workspaceId: WORKSPACE_ID,
    sourceId: SOURCE_ID,
    version: 1,
    artifactKind: "HTML",
    mimeType: "text/html",
    originalName: "browser-acceptance-original-evidence.html",
    canonicalUri: FIXTURE_PROVENANCE,
    storage: {
      provider: "LOCAL",
      uri: `artifact+local://sha256/${rawDigest}`,
    },
    binaryHash: { algorithm: "SHA-256", value: rawDigest },
    contentHash: { algorithm: "SHA-256", value: rawDigest },
    sizeBytes: rawBytes.byteLength,
    capturedAt: FIXED_TIME,
    collector: {
      connectorId: "crawl4ai-web",
      connectorVersion: "1.0.0",
      requestId: "browser-acceptance-edge-fixture",
    },
    provenance: { sourceUri: FIXTURE_PROVENANCE },
    status: "REGISTERED",
    createdAt: FIXED_TIME,
  };
  assert.ok(isRawArtifact(rawArtifact), "RawArtifact edge fixture must satisfy Schema v1");

  const markdown = Buffer.from(
    `# ${FIXTURE_TITLE}\n\nThis fixture exercises original evidence navigation and accessibility status.\n`,
    "utf8",
  );
  const stagingDigest = sha256(markdown);
  const stagingStorageRef = `sha256/${stagingDigest.slice(0, 2)}/${stagingDigest}.md`;
  const stagingPath = join(stagingStore, stagingStorageRef);
  mkdirSync(dirname(stagingPath), { recursive: true });
  writeFileSync(stagingPath, markdown);

  const descriptor: StagingDocumentDescriptor = {
    contractVersion: CONVERSION_EXECUTION_VERSION,
    objectType: "STAGING_DOCUMENT_DESCRIPTOR",
    id: STAGING_ID,
    workspaceId: WORKSPACE_ID,
    sourceId: SOURCE_ID,
    rawArtifactId: ARTIFACT_ID,
    conversionRunId: CONVERSION_RUN_ID,
    title: FIXTURE_TITLE,
    targetPath: "acceptance/browser-evidence-baseline.md",
    outputFormat: "MARKDOWN",
    contentHash: { algorithm: "SHA-256", value: stagingDigest },
    sizeBytes: markdown.byteLength,
    contentAddressedRef: `cas:sha256:${stagingDigest}`,
    frontmatterSummary: { fieldCount: 0, fields: [] },
    converter: { converterId: "browser-fixture", version: "1.0.0" },
    generatedAt: FIXED_TIME,
    validation: { outcome: "PASS", checks: [], warnings: [] },
    status: "READY",
  };
  assert.ok(
    isStagingDocumentDescriptor(descriptor),
    "StagingDocument edge fixture must satisfy conversion contract",
  );

  database.exec("PRAGMA foreign_keys = OFF;");
  database
    .prepare(
      `INSERT INTO content_objects (
        digest, size_bytes, relative_path, storage_uri, reference_count, created_at, verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      rawDigest,
      rawBytes.byteLength,
      rawRelativePath,
      rawArtifact.storage.uri,
      1,
      FIXED_TIME,
      FIXED_TIME,
    );
  database
    .prepare(
      `INSERT INTO raw_artifacts (
        id, workspace_id, source_id, run_id, job_id, job_attempt, execution_attempt_id,
        session_id, receipt_id, content_digest, artifact_kind, mime_type, status,
        canonical_uri, document_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      ARTIFACT_ID,
      WORKSPACE_ID,
      SOURCE_ID,
      "run_01ARZ3NDEKTSV4RRFFQ69G5FB1",
      "job_browser_acceptance_edge",
      1,
      "exa_browser_acceptance_edge",
      "ing_browser_acceptance_edge",
      "air_browser_acceptance_edge",
      rawDigest,
      rawArtifact.artifactKind,
      rawArtifact.mimeType,
      rawArtifact.status,
      rawArtifact.canonicalUri ?? null,
      JSON.stringify(rawArtifact),
      FIXED_TIME,
    );
  database
    .prepare(
      `INSERT INTO staging_content_objects (
        sha256, size_bytes, media_type, storage_ref, created_at
      ) VALUES (?, ?, 'text/markdown', ?, ?)`,
    )
    .run(stagingDigest, markdown.byteLength, stagingStorageRef, FIXED_TIME);
  database
    .prepare(
      `INSERT INTO staging_documents (
        id, workspace_id, source_id, raw_artifact_id, conversion_run_id, target_path,
        content_sha256, size_bytes, status, document_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      STAGING_ID,
      WORKSPACE_ID,
      SOURCE_ID,
      ARTIFACT_ID,
      CONVERSION_RUN_ID,
      descriptor.targetPath,
      stagingDigest,
      markdown.byteLength,
      descriptor.status,
      JSON.stringify(descriptor),
      FIXED_TIME,
      FIXED_TIME,
    );
  database.exec("PRAGMA foreign_keys = ON;");
  database.close();
}

async function main(): Promise<void> {
  const runRoot = mkdtempSync(join(tmpdir(), "markorbit-admin-browser-acceptance-edge-"));
  const diagnosticsDirectory = resolve(
    process.env.MARKORBIT_ADMIN_BROWSER_ACCEPTANCE_EDGE_ARTIFACTS ??
      join(REPOSITORY_ROOT, "artifacts", "admin-browser-acceptance-edge"),
  );
  rmSync(diagnosticsDirectory, { recursive: true, force: true });
  mkdirSync(diagnosticsDirectory, { recursive: true });

  const databasePath = join(runRoot, "knowledge.sqlite");
  const artifactStore = join(runRoot, "artifacts");
  const stagingStore = join(runRoot, "staging");
  seedFixture(databasePath, artifactStore, stagingStore);

  const childEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    MARKORBIT_REPOSITORY_ROOT: REPOSITORY_ROOT,
    MARKORBIT_KNOWLEDGE_DB_PATH: databasePath,
    MARKORBIT_ARTIFACT_STORE_PATH: artifactStore,
    MARKORBIT_STAGING_STORE_PATH: stagingStore,
    MARKORBIT_CORE_AUTH_URL: AUTH_ORIGIN,
    MARKORBIT_CORE_INTERNAL_SECRET: INTERNAL_SECRET,
    MO_INTERNAL_SERVICE_SECRET: INTERNAL_SECRET,
    MARKORBIT_ADMIN_CSRF_SECRET: CSRF_SECRET,
    MARKORBIT_ADMIN_ORIGINS: ADMIN_ORIGIN,
    MARKORBIT_CALIBRATION_CORE_AUTH_PORT: String(AUTH_PORT),
    MARKORBIT_CALIBRATION_SESSION_TOKEN: SESSION_TOKEN,
    MARKORBIT_CALIBRATION_SESSION_ID: "ses_browser_acceptance_edge",
    MARKORBIT_CALIBRATION_USER_ID: "usr_browser_acceptance_edge",
    MARKORBIT_CALIBRATION_WORKSPACE_ID: WORKSPACE_ID,
    MARKORBIT_CALIBRATION_MEMBERSHIP_ID: "mem_browser_acceptance_edge",
  };

  let authProcess: ChildProcess | null = null;
  let adminProcess: ChildProcess | null = null;
  const browser = await chromium.launch({ headless: true });
  try {
    authProcess = spawnLogged(
      process.execPath,
      [join(REPOSITORY_ROOT, "scripts", "admin-browser-calibration-core-auth-stub.mjs")],
      join(diagnosticsDirectory, "core-auth.log"),
      childEnvironment,
    );
    await waitForHttp(`${AUTH_ORIGIN}/health`, 30_000);

    adminProcess = spawnLogged(
      pnpmExecutable(),
      [
        "--filter",
        "@markorbit/admin",
        "exec",
        "next",
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(ADMIN_PORT),
      ],
      join(diagnosticsDirectory, "admin.log"),
      childEnvironment,
    );
    await waitForHttp(`${ADMIN_ORIGIN}/dashboard`, 90_000);

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies([
      {
        name: "mo_session",
        value: SESSION_TOKEN,
        url: ADMIN_ORIGIN,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = await context.newPage();

    try {
      const knowledgeResponse = page.waitForResponse(
        (response) => response.url().includes("/api/knowledge?") && response.status() === 200,
      );
      await page.goto(`${ADMIN_ORIGIN}/knowledge`);
      await knowledgeResponse;
      await page.getByText(FIXTURE_TITLE, { exact: true }).waitFor();

      assert.equal(
        await page.getByRole("textbox", { name: /Search|搜索/ }).count(),
        1,
        "Knowledge search must have an accessible name",
      );
      assert.equal(
        await page.getByRole("combobox", { name: /Source|来源/ }).count(),
        1,
        "Source filter must have an accessible name",
      );
      assert.equal(
        await page.getByRole("combobox", { name: /Jurisdiction|国家|地区/ }).count(),
        1,
        "Jurisdiction filter must have an accessible name",
      );
      assert.equal(
        await page.getByRole("combobox", { name: /Type|类型/ }).count(),
        1,
        "Type filter must have an accessible name",
      );
      await page
        .getByRole("status")
        .filter({ hasText: /Loaded 1|已载入 1/ })
        .waitFor();

      await page.getByRole("button", { name: /View document|查看资料/ }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      const originalEvidence = dialog.getByRole("link", {
        name: /Open original file|打开原始文件/,
      });
      assert.equal(
        await originalEvidence.getAttribute("href"),
        `/api/artifacts/${ARTIFACT_ID}/content`,
        "Original evidence link must target the canonical authenticated content route",
      );
      const downloadPromise = page.waitForEvent("download");
      await originalEvidence.click();
      const download = await downloadPromise;
      assert.equal(
        download.suggestedFilename(),
        "browser-acceptance-original-evidence.html",
        "Original evidence download must retain its governed filename",
      );
      const downloadedPath = await download.path();
      assert.ok(downloadedPath, "Original evidence download must produce local bytes");
      assert.match(readFileSync(downloadedPath, "utf8"), new RegExp(RAW_MARKER));
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });

      await page.route("**/api/knowledge?**", async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { message: "Browser acceptance forced failure" } }),
        });
      });
      await page.getByRole("button", { name: /Refresh|刷新/ }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Browser acceptance forced failure" })
        .waitFor();
      await page.unroute("**/api/knowledge?**");

      await page.goto(`${ADMIN_ORIGIN}/workers/new`);
      await page.getByLabel("显示名称").fill("Rejected Browser Acceptance Worker");
      let workerPostCount = 0;
      page.on("request", (request) => {
        if (request.method() === "POST" && request.url() === `${ADMIN_ORIGIN}/api/workers`) {
          workerPostCount += 1;
        }
      });
      await page.route("**/api/admin-session", async (route) => {
        const response = await route.fetch();
        const body = (await response.json()) as Record<string, unknown>;
        await route.fulfill({
          response,
          json: { ...body, csrfToken: "invalid-browser-acceptance-token" },
        });
      });
      const rejectedMutation = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url() === `${ADMIN_ORIGIN}/api/workers`,
      );
      await page.getByRole("button", { name: "保存 Worker" }).click();
      const rejectedResponse = await rejectedMutation;
      assert.equal(rejectedResponse.status(), 403, "Invalid CSRF mutation must fail closed");
      await page.getByText("CSRF token is invalid.", { exact: true }).waitFor();
      await page.waitForTimeout(300);
      assert.equal(workerPostCount, 1, "Rejected mutation must not be silently retried");
      assert.equal(new URL(page.url()).pathname, "/workers/new");
      assert.equal(await page.getByText("一次性 Worker 凭证", { exact: true }).count(), 0);
      await page.unroute("**/api/admin-session");

      await page.screenshot({
        path: join(diagnosticsDirectory, "edge-success.png"),
        fullPage: true,
      });
      writeFileSync(
        join(diagnosticsDirectory, "summary.json"),
        `${JSON.stringify(
          {
            schemaVersion: 1,
            status: "PASS",
            originalEvidenceDownload: true,
            labelledCriticalControls: true,
            accessibleErrorAndSuccessStatus: true,
            invalidCsrfSurfaced: true,
            rejectedMutationRetries: 0,
            paidProviderCalls: false,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      process.stdout.write("admin-browser-acceptance-edge: PASS\n");
    } catch (error) {
      await page.screenshot({
        path: join(diagnosticsDirectory, "edge-failure.png"),
        fullPage: true,
      });
      writeFileSync(
        join(diagnosticsDirectory, "summary.json"),
        `${JSON.stringify(
          {
            schemaVersion: 1,
            status: "FAIL",
            message: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      throw error;
    } finally {
      await context.tracing.stop({ path: join(diagnosticsDirectory, "edge-trace.zip") });
      await context.close();
    }
  } finally {
    await browser.close();
    await stopProcess(adminProcess);
    await stopProcess(authProcess);
    rmSync(runRoot, { recursive: true, force: true });
  }
}

await main();
