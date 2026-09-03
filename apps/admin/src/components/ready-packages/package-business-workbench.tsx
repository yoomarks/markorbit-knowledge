"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  PackageCheck,
  RefreshCw,
  Send,
} from "lucide-react";
import type { ReadyPackage } from "@markorbit/contracts";
import type { SourceListResult } from "@markorbit/persistence";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";
import { useAdminI18n } from "@/lib/i18n";
import {
  isCoreContentActionable,
  isCoreIntakeActionable,
  type ContentTransportStatus,
  type TransportStatus,
} from "./ready-package-delivery-policy";

type DeliveryDetail = {
  readyPackageStatus: ReadyPackage["status"];
  transportStatus: TransportStatus;
  outboundTransport: { configured: boolean; issueCode: string | null };
  contentTransportStatus: ContentTransportStatus;
  contentOutboundTransport: { configured: boolean; issueCode: string | null };
  latestCoreIntakeReceipt: {
    status: "RECEIVED" | "ACCEPTED" | "REJECTED";
    recordedAt: string;
  } | null;
  latestCoreIntakeSubmission: {
    submittedAt: string;
    state: "PENDING" | "RESULT_RECORDED";
  } | null;
  coreContentDelivery: {
    state: "PENDING" | "RESULT_RECORDED";
    preparedAt: string;
    updatedAt: string;
  } | null;
};

type PackageView = {
  readyPackage: ReadyPackage;
  detail: DeliveryDetail | null;
  sourceName: string;
  jurisdiction: string;
};

type BusinessStatus = "PREPARING" | "READY" | "DELIVERING" | "DELIVERED" | "ATTENTION";

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function businessStatus(item: PackageView): BusinessStatus {
  const { readyPackage, detail } = item;
  if (readyPackage.status === "CREATED") return "PREPARING";
  if (!detail) return "ATTENTION";
  if (detail.contentTransportStatus === "ACCEPTED") return "DELIVERED";
  if (
    detail.transportStatus === "REJECTED" ||
    detail.contentTransportStatus === "BLOCKED_REJECTED"
  ) {
    return "ATTENTION";
  }
  if (
    (detail.transportStatus === "NOT_SUBMITTED" && !detail.outboundTransport.configured) ||
    (detail.contentTransportStatus === "READY_TO_DELIVER" &&
      !detail.contentOutboundTransport.configured)
  ) {
    return "ATTENTION";
  }
  if (
    detail.transportStatus === "SUBMISSION_PENDING_RESULT" ||
    detail.transportStatus === "SUBMISSION_FINALIZATION_PENDING" ||
    detail.contentTransportStatus === "WAITING_FOR_INTAKE" ||
    detail.contentTransportStatus === "CONTENT_PENDING_RESULT" ||
    detail.contentTransportStatus === "CONTENT_FINALIZATION_PENDING"
  ) {
    return "DELIVERING";
  }
  return "READY";
}

function statusTone(status: BusinessStatus): string {
  if (status === "DELIVERED") return "bg-emerald-50 text-emerald-700";
  if (status === "ATTENTION") return "bg-rose-50 text-rose-700";
  if (status === "DELIVERING") return "bg-amber-50 text-amber-700";
  if (status === "READY") return "bg-sky-50 text-sky-700";
  return "bg-slate-100 text-slate-600";
}

