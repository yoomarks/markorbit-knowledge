import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import { AdminShell } from "@/components/admin-shell";
import { GlobalSupplyRadar } from "@/components/overview/global-supply-radar";
import { OverviewWorkbench } from "@/components/overview/overview-workbench";

export default function DashboardPage() {
  return (
    <AdminShell>
      <div className="space-y-5">
        <GlobalSupplyRadar workspaceId={DEFAULT_WORKSPACE.id} />
        <OverviewWorkbench workspaceId={DEFAULT_WORKSPACE.id} />
      </div>
    </AdminShell>
  );
}
