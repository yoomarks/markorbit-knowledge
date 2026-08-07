import { AdminShell } from "@/components/admin-shell";
import { PageHeading } from "@/components/page-heading";
import { SourceEditor } from "@/components/sources/source-editor";

export default function NewSourcePage() {
  return (
    <AdminShell>
      <PageHeading
        title="新建数据源"
        description="创建符合 Schema v1 的 SourceDefinition。该操作只登记采集意图，不执行连接或采集。"
      />
      <SourceEditor />
    </AdminShell>
  );
}
