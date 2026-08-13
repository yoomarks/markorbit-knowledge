"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeading } from "./page-heading";
import { useAdminI18n } from "@/lib/i18n";

type CorePage = "sources" | "discovery" | "knowledge" | "packages";

export function CorePageHeading({
  page,
  sourceCreateAction = false,
}: {
  page: CorePage;
  sourceCreateAction?: boolean;
}) {
  const { t } = useAdminI18n();
  return (
    <PageHeading
      title={t(`${page}.title`)}
      description={t(`${page}.description`)}
      actions={
        sourceCreateAction ? (
          <Link
            href="/sources/new"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white"
          >
            <Plus size={17} aria-hidden="true" />
            {t("sources.new")}
          </Link>
        ) : undefined
      }
    />
  );
}
