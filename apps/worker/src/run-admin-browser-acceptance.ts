import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  createWriteStream,
  mkdirSync,
  mkdtempSync,
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
import { chromium, type BrowserContext, type Page } from "playwright-core";

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const ADMIN_PORT = 3317;
const AUTH_PORT = 4317;
const ADMIN_ORIGIN = `http://127.0.0.1:${ADMIN_PORT}`;
const AUTH_ORIGIN = `http://127.0.0.1:${AUTH_PORT}`;
const WORKSPACE_ID = DEFAULT_WORKSPACE.id;
const OTHER_WORKSPACE_ID = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FB0";
const SOURCE_ID = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ARTIFACT_ID = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const STAGING_ID = "std_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const CONVERSION_RUN_ID = "cvr_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const FIXED_TIME = "2026-09-03T12:00:00.000Z";
const SESSION_TOKEN = "browser-acceptance-session-token";
const INTERNAL_SECRET = "browser-acceptance-internal-secret-0000000000000001";
const CSRF_SECRET = "browser-acceptance-csrf-secret-0000000000000000001";
const FIXTURE_TITLE = "Browser Acceptance Official Guide";
const FIXTURE_SOURCE_NAME = "MO Browser Acceptance Source";
const FIXTURE_PROVENANCE = "https://acceptance.example/source/official-guide";
const FIXTURE_CONTENT_MARKER = "browser-acceptance-provenance-marker";

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function browserExecutable(): string {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function appendDiagnostic(path: string, value: string): void {
  appendFileSync(path, `${new Date().toISOString()} ${value}\n`, "utf8");
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
  let lastStatus = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
      lastStatus = String(response.status);
      if (response.ok) return;
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`Timed out waiting for ${url}; last result: ${lastStatus}`);
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
    slug: "browser-acceptance-source",
    sourceType: "WEB",
    category: "OFFICIAL_GUIDANCE",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["NL"],
    languages: ["en-US"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    connectorConfig: {},
    canonicalUri: FIXTURE_PROVENANCE,
    entrypoints: [{ uri: FIXTURE_PROVENANCE, label: "Acceptance source" }],
    tags: ["browser-acceptance"],
  });

  new SqliteRawArtifactRepository(database, artifactStore, clock);
  new SqliteStagingContentRegistryRepository(database, stagingStore, clock);

  const rawBytes = Buffer.from("<html><body>Browser acceptance raw evidence</body></html>", "utf8");
  const rawDigest = sha256(rawBytes);
  const rawRelativePath = join(
    "objects",
    "sha256",
    rawDigest.slice(0, 2),
    rawDigest.slice(2, 4),
    rawDigest,
  ).replaceAll("\\", "/");
  const rawArtifact: RawArtifact = {
    schemaVersion: SCHEMA_V1_VERSION,
    objectType: "RAW_ARTIFACT",
    id: ARTIFACT_ID,
    workspaceId: WORKSPACE_ID,
    sourceId: SOURCE_ID,
    version: 1,
    artifactKind: "HTML",
    mimeType: "text/html",
    originalName: "browser-acceptance-official-guide.html",
    canonicalUri: FIXTURE_PROVENANCE,
    storage: {
      provider: "LOCAL",
      uri: `artifact+local://sha256/${rawDigest}`,
    },
    binaryHash: { algorithm: "SHA-256", value: rawDigest },
    contentHash: { algorithm: "SHA-256", value: rawDigest },
    sizeBytes: rawBytes.byteLength,
    capturedAt: FIXED_TIME,
    publishedAt: "2026-09-01T09:00:00.000Z",
    collector: {
      connectorId: "crawl4ai-web",
      connectorVersion: "1.0.0",
      requestId: "browser-acceptance-fixture",
    },
    provenance: { sourceUri: FIXTURE_PROVENANCE },
    status: "REGISTERED",
    createdAt: FIXED_TIME,
  };
  assert.ok(isRawArtifact(rawArtifact), "RawArtifact fixture must satisfy Schema v1");

  const markdown = Buffer.from(
    `# ${FIXTURE_TITLE}\n\n${FIXTURE_CONTENT_MARKER}\n\nThis document proves real Knowledge provenance rendering.\n`,
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
    targetPath: "acceptance/browser-baseline.md",
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
    "StagingDocument fixture must satisfy conversion contract",
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
      "run_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "job_browser_acceptance",
      1,
      "exa_browser_acceptance",
      "ing_browser_acceptance",
      "air_browser_acceptance",
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

function attachPageDiagnostics(page: Page, logPath: string, label: string): void {
  page.on("console", (message) =>
    appendDiagnostic(logPath, `${label}.console ${message.type()} ${message.text()}`),
  );
  page.on("pageerror", (error) => appendDiagnostic(logPath, `${label}.pageerror ${error.message}`));
  page.on("requestfailed", (request) =>
    appendDiagnostic(
      logPath,
      `${label}.requestfailed ${request.method()} ${request.url()} ${request.failure()?.errorText ?? "unknown"}`,
    ),
  );
}

async function authenticatedContext(viewport: {
  width: number;
  height: number;
}): Promise<BrowserContext> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport });
  context.on("close", () => void browser.close());
  await context.addCookies([
    {
      name: "mo_session",
      value: SESSION_TOKEN,
      url: ADMIN_ORIGIN,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return context;
}

async function assertAuthenticationBoundary(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const unauthenticated = await browser.newContext();
  try {
    const response = await unauthenticated.request.get(`${ADMIN_ORIGIN}/api/admin-session`);
    assert.equal(response.status(), 401, "unauthenticated Admin session must fail closed");
  } finally {
    await unauthenticated.close();
    await browser.close();
  }

  const context = await authenticatedContext({ width: 1440, height: 1000 });
  try {
    const sessionResponse = await context.request.get(`${ADMIN_ORIGIN}/api/admin-session`);
    assert.equal(sessionResponse.status(), 200, "authenticated Admin session must resolve");
    const session = (await sessionResponse.json()) as {
      authenticated?: boolean;
      userId?: string;
      csrfToken?: string;
      workspaces?: Array<{ workspaceId?: string }>;
    };
    assert.equal(session.authenticated, true);
    assert.ok(session.userId);
    assert.ok(session.csrfToken);
    assert.ok(session.workspaces?.some((workspace) => workspace.workspaceId === WORKSPACE_ID));

    const mismatch = await context.request.get(
      `${ADMIN_ORIGIN}/api/knowledge?workspaceId=${OTHER_WORKSPACE_ID}`,
    );
    assert.equal(mismatch.status(), 403, "cross-workspace assertion must fail closed");
  } finally {
    await context.close();
  }
}

async function navigateThroughBusinessSurfaces(page: Page): Promise<void> {
  await page.goto(`${ADMIN_ORIGIN}/dashboard`);
  await page.waitForLoadState("domcontentloaded");

  for (const href of ["/sources", "/jobs", "/runs", "/workers", "/connectors", "/packages"]) {
    const link = page.locator(`a[href="${href}"]`).first();
    if (!(await link.isVisible())) {
      const advanced = page.getByRole("button", { name: /Advanced|高级/ });
      assert.ok(await advanced.isVisible(), `Advanced navigation must expose ${href}`);
      if ((await advanced.getAttribute("aria-expanded")) !== "true") await advanced.click();
    }
    await link.click();
    await page.waitForURL((url) => url.pathname === href);
    assert.equal(new URL(page.url()).pathname, href);
  }
}

async function waitForKnowledgeRefresh(page: Page, action: () => Promise<void>): Promise<void> {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url().includes("/api/knowledge?") &&
      response.status() === 200,
  );
  await action();
  await responsePromise;
}

async function assertKnowledgeJourney(page: Page): Promise<void> {
  const initialResponse = page.waitForResponse(
    (response) => response.url().includes("/api/knowledge?") && response.status() === 200,
  );
  await page.goto(`${ADMIN_ORIGIN}/knowledge`);
  await initialResponse;
  await page.getByText(FIXTURE_TITLE, { exact: true }).waitFor();

  const search = page.locator('input[type="text"]').first();
  await waitForKnowledgeRefresh(page, () => search.fill("Browser Acceptance"));
  const filters = page.locator("select");
  assert.equal(await filters.count(), 4, "Knowledge Browser filter set must remain stable");
  await waitForKnowledgeRefresh(page, () => filters.nth(0).selectOption(SOURCE_ID));
  await waitForKnowledgeRefresh(page, () => filters.nth(1).selectOption("NL"));
  await waitForKnowledgeRefresh(page, () => filters.nth(2).selectOption("HTML"));
  await waitForKnowledgeRefresh(page, () => filters.nth(3).selectOption("READY"));
  await page.getByText(FIXTURE_SOURCE_NAME, { exact: true }).waitFor();

  const trigger = page.getByRole("button", { name: /View document|查看资料/ });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await page.getByText(FIXTURE_CONTENT_MARKER, { exact: false }).waitFor();
  await page.getByText(FIXTURE_PROVENANCE, { exact: true }).waitFor();
  assert.equal(await dialog.getAttribute("aria-modal"), "true");

  const closeButton = dialog.getByRole("button", { name: /Close|关闭/ });
  assert.ok(
    await closeButton.evaluate((element) => element === document.activeElement),
    "Knowledge dialog must place initial focus on its close control",
  );
  await page.keyboard.press("Shift+Tab");
  assert.ok(
    await dialog.evaluate((element) => element.contains(document.activeElement)),
    "Knowledge dialog must trap reverse-tab focus",
  );
  await page.keyboard.press("Tab");
  assert.ok(
    await dialog.evaluate((element) => element.contains(document.activeElement)),
    "Knowledge dialog must trap forward-tab focus",
  );
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  assert.ok(
    await trigger.evaluate((element) => element === document.activeElement),
    "Knowledge dialog must return focus to its trigger",
  );
}

async function assertRealMutation(page: Page): Promise<void> {
  await page.goto(`${ADMIN_ORIGIN}/workers/new`);
  await page.getByLabel("显示名称").fill("Browser Acceptance Worker");
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && response.url() === `${ADMIN_ORIGIN}/api/workers`,
  );
  await page.getByRole("button", { name: "保存 Worker" }).click();
  const response = await responsePromise;
  assert.ok(
    response.status() >= 200 && response.status() < 300,
    `Worker mutation failed: ${response.status()}`,
  );
  await page.waitForURL((url) => /^\/workers\/wrk_[0-9A-HJKMNP-TV-Z]{26}$/.test(url.pathname));
  await page.getByText("一次性 Worker 凭证", { exact: true }).waitFor();
  await page.getByDisplayValue("Browser Acceptance Worker").waitFor();
}

