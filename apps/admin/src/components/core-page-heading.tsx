"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeading } from "./page-heading";
import { useAdminI18n } from "@/lib/i18n";

type CorePage = "sources" | "discovery" | "knowledge" | "packages";

const labels: Record<CorePage, { zh: string; en: string }> = {
  sources: { zh: "来源管理", en: "Sources" },
  discovery: { zh: "来源发现", en: "Discovery" },
  knowledge: { zh: "知识资产", en: "Knowledge" },
  packages: { zh: "交付包", en: "Packages" },
};

export function CorePageHeading({
  page,
  sourceCreateAction = false,
}: {
  page: CorePage;
  sourceCreateAction?: boolean;
}) {
  const { locale, t } = useAdminI18n();
  const label = labels[page];
  const title = locale === "zh-CN" ? `${label.zh} / ${label.en}` : `${label.en} / ${label.zh}`;

  return (
    <PageHeading
      title={title}
      description={t(`${page}.description`)}
      actions={
        sourceCreateAction ? (
          <Link
            href="/sources/new"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/15 transition hover:bg-blue-700"
          >
            <Plus size={17} aria-hidden="true" />
            {t("sources.new")}
          </Link>
        ) : undefined
      }
    />
  );
}
