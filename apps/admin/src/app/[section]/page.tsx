import Link from "next/link";
import { Plus } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import { AdminShell } from "@/components/admin-shell";
import { ArtifactList } from "@/components/artifacts/artifact-list";
import { ConnectorList } from "@/components/connectors/connector-list";
import { ConversionRunList } from "@/components/conversion-runs/conversion-run-list";
import { ConverterControl } from "@/components/converters/converter-control";
import { CorePageHeading } from "@/components/core-page-heading";
import { DiscoveryIntake } from "@/components/discovery/discovery-intake";
import { FoundationalOperatorPanel } from "@/components/foundational/foundational-operator-panel";
import { FoundationalRemediationConsole } from "@/components/foundational/foundational-remediation-console";
import { KnowledgeWorkspaceBoundary } from "@/components/knowledge/knowledge-workspace";
import {
  KnowledgeBrowseSurface,
  KnowledgeSearchEntryLink,
} from "@/components/knowledge/knowledge-workspace-surfaces";
import { OverviewWorkbench } from "@/components/overview/overview-workbench";
import { PageHeading } from "@/components/page-heading";
import { PlanList } from "@/components/plans/plan-list";
import { PackageBusinessWorkbench } from "@/components/ready-packages/package-business-workbench";
import { RunList } from "@/components/runs/run-list";
import { SourceCountryAnalysis } from "@/components/sources/source-country-analysis";
import { SourceCountryCoverage } from "@/components/sources/source-country-coverage";
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

const legacyBusinessRedirects: Partial<Record<ModuleKey, string>> = {
  foundational: "/sources",
  people: "/sources",
  collection: "/sources",
  staging: "/knowledge",
  errors: "/dashboard",
  audit: "/dashboard",
  settings: "/dashboard",
};

export function generateStaticParams() {
  return moduleOrder.map((section) => ({ section }));
}

function SourcesPage() {
  return (
    <>
      <CorePageHeading page="sources" sourceCreateAction />
      <div className="mb-4 flex justify-end">
        <Link
          href="/source-coverage"
          className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-blue-300 hover:text-blue-700"
        >
          Source Coverage Board
        </Link>
      </div>
      <div className="space-y-6">
        <SourceSmartReview />
        <SourceCountryCoverage workspaceId={DEFAULT_WORKSPACE.id} />
        <SourceCountryAnalysis workspaceId={DEFAULT_WORKSPACE.id} />
        <SourceFileImport workspaceId={DEFAULT_WORKSPACE.id} />
        <SourceList />
      </div>
    </>
  );
}

function KnowledgePage() {
  return (
    <>
      <CorePageHeading page="knowledge" />
      <Suspense fallback={null}>
        <KnowledgeWorkspaceBoundary>
          <div className="mb-4 flex justify-end">
            <KnowledgeSearchEntryLink />
          </div>
          <KnowledgeBrowseSurface />
        </KnowledgeWorkspaceBoundary>
      </Suspense>
    </>
  );
}

function FoundationalDiagnosticsPage() {
  return (
    <>
      <PageHeading
        title="基础资料技术诊断 / Foundational Diagnostics"
        description="高级控制面：保留受控采集派发、转换恢复、验证后重建索引、检索质量修复、相关性冒烟验证与供给健康诊断。所有写操作继续遵守显式审批和可审计边界。"
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
        title="来源智能诊断 / Source Intelligence"
        description="高级控制面：检查来源智能策略、人工复查队列、历史策略解析与审计结果。该区域用于运营诊断，不替代来源审批，也不构成自动执行授权。"
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
      <PlanList workspaceId={DEFAULT_WORKSPACE.id} />
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
      <RunList workspaceId={DEFAULT_WORKSPACE.id} />
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
      <WorkerList workspaceId={DEFAULT_WORKSPACE.id} />
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
      <ConnectorList workspaceId={DEFAULT_WORKSPACE.id} />
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
      <CorePageHeading page="packages" />
      <PackageBusinessWorkbench workspaceId={DEFAULT_WORKSPACE.id} />
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
  const legacyTarget = legacyBusinessRedirects[moduleKey];
  if (legacyTarget) redirect(legacyTarget);

  return (
    <AdminShell>
      {moduleKey === "dashboard" ? (
        <OverviewWorkbench workspaceId={DEFAULT_WORKSPACE.id} />
      ) : moduleKey === "discovery" ? (
        <DiscoveryIntake />
      ) : moduleKey === "sources" ? (
        <SourcesPage />
      ) : moduleKey === "knowledge" ? (
        <KnowledgePage />
      ) : moduleKey === "foundationalDiagnostics" ? (
        <FoundationalDiagnosticsPage />
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
      ) : null}
    </AdminShell>
  );
}
