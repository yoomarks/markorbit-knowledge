import { NextResponse } from "next/server";
import {
  ARTIFACT_KINDS,
  CONVERTER_CAPABILITIES,
  CONVERTER_RUNTIMES,
  CONVERTER_STATUSES,
  type ArtifactKind,
  type ConverterCapability,
  type ConverterRuntime,
  type ConverterStatus,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import type { CreateConverterManifestInput } from "@markorbit/persistence/converters";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getConverterRegistryRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function integer(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new RegistryValidationError("Pagination must be integer");
  return parsed;
}

export async function GET(request: Request) {
  try {
    await resolveAdminBrowserApiReadAccess(request);
    const params = new URL(request.url).searchParams;
    const runtimeValue = params.get("runtime") ?? undefined;
    const status = params.get("status") ?? undefined;
    const capability = params.get("capability") ?? undefined;
    const artifactKind = params.get("artifactKind") ?? undefined;
    if (runtimeValue && !CONVERTER_RUNTIMES.includes(runtimeValue as ConverterRuntime))
      throw new RegistryValidationError("Unknown runtime filter");
    if (status && !CONVERTER_STATUSES.includes(status as ConverterStatus))
      throw new RegistryValidationError("Unknown status filter");
    if (capability && !CONVERTER_CAPABILITIES.includes(capability as ConverterCapability))
      throw new RegistryValidationError("Unknown capability filter");
    if (artifactKind && !ARTIFACT_KINDS.includes(artifactKind as ArtifactKind))
      throw new RegistryValidationError("Unknown artifact kind filter");
    return NextResponse.json(
      getConverterRegistryRepository().listManifests({
        q: params.get("q") ?? undefined,
        runtime: runtimeValue as ConverterRuntime | undefined,
        status: status as ConverterStatus | undefined,
        capability: capability as ConverterCapability | undefined,
        artifactKind: artifactKind as ArtifactKind | undefined,
        mimeType: params.get("mimeType") ?? undefined,
        limit: integer(params.get("limit"), 25),
        offset: integer(params.get("offset"), 0),
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await resolveAdminBrowserApiMutationAccess(request);
    const body = requireRecord(await readJson(request));
    const record = getConverterRegistryRepository().createManifest(
      body as CreateConverterManifestInput,
    );
    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
