import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import {
  AI_COGNITIVE_MIGRATION_LEDGER_V1,
  AI_EVIDENCE_PLANE_OWNER_MAP_V1,
} from "@markorbit/contracts";

export const K0_ARCHITECTURE_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export type K0ArchitectureDiagnostic = {
  ruleId: string;
  filePath: string;
  message: string;
};

export type RepositoryFiles = ReadonlyMap<string, string>;

const TEST_FILE = /\.(test|spec)\.(ts|tsx)$/;
const SOURCE_FILE = /\.(ts|tsx)$/;
const CORE_WORKSPACE_TOKEN = /\bcoreWorkspaceId\b|\bcore_workspace_id\b|\bCORE_WORKSPACE_ID\b/;
const UNIVERSAL_HEALTH_AUTHORITY =
  /\b(?:GLOBAL|OVERALL|UNIVERSAL)_KNOWLEDGE_(?:HEALTH|READINESS)\b|\b(?:Global|Overall|Universal)Knowledge(?:Health|Readiness)\b/;

const CORE_WORKSPACE_ALLOWED = new Set([
  "packages/persistence/src/core-workspace-binding.ts",
  "packages/persistence/src/ready-package-core-intake-submission.ts",
  "packages/persistence/src/ready-package-v2-delivery-submission.ts",
]);

const REQUIRED_CONSUMER_GATES = [
  "apps/admin/src/server/knowledge-brain-ready-export.ts",
  "apps/admin/src/server/ready-package-content-export.ts",
] as const;

function posix(value: string): string {
  return value.split(path.sep).join("/");
}

export function loadRepositoryFiles(root = K0_ARCHITECTURE_ROOT): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", ".next", "dist"].includes(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!SOURCE_FILE.test(entry.name) && entry.name !== "package.json") continue;
      files.set(posix(path.relative(root, absolute)), fs.readFileSync(absolute, "utf8"));
    }
  };
  walk(path.join(root, "apps"));
  walk(path.join(root, "packages"));
  return files;
}

function productionSourcePaths(files: RepositoryFiles): string[] {
  return [...files.keys()].filter(
    (filePath) => SOURCE_FILE.test(filePath) && !TEST_FILE.test(filePath),
  );
}

function isAiProductionModule(filePath: string): boolean {
  if (/^packages\/(contracts|persistence)\/src\/ai-[^/]+\.ts$/.test(filePath)) return true;
  if (
    /^packages\/worker-runtime\/src\/(?:ai-|managed-ai-|openai-knowledge-)[^/]+\.ts$/.test(filePath)
  )
    return true;
  return /^apps\/worker\/src\/(?:adk-|prepare-adk-|persist-adk-|run-adk-)[^/]+\.ts$/.test(filePath);
}

export function workspaceAuthorityDiagnostics(files: RepositoryFiles): K0ArchitectureDiagnostic[] {
  return productionSourcePaths(files)
    .filter((filePath) => filePath.startsWith("packages/persistence/src/"))
    .filter((filePath) => CORE_WORKSPACE_TOKEN.test(files.get(filePath) ?? ""))
    .filter((filePath) => !CORE_WORKSPACE_ALLOWED.has(filePath))
    .map((filePath) => ({
      ruleId: "K0-WORKSPACE-AUTHORITY",
      filePath,
      message:
        "Direct Core Workspace UUID state appeared in Knowledge persistence outside the binding or audited delivery/intake seams.",
    }));
}

export function aiInventoryDiagnostics(files: RepositoryFiles): K0ArchitectureDiagnostic[] {
  const discovered = new Set(productionSourcePaths(files).filter(isAiProductionModule));
  const mapped = new Set(AI_EVIDENCE_PLANE_OWNER_MAP_V1.map((entry) => entry.modulePath));
  const diagnostics: K0ArchitectureDiagnostic[] = [];
  for (const filePath of discovered) {
    if (!mapped.has(filePath)) {
      diagnostics.push({
        ruleId: "K0-AI-OWNER-UNCLASSIFIED",
        filePath,
        message: "Production AI/ADK module is missing from AI_EVIDENCE_PLANE_OWNER_MAP_V1.",
      });
    }
  }
  for (const filePath of mapped) {
    if (!discovered.has(filePath)) {
      diagnostics.push({
        ruleId: "K0-AI-OWNER-STALE",
        filePath,
        message:
          "AI Evidence Plane owner-map entry no longer resolves to a production AI/ADK module.",
      });
    }
  }
  return diagnostics;
}