async function assertMobileNavigation(page: Page): Promise<void> {
  await page.goto(`${ADMIN_ORIGIN}/knowledge`);
  const menu = page.locator('button[aria-controls="admin-mobile-navigation"]');
  await menu.click();
  let dialog = page.getByRole("dialog", { name: /Main navigation|主导航/ });
  await dialog.waitFor();
  assert.equal(await menu.getAttribute("aria-expanded"), "true");
  assert.ok(
    await dialog
      .getByRole("button", { name: /Close|关闭/ })
      .evaluate((element) => element === document.activeElement),
    "mobile navigation must focus its close control",
  );

  await page.keyboard.press("Shift+Tab");
  assert.ok(
    await dialog.evaluate((element) => element.contains(document.activeElement)),
    "mobile navigation must trap focus",
  );

  await page.mouse.click(330, 420);
  await dialog.waitFor({ state: "detached" });
  assert.equal(await menu.getAttribute("aria-expanded"), "false");

  await menu.click();
  dialog = page.getByRole("dialog", { name: /Main navigation|主导航/ });
  await dialog.waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  assert.ok(
    await menu.evaluate((element) => element === document.activeElement),
    "mobile navigation must return focus to menu trigger",
  );
}

async function runContext(
  diagnosticsDirectory: string,
  logPath: string,
  label: string,
  viewport: { width: number; height: number },
  test: (page: Page) => Promise<void>,
): Promise<void> {
  const context = await authenticatedContext(viewport);
  const page = await context.newPage();
  attachPageDiagnostics(page, logPath, label);
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  try {
    await test(page);
    await page.screenshot({
      path: join(diagnosticsDirectory, `${label}-success.png`),
      fullPage: true,
    });
  } catch (error) {
    await page.screenshot({
      path: join(diagnosticsDirectory, `${label}-failure.png`),
      fullPage: true,
    });
    throw error;
  } finally {
    await context.tracing.stop({ path: join(diagnosticsDirectory, `${label}-trace.zip`) });
    await context.close();
  }
}

