"use client";

import { DiscoveryImportPanel } from "@/components/discovery/discovery-import-panel";
import { DiscoveryIntakeUi } from "@/lib/admin-v2/discovery-intake-workbench";

export function DiscoveryIntake() {
  return (
    <div className="space-y-5">
      <DiscoveryIntakeUi />
      <DiscoveryImportPanel />
    </div>
  );
}
