import { AdminShell } from "@/components/admin-shell";
import { PageHeading } from "@/components/page-heading";
import { SourceEditor } from "@/components/sources/source-editor";
import { SourceGraphPanel } from "@/components/sources/source-graph-panel";
import { SourceIntelligencePanel } from "@/components/sources/source-intelligence-panel";
import { SourcePlansPanel } from "@/components/sources/source-plans-panel";

export const dynamic = "force-dynamic";

export default async function SourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <PageHeading
        title="数据源详情"
        description="维护网站级 SourceDefinition、Source Intelligence、Source Map、Connector 绑定与关联采集计划。"
      />
      <div className="space-y-6">
        <SourceEditor sourceId={id} />
        <SourceIntelligencePanel sourceId={id} />
        <SourceGraphPanel sourceId={id} />
        <SourcePlansPanel sourceId={id} />
      </div>
    </AdminShell>
  );
}
