import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import process from "node:process";

const root = process.cwd();
const expectedVersion = process.env.MARKORBIT_KNOWLEDGE_RELEASE_VERSION ?? "0.1.0";
const failures = [];
const checks = [];

function pass(message) {
  checks.push(message);
}

function fail(message) {
  failures.push(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function requireFile(path) {
  if (!existsSync(join(root, path))) {
    fail(`missing required release file: ${path}`);
    return false;
  }
  pass(`required file present: ${path}`);
  return true;
}

function collectPackageJsons(directory, output = []) {
  const absolute = join(root, directory);
  if (!existsSync(absolute)) return output;
  for (const entry of readdirSync(absolute)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const child = join(absolute, entry);
    const stats = statSync(child);
    if (stats.isDirectory()) {
      const candidate = join(child, "package.json");
      if (existsSync(candidate)) output.push(relative(root, candidate));
      collectPackageJsons(relative(root, child), output);
    }
  }
  return output;
}

const rootPackage = readJson("package.json");
if (rootPackage.version !== expectedVersion) {
  fail(`root package version ${rootPackage.version} does not match release ${expectedVersion}`);
} else {
  pass(`root package version is ${expectedVersion}`);
}
if (rootPackage.private !== true) fail("root package must remain private");
else pass("root package remains private");
if (rootPackage.packageManager !== "pnpm@11.13.0") {
  fail(`packageManager must remain pnpm@11.13.0, found ${rootPackage.packageManager}`);
} else {
  pass("package manager is pinned to pnpm@11.13.0");
}
if (rootPackage.engines?.node !== ">=22 <25") {
  fail(`Node engine must remain >=22 <25, found ${rootPackage.engines?.node ?? "missing"}`);
} else {
  pass("Node support boundary remains >=22 <25");
}

const workspacePackages = [...new Set([
  ...collectPackageJsons("apps"),
  ...collectPackageJsons("packages"),
])].sort();
for (const path of workspacePackages) {
  const pkg = readJson(path);
  if (pkg.version !== expectedVersion) {
    fail(`${path} version ${pkg.version ?? "missing"} does not match ${expectedVersion}`);
  }
}
if (!workspacePackages.length) fail("no workspace packages discovered");
else if (!failures.some((item) => item.includes("does not match") && item.includes("package.json"))) {
  pass(`${workspacePackages.length} workspace package versions match ${expectedVersion}`);
}

const requiredFiles = [
  "README.md",
  "CHANGELOG.md",
  "docs/release/KNOWLEDGE_V0_1_RELEASE_READINESS_2026-08-12.md",
  "docs/release/KNOWLEDGE_V0_1_RELEASE_CLOSEOUT_2026-08-12.md",
  "docs/operations/KNOWLEDGE_V0_1_BACKUP_RESTORE.md",
  ".github/workflows/release-candidate.yml",
];
for (const path of requiredFiles) requireFile(path);

const textAssertions = [
  ["README.md", `Repository package version: **${expectedVersion}**`],
  ["README.md", "freeze-ready"],
  ["docs/release/KNOWLEDGE_V0_1_RELEASE_READINESS_2026-08-12.md", `Release line: repository package version \`${expectedVersion}\``],
  ["CHANGELOG.md", `## [${expectedVersion}] - 2026-08-12`],
  ["docs/release/KNOWLEDGE_V0_1_RELEASE_CLOSEOUT_2026-08-12.md", `Release version: \`${expectedVersion}\``],
];
for (const [path, expected] of textAssertions) {
  if (!existsSync(join(root, path))) continue;
  const text = readFileSync(join(root, path), "utf8");
  if (!text.includes(expected)) fail(`${path} is missing release marker: ${expected}`);
  else pass(`${path} release marker is consistent`);
}

const workflowDirectory = join(root, ".github/workflows");
for (const entry of readdirSync(workflowDirectory)) {
  if (/once|temporary|formatter|patch/i.test(basename(entry))) {
    fail(`temporary development workflow must not ship in a release: ${entry}`);
  }
}
pass("no temporary formatter/patch workflow names are present");

let trackedFiles = [];
try {
  trackedFiles = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split(/\r?\n/u)
    .filter(Boolean);
} catch (error) {
  fail(`unable to inspect tracked files: ${error instanceof Error ? error.message : String(error)}`);
}
const forbiddenTracked = trackedFiles.filter(
  (path) =>
    path === ".env" ||
    path.startsWith(".data/") ||
    path.includes("/__pycache__/") ||
    path.endsWith(".pyc"),
);
if (forbiddenTracked.length) {
  fail(`release contains forbidden runtime/generated files: ${forbiddenTracked.join(", ")}`);
} else {
  pass("no runtime database/CAS, .env, Python bytecode or __pycache__ is tracked");
}

const migrationIds = new Map();
const persistenceDirectory = join(root, "packages/persistence/src");
for (const entry of readdirSync(persistenceDirectory)) {
  if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
  const path = join(persistenceDirectory, entry);
  const text = readFileSync(path, "utf8");
  for (const match of text.matchAll(/\bid:\s*["'](\d{4}_[a-z0-9_]+)["']/giu)) {
    const id = match[1];
    const locations = migrationIds.get(id) ?? [];
    locations.push(relative(root, path));
    migrationIds.set(id, locations);
  }
}
const duplicateMigrations = [...migrationIds.entries()].filter(([, locations]) => locations.length > 1);
if (duplicateMigrations.length) {
  for (const [id, locations] of duplicateMigrations) {
    fail(`duplicate migration id ${id}: ${locations.join(", ")}`);
  }
} else if (migrationIds.size < 2) {
  fail(`migration discovery unexpectedly found only ${migrationIds.size} migration ids`);
} else {
  const ordered = [...migrationIds.keys()].sort();
  pass(`${ordered.length} migration ids are unique (${ordered[0]} .. ${ordered.at(-1)})`);
}

console.log(`MarkOrbit Knowledge ${expectedVersion} release preflight`);
for (const check of checks) console.log(`  ✓ ${check}`);
if (failures.length) {
  console.error("\nRelease preflight failed:");
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`\nRelease preflight passed with ${checks.length} checks.`);
}
