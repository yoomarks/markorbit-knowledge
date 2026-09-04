import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import { AdminShell } from "@/components/admin-shell";
import { GlobalSupplyRadar } from "@/components/overview/global-supply-radar";
import { OperatorInbox } from "@/components/overview/operator-inbox";
import { OverviewWorkbench } from "@/components/overview/overview-workbench";
import { ProducerCoreReliability } from "@/components/overview/producer-core-reliability";

export default function DashboardPage() {
  return (
    <AdminShell>
      <div className="space-y-5">
        <OperatorInbox workspaceId={DEFAULT_WORKSPACE.id} />
        <GlobalSupplyRadar workspaceId={DEFAULT_WORKSPACE.id} />
        <ProducerCoreReliability workspaceId={DEFAULT_WORKSPACE.id} />
        <OverviewWorkbench workspaceId={DEFAULT_WORKSPACE.id} />
      </div>
    </AdminShell>
  );
}