async function main(): Promise<void> {
  const runRoot = mkdtempSync(join(tmpdir(), "markorbit-admin-browser-acceptance-"));
  const diagnosticsDirectory = resolve(
    process.env.MARKORBIT_ADMIN_BROWSER_ACCEPTANCE_ARTIFACTS ??
      join(REPOSITORY_ROOT, "artifacts", "admin-browser-acceptance"),
  );
  rmSync(diagnosticsDirectory, { recursive: true, force: true });
  mkdirSync(diagnosticsDirectory, { recursive: true });
  const browserLog = join(diagnosticsDirectory, "browser.log");
  const authLog = join(diagnosticsDirectory, "core-auth.log");
  const adminLog = join(diagnosticsDirectory, "admin.log");
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
    MARKORBIT_CALIBRATION_SESSION_ID: "ses_browser_acceptance",
    MARKORBIT_CALIBRATION_USER_ID: "usr_browser_acceptance",
    MARKORBIT_CALIBRATION_WORKSPACE_ID: WORKSPACE_ID,
    MARKORBIT_CALIBRATION_MEMBERSHIP_ID: "mem_browser_acceptance",
  };

  let authProcess: ChildProcess | null = null;
  let adminProcess: ChildProcess | null = null;
  try {
    authProcess = spawnLogged(
      process.execPath,
      [join(REPOSITORY_ROOT, "scripts", "admin-browser-calibration-core-auth-stub.mjs")],
      authLog,
      childEnvironment,
    );
    await waitForHttp(`${AUTH_ORIGIN}/health`, 30_000);

    adminProcess = spawnLogged(
      browserExecutable(),
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
      adminLog,
      childEnvironment,
    );
    await waitForHttp(`${ADMIN_ORIGIN}/dashboard`, 90_000);

    await assertAuthenticationBoundary();
    await runContext(
      diagnosticsDirectory,
      browserLog,
      "desktop-critical-journey",
      { width: 1440, height: 1000 },
      async (page) => {
        await navigateThroughBusinessSurfaces(page);
        await assertKnowledgeJourney(page);
        await assertRealMutation(page);
      },
    );
    await runContext(
      diagnosticsDirectory,
      browserLog,
      "narrow-navigation",
      { width: 390, height: 844 },
      assertMobileNavigation,
    );

    writeFileSync(
      join(diagnosticsDirectory, "summary.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          status: "PASS",
          workspaceId: WORKSPACE_ID,
          sourceId: SOURCE_ID,
          stagingDocumentId: STAGING_ID,
          browser: "chromium",
          viewports: ["1440x1000", "390x844"],
          boundaries: {
            canonicalAdminSession: true,
            unauthenticatedFailClosed: true,
            workspaceMismatchFailClosed: true,
            realMutation: "worker-create",
            paidProviderCalls: false,
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    process.stdout.write("admin-browser-acceptance: PASS\n");
  } catch (error) {
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
    await stopProcess(adminProcess);
    await stopProcess(authProcess);
    rmSync(runRoot, { recursive: true, force: true });
  }
}

await main();
