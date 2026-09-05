"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Activity, Building2, ExternalLink, FileStack, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminI18n } from "@/lib/i18n";
import {
  knowledgeWorkspaceHref,
  selectKnowledgeWorkspace,
  type KnowledgeWorkspaceOption,
} from "@/lib/knowledge-workspace-model";

type CoverageStatus = "COMPLETE" | "PARTIAL" | "UNKNOWN";

type CoverageRow = {
  targetId: string;
  jurisdiction: string;
  authorityName: string;
  authorityLevel: string;
  family: string;
  displayName: string;
  coverageTier: string;
  catalogState: string;
  canonicalUri: string;
  coverageStatus: CoverageStatus;
  coverageReasons: string[];
  sources: Array<{ id: string; name: string; status: string }>;
  acquisition: {
    mode: string;
    expectedArtifactKinds: string[];
    observedArtifactKinds: string[];
    missingExpectedArtifactKinds: string[];
    latestSuccessfulAt: string | null;
    latestArtifactId: string | null;
    renderJavascriptHint: boolean;
    fetchAttachmentsHint: boolean;
  };
  lastCheck: {
    at: string | null;
    runId: string | null;
    runStatus: string | null;
    compatibilityState: string;
    compatibilityFreshness: string;
  };
  lastObjectiveChange: {
    sourceId: string;
    documentId: string;
    version: number;
    observedAt: string;
    addedSections: number;
    removedSections: number;
    modifiedSections: number;
  } | null;
  health: { state: string; freshness: string; gaps: string[] };
  limitationNote: string | null;
};

type BoardResponse = {
  workspaceId: string;
  observedAt: string;
  rows: CoverageRow[];
  summary: {
    total: number;
    complete: number;
    partial: number;
    unknown: number;
    requiringAttention: number;
  };
};

type AdminSessionResponse = {
  authenticated: true;
  userId: string;
  workspaces: KnowledgeWorkspaceOption[];
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function formatTime(value: string | null, locale: string): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(locale);
}

function humanize(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function StatusBadge({ value }: { value: CoverageStatus }) {
  const tone =
    value === "COMPLETE"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : value === "PARTIAL"
        ? "bg-amber-50 text-amber-800 ring-amber-200"
        : "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${tone}`}
    >
      {value}
    </span>
  );
}

