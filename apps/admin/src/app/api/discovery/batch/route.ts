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

function optionalCategory(value: unknown): SourceCategory | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !SOURCE_CATEGORIES.includes(value as SourceCategory)) {
    throw new RegistryValidationError("intake.category is invalid");
  }
  return value as SourceCategory;
}

function optionalAuthority(value: unknown): AuthorityLevel | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !AUTHORITY_LEVELS.includes(value as AuthorityLevel)) {
    throw new RegistryValidationError("intake.authorityLevel is invalid");
  }
  return value as AuthorityLevel;
}

function intakeDefaults(value: unknown): DiscoveryIntakeDefaults | undefined {
  if (value === undefined || value === null) return undefined;
  const record = requireRecord(value);
  return {
    category: optionalCategory(record.category),
    authorityLevel: optionalAuthority(record.authorityLevel),
    jurisdictions: optionalStringArray(record.jurisdictions, "intake.jurisdictions"),
    languages: optionalStringArray(record.languages, "intake.languages"),
    note: optionalString(record.note, "intake.note"),
    tags: optionalStringArray(record.tags, "intake.tags"),
  };
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    if (!Array.isArray(body.locators) || !body.locators.every((item) => typeof item === "string")) {
      throw new RegistryValidationError("locators must be an array of strings");
    }

    const result = await getDiscoveryWorkflowService().startBatch({
      locators: body.locators,
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
