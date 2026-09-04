"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Inbox, Loader2, RefreshCw } from "lucide-react";

type OperatorInboxCategory =
  | "ACQUISITION_FAILED"
  | "SOURCE_STALE_DEGRADED"
  | "NEW_MATERIAL"
  | "MATERIAL_CHANGE"
  | "NEEDS_REVIEW"
  | "VAULT_CONFLICT"
  | "READY_FOR_DELIVERY"
  | "DELIVERY_BLOCKED";

type OperatorInboxItem = {
  category: OperatorInboxCategory;
  id: string;
  objectType: string;
  objectId: string;
  title: string;
  reason: string;
  occurredAt: string;
  href: string;
};

type OperatorInboxResponse = {
  workspaceId: string;
  generatedAt: string;
  evidenceState: "COMPLETE" | "PARTIAL";
  unavailableEvidence: string[];
  total: number;
  categories: Array<{
    category: OperatorInboxCategory;
    count: number;
    items: OperatorInboxItem[];
  }>;
};

const labels: Record<OperatorInboxCategory, string> = {
  ACQUISITION_FAILED: "采集失败",
  SOURCE_STALE_DEGRADED: "来源需关注",
  NEW_MATERIAL: "新增材料",
  MATERIAL_CHANGE: "材料变更",
  NEEDS_REVIEW: "待复核",
  VAULT_CONFLICT: "Vault 冲突",
  READY_FOR_DELIVERY: "可交付",
  DELIVERY_BLOCKED: "交付阻塞",
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export function OperatorInbox({ workspaceId }: { workspaceId: string }) {
  const [state, setState] = useState<OperatorInboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/operator-inbox?workspaceId=${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(await readError(response));
      setState((await response.json()) as OperatorInboxResponse);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load Operator Inbox");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  if (loading && !state) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Loader2 size={17} className="animate-spin" aria-hidden="true" />
          正在读取 Operator Inbox…
        </div>
      </section>
    );
  }

  if (error && !state) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-semibold text-rose-800">
              <AlertTriangle size={17} aria-hidden="true" />
              Operator Inbox 暂时不可用
            </div>
            <p className="mt-1 text-sm text-rose-700">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700"
          >
            <RefreshCw size={14} aria-hidden="true" />
            重试
          </button>
        </div>
      </section>
    );
  }

  if (!state) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Inbox size={19} className="text-slate-700" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-950">Operator Inbox</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
              {state.total}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            从持久化 Knowledge 证据派生的今日工作入口，不保存组件内工作流状态。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          刷新
        </button>
      </div>

      {state.evidenceState === "PARTIAL" ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={16} aria-hidden="true" />
            部分证据不可用
          </div>
          <p className="mt-1 text-xs text-amber-700">
            当前计数不代表缺失来源为 0：{state.unavailableEvidence.join("、")}
          </p>
        </div>
      ) : null}

      {state.total === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          当前没有需要处理的持久化工作项。
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {state.categories.map((category) => (
            <div key={category.category} className="rounded-xl border border-slate-200 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800">{labels[category.category]}</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {category.count}
                </span>
              </div>
              {category.items.length === 0 ? (
                <p className="mt-3 text-xs text-slate-400">无待处理项</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {category.items.slice(0, 2).map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="group block rounded-lg bg-slate-50 px-3 py-2.5 transition hover:bg-slate-100"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="line-clamp-1 text-xs font-semibold text-slate-800">
                          {item.title}
                        </span>
                        <ArrowRight
                          size={13}
                          className="mt-0.5 shrink-0 text-slate-400 group-hover:text-slate-700"
                          aria-hidden="true"
                        />
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">
                        {item.reason}
                      </p>
                    </Link>
                  ))}
                  {category.count > 2 ? (
                    <p className="text-[11px] text-slate-400">另有 {category.count - 2} 项</p>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
