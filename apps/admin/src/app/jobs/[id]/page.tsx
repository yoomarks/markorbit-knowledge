import { AdminShell } from "@/components/admin-shell";
import { PageHeading } from "@/components/page-heading";
import { PlanEditor } from "@/components/plans/plan-editor";
import { PlanRunsPanel } from "@/components/plans/plan-runs-panel";

export const dynamic = "force-dynamic";

export default async function CollectionPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminShell>
      <PageHeading
        title="采集计划详情"
        description="维护 CollectionPlan 策略和生命周期，并创建持久化的手动运行记录。"
      />
      <PlanEditor planId={id} />
      <PlanRunsPanel planId={id} />
    </AdminShell>
  );
}
