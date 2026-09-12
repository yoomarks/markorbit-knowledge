"use client";

import { useEffect, useMemo, useState } from "react";
import type { AiAssignmentLibraryV1, AiKnowledgeAssignmentV1 } from "@markorbit/contracts";

type AdminSession = {
  authenticated: true;
  workspaces: Array<{ workspaceId: string; name: string; role: string }>;
};

type BankLibrary = {
  library: AiAssignmentLibraryV1;
  questions: AiKnowledgeAssignmentV1[];
};

type BankResponse = {
  libraries: BankLibrary[];
  totalQuestions: number;
};

type ApiError = { error?: { message?: string } };

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | ApiError;
  if (!response.ok) {
    throw new Error(
      (body as ApiError).error?.message ?? `Request failed with HTTP ${response.status}`,
    );
  }
  return body as T;
}
export function AiQuestionBankWorkbench() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [data, setData] = useState<BankResponse | null>(null);
  const [jurisdiction, setJurisdiction] = useState("ALL");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin-session", { cache: "no-store", credentials: "include" })
      .then((response) => responseJson<AdminSession>(response))
      .then((next) => {
        if (!active) return;
        setSession(next);
        setWorkspaceId(next.workspaces[0]?.workspaceId ?? "");
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "Failed to load Admin session");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    void fetch("/api/ai-question-bank", {
      cache: "no-store",
      credentials: "include",
      headers: { "x-markorbit-workspace-id": workspaceId },
    })
      .then((response) => responseJson<BankResponse>(response))
      .then((next) => {
        if (!active) return;
        setData(next);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "Failed to load AI Question Bank");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const visibleLibraries = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    return data.libraries
      .filter((item) => jurisdiction === "ALL" || item.library.jurisdiction === jurisdiction)
      .map((item) => ({
        ...item,
        questions: item.questions.filter((question) => {
          if (!needle) return true;
          return [question.title, question.topic, question.prompt, question.assignmentId]
            .join(" ")
            .toLowerCase()
            .includes(needle);
        }),
      }))
      .filter((item) => item.questions.length > 0);
  }, [data, jurisdiction, query]);

  if (!session && !error) {
    return <p className="text-sm text-slate-500">正在解析 Admin workspace…</p>;
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">基础问题总数</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {data?.totalQuestions ?? "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">题库</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {data?.libraries.length ?? "—"}
          </p>
          <p className="mt-1 text-xs text-slate-500">US / AU / CA</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className="text-xs font-medium text-emerald-700">System seeded</p>
          <p className="mt-2 text-sm font-semibold text-slate-950">Governed Assignment Library</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            读取时幂等初始化，不再依赖手工 bootstrap。
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[220px_1fr]">
          <select
            value={jurisdiction}
            onChange={(event) => setJurisdiction(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
          >
            <option value="ALL">全部法域 · All jurisdictions</option>
            {data?.libraries.map(({ library }) => (
              <option key={library.libraryId} value={library.jurisdiction}>
                {library.jurisdiction}
              </option>
            ))}
          </select>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、Topic、Prompt 或 Assignment ID"
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
          />
        </div>
      </section>

      {loading ? <p className="text-sm text-slate-500">正在读取基础问题库…</p> : null}
      <div className="space-y-5">
        {visibleLibraries.map(({ library, questions }) => (
          <section
            key={library.libraryId}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-950">{library.title}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {library.libraryId} · rev {library.revision} · {questions.length} questions
                </p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                {library.jurisdiction}
              </span>
            </div>
            <div className="space-y-3">
              {questions.map((question) => (
                <article
                  key={question.assignmentId}
                  className="rounded-xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{question.topic}</span>
                    <span>·</span>
                    <code>{question.assignmentId}</code>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-slate-950">{question.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{question.prompt}</p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
