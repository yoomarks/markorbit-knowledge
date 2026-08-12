"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleX,
  Database,
  PackageCheck,
  RefreshCw,
  ServerCog,
  Workflow,
} from "lucide-react";
import type {
  OperationsIssueSeverity,
  OperationsReadinessSnapshot,
} from "@markorbit/persistence/operations-readiness";

function stateClasses(state: OperationsReadinessSnapshot["state"]): string {
  if (state === "READY") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (state === "DEGRADED") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

function severityClasses(severity: OperationsIssueSeverity): string {
  if (severity === "ACTION") return "bg-sky-50 text-sky-800";
  if (severity === "DEGRADED") return "bg-amber-50 text-amber-800";
  return "bg-rose-50 text-rose-800";
}

function issueIcon(severity: OperationsIssueSeverity) {
  if (severity === "ACTION") return <Activity size={17} aria-hidden="true" />;
  if (severity === "DEGRADED") return <AlertTriangle size={17} aria-hidden="true" />;
  return <CircleX size={17} aria-hidden="true" />;
}

export function OperationsReadinessPanel({ snapshot }: { snapshot: OperationsReadinessSnapshot }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  const metrics = useMemo(() => {
    const { sources, workers, collection, conversion, readyPackages, delivery } = snapshot.metrics;
    return [
      {
        label: "Active Sources",
        value: sources.active.toLocaleString(),
        hint: `${sources.total.toLocaleString()} registered · ${sources.error.toLocaleString()} error`,
        icon: Database,
      },
      {
        label: "Worker Capacity",
        value: (workers.online + workers.busy).toLocaleString(),
        hint: `${workers.total.toLocaleString()} total · ${workers.offline.toLocaleString()} offline · ${workers.error.toLocaleString()} error`,
        icon: ServerCog,
      },
      {
        label: "Collection Queue",
        value: (collection.jobsPending + collection.jobsRetry).toLocaleString(),
        hint: `${collection.jobsRunning.toLocaleString()} running · ${collection.jobsDeadLetter.toLocaleString()} dead-letter`,
        icon: Workflow,
      },
      {
        label: "ReadyPackage V2",
        value: readyPackages.verified.toLocaleString(),
        hint: `${delivery.delivered.toLocaleString()} delivered · ${readyPackages.withoutSubmission.toLocaleString()} not prepared`,
        icon: PackageCheck,
      },
      {
        label: "Conversion Active",
        value: (conversion.pending + conversion.running + conversion.verifying).toLocaleString(),
        hint: `${conversion.failed24h.toLocaleString()} failed in 24h · ${conversion.stalled.toLocaleString()} stalled`,
        icon: Activity,
      },
    ] as const;
  }, [snapshot]);

  const { scheduler, conversion, delivery } = snapshot.metrics;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Operations readiness
            </p>
            <div className="mt-2 flex items-center gap-3">
              <span
                className={`rounded-full border px-3 py-1 text-sm font-semibold ${stateClasses(snapshot.state)}`}
              >
                {snapshot.state}
              </span>
              <span className="text-xs text-slate-500">
                Observed {new Date(snapshot.observedAt).toLocaleString()}
              </span>
            </div>
          </div>
          <button
            type="button"
            disabled={refreshing}
            onClick={() => startRefresh(() => router.refresh())}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            <RefreshCw
              size={15}
              className={refreshing ? "animate-spin" : ""}
              aria-hidden="true"
            />
            Refresh
          </button>
        </div>
      </section>

      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
        aria-label="Live operations metrics"
      >
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article
              key={metric.label}
              className="rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-600">{metric.label}</p>
                <span className="grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-600">
                  <Icon size={17} aria-hidden="true" />
                </span>
              </div>
              <strong className="mt-4 block text-3xl font-semibold tracking-tight text-slate-950">
                {metric.value}
              </strong>
              <p className="mt-3 text-xs leading-5 text-slate-500">{metric.hint}</p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-950">Scheduler</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">
            {scheduler.activeAutomaticPlans.toLocaleString()} automatic plans
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {scheduler.initialized.toLocaleString()} initialized ·{" "}
            {scheduler.errors.toLocaleString()} error · {scheduler.overdue.toLocaleString()} overdue
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-950">Conversion</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">
            {conversion.completed.toLocaleString()} completed
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {conversion.failed24h.toLocaleString()} failed in 24h ·{" "}
            {conversion.stalled.toLocaleString()} stalled
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-950">Core delivery</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">
            {delivery.delivered.toLocaleString()} delivered
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {delivery.outcomeUnknown.toLocaleString()} unknown ·{" "}
            {delivery.consumerRejected.toLocaleString()} rejected ·{" "}
            {delivery.evidenceInconsistent.toLocaleString()} inconsistent
          </p>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-950">Needs attention</h2>
          <p className="mt-1 text-xs text-slate-500">
            Only durable control-plane state is shown here. No credentials, frozen request bodies,
            or downstream response bodies are exposed.
          </p>
        </div>
        {snapshot.issues.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-6 text-sm text-emerald-800">
            <CheckCircle2 size={18} aria-hidden="true" /> No blocking or degraded operational
            conditions detected.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {snapshot.issues.map((item) => (
              <div
                key={item.code}
                className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-start"
              >
                <span
                  className={`inline-flex w-fit items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${severityClasses(item.severity)}`}
                >
                  {issueIcon(item.severity)} {item.severity}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-950">{item.message}</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {item.count.toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{item.recommendedAction}</p>
                  <p className="mt-1 font-mono text-[11px] text-slate-400">{item.code}</p>
                </div>
                <Link
                  href={item.href}
                  className="shrink-0 text-sm font-medium text-emerald-700 hover:text-emerald-800"
                >
                  Open →
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
