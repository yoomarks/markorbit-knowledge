import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import { AdminShell } from "@/components/admin-shell";
import { PageHeading } from "@/components/page-heading";
import { WorkerEditor } from "@/components/workers/worker-editor";

export const dynamic = "force-dynamic";

export default async function WorkerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <PageHeading
        title="Worker 详情"
        description="管理 Worker 能力、期望状态、心跳与活动租约。LEASED 仅代表任务已保留。"
      />
      <WorkerEditor workerId={id} workspaceId={DEFAULT_WORKSPACE.id} />
    </AdminShell>
  );
}
