import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import { AdminShell } from "@/components/admin-shell";
import { PageHeading } from "@/components/page-heading";
import { WorkerEditor } from "@/components/workers/worker-editor";

export default function NewWorkerPage() {
  return (
    <AdminShell>
      <PageHeading
        title="新建 Worker"
        description="登记独立执行节点的精确能力边界。Worker 凭证只会展示一次，创建后仍需发送认证心跳。"
      />
      <WorkerEditor workspaceId={DEFAULT_WORKSPACE.id} />
    </AdminShell>
  );
}
