import { AdminShell } from "@/components/admin-shell";
import { DiscoveryIntakeUi } from "@/lib/admin-v2/discovery-intake-ui";

export default function DiscoveryPage() {
  return (
    <AdminShell>
      <DiscoveryIntakeUi />
    </AdminShell>
  );
}
