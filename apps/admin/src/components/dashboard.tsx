import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  DatabaseZap,
  FileClock,
  Plus,
  RefreshCw,
} from "lucide-react";
import {
  dashboardMetrics,
  recentActivities,
  sourceChanges,
  systemHealth,
} from "@/fixtures/preview-data";
import { PageHeading } from "./page-heading";

const toneClasses = {
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
};

export function DashboardPage() {
  return (
    <>
      <PageHeading
        title="系统总览"
        description="观察采集与知识预处理控制面的运行状态。页面中的全部数值均为 fixture 预览数据。"
        actions={
          <>
            <button className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700">
              <RefreshCw size={16} aria-hidden="true" /> 检查高优先级源
            </button>
            <button className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-medium text-white">
              <Plus size={16} aria-hidden="true" /> 新建数据源
            </button>
          </>
        }
      />

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">运行指标</h2>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
          Fixture preview
        </span>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="运行指标预览">
        {dashboardMetrics.map((metric) => (
          <article key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-600">{metric.label}</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <strong className="text-3xl font-semibold tracking-tight text-slate-950">
                {metric.value}
              </strong>
              {metric.status ? (
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                  {metric.status}
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-slate-500">{metric.hint}</p>
          </article>
        ))}
      </section>

      <section className="mt-7 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <article className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-950">最近活动</h2>
              <p className="mt-1 text-xs text-slate-500">任务和转换状态的 fixture 示例</p>
            </div>
            <button className="text-sm font-medium text-emerald-700">查看任务</button>
          </div>
          <div className="divide-y divide-slate-100">
            {recentActivities.map((item) => (
              <div key={item.title} className="flex items-start gap-3 px-5 py-4">
                <span className={`mt-0.5 rounded-lg p-2 ${toneClasses[item.tone]}`}>
                  {item.tone === "danger" ? (
                    <AlertTriangle size={17} />
                  ) : (
                    <CheckCircle2 size={17} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.meta}</p>
                </div>
                <ArrowRight className="mt-2 text-slate-300" size={17} />
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-950">系统健康</h2>
          <p className="mt-1 text-xs text-slate-500">控制面组件状态预览</p>
          <div className="mt-5 space-y-4">
            {systemHealth.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between border-b border-slate-100 pb-4 last:border-0 last:pb-0"
              >
                <span className="text-sm text-slate-600">{item.label}</span>
                <span className="text-right">
                  <span className="block text-sm font-medium text-slate-900">{item.value}</span>
                  <span className="block text-xs text-slate-500">{item.detail}</span>
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-950">最近数据源变化</h2>
            <p className="mt-1 text-xs text-slate-500">用于展示未来版本比较和检查更新入口</p>
          </div>
          <DatabaseZap className="text-emerald-700" size={20} />
        </div>
        <div className="grid divide-y divide-slate-100 md:grid-cols-3 md:divide-x md:divide-y-0">
          {sourceChanges.map((item) => (
            <div key={item.source} className="p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <FileClock size={16} className="text-slate-400" /> {item.source}
              </div>
              <p className="mt-4 text-lg font-semibold text-emerald-700">{item.change}</p>
              <p className="mt-1 text-xs text-slate-500">{item.time}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
