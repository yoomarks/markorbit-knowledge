import { AdminShell } from "@/components/admin-shell";
import { PageHeading } from "@/components/page-heading";
import { ExecutionTimeline } from "@/components/runs/execution-timeline";
import { RunDetail } from "@/components/runs/run-detail";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <PageHeading
        title="运行记录详情"
        description="查看不可变派发快照、Job 状态、Worker 执行尝试与追加式事件证据。"
      />
      <div className="space-y-6">
        <RunDetail runId={id} />
        <ExecutionTimeline runId={id} />
      </div>
    </AdminShell>
  );
}
