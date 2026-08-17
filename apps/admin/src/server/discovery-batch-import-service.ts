import type { DiscoveryWorkflowService, DiscoveryIntakeDefaults } from "./discovery-service";
import { websiteIdentity } from "./discovery-source-graph";

export type DiscoveryImportEntry = {
  locator: string;
  intake?: DiscoveryIntakeDefaults;
};

export type DiscoveryImportBatchInput = {
  entries: DiscoveryImportEntry[];
  maxDepth?: number;
  maxCandidates?: number;
  maxFetches?: number;
  deniedUrlPatterns?: string[];
};

type Dependencies = {
  workflow: Pick<DiscoveryWorkflowService, "startBatch">;
};

function normalizedWebsiteIdentity(locator: string): string | null {
  try {
    return websiteIdentity(locator.trim());
  } catch {
    return null;
  }
}

function groupKey(intake: DiscoveryIntakeDefaults | undefined): string {
  if (!intake) return "{}";
  return JSON.stringify({
    category: intake.category ?? null,
    authorityLevel: intake.authorityLevel ?? null,
    jurisdictions: intake.jurisdictions ?? [],
    languages: intake.languages ?? [],
    note: intake.note ?? null,
    tags: intake.tags ?? [],
  });
}

export async function runDiscoveryImportBatch(
  input: DiscoveryImportBatchInput,
  dependencies: Dependencies,
) {
  const groups = new Map<string, { intake?: DiscoveryIntakeDefaults; locators: string[] }>();
  const seenWebsiteIdentities = new Set<string>();
  let skippedDuplicateInput = 0;

  for (const entry of input.entries) {
    const identity = normalizedWebsiteIdentity(entry.locator);
    if (identity && seenWebsiteIdentities.has(identity)) {
      skippedDuplicateInput += 1;
      continue;
    }
    if (identity) seenWebsiteIdentities.add(identity);
    const key = groupKey(entry.intake);
    const group = groups.get(key) ?? { intake: entry.intake, locators: [] };
    group.locators.push(entry.locator);
    groups.set(key, group);
  }

  const summary = {
    submitted: input.entries.length,
    uniqueOrigins: seenWebsiteIdentities.size,
    started: 0,
    skippedDuplicateInput,
    skippedExistingSource: 0,
    failed: 0,
    candidateCount: 0,
  };
  const items: Awaited<ReturnType<DiscoveryWorkflowService["startBatch"]>>["items"] = [];

  for (const group of groups.values()) {
    const result = await dependencies.workflow.startBatch({
      locators: group.locators,
      intake: group.intake,
      ...(input.maxDepth !== undefined ? { maxDepth: input.maxDepth } : {}),
      ...(input.maxCandidates !== undefined ? { maxCandidates: input.maxCandidates } : {}),
      ...(input.maxFetches !== undefined ? { maxFetches: input.maxFetches } : {}),
      ...(input.deniedUrlPatterns !== undefined
        ? { deniedUrlPatterns: input.deniedUrlPatterns }
        : {}),
    });
    summary.started += result.summary.started;
    summary.skippedDuplicateInput += result.summary.skippedDuplicateInput;
    summary.skippedExistingSource += result.summary.skippedExistingSource;
    summary.failed += result.summary.failed;
    summary.candidateCount += result.summary.candidateCount;
    items.push(...result.items);
  }

  return { summary, items };
}
