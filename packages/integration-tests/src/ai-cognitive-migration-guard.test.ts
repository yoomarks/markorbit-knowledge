import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AI_COGNITIVE_MIGRATION_LEDGER_V1 } from "@markorbit/contracts";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MIGRATION = new Map(
  AI_COGNITIVE_MIGRATION_LEDGER_V1.map((entry) => [entry.modulePath, entry]),
);
const CONTRACT_PREFIX = "packages/contracts/src/";

function posix(value: string): string {
  return value.split(path.sep).join("/");
}

function exportedNames(modulePath: string): Set<string> {
  const text = fs.readFileSync(path.join(ROOT, modulePath), "utf8");
  const source = ts.createSourceFile(modulePath, text, ts.ScriptTarget.Latest, true);
  const names = new Set<string>();
  for (const node of source.statements) {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const exported = modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
    } else if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node)
    ) {
      if (node.name) names.add(node.name.text);
    }
  }
  return names;
}

const contractSymbolOwners = new Map<string, string>();
for (const modulePath of MIGRATION.keys()) {
  if (!modulePath.startsWith(CONTRACT_PREFIX)) continue;
  for (const name of exportedNames(modulePath)) contractSymbolOwners.set(name, modulePath);
}

function resolvePackageExport(specifier: string): string | null {
  const match = /^@markorbit\/(contracts|persistence|worker-runtime)(?:\/(.+))?$/.exec(specifier);
  if (!match) return null;
  const [, packageName, subpath] = match;
  if (!subpath) return packageName === "contracts" ? "packages/contracts/src/index.ts" : null;
  const packageDir = path.join(ROOT, "packages", packageName);
  const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8")) as {
    exports?: Record<string, string>;
  };
  const target = manifest.exports?.[`./${subpath}`];
  return target ? posix(path.relative(ROOT, path.resolve(packageDir, target))) : null;
}

function resolveRelativeImport(filePath: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(ROOT, path.dirname(filePath), specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate)) return posix(path.relative(ROOT, candidate));
  }
  return null;
}

function productionSources(): string[] {
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", ".next", "dist"].includes(entry.name)) continue;
        walk(absolute);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name) || /\.(test|spec)\.(ts|tsx)$/.test(entry.name)) continue;
      files.push(posix(path.relative(ROOT, absolute)));
    }
  };
  walk(path.join(ROOT, "apps"));
  walk(path.join(ROOT, "packages"));
  return files;
}

type UsageMap = Map<string, Set<string>>;
function addUsage(usage: UsageMap, modulePath: string, filePath: string): void {
  if (modulePath === filePath) return;
  const existing = usage.get(modulePath) ?? new Set<string>();
  existing.add(filePath);
  usage.set(modulePath, existing);
}

function collectUsages(): UsageMap {
  const usage: UsageMap = new Map();
  for (const filePath of productionSources()) {
    const text = fs.readFileSync(path.join(ROOT, filePath), "utf8");
    const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      const specifier = node.moduleSpecifier.text;
      if (specifier === "@markorbit/contracts") {
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) {
          throw new Error(
            `${filePath} uses a contracts namespace import that bypasses migration ownership`,
          );
        }
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            const imported = element.propertyName?.text ?? element.name.text;
            const owner = contractSymbolOwners.get(imported);
            if (owner) addUsage(usage, owner, filePath);
          }
        }
        continue;
      }
      const resolved =
        resolvePackageExport(specifier) ?? resolveRelativeImport(filePath, specifier);
      if (resolved && MIGRATION.has(resolved)) addUsage(usage, resolved, filePath);
    }
  }
  return usage;
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}

describe("AI cognitive migration compatibility guard", () => {
  it("allows only frozen production call sites into migration-owned modules", () => {
    const usage = collectUsages();
    const drift: Record<string, { actual: string[]; approved: string[] }> = {};
    for (const entry of AI_COGNITIVE_MIGRATION_LEDGER_V1) {
      const actual = sorted(usage.get(entry.modulePath) ?? []);
      const approved = sorted(entry.approvedCompatibilityCallSites);
      if (JSON.stringify(actual) !== JSON.stringify(approved)) {
        drift[entry.modulePath] = { actual, approved };
      }
    }
    expect(drift).toEqual({});
  });

  it("keeps the two legacy cognitive CLIs exposed only through their frozen scripts", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, "apps/worker/package.json"), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };
    const cognitiveScripts = Object.entries(manifest.scripts ?? {}).filter(([, command]) =>
      /run-adk-(assignment-library-bootstrap|candidate-promotion)\.ts/.test(command),
    );
    expect(cognitiveScripts).toEqual([
      ["adk:library:bootstrap", "tsx src/run-adk-assignment-library-bootstrap.ts"],
      ["adk:candidate:promote", "tsx src/run-adk-candidate-promotion.ts"],
    ]);
  });
});
