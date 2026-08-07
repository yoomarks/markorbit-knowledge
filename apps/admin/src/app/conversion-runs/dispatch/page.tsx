import { AdminShell } from "@/components/admin-shell";
import { PageHeading } from "@/components/page-heading";
import { ConversionDispatch } from "@/components/conversion-runs/conversion-dispatch";
export default function Page() {
  return (
    <AdminShell>
      <PageHeading
        title="Manual Conversion Dispatch"
        description="从不可变 RawArtifact 创建持久化 PENDING ConversionRun。"
      />
      <ConversionDispatch />
    </AdminShell>
  );
}
