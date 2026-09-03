import { NextResponse } from "next/server";
import {
  AUTHORITY_LEVELS,
  SOURCE_CATEGORIES,
  type AuthorityLevel,
  type SourceCategory,
} from "@markorbit/contracts";
import { DEFAULT_WORKSPACE, RegistryValidationError } from "@markorbit/persistence";
import { resolveAdminBrowserApiMutationAccess } from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import {
  runDiscoveryImportBatch,
  type DiscoveryImportEntry,
} from "@/server/discovery-batch-import-service";
import {
  getDiscoveryWorkflowService,
  type DiscoveryIntakeDefaults,
} from "@/server/discovery-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function importEntries(value: unknown): DiscoveryImportEntry[] | undefined {
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

export async function POST(request: Request) {
  try {
    await resolveAdminBrowserApiMutationAccess(request, DEFAULT_WORKSPACE.id);
    const body = requireRecord(await readJson(request));
    const entries = importEntries(body.entries);
    const maxDepth = optionalInteger(body.maxDepth, "maxDepth");
    const maxCandidates = optionalInteger(body.maxCandidates, "maxCandidates");
    const maxFetches = optionalInteger(body.maxFetches, "maxFetches");
    const deniedUrlPatterns = optionalStringArray(body.deniedUrlPatterns, "deniedUrlPatterns");
    const workflow = getDiscoveryWorkflowService();

    if (entries) {
      const result = await runDiscoveryImportBatch(
        {
          entries,
          ...(maxDepth !== undefined ? { maxDepth } : {}),
          ...(maxCandidates !== undefined ? { maxCandidates } : {}),
          ...(maxFetches !== undefined ? { maxFetches } : {}),
          ...(deniedUrlPatterns !== undefined ? { deniedUrlPatterns } : {}),
        },
        { workflow },
      );
      return NextResponse.json(result, { status: 201 });
    }

    if (!Array.isArray(body.locators) || !body.locators.every((item) => typeof item === "string")) {
      throw new RegistryValidationError("locators must be an array of strings");
    }
    const result = await workflow.startBatch({
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
