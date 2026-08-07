import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Compass,
  Database,
  PackageCheck,
  Plus,
  UsersRound,
} from "lucide-react";
import { PageHeading } from "./page-heading";

const metrics = [
  { label: "Accepted Sources", value: "18,542", hint: "已进入来源管理的业务来源", icon: Database },
  { label: "New Discoveries", value: "286", hint: "今日新增候选，等待规则或人工处理", icon: Compass },
  { label: "Awaiting Review", value: "37", hint: "需要运营人员判断的发现结果", icon: UsersRound },
  { label: "Ready Packages", value: "7,961", hint: "已通过交付校验的 Package", icon: PackageCheck },
] as const;

const discoveries = [
  { title: "USPTO", detail: "+13 candidate pages", meta: "Official authority · 4 minutes ago", tone: "success" },
  { title: "Thailand DIP", detail: "+2 PDF candidates", meta: "Official authority · 18 minutes ago", tone: "success" },
  { title: "Professional firm seed batch", detail: "+4 professional observations", meta: "Public business evidence · 31 minutes ago", tone: "warning" },
] as const;

const attention = [
  ["37", "Discovery candidates need review"],
  ["8", "Sources changed materially"],
  ["12", "Collection / conversion failures"],
  ["4", "Public business contacts may be stale"],
] as const;

export function DashboardPage() {
  return (
    <>
      <PageHeading
        title="Knowledge Overview"
        description="先看需要处理的发现、来源和交付状态；工程级 Worker / Plan / Run 信息已移动到 System · Advanced。"
        actions={
          <>
            <Link
              href="/discovery"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
            >
              <Compass size={16} aria-hidden="true" /> Discovery
            </Link>
            <Link
              href="/sources/new"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-medium text-white"
            >
              <Plus size={16} aria-hidden="true" /> Add Source
            </Link>
          </>
        }
      />

      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Knowledge health</h2>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
          vNext interaction preview · fixture values
        </span>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Knowledge health preview">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-4">
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

      <section className="mt-7 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-950">New discoveries</h2>
              <p className="mt-1 text-xs text-slate-500">运营人员首先看到“发现了什么”，不是 Job ID。</p>
            </div>
            <Link href="/discovery" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
              Review <ArrowRight size={15} />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {discoveries.map((item) => (
              <div key={item.title} className="flex items-start gap-3 px-5 py-4">
                <span className={`mt-0.5 rounded-lg p-2 ${item.tone === "success" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {item.tone === "success" ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.meta}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-950">Needs attention</h2>
          <p className="mt-1 text-xs text-slate-500">把异常和待判断事项集中，而不是要求运营人员翻运行日志。</p>
          <div className="mt-5 space-y-3">
            {attention.map(([value, label]) => (
              <div key={label} className="flex items-center gap-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <span className="min-w-9 text-xl font-semibold text-slate-950">{value}</span>
                <span className="text-sm text-slate-600">{label}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-3">
        {[
          ["Discovery", "给一个主页或批量 Seed，系统在批准的范围内发现候选。", "/discovery"],
          ["People & Organizations", "集中查看来源中观察到的机构、专业人士和公开业务联系方式。", "/people"],
          ["Collection", "只从业务层看正在采集、计划任务和失败项，需要时再下钻。", "/collection"],
        ].map(([title, detail, href]) => (
          <Link key={title} href={href} className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300">
            <p className="font-semibold text-slate-950">{title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
              Open <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </section>
    </>
  );
}
