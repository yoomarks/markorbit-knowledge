"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Globe2,
  Loader2,
  RefreshCw,
  Send,
} from "lucide-react";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";
import { useAdminI18n } from "@/lib/i18n";

type CoverageTarget = {
  id: string;
  displayName: string;
  family: string;
  coverageTier: string;
  catalogState: string;
  canonicalUri: string;
  state: "REGISTERED" | "UNREGISTERED";
  sources: Array<{ id: string; name: string; status: string }>;
  discoveryCandidate?: { candidateId: string; status: string };
};

type CoverageItem = {
  jurisdiction: string;
  sourceCount: number;
  activeSourceCount: number;
  targetCount: number;
  registeredTargetCount: number;
  completenessPercent: number | null;
  foundational: {
    total: number;
    registered: number;
    completenessPercent: number | null;
  };
  missingFamilies: string[];
  missingCount: number;
  targets: CoverageTarget[];
};

type CoverageResponse = {
  items: CoverageItem[];
  summary: {
    jurisdictionCount: number;
    curatedJurisdictionCount: number;
    fullyCoveredCount: number;
    attentionCount: number;
  };
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function coverageTone(percent: number | null): string {
  if (percent === null) return "bg-slate-100 text-slate-600";
  if (percent >= 90) return "bg-emerald-50 text-emerald-700";
  if (percent >= 60) return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}

export function SourceCountryCoverage({ workspaceId }: { workspaceId: string }) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [result, setResult] = useState<CoverageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [queueingTargetId, setQueueingTargetId] = useState<string | null>(null);
  const [queueingJurisdiction, setQueueingJurisdiction] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/sources/coverage?workspaceId=${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(await readError(response));
      setResult((await response.json()) as CoverageResponse);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load coverage");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const queueForDiscovery = useCallback(
    async (targetId: string) => {
      setQueueingTargetId(targetId);
      try {
        const response = await fetch(
          `/api/source-coverage/${encodeURIComponent(targetId)}/discovery`,
          {
            method: "POST",
            headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
            body: JSON.stringify({ workspaceId }),
          },
        );
        if (!response.ok) throw new Error(await readError(response));
        setError(null);
        await refresh();
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : zh
              ? "无法送入 Discovery"
              : "Unable to queue the coverage target",
        );
      } finally {
        setQueueingTargetId(null);
      }
    },
    [refresh, workspaceId, zh],
  );

  const queueMissingForDiscovery = useCallback(
    async (targetIds: string[], jurisdiction: string) => {
      if (targetIds.length === 0) return;
      setQueueingJurisdiction(jurisdiction);
      try {
        const response = await fetch("/api/source-coverage/discovery", {
          method: "POST",
          headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ workspaceId, targetIds }),
        });
        if (!response.ok) throw new Error(await readError(response));
        setError(null);
        await refresh();
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : zh
              ? "无法批量送入 Discovery"
              : "Unable to queue the coverage targets",
        );
      } finally {
        setQueueingJurisdiction(null);
      }
    },
    [refresh, workspaceId, zh],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const sorted = useMemo(
    () =>
      [...(result?.items ?? [])].sort((left, right) => {
        if (left.targetCount > 0 && right.targetCount === 0) return -1;
        if (left.targetCount === 0 && right.targetCount > 0) return 1;
        return left.jurisdiction.localeCompare(right.jurisdiction);
      }),
    [result],
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div>
          <div className="flex items-center gap-2">
            <Globe2 size={19} className="text-emerald-700" />
            <h2 className="font-semibold text-slate-950">
              {zh ? "国家 / 地区资源完整度" : "Jurisdiction coverage"}
            </h2>
          </div>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
            {zh
              ? "按已登记 Source 与官方覆盖目录进行事实核对。完整度只表示资料来源是否覆盖，不代表法律结论或内容质量。"
              : "Compare registered Sources against the curated official coverage catalog. Completeness measures source coverage only; it is not a legal or content-quality conclusion."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          {zh ? "刷新" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {loading && !result ? (
        <div className="p-10 text-center text-sm text-slate-500">
          <Loader2 className="mx-auto mb-3 animate-spin" size={22} />
          {zh ? "正在核对资源覆盖…" : "Checking source coverage…"}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {sorted.map((item) => {
            const isExpanded = expanded === item.jurisdiction;
            const curated = item.targetCount > 0;
            const missing = item.targets.filter(
              (target) => target.catalogState === "ACTIVE" && target.state === "UNREGISTERED",
            );
            const unqueuedMissing = missing.filter((target) => !target.discoveryCandidate);
            return (
              <article key={item.jurisdiction} className="px-5 py-4 sm:px-6">
                <div className="grid gap-3 xl:grid-cols-[0.6fr_0.8fr_0.8fr_1.5fr_auto] xl:items-center">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{item.jurisdiction}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.activeSourceCount} {zh ? "个启用来源" : "active sources"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">{zh ? "总体覆盖" : "Overall coverage"}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${coverageTone(item.completenessPercent)}`}
                      >
                        {item.completenessPercent === null ? "—" : `${item.completenessPercent}%`}
                      </span>
                      {curated ? (
                        <span className="text-xs text-slate-500">
                          {item.registeredTargetCount}/{item.targetCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">{zh ? "基础资源" : "Foundational"}</p>
                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {item.foundational.total > 0
                        ? `${item.foundational.registered}/${item.foundational.total}`
                        : "—"}
                    </p>
                  </div>
                  <div className="min-w-0">
                    {curated ? (
                      item.missingCount > 0 ? (
                        <div className="flex items-start gap-2 text-sm text-amber-800">
                          <AlertCircle size={16} className="mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium">
                              {zh
                                ? `还有 ${item.missingCount} 类目标资源未覆盖`
                                : `${item.missingCount} catalog targets are missing`}
                            </p>
                            <p className="mt-1 truncate text-xs text-slate-500">
                              {item.missingFamilies.slice(0, 5).join(" · ")}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                          <CheckCircle2 size={16} />
                          {zh
                            ? "当前目录目标已全部覆盖"
                            : "All current catalog targets are covered"}
                        </div>
                      )
                    ) : (
                      <p className="text-sm text-slate-500">
                        {zh
                          ? "该地区已有来源，但尚未建立标准覆盖目录。"
                          : "Sources exist, but no curated coverage catalog is defined yet."}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 xl:justify-end">
                    {curated ? (
                      <button
                        type="button"
                        onClick={() => setExpanded(isExpanded ? null : item.jurisdiction)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600"
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {isExpanded ? (zh ? "收起" : "Hide") : zh ? "查看完整度" : "View coverage"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {isExpanded ? (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                          {zh ? "已覆盖资源" : "Covered resources"}
                        </h3>
                        <div className="mt-2 space-y-2">
                          {item.targets
                            .filter((target) => target.state === "REGISTERED")
                            .map((target) => (
                              <div
                                key={target.id}
                                className="rounded-lg bg-white px-3 py-2 text-xs"
                              >
                                <p className="font-medium text-slate-800">{target.displayName}</p>
                                <p className="mt-1 text-slate-500">
                                  {target.family} · {target.coverageTier}
                                </p>
                                <div className="mt-1 flex flex-wrap gap-2">
                                  {target.sources.map((source) => (
                                    <Link
                                      key={source.id}
                                      href={`/sources/${source.id}`}
                                      className="font-medium text-emerald-700 hover:underline"
                                    >
                                      {source.name}
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            ))}
                          {item.registeredTargetCount === 0 ? (
                            <p className="text-xs text-slate-500">
                              {zh ? "尚无目录目标被登记。" : "No catalog target is registered yet."}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold text-slate-900">
                            {zh ? "缺失资源" : "Missing resources"}
                          </h3>
                          {missing.length > 0 ? (
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {unqueuedMissing.length > 0 ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void queueMissingForDiscovery(
                                      unqueuedMissing.map((target) => target.id),
                                      item.jurisdiction,
                                    )
                                  }
                                  disabled={queueingJurisdiction === item.jurisdiction}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {queueingJurisdiction === item.jurisdiction ? (
                                    <Loader2 size={13} className="animate-spin" />
                                  ) : (
                                    <Send size={13} />
                                  )}
                                  {zh
                                    ? `全部送审 (${unqueuedMissing.length})`
                                    : `Send all (${unqueuedMissing.length})`}
                                </button>
                              ) : null}
                              <Link
                                href="/discovery"
                                className="text-xs font-semibold text-emerald-700 hover:underline"
                              >
                                {zh ? "前往 Discovery →" : "Open Discovery →"}
                              </Link>
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-2 space-y-2">
                          {missing.map((target) => (
                            <div key={target.id} className="rounded-lg bg-white px-3 py-2 text-xs">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <a
                                    href={target.canonicalUri}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-medium text-slate-800 hover:text-emerald-700 hover:underline"
                                  >
                                    {target.displayName}
                                  </a>
                                  <p className="mt-1 text-slate-500">
                                    {target.family} · {target.coverageTier}
                                  </p>
                                </div>
                                {target.discoveryCandidate ? (
                                  <Link
                                    href="/discovery"
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 font-semibold text-emerald-700 hover:bg-emerald-100"
                                  >
                                    {zh ? "已在 Discovery" : "In Discovery"} ·{" "}
                                    {target.discoveryCandidate.status}
                                  </Link>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => void queueForDiscovery(target.id)}
                                    disabled={queueingTargetId === target.id}
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {queueingTargetId === target.id ? (
                                      <Loader2 size={13} className="animate-spin" />
                                    ) : (
                                      <Send size={13} />
                                    )}
                                    {zh ? "送入 Discovery" : "Send to Discovery"}
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                          {missing.length === 0 ? (
                            <p className="text-xs text-emerald-700">
                              {zh
                                ? "没有缺失的 ACTIVE 目录目标。"
                                : "No ACTIVE catalog target is missing."}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