function exportedNames(modulePath: string, files: RepositoryFiles): Set<string> {
  const text = files.get(modulePath);
  if (!text) return new Set();
  const source = ts.createSourceFile(modulePath, text, ts.ScriptTarget.Latest, true);
  const names = new Set<string>();
  for (const node of source.statements) {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
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
function contractSymbolOwners(files: RepositoryFiles): Map<string, string> {
  const owners = new Map<string, string>();
  for (const entry of AI_COGNITIVE_MIGRATION_LEDGER_V1) {
    if (!entry.modulePath.startsWith("packages/contracts/src/")) continue;
    for (const name of exportedNames(entry.modulePath, files)) owners.set(name, entry.modulePath);
  }
  return owners;
}

function resolvePackageExport(specifier: string, files: RepositoryFiles): string | null {
  const match = /^@markorbit\/(contracts|persistence|worker-runtime)(?:\/(.+))?$/.exec(specifier);
  if (!match) return null;
  const [, packageName, subpath] = match;
  if (!subpath) return packageName === "contracts" ? "packages/contracts/src/index.ts" : null;
  const manifestText = files.get(`packages/${packageName}/package.json`);
  if (!manifestText) return null;
  const manifest = JSON.parse(manifestText) as { exports?: Record<string, string> };
  const target = manifest.exports?.[`./${subpath}`];
  if (!target) return null;
  return posix(path.join(`packages/${packageName}`, target.replace(/^\.\//, "")));
}
function resolveRelativeImport(
  filePath: string,
  specifier: string,
  files: RepositoryFiles,
): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = posix(
    path.posix.normalize(path.posix.join(path.posix.dirname(filePath), specifier)),
  );
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    if (files.has(candidate)) return candidate;
  }
  return null;
}

function addUsage(usage: Map<string, Set<string>>, modulePath: string, filePath: string): void {
  if (modulePath === filePath) return;
  const existing = usage.get(modulePath) ?? new Set<string>();
  existing.add(filePath);
  usage.set(modulePath, existing);
}

function cognitiveUsage(files: RepositoryFiles): Map<string, Set<string>> {
  const migration = new Set(AI_COGNITIVE_MIGRATION_LEDGER_V1.map((entry) => entry.modulePath));
  const symbols = contractSymbolOwners(files);
  const usage = new Map<string, Set<string>>();
  for (const filePath of productionSourcePaths(files)) {
    const source = ts.createSourceFile(
      filePath,
      files.get(filePath) ?? "",
      ts.ScriptTarget.Latest,
      true,
    );
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      const specifier = node.moduleSpecifier.text;
      if (specifier === "@markorbit/contracts") {
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) {
          addUsage(usage, "packages/contracts/src/ai-distilled-knowledge-v1.ts", filePath);
          continue;
        }
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            const imported = element.propertyName?.text ?? element.name.text;
            const owner = symbols.get(imported);
            if (owner) addUsage(usage, owner, filePath);
          }
        }
        continue;
      }
      const resolved =
        resolvePackageExport(specifier, files) ?? resolveRelativeImport(filePath, specifier, files);
      if (resolved && migration.has(resolved)) addUsage(usage, resolved, filePath);
    }
  }
  return usage;
}

export function cognitiveCompatibilityDiagnostics(
  files: RepositoryFiles,
): K0ArchitectureDiagnostic[] {
  const usage = cognitiveUsage(files);
  const diagnostics: K0ArchitectureDiagnostic[] = [];
  for (const entry of AI_COGNITIVE_MIGRATION_LEDGER_V1) {
    const actual = [...(usage.get(entry.modulePath) ?? new Set<string>())].sort();
    const approved = [...entry.approvedCompatibilityCallSites].sort();
    if (JSON.stringify(actual) === JSON.stringify(approved)) continue;
    diagnostics.push({
      ruleId: "K0-AI-COMPATIBILITY-CALLSITE",
      filePath: entry.modulePath,
      message: `Compatibility call-site drift. approved=${approved.join(",") || "<none>"}; actual=${actual.join(",") || "<none>"}.`,
    });
  }
  return diagnostics;
}

export function healthAuthorityDiagnostics(files: RepositoryFiles): K0ArchitectureDiagnostic[] {
  return productionSourcePaths(files)
    .filter((filePath) => UNIVERSAL_HEALTH_AUTHORITY.test(files.get(filePath) ?? ""))
    .map((filePath) => ({
      ruleId: "K0-HEALTH-AUTHORITY",
      filePath,
      message:
        "Universal/global Knowledge health or readiness authority declaration is prohibited; use the frozen purpose-specific taxonomy.",
    }));
}

export function consumerGateDiagnostics(files: RepositoryFiles): K0ArchitectureDiagnostic[] {
  const diagnostics: K0ArchitectureDiagnostic[] = [];
  for (const filePath of REQUIRED_CONSUMER_GATES) {
    const source = files.get(filePath) ?? "";
    if (
      source.includes("@markorbit/persistence/current-governed-knowledge") &&
      source.includes("projectCurrentGovernedKnowledge")
    )
      continue;
    diagnostics.push({
      ruleId: "K0-CURRENT-GOVERNED-GATE",
      filePath,
      message:
        "Brain/Core export must consume projectCurrentGovernedKnowledge from the canonical persistence seam.",
    });
  }
  return diagnostics;
}

export function evaluateK0ArchitectureConformance(
  files: RepositoryFiles,
): K0ArchitectureDiagnostic[] {
  return [
    ...workspaceAuthorityDiagnostics(files),
    ...aiInventoryDiagnostics(files),
    ...cognitiveCompatibilityDiagnostics(files),
    ...healthAuthorityDiagnostics(files),
    ...consumerGateDiagnostics(files),
  ].sort((left, right) =>
    `${left.ruleId}:${left.filePath}`.localeCompare(`${right.ruleId}:${right.filePath}`),
  );
}

export function runK0ArchitectureConformance(
  root = K0_ARCHITECTURE_ROOT,
): K0ArchitectureDiagnostic[] {
  return evaluateK0ArchitectureConformance(loadRepositoryFiles(root));
}
