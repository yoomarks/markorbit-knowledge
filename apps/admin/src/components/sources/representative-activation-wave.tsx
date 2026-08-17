"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Globe2,
  Loader2,
  RefreshCw,
  Rocket,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useAdminI18n } from "@/lib/i18n";

type ActivationJurisdiction = {
  jurisdiction: string;
  displayName: string;
  profile: string;
  purpose: string;
  targetCount: number;
  registered: number;
  activated: number;
  healthy: number;
  missing: number;
  queuedForReview: number;
};

type ActivationPreview = {
  version: string;
  workspaceId: string;
  targetCount: number;
  registeredTargetCount: number;
  activatedTargetCount: number;
  healthyTargetCount: number;
  missingTargetCount: number;
  queuedForReviewCount: number;
  queueableTargetCount: number;
  jurisdictions: ActivationJurisdiction[];
  missingTargetIds: string[];
};

type ActivationQueueResult = {
  preview: ActivationPreview;
  intake: {
    total: number;
    queued: number;
    alreadyInDiscovery: number;
    alreadyCovered: number;
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

function ratio(value: number, total: number): string {
  return total === 0 ? "—" : `${Math.round((value / total) * 100)}%`;
}

function profileLabel(profile: string): string {
  return profile.replaceAll("_", " ");
}

export function RepresentativeActivationWave({ workspaceId }: { workspaceId: string }) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [preview, setPreview] = useState<ActivationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [queueing, setQueueing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastIntake, setLastIntake] = useState<ActivationQueueResult["intake"] | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/source-coverage/activation-wave?workspaceId=${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(await readError(response));
      setPreview((await response.json()) as ActivationPreview);
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : zh
            ? "无法加载代表性激活波次"
            : "Unable to load the representative activation wave",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId, zh]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const queueWave = useCallback(async () => {
    setQueueing(true);
    setError(null);
    try {
      const response = await fetch("/api/source-coverage/activation-wave", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as ActivationQueueResult;
      setPreview(result.preview);
      setLastIntake(result.intake);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : zh
            ? "无法送入 Discovery"
            : "Unable to queue the activation wave",
      );
    } finally {
      setQueueing(false);
    }
  }, [workspaceId, zh]);

  if (loading && !preview) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        <Loader2 className="mx-auto mb-3 animate-spin text-blue-600" size={22} />
        {zh ? "正在准备代表性全球激活波次…" : "Preparing representative global activation wave…"}
      </section>
    );
  }

  const complete = (preview?.healthyTargetCount ?? 0) === (preview?.targetCount ?? 0) &&
    (preview?.targetCount ?? 0) > 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/30">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div>
          <div className="flex items-center gap-2">
            <Rocket size={19} className="text-blue-600" />
            <h2 className="font-semibold text-slate-950">
              {zh
                ? "代表性全球激活波次 / Representative Activation"
                : "Representative Activation / 代表性全球激活波次"}
            </h2>
          </div>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
            {zh
              ? "先用 12 个具有不同技术形态的商标辖区验证真实供应链：核心市场、动态门户、多语言站点、中东服务门户、EUIPO 区域路径和 OAPI 区域路径。送入 Discovery 只创建待审查候选，不会绕过人工批准直接采集。"
              : "Validate real supply across 12 technically diverse trademark jurisdictions: core markets, dynamic portals, multilingual sites, MENA service portals, EUIPO regional reuse and OAPI regional reuse. Queueing creates review candidates only; it never bypasses human approval to start collection."}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || queueing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            {zh ? "刷新" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => void queueWave()}
            disabled={queueing || !preview || preview.queueableTargetCount === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {queueing ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {preview?.queueableTargetCount
              ? zh
                ? `送入 Discovery (${preview.queueableTargetCount})`
                : `Queue to Discovery (${preview.queueableTargetCount})`
              : zh
                ? "已全部送审 / 覆盖"
                : "All queued / covered"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {lastIntake ? (
        <div className="border-b border-blue-100 bg-blue-50 px-5 py-3 text-sm text-blue-800 sm:px-6">
          {zh
            ? `本次处理 ${lastIntake.total} 个目标：新增送审 ${lastIntake.queued}，已在 Discovery ${lastIntake.alreadyInDiscovery}，已覆盖 ${lastIntake.alreadyCovered}。`
            : `Processed ${lastIntake.total} targets: ${lastIntake.queued} newly queued, ${lastIntake.alreadyInDiscovery} already in Discovery, ${lastIntake.alreadyCovered} already covered.`}
        </div>
      ) : null}

      <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
        {[
          {
            label: zh ? "波次目标" : "Wave targets",
            value: preview?.targetCount ?? 0,
            detail: `${preview?.jurisdictions.length ?? 0} ${zh ? "个辖区" : "jurisdictions"}`,
            icon: Globe2,
          },
          {
            label: zh ? "已登记" : "Registered",
            value: preview?.registeredTargetCount ?? 0,
            detail: ratio(preview?.registeredTargetCount ?? 0, preview?.targetCount ?? 0),
            icon: CheckCircle2,
          },
          {
            label: zh ? "已激活" : "Activated",
            value: preview?.activatedTargetCount ?? 0,
            detail: ratio(preview?.activatedTargetCount ?? 0, preview?.targetCount ?? 0),
            icon: Rocket,
          },
          {
            label: zh ? "健康供应" : "Healthy supply",
            value: preview?.healthyTargetCount ?? 0,
            detail: ratio(preview?.healthyTargetCount ?? 0, preview?.targetCount ?? 0),
            icon: ShieldCheck,
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-slate-500">{card.label}</p>
                <Icon size={16} className="text-slate-400" />
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{card.value}</p>
              <p className="mt-1 text-xs text-slate-500">{card.detail}</p>
            </div>
          );
        })}
      </div>

      <div className="border-t border-slate-200 p-5 sm:p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">
            {zh ? "波次辖区状态" : "Wave jurisdiction status"}
          </h3>
          {complete ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <ShieldCheck size={13} /> {zh ? "全量健康" : "Fully healthy"}
            </span>
          ) : (
            <span className="text-xs text-slate-500">
              {preview?.queuedForReviewCount ?? 0} {zh ? "个目标等待人工审查" : "targets awaiting human review"}
            </span>
          )}
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {(preview?.jurisdictions ?? []).map((item) => (
            <div key={item.jurisdiction} className="rounded-xl border border-slate-200 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {item.jurisdiction} · {item.displayName}
                  </p>
                  <p className="mt-1 text-[10px] font-medium tracking-wide text-slate-400">
                    {profileLabel(item.profile)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    item.healthy === item.targetCount && item.targetCount > 0
                      ? "bg-emerald-50 text-emerald-700"
                      : item.queuedForReview > 0
                        ? "bg-blue-50 text-blue-700"
                        : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {item.healthy}/{item.targetCount}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">{item.purpose}</p>
              <p className="mt-2 text-[11px] text-slate-500">
                {zh ? "登记" : "Registered"} {item.registered} · {zh ? "激活" : "Activated"} {item.activated} · {zh ? "缺失" : "Missing"} {item.missing} · Discovery {item.queuedForReview}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
