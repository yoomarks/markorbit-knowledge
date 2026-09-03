import { NextResponse } from "next/server";
import type { VaultBindingStatus } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteVaultBindingRepository } from "@markorbit/persistence/vault-bindings";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { obsidianVaultFilesystemReadiness } from "@/server/obsidian-vault-readiness";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function optionalRevision(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RegistryValidationError("expectedRevision must be a non-negative safe integer");
  }
  return value as number;
}

function requiredRevision(value: unknown): number {
  const revision = optionalRevision(value);
  if (revision === undefined || revision < 1) {
    throw new RegistryValidationError("expectedRevision must be a positive safe integer");
  }
  return revision;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, id);
    const repository = new SqliteVaultBindingRepository(getRegistryDatabase());
    return NextResponse.json({
      binding: repository.getByWorkspaceId(workspaceId),
      filesystem: obsidianVaultFilesystemReadiness(),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const body = requireRecord(await readJson(request));
    const name = typeof body.name === "string" ? body.name : "";
    const relativeRoot = typeof body.relativeRoot === "string" ? body.relativeRoot : "";
    if (!name.trim()) throw new RegistryValidationError("name is required");
    if (!relativeRoot.trim()) throw new RegistryValidationError("relativeRoot is required");
    const { id } = await context.params;
    const { workspaceId } = await resolveAdminBrowserApiMutationAccess(request, id);
    const repository = new SqliteVaultBindingRepository(getRegistryDatabase());
    return NextResponse.json({
      binding: repository.configure({
        workspaceId,
        name,
        relativeRoot,
        expectedRevision: optionalRevision(body.expectedRevision),
      }),
      filesystem: obsidianVaultFilesystemReadiness(),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const body = requireRecord(await readJson(request));
    const status = body.status as VaultBindingStatus;
    if (status !== "ACTIVE" && status !== "DISABLED") {
      throw new RegistryValidationError("status must be ACTIVE or DISABLED");
    }
    const { id } = await context.params;
    const { workspaceId } = await resolveAdminBrowserApiMutationAccess(request, id);
    const repository = new SqliteVaultBindingRepository(getRegistryDatabase());
    return NextResponse.json({
      binding: repository.setStatus(workspaceId, status, requiredRevision(body.expectedRevision)),
      filesystem: obsidianVaultFilesystemReadiness(),
    });
  } catch (error) {
    return apiError(error);
  }
}
