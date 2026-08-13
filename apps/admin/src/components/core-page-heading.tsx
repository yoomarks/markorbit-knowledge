"use client";

import { PageHeading } from "./page-heading";
import { useAdminI18n } from "@/lib/i18n";

type CorePage = "sources" | "discovery" | "knowledge" | "packages";

export function CorePageHeading({
  page,
  actions,
}: {
  page: CorePage;
  actions?: React.ReactNode;
}) {
  const { t } = useAdminI18n();
  return (
    <PageHeading
      title={t(`${page}.title`)}
      description={t(`${page}.description`)}
      actions={actions}
    />
  );
}
