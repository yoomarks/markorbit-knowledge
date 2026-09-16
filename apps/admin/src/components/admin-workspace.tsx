"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  knowledgeWorkspaceHref,
  selectKnowledgeWorkspace,
  type KnowledgeWorkspaceOption,
} from "@/lib/knowledge-workspace-model";

type AdminSessionResponse = {
  authenticated: true;
  userId: string;
  workspaces: KnowledgeWorkspaceOption[];
};

type AdminWorkspaceContextValue = {
  workspaceId: string;
  workspace: KnowledgeWorkspaceOption;
  workspaces: KnowledgeWorkspaceOption[];
};
const AdminWorkspaceContext = createContext<AdminWorkspaceContextValue | null>(null);

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export function useAdminWorkspace(): AdminWorkspaceContextValue {
  const value = useContext(AdminWorkspaceContext);
  if (!value) throw new Error("Admin Core workspace context is unavailable");
  return value;
}

export function useOptionalAdminWorkspace(): AdminWorkspaceContextValue | null {
  return useContext(AdminWorkspaceContext);
}

export function useResolvedAdminWorkspaceId(fallbackWorkspaceId?: string): string {
  const value = useOptionalAdminWorkspace();
  const workspaceId = value?.workspaceId ?? fallbackWorkspaceId?.trim();
  if (!workspaceId) throw new Error("Admin Core workspace context is required");
  return workspaceId;
}

export function AdminWorkspaceBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedWorkspaceId = searchParams.get("workspaceId");
  const [session, setSession] = useState<AdminSessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/admin-session", { cache: "no-store" });
        if (!response.ok) throw new Error(await readError(response));
        const value = (await response.json()) as AdminSessionResponse;
        if (active) {
          setSession(value);
          setError(null);
        }
      } catch (requestError) {
        if (active) {
          setError(
            requestError instanceof Error ? requestError.message : "Unable to load Admin workspace",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const selection = useMemo(
    () => (session ? selectKnowledgeWorkspace(session.workspaces, requestedWorkspaceId) : null),
    [requestedWorkspaceId, session],
  );
  const currentHref = useMemo(() => {
    const query = searchParams.toString();
    return `${pathname}${query ? `?${query}` : ""}`;
  }, [pathname, searchParams]);

  useEffect(() => {
    if (selection?.kind !== "SELECTED" || !selection.needsExplicitUrl) return;
    router.replace(knowledgeWorkspaceHref(currentHref, selection.workspace.workspaceId), {
      scroll: false,
    });
  }, [currentHref, router, selection]);

  const contextValue = useMemo<AdminWorkspaceContextValue | null>(() => {
    if (!session || selection?.kind !== "SELECTED" || selection.needsExplicitUrl) return null;
    return {
      workspaceId: selection.workspace.workspaceId,
      workspace: selection.workspace,
      workspaces: session.workspaces,
    };
  }, [selection, session]);

  if (loading || (selection?.kind === "SELECTED" && selection.needsExplicitUrl)) {
    return (
      <div className="min-h-screen bg-[#f4f7fb] p-10 text-center text-sm text-slate-500">
        <Loader2 className="mx-auto mb-3 animate-spin" size={20} />
        Resolving Core workspace…
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-[#f4f7fb] p-10 text-center text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (selection?.kind === "NO_WORKSPACE") {
    return (
      <div className="min-h-screen bg-[#f4f7fb] p-10 text-center text-sm text-amber-800">
        No active Core workspace is available. Knowledge will not fall back to an internal
        workspace.
      </div>
    );
  }

  if (selection?.kind === "FORBIDDEN") {
    return (
      <div className="min-h-screen bg-[#f4f7fb] p-10 text-center text-sm text-rose-700">
        Core workspace access denied: {selection.requestedWorkspaceId}
      </div>
    );
  }

  if (!contextValue) return null;

  return (
    <AdminWorkspaceContext.Provider value={contextValue}>{children}</AdminWorkspaceContext.Provider>
  );
}
