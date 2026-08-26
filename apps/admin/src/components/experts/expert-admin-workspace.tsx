"use client";

import { useEffect, useState } from "react";
import { ExpertQaWorkbench } from "./expert-qa-workbench";
import { ExpertSourceSearch } from "./expert-source-search";

type AdminWorkspaceOption = {
  workspaceId: string;
  name: string;
  role: string;
};

type AdminSession = {
  authenticated: true;
  userId: string;
  sessionId: string;
  sessionExpiresAt: string;
  csrfToken: string;
  workspaces: AdminWorkspaceOption[];
};

type ApiError = { error?: { message?: string } };

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | ApiError;
  if (!response.ok) {
    const error = body as ApiError;
    throw new Error(error.error?.message ?? `Request failed with HTTP ${response.status}`);
  }
  return body as T;
}

export function ExpertAdminWorkspace() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin-session", { cache: "no-store", credentials: "include" })
      .then((response) => responseJson<AdminSession>(response))
      .then((next) => {
        if (!active) return;
        setSession(next);
        setWorkspaceId(next.workspaces[0]?.workspaceId ?? "");
        setError(null);
      })
      .catch((sessionError: unknown) => {
        if (!active) return;
        setSession(null);
        setError(
          sessionError instanceof Error
            ? sessionError.message
            : "Admin browser authentication failed",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
        Resolving governed Admin session…
      </section>
    );
  }

  if (!session) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-950">Admin authentication required</p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
          {error ?? "Sign in through the MarkOrbit account surface before opening Expert tools."}
        </p>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-600">
          The Expert browser never receives Core session tokens, internal service credentials,
          Workspace Principal headers, roles or permission authority.
        </p>
      </section>
    );
  }

  if (!workspaceId || session.workspaces.length === 0) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-950">No active workspace membership</p>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          Core did not return an active workspace membership for this session. Expert data remains
          inaccessible until a governed workspace is available.
        </p>
      </section>
    );
  }

  const selected = session.workspaces.find((workspace) => workspace.workspaceId === workspaceId);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">
              Governed workspace context
            </p>
            <p className="mt-1 text-sm text-slate-700">
              Signed in as <span className="font-medium text-slate-950">{session.userId}</span>.
              Core resolves membership, role and permissions server-side for every Expert request.
            </p>
          </div>
          <label className="grid min-w-64 gap-1 text-xs font-medium text-slate-600">
            Workspace
            <select
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
              className="rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500"
            >
              {session.workspaces.map((workspace) => (
                <option key={workspace.workspaceId} value={workspace.workspaceId}>
                  {workspace.name} · {workspace.role}
                </option>
              ))}
            </select>
          </label>
        </div>
        {selected ? (
          <p className="mt-2 text-xs text-blue-800">
            {selected.workspaceId} · {selected.role}
          </p>
        ) : null}
      </section>

      <div key={workspaceId} className="space-y-6">
        <ExpertQaWorkbench workspaceId={workspaceId} csrfToken={session.csrfToken} />
        <ExpertSourceSearch workspaceId={workspaceId} />
      </div>
    </div>
  );
}
