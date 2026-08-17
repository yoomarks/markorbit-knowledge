"use client";

import { AlertTriangle, CheckCircle2, Eye, ShieldCheck } from "lucide-react";
import type { FoundationalRemediationQueueSnapshot } from "@markorbit/worker-runtime/foundational-remediation-snapshot";
import {
  foundationalAdvancedCapabilities,
  hasFoundationalAdvancedCapability,
  type FoundationalAdvancedJurisdiction,
} from "./foundational-advanced-capabilities";

type Props = {
  jurisdiction: FoundationalAdvancedJurisdiction;
  snapshot: FoundationalRemediationQueueSnapshot;
};

function stateTone(value: string): string {
  if (value === "READY" || value === "PASS") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (value === "DEGRADED" || value === "STALE" || value === "MISSING") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (value === "BLOCKED") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function timeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function FoundationalLimitedDiagnostics({ jurisdiction, snapshot }: Props) {
  const capabilities = foundationalAdvancedCapabilities(jurisdiction);
  const compatibilityReprobeEnabled = hasFoundationalAdvancedCapability(
    jurisdiction,
    "COMPATIBILITY_REPROBE",
  );
  return (
    <section className="rounded-2xl border border-sky-200 bg-white">
      <div className="border-b border-sky-100 bg-sky-50/60 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-white px-2.5 py-1 text-xs font-semibold text-sky-800">
                <Eye size={13} aria-hidden="true" /> Limited Advanced scope
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                {jurisdiction}
              </span>
            </div>
            <h2 className="mt-3 font-semibold text-slate-950">Foundational diagnostics</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
              该辖区已进入 Foundational 健康观察范围。当前暴露 readiness、供给健康与 deterministic
              relevance 诊断；
              {compatibilityReprobeEnabled
                ? " compatibility re-probe 已通过专项 promotion proof，并在下方作为独立受控 Worker 操作提供。"
                : " compatibility re-probe 尚未晋级。"}
              采集派发、转换恢复、reindex 与 quality remediation 等内容写路径仍不会在此显示。
            </p>
          </div>
          <div className="text-xs text-slate-500 lg:text-right">
            <p>Observed · {timeLabel(snapshot.observedAt)}</p>
            <p className="mt-1">
              Mutation authorization · {compatibilityReprobeEnabled ? "REPROBE ONLY" : "NONE"}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Readiness
            </p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <strong className="text-2xl font-semibold text-slate-950">
                {snapshot.readiness.readyPercent}%
              </strong>
              <span
                className={`rounded-full border px-2 py-1 text-xs font-semibold ${stateTone(snapshot.readiness.state)}`}
              >
                {snapshot.readiness.state}
              </span>
            </div>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Targets</p>
            <strong className="mt-2 block text-2xl font-semibold text-slate-950">
              {snapshot.readiness.totalCount}
            </strong>
            <p className="mt-1 text-xs text-slate-500">
              {snapshot.readiness.readyCount} READY · {snapshot.readiness.blockingCount} attention
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Queue</p>
            <strong className="mt-2 block text-2xl font-semibold text-slate-950">
              {snapshot.remediationQueue.actionableTargetCount}
            </strong>
            <p className="mt-1 text-xs text-slate-500">
              {compatibilityReprobeEnabled ? "Advisory except promoted re-probe path" : "Advisory only"}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Capabilities
            </p>
            <strong className="mt-2 block text-2xl font-semibold text-slate-950">
              {capabilities.length}
            </strong>
            <p className="mt-1 text-xs text-slate-500">Explicit promoted capability set</p>
          </article>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <AlertTriangle className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">Unproven mutation surfaces remain withheld</p>
            <p className="mt-1 text-xs leading-5 text-amber-900/80">
              这里的限制是能力成熟度边界，不代表该辖区没有 Foundational coverage。只有完成专项
              live-run、审计与回归的路径才会逐项晋级；诊断可见性不会自动解锁 collection、conversion、
              reindex 或 quality remediation。
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Target</th>
                <th className="px-4 py-3 font-semibold">Stage</th>
                <th className="px-4 py-3 font-semibold">Supply</th>
                <th className="px-4 py-3 font-semibold">Compatibility</th>
                <th className="px-4 py-3 font-semibold">Quality</th>
                <th className="px-4 py-3 font-semibold">Relevance</th>
                <th className="px-4 py-3 font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {snapshot.readiness.targets.map((target) => (
                <tr key={target.targetId} className="align-top">
                  <td className="px-4 py-3 font-medium text-slate-900">{target.targetId}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2 py-1 font-semibold ${stateTone(target.stage === "READY" ? "READY" : target.healthState)}`}
                    >
                      {target.stage}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2 py-1 font-semibold ${stateTone(target.healthState)}`}
                    >
                      {target.healthState}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <p>{target.compatibilityState ?? "UNOBSERVED"}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {target.compatibilityFreshness ?? "UNOBSERVED"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{target.retrievalQualityState}</td>
                  <td className="px-4 py-3 text-slate-600">{target.retrievalRelevanceState}</td>
                  <td className="max-w-sm px-4 py-3 text-slate-500">{target.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <ShieldCheck size={14} aria-hidden="true" className="text-emerald-600" />
          {capabilities.map((capability) => (
            <span
              key={capability}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1"
            >
              {capability}
            </span>
          ))}
          {snapshot.readiness.state === "READY" ? (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <CheckCircle2 size={14} aria-hidden="true" /> All current gates READY
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
