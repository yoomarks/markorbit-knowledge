import {
  Archive,
  BookOpen,
  Boxes,
  Cable,
  Compass,
  Database,
  FileCog,
  FileStack,
  History,
  Home,
  PackageCheck,
  Workflow,
} from "lucide-react";

export const modules = {
  dashboard: {
    label: "Overview",
    description: "查看发现、来源、知识资产与交付状态，并处理需要关注的事项。",
    icon: Home,
  },
  discovery: {
    label: "Discovery",
    description: "从少量 Seed 出发，发现值得审核的页面、文档和相关来源。",
    icon: Compass,
  },
  sources: {
    label: "Sources",
    description: "统一完成来源审批、启用、状态管理、重新扫描与国家资源覆盖检查。",
    icon: Database,
  },
  foundational: {
    label: "Foundational Health",
    description: "兼容入口：基础资料健康已内化到 Sources 与 Overview，不再作为独立业务模块。",
    icon: PackageCheck,
  },
  foundationalDiagnostics: {
    label: "Foundational Diagnostics",
    description: "高级：执行基础资料供给链路的受控诊断、修复与显式操作。",
    icon: FileCog,
  },
  intelligence: {
    label: "Source Intelligence",
    description: "高级：检查来源智能策略、人工复查队列与历史策略解析。",
    icon: Compass,
  },
  people: {
    label: "People & Organizations",
    description: "预留：人员与机构能力尚未形成独立业务工作台。",
    icon: Boxes,
  },
  knowledge: {
    label: "Knowledge",
    description: "按国家、来源与资料类型浏览已采集的知识资产，并追溯原始证据和版本。",
    icon: BookOpen,
  },
  collection: {
    label: "Collection",
    description: "预留：常规采集状态已内化到 Sources 与 Overview。",
    icon: Workflow,
  },
  packages: {
    label: "Packages",
    description: "查看已准备、待交付、已交付或需要处理的知识交付包。",
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
    description: "兼容入口：普通用户通过 Knowledge 查看转换后的知识资产。",
    icon: BookOpen,
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
    description: "预留：错误处理暂未形成独立工作台。",
    icon: Boxes,
  },
  audit: {
    label: "Audit",
    description: "预留：审计能力通过高级诊断与历史记录逐步汇总。",
    icon: History,
  },
  settings: {
    label: "Settings",
    description: "预留：设置能力尚未形成独立业务工作台。",
    icon: FileCog,
  },
} as const;

export type ModuleKey = keyof typeof modules;

export const primaryModuleOrder: ModuleKey[] = [
  "dashboard",
  "discovery",
  "sources",
  "knowledge",
  "packages",
];

export const systemModuleOrder: ModuleKey[] = [
  "foundationalDiagnostics",
  "intelligence",
  "jobs",
  "runs",
  "artifacts",
  "workers",
  "connectors",
  "conversionRuns",
  "converters",
  "vault",
];

export const moduleOrder: ModuleKey[] = Object.keys(modules) as ModuleKey[];
