import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const productionRoots = ["apps", "packages", "workers"];
const sourceExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);
const ignoredDirectoryNames = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  "tests",
  "__tests__",
  "fixtures",
  "__fixtures__",
]);
const allowedDirectConsumers = new Set([
  "packages/persistence/src/raw-artifact-registry.ts",
  "packages/persistence/src/raw-artifact-repository.ts",
]);

function extension(path: string): string {
  const match = path.match(/(\.[^.\\/]+)$/);
  return match?.[1] ?? "";
}

function isTestFile(path: string): boolean {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path);
}

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignoredDirectoryNames.has(entry.name)) continue;
      files.push(...walk(join(directory, entry.name)));
      continue;
    }
    if (entry.isFile() && sourceExtensions.has(extension(entry.name))) {
      files.push(join(directory, entry.name));
    }
  }
  return files;
}

function repoPath(path: string): string {
  return relative(repoRoot, path).split(sep).join("/");
}

function directRegistryImports(source: string): string[] {
  const matches: string[] = [];
  const importPattern =
    /(?:from\s*|import\s*\()\s*["']([^"']*raw-artifact-registry(?:\.[cm]?[jt]s)?)['"]/g;
  for (const match of source.matchAll(importPattern)) {
    matches.push(match[1]);
  }
  return matches;
}

describe("RawArtifact production integrity boundary", () => {
  it("prevents production code from importing the storage registry directly", () => {
    const violations: Array<{ path: string; imports: string[] }> = [];

    for (const root of productionRoots) {
      const rootPath = resolve(repoRoot, root);
      for (const path of walk(rootPath)) {
        const normalized = repoPath(path);
        if (isTestFile(normalized) || allowedDirectConsumers.has(normalized)) continue;

        const imports = directRegistryImports(readFileSync(path, "utf8"));
        if (imports.length > 0) violations.push({ path: normalized, imports });
      }
    }

    expect(violations).toEqual([]);
  });
});
