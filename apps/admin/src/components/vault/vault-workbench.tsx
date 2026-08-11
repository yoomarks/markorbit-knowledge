import { VaultBindingControl } from "./vault-binding-control";
import { VaultExportControl } from "./vault-export-control";
import { VaultInspectionControl } from "./vault-inspection-control";

export function VaultWorkbench({ workspaceId }: { workspaceId: string }) {
  return (
    <div className="space-y-6">
      <VaultBindingControl workspaceId={workspaceId} />
      <VaultExportControl workspaceId={workspaceId} />
      <VaultInspectionControl workspaceId={workspaceId} />
    </div>
  );
}
