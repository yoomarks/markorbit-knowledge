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
  type StartBatchDiscoveryEntry,
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
  return value;
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

function batchEntries(value: unknown): StartBatchDiscoveryEntry[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new RegistryValidationError("entries must be an array");
  if (value.length > 100) throw new RegistryValidationError("entries must contain at most 100 rows");
  return value.map((item, index) => {
    const record = requireRecord(item);
    if (typeof record.locator !== "string" || !record.locator.trim()) {
      throw new RegistryValidationError(`entries[${index}].locator must be a non-empty string`);
    }
    return {
      locator: record.locator,
      intake: intakeDefaults(record.intake, `entries[${index}].intake`),
    };
  });
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const locators = optionalStringArray(body.locators, "locators");
    const entries = batchEntries(body.entries);
    if ((!locators || locators.length === 0) && (!entries || entries.length === 0)) {
      throw new RegistryValidationError("locators or entries must contain at least one website");
    }

    const result = await getDiscoveryWorkflowService().startBatch({
      ...(locators ? { locators } : {}),
      ...(entries ? { entries } : {}),
      maxDepth: optionalInteger(body.maxDepth, "maxDepth"),
      maxCandidates: optionalInteger(body.maxCandidates, "maxCandidates"),
      maxFetches: optionalInteger(body.maxFetches, "maxFetches"),
      intake: intakeDefaults(body.intake),
      deniedUrlPatterns: optionalStringArray(body.deniedUrlPatterns, "deniedUrlPatterns"),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
