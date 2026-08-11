import { CanonicalDownstreamPromotionControl } from "./canonical-downstream-promotion-control";
import { ReadyPackageV2Control } from "./ready-package-v2-control";
import { ReadyPackageV2DeliveryControl } from "./ready-package-v2-delivery-control";
import { VaultBindingControl } from "./vault-binding-control";
import { VaultExportControl } from "./vault-export-control";
import { VaultImportExecutionControl } from "./vault-import-execution-control";
import { VaultImportIntentControl } from "./vault-import-intent-control";
import { VaultInspectionControl } from "./vault-inspection-control";
import { VaultOriginStagingVerificationControl } from "./vault-origin-staging-verification-control";

export function VaultWorkbench({ workspaceId }: { workspaceId: string }) {
  return (
    <div className="space-y-6">
      <VaultBindingControl workspaceId={workspaceId} />
      <VaultExportControl workspaceId={workspaceId} />
      <VaultInspectionControl workspaceId={workspaceId} />
      <VaultImportIntentControl workspaceId={workspaceId} />
      <VaultImportExecutionControl workspaceId={workspaceId} />
      <VaultOriginStagingVerificationControl workspaceId={workspaceId} />
      <CanonicalDownstreamPromotionControl workspaceId={workspaceId} />
      <ReadyPackageV2Control workspaceId={workspaceId} />
      <ReadyPackageV2DeliveryControl workspaceId={workspaceId} />
    </div>
  );
}
