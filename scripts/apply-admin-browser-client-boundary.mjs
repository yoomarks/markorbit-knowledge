import { readFileSync, writeFileSync } from "node:fs";

const helperImport = 'import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";\n';

function replaceCount(text, search, replacement, expected, path, label) {
  const count = text.split(search).length - 1;
  if (count !== expected) {
    throw new Error(`${path}: expected ${expected} ${label} replacements, found ${count}`);
  }
  return text.split(search).join(replacement);
}

function insertImport(text, anchor, path) {
  if (text.includes(helperImport.trim())) return text;
  const count = text.split(anchor).length - 1;
  if (count !== 1) throw new Error(`${path}: import anchor count ${count}`);
  return text.replace(anchor, `${anchor}${helperImport}`);
}

function migrate({
  path,
  importAnchor,
  lowerHeaderCount = 0,
  upperHeaderCount = 0,
  removals = [],
  replacements = [],
}) {
  let text = readFileSync(path, "utf8");
  text = insertImport(text, importAnchor, path);
  if (lowerHeaderCount > 0) {
    text = replaceCount(
      text,
      'headers: { "content-type": "application/json" },',
      'headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),',
      lowerHeaderCount,
      path,
      "lowercase mutation header",
    );
  }
  if (upperHeaderCount > 0) {
    text = replaceCount(
      text,
      'headers: { "Content-Type": "application/json" },',
      'headers: await adminBrowserMutationHeaders({ "Content-Type": "application/json" }),',
      upperHeaderCount,
      path,
      "uppercase mutation header",
    );
  }
  for (const [search, expected, label] of removals) {
    text = replaceCount(text, search, "", expected, path, label);
  }
  for (const [search, replacement, expected, label] of replacements) {
    text = replaceCount(text, search, replacement, expected, path, label);
  }
  writeFileSync(path, text);
}

const persistenceAnchor = 'import type { SourceListResult } from "@markorbit/persistence";\n';
const i18nAnchor = 'import { useAdminI18n } from "@/lib/i18n";\n';
const connectorRegistryAnchor =
  'import type { ConnectorRegistryRecord } from "@markorbit/persistence/connectors";\n';
const collectionPlansAnchor =
  'import type { CollectionPlanRegistryRecord } from "@markorbit/persistence/collection-plans";\n';
const contractsBlockAnchor = '} from "@markorbit/contracts";\n';

migrate({
  path: "apps/admin/src/components/sources/source-intelligence-review-ownership.tsx",
  importAnchor: persistenceAnchor,
  lowerHeaderCount: 1,
  removals: [["          actor,\n", 1, "browser actor"]],
});

migrate({
  path: "apps/admin/src/components/sources/source-intelligence-manual-sla.tsx",
  importAnchor: persistenceAnchor,
  lowerHeaderCount: 2,
  removals: [["          actor: operator,\n", 2, "browser actor"]],
});

migrate({
  path: "apps/admin/src/components/sources/source-intelligence-policy-scopes.tsx",
  importAnchor: persistenceAnchor,
  lowerHeaderCount: 2,
  removals: [["          actor: operator,\n", 2, "browser actor"]],
});

migrate({
  path: "apps/admin/src/components/sources/source-intelligence-review-queue.tsx",
  importAnchor: persistenceAnchor,
  lowerHeaderCount: 1,
  removals: [["          reviewer: \"admin-console\",\n", 1, "browser reviewer"]],
});

migrate({
  path: "apps/admin/src/lib/admin-v2/source-smart-review-ui.tsx",
  importAnchor: i18nAnchor,
  lowerHeaderCount: 5,
  removals: [["          reviewer: \"admin-console\",\n", 2, "browser reviewer"]],
});

migrate({
  path: "apps/admin/src/components/overview/overview-workbench.tsx",
  importAnchor: i18nAnchor,
  lowerHeaderCount: 1,
  removals: [["          reviewer: \"admin-console\",\n", 1, "browser reviewer"]],
});

migrate({
  path: "apps/admin/src/components/sources/representative-activation-wave.tsx",
  importAnchor: i18nAnchor,
  lowerHeaderCount: 1,
});

migrate({
  path: "apps/admin/src/components/sources/radar-review-evidence.tsx",
  importAnchor: i18nAnchor,
  lowerHeaderCount: 1,
  removals: [["          reviewer: \"radar-review-console\",\n", 1, "browser reviewer"]],
});

migrate({
  path: "apps/admin/src/components/sources/radar-collection-authorization.tsx",
  importAnchor: i18nAnchor,
  lowerHeaderCount: 1,
  removals: [[', requestedBy: "radar-collection-console"', 1, "browser requestedBy"]],
});

migrate({
  path: "apps/admin/src/components/sources/source-detail-workbench.tsx",
  importAnchor: i18nAnchor,
  lowerHeaderCount: 3,
});

migrate({
  path: "apps/admin/src/components/sources/source-editor.tsx",
  importAnchor: connectorRegistryAnchor,
  upperHeaderCount: 2,
});

migrate({
  path: "apps/admin/src/components/sources/source-assessment-panel.tsx",
  importAnchor: i18nAnchor,
  lowerHeaderCount: 1,
});

migrate({
  path: "apps/admin/src/components/sources/source-related-recommendations.tsx",
  importAnchor: i18nAnchor,
  lowerHeaderCount: 1,
});

migrate({
  path: "apps/admin/src/components/sources/source-plans-panel.tsx",
  importAnchor: collectionPlansAnchor,
  upperHeaderCount: 1,
});

migrate({
  path: "apps/admin/src/components/sources/source-graph-panel.tsx",
  importAnchor: contractsBlockAnchor,
  replacements: [
    [
      'const response = await fetch(`/api/sources/${sourceId}/graph`, { method: "POST" });',
      'const response = await fetch(`/api/sources/${sourceId}/graph`, {\n        method: "POST",\n        headers: await adminBrowserMutationHeaders(),\n      });',
      1,
      "graph mutation headers",
    ],
  ],
});
