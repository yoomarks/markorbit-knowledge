import Link from "next/link";
import { ArrowRight, Check, CircleAlert, Globe2, Search, ShieldCheck } from "lucide-react";
import { PageHeading } from "../page-heading";

const previewCandidates = [
  {
    title: "Trademark Examination Policy",
    source: "Official authority seed",
    reason: "同域页面 · Trademark 路径 · 从主页导航发现",
    tone: "emerald",
  },
  {
    title: "Trademark team & professionals",
    source: "Professional firm seed",
    reason: "Team 页面 · 可产生机构/专业人士/公开业务联系方式观察值",
    tone: "blue",
  },
  {
    title: "Careers",
    source: "Professional firm seed",
    reason: "低采集相关度候选 · 建议加入排除策略",
    tone: "amber",
  },
] as const;

const autonomyLevels = [
  ["L0", "Manual", "只采集人工指定目标"],
  ["L1", "Assisted", "自动发现，人工逐项审核"],
  ["L2", "Guided", "已批准模式自动处理，异常进入审核"],
  ["L3", "Autonomous", "在批准的范围与预算内自主发现"],
  ["L4", "Trusted Monitoring", "稳定来源持续维护，仅异常提醒"],
] as const;

export function DiscoveryWorkspace() {
  return (
    <>
      <PageHeading
        title="Discovery"
        description="从一个主页或一批 Seed 出发，受控发现值得采集的来源。候选仍需经过 Review / Policy 边界，不会自动成为可信 Source。"
        actions={
          <Link
            href="/sources/new"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700"
          >
            高级：直接创建 Source <ArrowRight size={16} />
          </Link>
        }
      />

      <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} />
          <p>
            <strong>当前实现状态：</strong> 已加入受控 HTML 链接发现 Runtime；本页 Seed 提交、审核持久化与 sitemap / robots 接线仍在后续任务中，因此不会伪装成可执行按钮。
          </p>
        </div>
      </div>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-slate-950 text-white">
              <Globe2 size={19} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-950">添加 Seed</h2>
              <p className="mt-1 text-xs text-slate-500">正常使用时只需要先给主页，不必手工列出站内所有 URL。</p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className="text-xs font-medium text-slate-600" htmlFor="seed-preview">
              Homepage / endpoint
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 text-slate-400" size={17} />
                <input
                  id="seed-preview"
                  disabled
                  value="https://www.uspto.gov/"
                  readOnly
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-500"
                />
              </div>
              <button
                type="button"
                disabled
                className="rounded-xl bg-slate-300 px-4 py-2.5 text-sm font-medium text-white"
              >
                Start Discovery
              </button>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              UI wiring pending. Runtime 已支持 maxDepth、maxCandidates、sameHost、allowedHosts、deny patterns 与 URL 去重。
            </p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              ["1", "Seed", "主页 / 列表"],
              ["2", "Discover", "受控向下发现"],
              ["3", "Review", "接受、拒绝或形成策略"],
            ].map(([step, label, detail]) => (
              <div key={step} className="rounded-xl border border-slate-200 p-4">
                <span className="text-xs font-semibold text-emerald-700">STEP {step}</span>
                <p className="mt-2 text-sm font-semibold text-slate-900">{label}</p>
                <p className="mt-1 text-xs text-slate-500">{detail}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-950">默认自主等级</h2>
              <p className="mt-1 text-xs text-slate-500">建议生产初期从 L1 / L2 开始。</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              L1 Assisted
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {autonomyLevels.map(([level, name, detail]) => (
              <div key={level} className="flex items-start gap-3 rounded-xl border border-slate-100 px-3 py-3">
                <span className="mt-0.5 w-8 text-xs font-semibold text-slate-400">{level}</span>
                <div>
                  <p className="text-sm font-medium text-slate-800">{name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Review Queue · Interaction Preview</h2>
            <p className="mt-1 text-xs text-slate-500">示例仅展示审核信息密度，不代表真实采集结果。</p>
          </div>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">Fixture preview</span>
        </div>
        <div className="divide-y divide-slate-100">
          {previewCandidates.map((item) => (
            <div key={item.title} className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${item.tone === "emerald" ? "bg-emerald-500" : item.tone === "blue" ? "bg-blue-500" : "bg-amber-500"}`} />
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                </div>
                <p className="mt-1 text-xs text-slate-500">{item.source}</p>
                <p className="mt-2 text-sm text-slate-600">{item.reason}</p>
              </div>
              <div className="flex gap-2">
                <button disabled className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-400">
                  <CircleAlert size={14} /> Reject
                </button>
                <button disabled className="inline-flex items-center gap-1.5 rounded-lg bg-slate-200 px-3 py-2 text-xs font-medium text-white">
                  <Check size={14} /> Accept
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