function Board({ workspaceId }: { workspaceId: string }) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [result, setResult] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<CoverageStatus | "ALL">("ALL");
  const [query, setQuery] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/source-coverage/board?workspaceId=${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(await readError(response));
      setResult((await response.json()) as BoardResponse);
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to load coverage board",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (result?.rows ?? []).filter((row) => {
      if (status !== "ALL" && row.coverageStatus !== status) return false;
      if (!needle) return true;
      return [
        row.jurisdiction,
        row.authorityName,
        row.family,
        row.displayName,
        ...row.sources.map((source) => source.name),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [query, result, status]);

  const grouped = useMemo(() => {
    const groups = new Map<string, CoverageRow[]>();
    rows.forEach((row) =>
      groups.set(row.jurisdiction, [...(groups.get(row.jurisdiction) ?? []), row]),
    );
    return [...groups.entries()];
  }, [rows]);

  if (loading && !result) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
        <Loader2 className="mx-auto mb-3 animate-spin" size={20} />
        {zh ? "正在读取证据供应覆盖…" : "Loading evidence-supply coverage…"}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/30">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-blue-600" />
              <h2 className="font-semibold text-slate-950">Source Coverage Board</h2>
            </div>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
              {zh
                ? "这里的 COMPLETE 只表示已知 evidence-supply 路径有可验证的采集、规范化、检索与预期 artifact 证据；不代表法律、语义或一国资料已绝对完整。任何无证据或无法确认的边界保持 UNKNOWN / PARTIAL。"
                : "COMPLETE means only that the known evidence-supply path is durably evidenced across acquisition, normalization, retrieval, and expected artifact kinds. It is not a legal or semantic completeness opinion."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            {zh ? "刷新事实" : "Refresh facts"}
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            [zh ? "覆盖目标" : "Targets", result?.summary.total ?? 0],
            ["COMPLETE", result?.summary.complete ?? 0],
            ["PARTIAL", result?.summary.partial ?? 0],
            ["UNKNOWN", result?.summary.unknown ?? 0],
            [zh ? "需要关注" : "Needs attention", result?.summary.requiringAttention ?? 0],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
            >
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              zh
                ? "搜索辖区、机构、family 或 source"
                : "Search jurisdiction, authority, family, or source"
            }
            className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm sm:max-w-md"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as CoverageStatus | "ALL")}
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm"
          >
            <option value="ALL">{zh ? "全部状态" : "All statuses"}</option>
            <option value="COMPLETE">COMPLETE</option>
            <option value="PARTIAL">PARTIAL</option>
            <option value="UNKNOWN">UNKNOWN</option>
          </select>
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          {zh ? "事实快照" : "Observed"}: {formatTime(result?.observedAt ?? null, locale)}
        </p>
      </section>

      {grouped.map(([jurisdiction, jurisdictionRows]) => (
        <section
          key={jurisdiction}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-5 py-3">
            <div>
              <span className="text-sm font-semibold text-slate-950">{jurisdiction}</span>
              <span className="ml-2 text-xs text-slate-500">
                {jurisdictionRows.length} {zh ? "个 source family 目标" : "source-family targets"}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1420px] text-left text-sm">
              <thead className="bg-white text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">{zh ? "边界" : "Boundary"}</th>
                  <th className="px-5 py-3 font-medium">
                    {zh ? "机构 / Family" : "Authority / family"}
                  </th>
                  <th className="px-5 py-3 font-medium">Sources</th>
                  <th className="px-5 py-3 font-medium">
                    {zh ? "最后成功采集" : "Last acquisition"}
                  </th>
                  <th className="px-5 py-3 font-medium">{zh ? "最后检查" : "Last check"}</th>
                  <th className="px-5 py-3 font-medium">
                    {zh ? "最后客观变化" : "Last objective change"}
                  </th>
                  <th className="px-5 py-3 font-medium">
                    {zh ? "健康 / 限制" : "Health / limits"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jurisdictionRows.map((row) => (
                  <tr key={row.targetId} className="align-top hover:bg-slate-50/60">
                    <td className="px-5 py-4">
                      <StatusBadge value={row.coverageStatus} />
                      {row.coverageReasons.length ? (
                        <p className="mt-2 max-w-52 text-[10px] leading-4 text-slate-500">
                          {row.coverageReasons.map(humanize).join(" · ")}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4">
                      <a
                        href={row.canonicalUri}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-72 items-center gap-1 font-semibold text-slate-950 hover:text-blue-700"
                      >
                        {row.displayName}
                        <ExternalLink size={12} />
                      </a>
                      <p className="mt-1 text-xs text-slate-600">{row.authorityName}</p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {row.family} · {row.authorityLevel} · {row.coverageTier}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      {row.sources.length ? (
                        <div className="space-y-1">
                          {row.sources.map((source) => (
                            <Link
                              key={source.id}
                              href={`/sources/${source.id}`}
                              className="block max-w-56 truncate text-xs font-medium text-blue-700 hover:underline"
                              title={source.name}
                            >
                              {source.name}{" "}
                              <span className="text-[10px] text-slate-400">· {source.status}</span>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">
                          {zh ? "未登记" : "Unregistered"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-xs text-slate-800">
                        {formatTime(row.acquisition.latestSuccessfulAt, locale)}
                      </p>
                      {row.acquisition.latestArtifactId ? (
                        <Link
                          href={`/artifacts/${row.acquisition.latestArtifactId}`}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:underline"
                        >
                          <FileStack size={11} />
                          Artifact
                        </Link>
                      ) : (
                        <Link
                          href="/artifacts"
                          className="mt-1 block text-[11px] text-slate-500 hover:underline"
                        >
                          Artifacts
                        </Link>
                      )}
                      <p className="mt-2 text-[10px] text-slate-400">
                        {row.acquisition.mode} · observed{" "}
                        {row.acquisition.observedArtifactKinds.join(", ") || "—"}
                      </p>
                      {row.acquisition.missingExpectedArtifactKinds.length ? (
                        <p className="mt-1 text-[10px] text-amber-700">
                          missing: {row.acquisition.missingExpectedArtifactKinds.join(", ")}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-xs text-slate-800">
                        {formatTime(row.lastCheck.at, locale)}
                      </p>
                      {row.lastCheck.runId ? (
                        <Link
                          href={`/runs/${row.lastCheck.runId}`}
                          className="mt-1 block max-w-48 truncate text-[11px] text-blue-700 hover:underline"
                        >
                          Run · {row.lastCheck.runStatus}
                        </Link>
                      ) : (
                        <Link
                          href="/runs"
                          className="mt-1 block text-[11px] text-slate-500 hover:underline"
                        >
                          Runs
                        </Link>
                      )}
                      <p className="mt-1 text-[10px] text-slate-400">
                        compatibility {row.lastCheck.compatibilityState} ·{" "}
                        {row.lastCheck.compatibilityFreshness}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      {row.lastObjectiveChange ? (
                        <>
                          <p className="text-xs text-slate-800">
                            {formatTime(row.lastObjectiveChange.observedAt, locale)}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            v{row.lastObjectiveChange.version} · +
                            {row.lastObjectiveChange.addedSections} / −
                            {row.lastObjectiveChange.removedSections} / ≈
                            {row.lastObjectiveChange.modifiedSections}
                          </p>
                          <Link
                            href={`/sources/${row.lastObjectiveChange.sourceId}`}
                            className="mt-1 block text-[11px] text-blue-700 hover:underline"
                          >
                            {zh ? "查看来源证据" : "Source evidence"}
                          </Link>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">
                          {zh ? "尚无 UPDATED 变化事实" : "No UPDATED change observed"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-xs font-medium text-slate-800">
                        {row.health.state} · {row.health.freshness}
                      </p>
                      {row.health.gaps.length ? (
                        <p className="mt-1 max-w-64 text-[10px] leading-4 text-amber-700">
                          {row.health.gaps.map(humanize).join(" · ")}
                        </p>
                      ) : null}
                      {row.limitationNote ? (
                        <p className="mt-2 max-w-72 text-[10px] leading-4 text-slate-600">
                          {row.limitationNote}
                        </p>
                      ) : null}
                      <p className="mt-2 text-[10px] text-slate-400">
                        {row.acquisition.renderJavascriptHint ? "JS render · " : ""}
                        {row.acquisition.fetchAttachmentsHint
                          ? "attachments expected"
                          : "no attachment requirement"}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {!loading && grouped.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          {zh ? "当前筛选没有 Coverage 行。" : "No coverage rows match the current filters."}
        </div>
      ) : null}
    </div>
  );
}

export function SourceCoverageBoardWorkspace() {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedWorkspaceId = searchParams.get("workspaceId");
  const [session, setSession] = useState<AdminSessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin-session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        const value = (await response.json()) as AdminSessionResponse;
        if (active) setSession(value);
      })
      .catch((requestError: unknown) => {
        if (active)
          setError(
            requestError instanceof Error ? requestError.message : "Unable to load Admin workspace",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  const selection = useMemo(
    () => (session ? selectKnowledgeWorkspace(session.workspaces, requestedWorkspaceId) : null),
    [requestedWorkspaceId, session],
  );
  const currentHref = useMemo(
    () => `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
    [pathname, searchParams],
  );

  useEffect(() => {
    if (selection?.kind !== "SELECTED" || !selection.needsExplicitUrl) return;
    router.replace(knowledgeWorkspaceHref(currentHref, selection.workspace.workspaceId), {
      scroll: false,
    });
  }, [currentHref, router, selection]);

  if (error)
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
        {error}
      </div>
    );
  if (!session || (selection?.kind === "SELECTED" && selection.needsExplicitUrl))
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        <Loader2 className="mx-auto mb-3 animate-spin" size={20} />
        {zh ? "正在确认 Source Coverage workspace…" : "Resolving Source Coverage workspace…"}
      </div>
    );
  if (selection?.kind === "NO_WORKSPACE")
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        {zh
          ? "当前账号没有 active workspace；Coverage Board 不会回退到默认 workspace。"
          : "No active workspace is available; the board will not fall back to a default workspace."}
      </div>
    );
  if (selection?.kind === "FORBIDDEN")
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
        {zh ? "无权访问该 workspace。" : "Workspace access denied."}
      </div>
    );
  if (selection?.kind !== "SELECTED") return null;

  const switchWorkspace = (workspaceId: string) =>
    router.push(knowledgeWorkspaceHref(currentHref, workspaceId), { scroll: false });
  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-600">
            <Building2 size={16} />
          </span>
          <div>
            <p className="text-xs font-semibold text-slate-800">{selection.workspace.name}</p>
            <p className="text-[10px] text-slate-400">
              {selection.workspace.workspaceId} · {selection.workspace.role}
            </p>
          </div>
        </div>
        {session.workspaces.length > 1 ? (
          <select
            value={selection.workspace.workspaceId}
            onChange={(event) => switchWorkspace(event.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
          >
            {session.workspaces.map((workspace) => (
              <option key={workspace.workspaceId} value={workspace.workspaceId}>
                {workspace.name}
              </option>
            ))}
          </select>
        ) : null}
      </section>
      <Board workspaceId={selection.workspace.workspaceId} />
    </div>
  );
}
