import { NextResponse } from "next/server";
import { DEFAULT_WORKSPACE, RegistryValidationError } from "@markorbit/persistence";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getPageValueCapabilityService } from "@/server/page-value-capability-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function candidateIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new RegistryValidationError("candidateIds must be an array");
  }
  return value.map((item) => {
    if (typeof item !== "string") {
      throw new RegistryValidationError("candidateIds must contain strings");
    }
    return item;
  });
}

export async function GET(request: Request) {
  try {
    await resolveAdminBrowserApiReadAccess(request, DEFAULT_WORKSPACE.id);
    return NextResponse.json({ status: getPageValueCapabilityService().status() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await resolveAdminBrowserApiMutationAccess(request, DEFAULT_WORKSPACE.id);
    const body = requireRecord(await readJson(request));
    const service = getPageValueCapabilityService();
    const ids = candidateIds(body.candidateIds);
    if (body.action === "LATEST") {
      return NextResponse.json({ status: service.status(), latest: service.latest(ids) });
    }
    if (body.action !== undefined && body.action !== "SCREEN") {
      throw new RegistryValidationError("action must be SCREEN or LATEST");
    }
    if (body.locale !== undefined && typeof body.locale !== "string") {
      throw new RegistryValidationError("locale must be a string");
    }
    if (body.objective !== undefined && typeof body.objective !== "string") {
      throw new RegistryValidationError("objective must be a string");
    }
    if (body.maxResults !== undefined && typeof body.maxResults !== "number") {
      throw new RegistryValidationError("maxResults must be a number");
    }
    const result = await service.screen({
      candidateIds: ids,
      ...(typeof body.locale === "string" ? { locale: body.locale } : {}),
      ...(typeof body.objective === "string" ? { objective: body.objective } : {}),
      ...(typeof body.maxResults === "number" ? { maxResults: body.maxResults } : {}),
    });
    return NextResponse.json({
      status: service.status(),
      response: result.response,
      latest: Object.fromEntries(result.records.map((record) => [record.candidateId, record])),
    });
  } catch (error) {
    return apiError(error);
  }
}
