import {
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
    label: "总览",
    description: "查看数据源、任务、文件、Worker 与 Vault 的整体运行状态。",
    icon: Gauge,
  },
  sources: {
    label: "数据源",
    description: "统一登记、分类、筛选和操作网页、API、本地目录及其他来源。",
    icon: Database,
  },
  jobs: {
    label: "采集计划",
    description: "管理采集策略、输出与调度意图，不代表已经创建或执行 Job。",
    icon: Workflow,
  },
  runs: {
    label: "运行记录",
    description: "查看手动派发的 CollectionRun、Job 快照和待 Worker 执行状态。",
    icon: History,
  },
  artifacts: {
    label: "文件与版本",
    description: "查看不可变 Raw Artifact、重复状态、历史版本和内容差异。",
    icon: FileStack,
  },
  staging: {
    label: "Staging 文档",
    description: "浏览由转换器生成、等待进入 Obsidian 加工的标准 Markdown。",
    icon: LibraryBig,
  },
  workers: {
    label: "Workers",
    description: "查看执行节点、能力、心跳、并发和任务分配状态。",
    icon: Boxes,
  },
  connectors: {
    label: "Connectors",
    description: "管理可替换的采集 Provider、Manifest 和 Capability。",
    icon: Cable,
  },
  conversionRuns: {
    label: "ConversionRuns",
    description: "管理 PENDING ConversionRun ledger、Manual Dispatch 和取消边界。",
    icon: History,
  },
  converters: {
    label: "Converters",
    description: "管理可替换的转换器 Manifest 和 Conversion Profile 意图。",
    icon: FileCog,
  },
  vault: {
    label: "Obsidian",
    description: "管理 Vault 绑定、导入导出、格式校验、断链和同步冲突。",
    icon: Archive,
  },
  packages: {
    label: "Ready Packages",
    description: "构建并发布经过校验、可供 MarkOrbit Core 消费的 Package。",
    icon: PackageCheck,
  },
  errors: {
    label: "错误中心",
    description: "集中处理 Connector、Worker、转换、存储和 Vault 错误。",
    icon: CircleAlert,
  },
  audit: {
    label: "审计",
    description: "追踪关键操作、对象变化、Trace ID 与责任主体。",
    icon: ScrollText,
  },
  settings: {
    label: "设置",
    description: "配置 Workspace、环境、策略和系统级默认值。",
    icon: Settings,
  },
} as const;

export type ModuleKey = keyof typeof modules;

export const moduleOrder: ModuleKey[] = [
  "dashboard",
  "sources",
  "jobs",
  "runs",
  "artifacts",
  "staging",
  "workers",
  "connectors",
  "converters",
  "vault",
  "packages",
  "errors",
  "audit",
  "settings",
];
