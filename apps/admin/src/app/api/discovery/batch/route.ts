import { NextResponse } from "next/server";
import {
  AUTHORITY_LEVELS,
  SOURCE_CATEGORIES,
  type AuthorityLevel,
  type SourceCategory,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import {
  getDiscoveryWorkflowService,
  type DiscoveryIntakeDefaults,
} from "@/server/discovery-service";
import { websiteIdentity } from "@/server/discovery-source-graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImportEntry = {
  locator: string;
  intake?: DiscoveryIntakeDefaults;
};

function optionalInteger(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new RegistryValidationError(`${field} must be an integer`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new RegistryValidationError(`${field} must be a string`);
  return value.trim() || undefined;
}

function optionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new RegistryValidationError(`${field} must be an array of strings`);
  }
  return value;
}

function optionalCategory(value: unknown, field = "intake.category"): SourceCategory | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !SOURCE_CATEGORIES.includes(value as SourceCategory)) {
    throw new RegistryValidationError(`${field} is invalid`);
  }
  return value as SourceCategory;
}

function optionalAuthority(
  value: unknown,
  field = "intake.authorityLevel",
): AuthorityLevel | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !AUTHORITY_LEVELS.includes(value as AuthorityLevel)) {
    throw new RegistryValidationError(`${field} is invalid`);
  }
  return value as AuthorityLevel;
}

function intakeDefaults(value: unknown, prefix = "intake"): DiscoveryIntakeDefaults | undefined {
  if (value === undefined || value === null) return undefined;
  const record = requireRecord(value);
  return {
    category: optionalCategory(record.category, `${prefix}.category`),
    authorityLevel: optionalAuthority(record.authorityLevel, `${prefix}.authorityLevel`),
    jurisdictions: optionalStringArray(record.jurisdictions, `${prefix}.jurisdictions`),
    languages: optionalStringArray(record.languages, `${prefix}.languages`),
    note: optionalString(record.note, `${prefix}.note`),
    tags: optionalStringArray(record.tags, `${prefix}.tags`),
  };
}

function importEntries(value: unknown): ImportEntry[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new RegistryValidationError("entries must contain 1 to 100 rows");
  }
  return value.map((item, index) => {
    const record = requireRecord(item);
    if (typeof record.locator !== "string" || !record.locator.trim()) {
      throw new RegistryValidationError(`entries[${index}].locator must be a non-empty string`);
    }
    return {
      locator: record.locator.trim(),
      intake: intakeDefaults(record.intake, `entries[${index}].intake`),
    };
  });
}

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

async function runPerRowImport(input: {
  entries: ImportEntry[];
  maxDepth?: number;
  maxCandidates?: number;
  maxFetches?: number;
  deniedUrlPatterns?: string[];
}) {
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
  const items: unknown[] = [];
  const service = getDiscoveryWorkflowService();

  for (const group of groups.values()) {
    const result = await service.startBatch({
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

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const entries = importEntries(body.entries);
    const maxDepth = optionalInteger(body.maxDepth, "maxDepth");
    const maxCandidates = optionalInteger(body.maxCandidates, "maxCandidates");
    const maxFetches = optionalInteger(body.maxFetches, "maxFetches");
    const deniedUrlPatterns = optionalStringArray(body.deniedUrlPatterns, "deniedUrlPatterns");

    if (entries) {
      const result = await runPerRowImport({
        entries,
        ...(maxDepth !== undefined ? { maxDepth } : {}),
        ...(maxCandidates !== undefined ? { maxCandidates } : {}),
        ...(maxFetches !== undefined ? { maxFetches } : {}),
        ...(deniedUrlPatterns !== undefined ? { deniedUrlPatterns } : {}),
      });
      return NextResponse.json(result, { status: 201 });
    }

    if (!Array.isArray(body.locators) || !body.locators.every((item) => typeof item === "string")) {
      throw new RegistryValidationError("locators must be an array of strings");
    }
    const result = await getDiscoveryWorkflowService().startBatch({
      locators: body.locators,
      ...(maxDepth !== undefined ? { maxDepth } : {}),
      ...(maxCandidates !== undefined ? { maxCandidates } : {}),
      ...(maxFetches !== undefined ? { maxFetches } : {}),
      intake: intakeDefaults(body.intake),
      ...(deniedUrlPatterns !== undefined ? { deniedUrlPatterns } : {}),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
