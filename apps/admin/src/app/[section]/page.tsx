import Link from "next/link";
import { Plus } from "lucide-react";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { ArtifactList } from "@/components/artifacts/artifact-list";
import { ConnectorList } from "@/components/connectors/connector-list";
import { ConversionRunList } from "@/components/conversion-runs/conversion-run-list";
import { ConverterControl } from "@/components/converters/converter-control";
import { DashboardPage } from "@/components/dashboard";
import { DiscoveryWorkspace } from "@/components/discovery/discovery-workspace";
import { ModulePreview } from "@/components/module-preview";
import { PageHeading } from "@/components/page-heading";
import { PlanList } from "@/components/plans/plan-list";
import { RunList } from "@/components/runs/run-list";
import { SourceIntelligenceReviewHealth } from "@/components/sources/source-intelligence-review-health";
import { SourceIntelligenceReviewOwnership } from "@/components/sources/source-intelligence-review-ownership";
import { SourceIntelligenceReviewQueue } from "@/components/sources/source-intelligence-review-queue";
import { SourceIntelligenceWorkbench } from "@/components/sources/source-intelligence-workbench";
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
        title="Sources"
        description="登记、分类和维护真实 SourceDefinition。vNext 将把 Discovery 接受的候选安全转换为来源与采集意图。"
        actions={
          <Link
            href="/sources/new"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white"
          >
            <Plus size={17} aria-hidden="true" />
            直接创建 Source
          </Link>
        }
      />
      <SourceList />
    </>
  );
}

function SourceIntelligencePage() {
  return (
    <>
      <PageHeading
        title="Source Intelligence"
        description="先在 D2.11 Ownership & Handoff 分配人工负责人，再查看 D2.10 运营健康度与 D2.9 Review Queue，最后进入 Source Value × Evidence Maturity 双轴详情；所有运营动作都不构成执行授权。"
      />
      <div className="space-y-6">
        <SourceIntelligenceReviewOwnership />
        <SourceIntelligenceReviewHealth />
        <SourceIntelligenceReviewQueue />
        <SourceIntelligenceWorkbench />
      </div>
    </>
  );
}

function CollectionPlansPage() {
  return (
    <>
      <PageHeading
        title="Collection Plans"
        description="高级控制面：管理 CollectionPlan 的策略、输出和调度意图。启用的计划可创建待 Worker 执行的运行记录。"
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
        title="Execution Runs"
        description="高级控制面：查看 CollectionRun 与 Job 的不可变派发快照。PENDING 表示待领取，LEASED 表示已保留但尚未执行。"
      />
      <RunList />
    </>
  );
}

function ArtifactsPage() {
  return (
    <>
      <PageHeading
        title="Raw Artifacts"
        description="高级控制面：查看经过流式校验、内容寻址存储并登记为不可变来源证据的 RawArtifact。"
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
        description="高级控制面：管理独立执行节点、一次性凭证、认证心跳与 Job 租约。"
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
        description="高级控制面：登记不可变 ConnectorManifest 版本、能力与兼容范围。Registry 仅管理契约，不拥有来源业务含义。"
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
        title="Conversion Runs"
        description="高级控制面：查看真实持久化 ConversionRun、Manual Dispatch 和等待转换运行时处理状态。"
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
        description="高级控制面：登记不可变 ConverterManifest 版本并配置 Conversion Profile。"
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
      ) : moduleKey === "discovery" ? (
        <DiscoveryWorkspace />
      ) : moduleKey === "sources" ? (
        <SourcesPage />
      ) : moduleKey === "intelligence" ? (
        <SourceIntelligencePage />
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
