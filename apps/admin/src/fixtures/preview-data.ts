import type {
  ArtifactStatus,
  JobStatus,
  ReadyPackageStatus,
  SourceStatus,
  StagingDocumentStatus,
  WorkerStatus,
} from "@markorbit/contracts";

export type MetricFixture = {
  label: string;
  value: number;
  hint: string;
  status?:
    | SourceStatus
    | JobStatus
    | ArtifactStatus
    | StagingDocumentStatus
    | WorkerStatus
    | ReadyPackageStatus;
};

export const dashboardMetrics: MetricFixture[] = [
  { label: "数据源总数", value: 128, hint: "覆盖 18 个国家和地区" },
  { label: "启用数据源", value: 104, hint: "81% 已启用", status: "ACTIVE" },
  { label: "失败任务", value: 3, hint: "需要人工检查", status: "FAILED" },
  { label: "新增文件", value: 47, hint: "过去 24 小时", status: "REGISTERED" },
  { label: "待转换", value: 12, hint: "等待 Markdown 转换", status: "READY_FOR_CONVERSION" },
  { label: "Vault 冲突", value: 2, hint: "尚未处理", status: "CONFLICT" },
  { label: "在线 Workers", value: 5, hint: "共注册 7 个", status: "ONLINE" },
  { label: "Ready Packages", value: 8, hint: "本周新增 3 个", status: "READY" },
];

export const recentActivities = [
  { title: "USPTO News 检查完成", meta: "WEB_CRAWL · 4 分钟前", tone: "success" },
  { title: "WIPO Fee Schedule 发现新版本", meta: "PAGE_UPDATE_CHECK · 19 分钟前", tone: "warning" },
  { title: "本地测试目录完成扫描", meta: "LOCAL_FILE_SCAN · 42 分钟前", tone: "success" },
  {
    title: "EUIPO Guidelines PDF 转换失败",
    meta: "DOCUMENT_CONVERSION · 1 小时前",
    tone: "danger",
  },
] as const;

export const sourceChanges = [
  { source: "USPTO News", change: "+6 新页面", time: "今天 22:31" },
  { source: "WIPO Madrid Notices", change: "1 个页面更新", time: "今天 21:54" },
  { source: "代理机构样本组", change: "+12 新文章", time: "今天 20:10" },
];

export const systemHealth = [
  { label: "API", value: "正常", detail: "42 ms" },
  { label: "Raw Store", value: "正常", detail: "68% 可用" },
  { label: "Vault Sync", value: "需注意", detail: "2 个冲突" },
  { label: "Workers", value: "正常", detail: "5 / 7 在线" },
];
