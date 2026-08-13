import Link from "next/link";
import { Plus } from "lucide-react";
import { notFound } from "next/navigation";
import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import { AdminShell } from "@/components/admin-shell";
import { ArtifactList } from "@/components/artifacts/artifact-list";
import { ConnectorList } from "@/components/connectors/connector-list";
import { ConversionRunList } from "@/components/conversion-runs/conversion-run-list";
import { ConverterControl } from "@/components/converters/converter-control";
import { DashboardPage } from "@/components/dashboard";
import { DiscoveryIntake } from "@/components/discovery/discovery-intake";
import { FoundationalOperatorPanel } from "@/components/foundational/foundational-operator-panel";
import { FoundationalRemediationConsole } from "@/components/foundational/foundational-remediation-console";
import { ModulePreview } from "@/components/module-preview";
import { PageHeading } from "@/components/page-heading";
import { PlanList } from "@/components/plans/plan-list";
import { ReadyPackageDeliveryWorkbench } from "@/components/ready-packages/ready-package-delivery-workbench";
import { RunList } from "@/components/runs/run-list";
import { SourceFileImport } from "@/components/sources/source-file-import";
import { SourceIntelligenceAssignmentHealth } from "@/components/sources/source-intelligence-assignment-health";
import { SourceIntelligenceManualSla } from "@/components/sources/source-intelligence-manual-sla";
import { SourceIntelligencePolicyAudit } from "@/components/sources/source-intelligence-policy-audit";
import { SourceIntelligencePolicyAuditQuery } from "@/components/sources/source-intelligence-policy-audit-query";
import { SourceIntelligencePolicyComparison } from "@/components/sources/source-intelligence-policy-comparison";
import { SourceIntelligencePolicyResolution } from "@/components/sources/source-intelligence-policy-resolution";
import { SourceIntelligencePolicyScopes } from "@/components/sources/source-intelligence-policy-scopes";
import { SourceIntelligenceReviewHealth } from "@/components/sources/source-intelligence-review-health";
import { SourceIntelligenceReviewOwnership } from "@/components/sources/source-intelligence-review-ownership";
import { SourceIntelligenceReviewQueue } from "@/components/sources/source-intelligence-review-queue";
import { SourceIntelligenceWorkbench } from "@/components/sources/source-intelligence-workbench";
import { SourceList } from "@/components/sources/source-list";
import { SourceSmartReview } from "@/components/sources/source-smart-review";
import { VaultWorkbench } from "@/components/vault/vault-workbench";
import { VaultExportControl } from "@/components/vault/vault-export-control";
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
        description="统一管理所有来源。Discovery、人工网站、文件导入及其他采集入口最终都进入同一 Source Registry。"
        actions={
          <Link
            href="/sources/new"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white"
          >
            <Plus size={17} aria-hidden="true" />
            新建网站 / API 来源
          </Link>
        }
      />
      <div className="space-y-6">
        <SourceSmartReview />
        <SourceFileImport workspaceId={DEFAULT_WORKSPACE.id} />
        <SourceList />
      </div>
    </>
  );
}

function FoundationalReadinessPage() {
  return (
    <>
      <PageHeading
        title="Foundational Readiness"
        description="查看 US 与 WIPO ACTIVE + FOUNDATIONAL 数据供给从注册、采集、转换、索引到结构质量和检索 smoke relevance 的统一 readiness gate；COLLECT 阶段可通过 M23/M24 三段式受控流程创建审批意图、审批并显式派发单目标采集。"
      />
      <div className="space-y-6">
        <FoundationalOperatorPanel workspaceId={DEFAULT_WORKSPACE.id} />
        <FoundationalRemediationConsole workspaceId={DEFAULT_WORKSPACE.id} />
      </div>
    </>
  );
}

function SourceIntelligencePage() {
  return (
    <>
      <PageHeading
        title="Source Intelligence"
        description="先用 D2.18 比较两个 D2.17 Historical Policy Resolution 端点并严格传播 RESOLVED/PARTIAL/UNKNOWN，再用 D2.17 单点重放与 D2.16 audit 查询追溯原因；所有结果都保持只读，不构成 rollback、apply 或自动执行授权。"
      />
      <div className="space-y-6">
        <SourceIntelligencePolicyComparison />
        <SourceIntelligencePolicyResolution />
        <SourceIntelligencePolicyAuditQuery />
        <SourceIntelligencePolicyAudit />
        <SourceIntelligencePolicyScopes />
        <SourceIntelligenceManualSla />
        <SourceIntelligenceAssignmentHealth />
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
        description="高级控制面：只读检查经过流式校验、内容寻址存储并登记为不可变来源证据的 RawArtifact。文件导入请从 Sources 完成。"
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

function ReadyPackagesPage() {
  return (
    <>
      <PageHeading
        title="Ready Packages"
        description="查看已验证 ReadyPackage 的真实 Core intake 交付证据，并通过现有显式 submit/retry 边界处理未提交、结果未知或本地 finalization 待完成状态。"
      />
      <ReadyPackageDeliveryWorkbench workspaceId={DEFAULT_WORKSPACE.id} />
    </>
  );
}

function VaultPage() {
  return (
    <>
      <PageHeading
        title="Obsidian / Vault"
        description="管理 Workspace Vault 绑定，并显式导出已验证 READY Staging。导出先持久化 PENDING 再执行文件系统写入，未知结果保持可核对重放，不自动覆盖不同内容。"
      />
      <div className="space-y-6">
        <VaultWorkbench workspaceId={DEFAULT_WORKSPACE.id} />
        <VaultExportControl workspaceId={DEFAULT_WORKSPACE.id} />
      </div>
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
        <DiscoveryIntake />
      ) : moduleKey === "sources" ? (
        <SourcesPage />
      ) : moduleKey === "foundational" ? (
        <FoundationalReadinessPage />
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
      ) : moduleKey === "packages" ? (
        <ReadyPackagesPage />
      ) : moduleKey === "vault" ? (
        <VaultPage />
      ) : (
        <ModulePreview moduleKey={moduleKey} />
      )}
    </AdminShell>
  );
}
