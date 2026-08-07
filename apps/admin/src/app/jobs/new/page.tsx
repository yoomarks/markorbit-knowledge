import { AdminShell } from "@/components/admin-shell";
import { PageHeading } from "@/components/page-heading";
import { PlanEditor } from "@/components/plans/plan-editor";

export default function NewCollectionPlanPage() {
  return (
    <AdminShell>
      <PageHeading
        title="新建采集计划"
        description="定义采集策略、输出和调度意图。新计划默认暂停，不会创建执行任务。"
      />
      <PlanEditor />
    </AdminShell>
  );
}
