"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, Loader2 } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAdminI18n } from "@/lib/i18n";
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

type KnowledgeWorkspaceContextValue = {
  workspaceId: string;
  workspace: KnowledgeWorkspaceOption;
  workspaces: KnowledgeWorkspaceOption[];
};

const KnowledgeWorkspaceContext = createContext<KnowledgeWorkspaceContextValue | null>(null);

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export function useKnowledgeWorkspace(): KnowledgeWorkspaceContextValue {
  const value = useContext(KnowledgeWorkspaceContext);
  if (!value) throw new Error("Knowledge workspace context is unavailable");
  return value;
}

export function KnowledgeWorkspaceBoundary({ children }: { children: ReactNode }) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedWorkspaceId = searchParams.get("workspaceId");
  const [session, setSession] = useState<AdminSessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
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
            requestError instanceof Error
              ? requestError.message
              : zh
                ? "无法读取 Admin workspace"
                : "Unable to load Admin workspace",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [zh]);

  const selection = useMemo(
    () =>
      session ? selectKnowledgeWorkspace(session.workspaces, requestedWorkspaceId) : null,
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

  const switchWorkspace = useCallback(
    (workspaceId: string) => {
      router.push(knowledgeWorkspaceHref(currentHref, workspaceId, { resetOffset: true }), {
        scroll: false,
      });
    },
    [currentHref, router],
  );

  const contextValue = useMemo<KnowledgeWorkspaceContextValue | null>(() => {
    if (!session || selection?.kind !== "SELECTED" || selection.needsExplicitUrl) return null;
    return {
      workspaceId: selection.workspace.workspaceId,
      workspace: selection.workspace,
      workspaces: session.workspaces,
    };
  }, [selection, session]);

  if (loading || selection?.kind === "SELECTED" && selection.needsExplicitUrl) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        <Loader2 className="mx-auto mb-3 animate-spin" size={20} />
        {zh ? "正在确认 Knowledge workspace…" : "Resolving Knowledge workspace…"}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
        <p className="font-semibold">
          {zh ? "无法确认 Admin workspace" : "Unable to resolve Admin workspace"}
        </p>
        <p className="mt-2">{error}</p>
      </div>
    );
  }

  if (selection?.kind === "NO_WORKSPACE") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        {zh
          ? "当前账号没有可用的 active workspace，Knowledge 不会回退到默认 workspace。"
          : "This account has no active workspace. Knowledge will not fall back to a default workspace."}
      </div>
    );
  }

  if (selection?.kind === "FORBIDDEN") {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
        <p className="font-semibold">
          {zh ? "无权访问该 Knowledge workspace" : "Knowledge workspace access denied"}
        </p>
        <p className="mt-2 break-all font-mono text-xs">{selection.requestedWorkspaceId}</p>
      </div>
    );
  }

  if (!contextValue) return null;

  return (
    <KnowledgeWorkspaceContext.Provider value={contextValue}>
      <div className="space-y-4">
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
              <Building2 size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-800">
                {contextValue.workspace.name}
              </p>
              <p className="truncate text-[10px] text-slate-400">
                {contextValue.workspace.workspaceId} · {contextValue.workspace.role}
              </p>
            </div>
          </div>
          {contextValue.workspaces.length > 1 ? (
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <span>{zh ? "Workspace" : "Workspace"}</span>
              <select
                value={contextValue.workspaceId}
                onChange={(event) => switchWorkspace(event.target.value)}
                className="max-w-64 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
              >
                {contextValue.workspaces.map((workspace) => (
                  <option key={workspace.workspaceId} value={workspace.workspaceId}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </section>
        {children}
      </div>
    </KnowledgeWorkspaceContext.Provider>
  );
}
