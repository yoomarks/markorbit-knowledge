import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import type { ModuleKey } from "@/lib/modules";
import { modules } from "@/lib/modules";
import { PageHeading } from "./page-heading";

const plannedActions: Record<Exclude<ModuleKey, "dashboard">, string[]> = {
  discovery: [
    "添加主页或批量 Seed",
    "审核自动发现的候选来源",
    "维护 Include / Exclude Discovery Policy",
  ],
  sources: ["创建与分类数据源", "按国家、类型和状态筛选", "测试连接、预览采集和检查更新"],
  intelligence: [
    "比较 Source 的运营优先级与显式 Authority",
    "查看六维评分解释和证据快照",
    "人工触发评估或复查建议，不自动授权执行",
  ],
  people: [
    "查看机构与专业人士候选",
    "核对公开业务联系方式及来源证据",
    "把身份解析交给 Core 而不是在此自动合并",
  ],
  knowledge: [
    "按文档、案例、公告和媒体浏览",
    "追溯 RawArtifact 与来源证据",
    "查看等待进入 Core 的 Staging 内容",
  ],
  collection: [
    "查看正在采集与计划采集工作",
    "聚合失败任务和需要关注的来源",
    "从业务视角进入高级 Plan / Run",
  ],
  jobs: ["维护 CollectionPlan", "配置采集策略和输出", "创建待 Worker 执行的手动运行记录"],
  runs: ["查看 CollectionRun 与 Job", "检查不可变派发快照", "取消尚未被 Worker 领取的任务"],
  artifacts: ["查看不可变 Raw Artifact", "识别重复与历史版本", "预览 Markdown 和内容 Diff"],
  staging: ["检查 YAML 与 Provenance", "查看转换版本", "准备进入 Obsidian 的文档"],
  workers: ["查看心跳和运行能力", "管理并发和排空状态", "按 Capability 调度任务"],
  connectors: ["浏览 Connector Manifest", "检查 Provider 健康状态", "基于 Schema 生成配置界面"],
  conversionRuns: ["查看 ConversionRun ledger", "Manual Dispatch", "取消 PENDING intent"],
  converters: ["管理 Converter Manifest", "维护 Conversion Profile", "检查精确版本兼容性"],
  vault: ["绑定 Obsidian Vault", "导出和回读 Markdown", "检查冲突、断链和缺失附件"],
  packages: ["校验 READY 文档", "构建 Package Manifest", "向 MarkOrbit Core 发布"],
  errors: ["集中查看系统错误", "按来源和错误类型筛选", "追踪重试与处理状态"],
  audit: ["查看关键操作", "查询对象变化", "使用 Trace ID 追踪链路"],
  settings: ["管理 Workspace 默认值", "配置环境和存储策略", "设置安全与同步边界"],
};

export function ModulePreview({ moduleKey }: { moduleKey: Exclude<ModuleKey, "dashboard"> }) {
  const moduleDefinition = modules[moduleKey];
  const Icon = moduleDefinition.icon;
  return (
    <>
      <PageHeading title={moduleDefinition.label} description={moduleDefinition.description} />
      <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <Icon size={23} aria-hidden="true" />
        </div>
        <p className="mt-5 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
          vNext foundation · 未连接的能力会明确标示
        </p>
        <h2 className="mt-4 text-xl font-semibold text-slate-950">以运营任务为入口</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          新后台先回答“现在需要做什么”，再按需下钻到 Plan、Run、Worker、Manifest
          等工程对象。未完成的 Runtime 不会伪装成真实采集结果。
        </p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {plannedActions[moduleKey].map((action) => (
            <div key={action} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <CheckCircle2 className="text-emerald-700" size={18} aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-slate-800">{action}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center gap-2 border-t border-slate-100 pt-5 text-sm text-slate-500">
          <ArrowUpRight size={16} aria-hidden="true" />
          真实操作继续复用既有 Contract、Registry、Worker、Artifact 与 Conversion 边界。
        </div>
      </section>
    </>
  );
}
