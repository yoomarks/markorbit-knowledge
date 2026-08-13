import {
  Activity,
  Archive,
  Boxes,
  Cable,
  FileCog,
  CircleAlert,
  Database,
  FileStack,
  Gauge,
  History,
  LibraryBig,
  PackageCheck,
  ScrollText,
  Settings,
  Workflow,
} from "lucide-react";

export const modules = {
  dashboard: {
    label: "Overview",
    description: "查看发现、来源、待审核项目、采集与 Ready Package 的整体健康状态。",
    icon: Gauge,
  },
  discovery: {
    label: "Discovery",
    description: "从少量 Seed 出发，发现值得审核的页面、文档和相关来源。",
    icon: Gauge,
  },
  sources: {
    label: "Sources",
    description: "用业务视角统一管理候选、已接受来源、来源状态与采集意图。",
    icon: Database,
  },
  foundational: {
    label: "Foundational Readiness",
    description:
      "查看 US / WIPO FOUNDATIONAL 来源的供给、检索质量、相关性 smoke gate 与人工修复队列。",
    icon: PackageCheck,
  },
  intelligence: {
    label: "Source Intelligence",
    description: "比较来源的运营价值、证据基础与人工复查建议，不替代法律权威判断。",
    icon: Activity,
  },
  people: {
    label: "People & Organizations",
    description: "查看从来源中观察到的机构、专业人士及公开业务联系方式候选。",
    icon: Boxes,
  },
  knowledge: {
    label: "Knowledge",
    description: "按文档、案例、公告、媒体和私有证据查看进入 Staging 的信息资产。",
    icon: LibraryBig,
  },
  collection: {
    label: "Collection",
    description: "从运营视角查看正在采集、计划采集和失败待处理的工作。",
    icon: Workflow,
  },
  packages: {
    label: "Packages",
    description: "查看通过验证并准备交付下游系统的 Ready Package。",
    icon: PackageCheck,
  },
  jobs: {
    label: "Collection Plans",
    description: "高级：管理 CollectionPlan 的策略、输出与调度意图。",
    icon: Workflow,
  },
  runs: {
    label: "Execution Runs",
    description: "高级：查看 CollectionRun、Job 快照和 Worker 执行状态。",
    icon: History,
  },
  artifacts: {
    label: "Raw Artifacts",
    description: "高级：查看不可变 RawArtifact、重复状态、版本和来源证据。",
    icon: FileStack,
  },
  staging: {
    label: "Staging",
    description: "高级：检查转换后的 Markdown、YAML 与 Provenance。",
    icon: LibraryBig,
  },
  workers: {
    label: "Workers",
    description: "高级：查看执行节点、能力、心跳、并发和任务分配状态。",
    icon: Boxes,
  },
  connectors: {
    label: "Connectors",
    description: "高级：管理采集 Provider、Manifest 和 Capability。",
    icon: Cable,
  },
  conversionRuns: {
    label: "Conversion Runs",
    description: "高级：管理 ConversionRun ledger、Manual Dispatch 和取消边界。",
    icon: History,
  },
  converters: {
    label: "Converters",
    description: "高级：管理转换器 Manifest 和 Conversion Profile。",
    icon: FileCog,
  },
  vault: {
    label: "Obsidian / Vault",
    description: "高级：管理 Vault 绑定、导入导出、格式校验和同步冲突。",
    icon: Archive,
  },
  errors: {
    label: "Errors",
    description: "集中处理 Connector、Worker、转换、存储和 Vault 错误。",
    icon: CircleAlert,
  },
  audit: {
    label: "Audit",
    description: "追踪关键操作、对象变化、Trace ID 与责任主体。",
    icon: ScrollText,
  },
  settings: {
    label: "Settings",
    description: "配置 Workspace、环境、策略和系统级默认值。",
    icon: Settings,
  },
} as const;

export type ModuleKey = keyof typeof modules;

// Admin V2: keep the daily operator surface intentionally small. Engineering and
// unfinished modules remain routable, but they do not compete with the five core tasks.
export const primaryModuleOrder: ModuleKey[] = [
  "dashboard",
  "discovery",
  "sources",
  "knowledge",
  "packages",
];

// Only real, currently connected control-plane pages are exposed in Advanced.
// Placeholder-only modules (staging/errors/audit/settings) stay routable but hidden.
export const systemModuleOrder: ModuleKey[] = [
  "jobs",
  "runs",
  "artifacts",
  "workers",
  "connectors",
  "conversionRuns",
  "converters",
  "vault",
];

// Static routing must still know about hidden/legacy pages so existing deep links do not break.
export const moduleOrder: ModuleKey[] = Object.keys(modules) as ModuleKey[];
