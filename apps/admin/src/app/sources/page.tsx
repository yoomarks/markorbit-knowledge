import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import { AdminShell } from "@/components/admin-shell";
import { CorePageHeading } from "@/components/core-page-heading";
import { RadarCollectionAuthorization } from "@/components/sources/radar-collection-authorization";
import { RadarReviewEvidence } from "@/components/sources/radar-review-evidence";
import { RepresentativeActivationWave } from "@/components/sources/representative-activation-wave";
import { SourceChangeAlerts } from "@/components/sources/source-change-alerts";
import { SourceCountryCoverage } from "@/components/sources/source-country-coverage";
import { SourceFailureRootCauses } from "@/components/sources/source-failure-root-causes";
import { SourceList } from "@/components/sources/source-list";
import { SourceSupplyCoverage } from "@/components/sources/source-supply-coverage";
import { SourceSmartReviewUi } from "@/lib/admin-v2/source-smart-review-ui";

export default function SourcesPage() {
  return (
    <AdminShell>
      <CorePageHeading page="sources" sourceCreateAction />
      <div className="space-y-6">
        {/* Radar Source approval and collection authorization remain separate operator decisions. */}
        <RadarReviewEvidence />
        <RadarCollectionAuthorization />
        <SourceSmartReviewUi />
        <SourceSupplyCoverage workspaceId={DEFAULT_WORKSPACE.id} />
        <RepresentativeActivationWave workspaceId={DEFAULT_WORKSPACE.id} />
        <SourceCountryCoverage workspaceId={DEFAULT_WORKSPACE.id} />
        <SourceChangeAlerts />
        <SourceFailureRootCauses />
        <SourceList />
      </div>
    </AdminShell>
  );
}
