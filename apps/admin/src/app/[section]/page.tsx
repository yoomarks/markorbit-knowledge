import Link from "next/link";
import { Plus } from "lucide-react";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { ArtifactList } from "@/components/artifacts/artifact-list";
import { ConnectorList } from "@/components/connectors/connector-list";
import { ConversionRunList } from "@/components/conversion-runs/conversion-run-list";
import { ConverterControl } from "@/components/converters/converter-control";
import { DashboardPage } from "@/components/dashboard";
import { ModulePreview } from "@/components/module-preview";
import { PageHeading } from "@/components/page-heading";
import { PlanList } from "@/components/plans/plan-list";
import { RunList } from "@/components/runs/run-list";
import { SourceList } from "@/components/sources/source-list";
import { WorkerList } from "@/components/workers/worker-list";
import { moduleOrder, type ModuleKey } from "@/lib/modules";

export function generateStaticParams() {
  return moduleOrder.map((section) => ({ section }));
}

function SourcesPage() {
  return (
    <>
      <PageHeading
        title="数据源"
        description="登记、分类和维护真实 SourceDefinition。采集、预览和连接测试将在 Connector Runtime 阶段启用。"
        actions={
          <Link
            href="/sources/new"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white"
          >
            <Plus size={17} aria-hidden="true" />
            新建数据源
          </Link>
        }
      />
      <SourceList />
    </>
  );
}

function CollectionPlansPage() {
  return (
    <>
      <PageHeading
        title="采集计划"
        description="管理 CollectionPlan 的策略、输出和调度意图。启用的计划可创建待 Worker 执行的运行记录。"
        actions={
          <Link
            href="/jobs/new"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white"
          >
            <Plus size={17} aria-hidden="true" />
            新建采集计划
          </Link>
        }
      />
      <PlanList />
    </>
  );
}

function RunsPage() {
  return (
    <>
      <PageHeading
        title="运行记录"
        description="查看 CollectionRun 与 Job 的不可变派发快照。PENDING 表示待领取，LEASED 表示已保留但尚未执行。"
      />
      <RunList />
    </>
  );
}

function ArtifactsPage() {
  return (
    <>
      <PageHeading
        title="文件与版本"
        description="查看经过流式校验、内容寻址存储并登记为不可变来源证据的 RawArtifact。"
      />
      <ArtifactList />
    </>
  );
}

function WorkersPage() {
  return (
    <>
      <PageHeading
        title="Workers"
        description="管理独立执行节点、一次性凭证、认证心跳与 Job 租约。当前阶段不会运行 Connector 或 Crawl4AI。"
        actions={
          <Link
            href="/workers/new"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white"
          >
            <Plus size={17} aria-hidden="true" />
            新建 Worker
          </Link>
        }
      />
      <WorkerList />
    </>
  );
}

function ConnectorsPage() {
  return (
    <>
      <PageHeading
        title="Connectors"
        description="登记不可变 ConnectorManifest 版本、能力与兼容范围。Registry 仅管理契约，不执行 Connector 代码。"
        actions={
          <Link
            href="/connectors/new"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white"
          >
            <Plus size={17} aria-hidden="true" />
            注册新版本
          </Link>
        }
      />
      <ConnectorList />
    </>
  );
}

function ConversionRunsPage() {
  return (
    <>
      <PageHeading
        title="ConversionRuns"
        description="查看真实持久化 ConversionRun、Manual Dispatch 和等待转换运行时处理状态。"
      />
      <ConversionRunList />
    </>
  );
}

function ConvertersPage() {
  return (
    <>
      <PageHeading
        title="Converters"
        description="登记不可变 ConverterManifest 版本并配置 Conversion Profile。当前阶段仅保存转换意图，不执行转换。"
      />
      <ConverterControl />
    </>
  );
}

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!moduleOrder.includes(section as ModuleKey)) notFound();
  const moduleKey = section as ModuleKey;

  return (
    <AdminShell>
      {moduleKey === "dashboard" ? (
        <DashboardPage />
      ) : moduleKey === "sources" ? (
        <SourcesPage />
      ) : moduleKey === "jobs" ? (
        <CollectionPlansPage />
      ) : moduleKey === "runs" ? (
        <RunsPage />
      ) : moduleKey === "artifacts" ? (
        <ArtifactsPage />
      ) : moduleKey === "workers" ? (
        <WorkersPage />
      ) : moduleKey === "connectors" ? (
        <ConnectorsPage />
      ) : moduleKey === "conversionRuns" ? (
        <ConversionRunsPage />
      ) : moduleKey === "converters" ? (
        <ConvertersPage />
      ) : (
        <ModulePreview moduleKey={moduleKey} />
      )}
    </AdminShell>
  );
}
