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

function migrate({ path, importAnchor, headerCount, removals = [] }) {
  let text = readFileSync(path, "utf8");
  text = insertImport(text, importAnchor, path);
  text = replaceCount(
    text,
    'headers: { "content-type": "application/json" },',
    'headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),',
    headerCount,
    path,
    "mutation header",
  );
  for (const [search, expected, label] of removals) {
    text = replaceCount(text, search, "", expected, path, label);
  }
  writeFileSync(path, text);
}

const persistenceAnchor = 'import type { SourceListResult } from "@markorbit/persistence";\n';
const i18nAnchor = 'import { useAdminI18n } from "@/lib/i18n";\n';

migrate({
  path: "apps/admin/src/components/sources/source-intelligence-review-ownership.tsx",
  importAnchor: persistenceAnchor,
  headerCount: 1,
  removals: [["          actor,\n", 1, "browser actor"]],
});

migrate({
  path: "apps/admin/src/components/sources/source-intelligence-manual-sla.tsx",
  importAnchor: persistenceAnchor,
  headerCount: 2,
  removals: [["          actor: operator,\n", 2, "browser actor"]],
});

migrate({
  path: "apps/admin/src/components/sources/source-intelligence-policy-scopes.tsx",
  importAnchor: persistenceAnchor,
  headerCount: 2,
  removals: [["          actor: operator,\n", 2, "browser actor"]],
});

migrate({
  path: "apps/admin/src/components/sources/source-intelligence-review-queue.tsx",
  importAnchor: persistenceAnchor,
  headerCount: 1,
  removals: [["          reviewer: \"admin-console\",\n", 1, "browser reviewer"]],
});

migrate({
  path: "apps/admin/src/lib/admin-v2/source-smart-review-ui.tsx",
  importAnchor: i18nAnchor,
  headerCount: 5,
  removals: [["          reviewer: \"admin-console\",\n", 2, "browser reviewer"]],
});

migrate({
  path: "apps/admin/src/components/overview/overview-workbench.tsx",
  importAnchor: i18nAnchor,
  headerCount: 1,
  removals: [["          reviewer: \"admin-console\",\n", 1, "browser reviewer"]],
});

migrate({
  path: "apps/admin/src/components/sources/representative-activation-wave.tsx",
  importAnchor: i18nAnchor,
  headerCount: 1,
});

migrate({
  path: "apps/admin/src/components/sources/radar-review-evidence.tsx",
  importAnchor: i18nAnchor,
  headerCount: 1,
  removals: [["          reviewer: \"radar-review-console\",\n", 1, "browser reviewer"]],
});

migrate({
  path: "apps/admin/src/components/sources/radar-collection-authorization.tsx",
  importAnchor: i18nAnchor,
  headerCount: 1,
  removals: [[', requestedBy: "radar-collection-console"', 1, "browser requestedBy"]],
});