export function PackageBusinessWorkbench({ workspaceId }: { workspaceId: string }) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [items, setItems] = useState<PackageView[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const copy = {
    preparing: zh ? "准备中" : "Preparing",
    ready: zh ? "待交付" : "Ready",
    delivering: zh ? "交付中" : "Delivering",
    delivered: zh ? "已交付" : "Delivered",
    attention: zh ? "需处理" : "Needs attention",
    total: zh ? "资料包" : "Packages",
    refresh: zh ? "刷新" : "Refresh",
    source: zh ? "来源" : "Source",
    jurisdiction: zh ? "国家 / 地区" : "Jurisdiction",
    evidence: zh ? "证据" : "Evidence",
    created: zh ? "创建时间" : "Created",
    status: zh ? "状态" : "Status",
    action: zh ? "操作" : "Action",
    continue: zh ? "继续交付" : "Continue delivery",
    retry: zh ? "重新处理" : "Retry delivery",
    details: zh ? "技术详情" : "Technical details",
    hideDetails: zh ? "收起详情" : "Hide details",
    empty: zh ? "目前还没有资料包" : "No packages yet",
    emptyHint: zh
      ? "知识资料完成验证并生成资料包后，会自动出现在这里。"
      : "Validated knowledge packages will appear here automatically.",
  };

  const label = useCallback(
    (status: BusinessStatus) => {
      if (status === "PREPARING") return copy.preparing;
      if (status === "READY") return copy.ready;
      if (status === "DELIVERING") return copy.delivering;
      if (status === "DELIVERED") return copy.delivered;
      return copy.attention;
    },
    [copy.attention, copy.delivered, copy.delivering, copy.preparing, copy.ready],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [packagesResponse, sourcesResponse] = await Promise.all([
        fetch(`/api/ready-packages?workspaceId=${encodeURIComponent(workspaceId)}`, {
          cache: "no-store",
        }),
        fetch(`/api/sources?workspaceId=${encodeURIComponent(workspaceId)}&limit=100`, {
          cache: "no-store",
        }),
      ]);
      if (!packagesResponse.ok) throw new Error(await readError(packagesResponse));
      if (!sourcesResponse.ok) throw new Error(await readError(sourcesResponse));
      const packagesBody = (await packagesResponse.json()) as { readyPackages: ReadyPackage[] };
      const sourceBody = (await sourcesResponse.json()) as SourceListResult;
      const sourceMap = new Map(sourceBody.items.map((source) => [source.id, source]));
      const detailResults = await Promise.all(
        packagesBody.readyPackages.map(async (readyPackage) => {
          try {
            const response = await fetch(
              `/api/ready-packages/${encodeURIComponent(readyPackage.id)}/core-intake?workspaceId=${encodeURIComponent(workspaceId)}`,
              { cache: "no-store" },
            );
            if (!response.ok) return null;
            return (await response.json()) as DeliveryDetail;
          } catch {
            return null;
          }
        }),
      );
      const next = packagesBody.readyPackages.map((readyPackage, index) => {
        const source = readyPackage.evidence.sourceId
          ? sourceMap.get(readyPackage.evidence.sourceId)
          : undefined;
        return {
          readyPackage,
          detail: detailResults[index] ?? null,
          sourceName: source?.name ?? (readyPackage.evidence.sourceId || "—"),
          jurisdiction: source?.jurisdictions.join(", ") || "—",
        };
      });
      setItems(next);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load packages");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const summary = useMemo(() => {
    const counts: Record<BusinessStatus, number> = {
      PREPARING: 0,
      READY: 0,
      DELIVERING: 0,
      DELIVERED: 0,
      ATTENTION: 0,
    };
    for (const item of items) counts[businessStatus(item)] += 1;
    return counts;
  }, [items]);

  async function continueDelivery(item: PackageView) {
    const detail = item.detail;
    if (!detail) return;
    const intakeActionable = isCoreIntakeActionable(
      item.readyPackage.status,
      detail.transportStatus,
      detail.outboundTransport.configured,
    );
    const contentActionable = isCoreContentActionable(
      item.readyPackage.status,
      detail.contentTransportStatus,
      detail.contentOutboundTransport.configured,
    );
    const target = intakeActionable
      ? "core-intake/submit"
      : contentActionable
        ? "core-content/submit"
        : null;
    if (!target) return;

    setWorkingId(item.readyPackage.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/ready-packages/${encodeURIComponent(item.readyPackage.id)}/${target}`,
        {
          method: "POST",
          headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({
            workspaceId,
            expectedDigest: item.readyPackage.evidence.digest,
            submit: true,
          }),
        },
      );
      if (!response.ok) throw new Error(await readError(response));
      setMessage(
        zh
          ? "交付步骤已完成，状态已从持久化交付证据重新读取。"
          : "Delivery step completed; status has been refreshed from durable delivery evidence.",
      );
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Delivery failed");
    } finally {
      setWorkingId(null);
    }
  }

  function canContinue(item: PackageView): boolean {
    if (!item.detail) return false;
    return (
      isCoreIntakeActionable(
        item.readyPackage.status,
        item.detail.transportStatus,
        item.detail.outboundTransport.configured,
      ) ||
      isCoreContentActionable(
        item.readyPackage.status,
        item.detail.contentTransportStatus,
        item.detail.contentOutboundTransport.configured,
      )
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          [copy.preparing, summary.PREPARING],
          [copy.ready, summary.READY],
          [copy.delivering, summary.DELIVERING],
          [copy.delivered, summary.DELIVERED],
          [copy.attention, summary.ATTENTION],
        ].map(([title, value]) => (
          <div key={String(title)} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{title}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-950">
              {zh ? "资料包交付" : "Package delivery"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {zh
                ? "正常操作只显示业务状态；底层交付协议仅在技术详情中保留。"
                : "Normal operations show business states; protocol details remain available only for diagnostics."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> {copy.refresh}
          </button>
        </div>

        {message ? (
          <div className="border-b border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        {loading && items.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            <Loader2 className="mx-auto mb-3 animate-spin" size={22} />
            {zh ? "正在读取资料包…" : "Loading packages…"}
          </div>
        ) : items.length === 0 ? (
          <div className="p-14 text-center">
            <PackageCheck className="mx-auto text-slate-300" size={34} />
            <h3 className="mt-4 font-semibold text-slate-900">{copy.empty}</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">{copy.emptyHint}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item) => {
              const state = businessStatus(item);
              const expanded = expandedId === item.readyPackage.id;
              const actionable = canContinue(item);
              return (
                <article key={item.readyPackage.id} className="px-5 py-5 sm:px-6">
                  <div className="grid gap-4 xl:grid-cols-[minmax(220px,1.4fr)_1fr_0.7fr_0.7fr_0.8fr_auto] xl:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-950">
                        {item.readyPackage.id}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">{item.sourceName}</p>
                    </div>
                    <div className="text-sm text-slate-700">
                      <p className="text-xs text-slate-400">{copy.jurisdiction}</p>
                      <p className="mt-1">{item.jurisdiction}</p>
                    </div>
                    <div className="text-sm text-slate-700">
                      <p className="text-xs text-slate-400">{copy.evidence}</p>
                      <p className="mt-1">{item.readyPackage.evidence.artifactIds.length}</p>
                    </div>
                    <div className="text-sm text-slate-700">
                      <p className="text-xs text-slate-400">{copy.created}</p>
                      <p className="mt-1 text-xs">
                        {new Date(item.readyPackage.createdAt).toLocaleString(locale)}
                      </p>
                    </div>
                    <div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(state)}`}
                      >
                        {label(state)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                      {actionable ? (
                        <button
                          type="button"
                          onClick={() => void continueDelivery(item)}
                          disabled={workingId === item.readyPackage.id}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {workingId === item.readyPackage.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Send size={14} />
                          )}
                          {state === "ATTENTION" ? copy.retry : copy.continue}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : item.readyPackage.id)}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600"
                      >
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {expanded ? copy.hideDetails : copy.details}
                      </button>
                    </div>
                  </div>

                  {state === "ATTENTION" ? (
                    <div className="mt-3 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
                      <AlertCircle size={15} className="mt-0.5 shrink-0" />
                      <span>
                        {item.detail?.transportStatus === "REJECTED" ||
                        item.detail?.contentTransportStatus === "BLOCKED_REJECTED"
                          ? zh
                            ? "下游拒绝了最近一次交付，请核对后重新处理。"
                            : "The latest downstream delivery was rejected. Review and retry when ready."
                          : zh
                            ? "交付服务尚未配置或状态无法确认，请检查系统配置。"
                            : "Delivery transport is not configured or its state cannot be confirmed."}
                      </span>
                    </div>
                  ) : state === "DELIVERED" ? (
                    <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700">
                      <CheckCircle2 size={14} />
                      {zh
                        ? "下游已确认接收资料内容。"
                        : "Downstream has confirmed receipt of package content."}
                    </div>
                  ) : null}

                  {expanded ? (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <p>
                          <span className="text-slate-400">ReadyPackage: </span>
                          {item.readyPackage.status}
                        </p>
                        <p>
                          <span className="text-slate-400">Intake: </span>
                          {item.detail?.transportStatus ?? "UNKNOWN"}
                        </p>
                        <p>
                          <span className="text-slate-400">Content: </span>
                          {item.detail?.contentTransportStatus ?? "UNKNOWN"}
                        </p>
                        <p className="truncate">
                          <span className="text-slate-400">Digest: </span>
                          {item.readyPackage.evidence.digest}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
