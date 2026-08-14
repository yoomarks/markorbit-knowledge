"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { FileUp, X } from "lucide-react";
import { useAdminI18n } from "@/lib/i18n";
import { intakeT } from "@/lib/intake-i18n";
import { SourceFileImportUi } from "@/lib/admin-v2/source-file-import-ui";

export function SourcesRootActions({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();
  const { locale } = useAdminI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pathname !== "/sources") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("import") === "1") setOpen(true);
  }, [pathname]);

  if (pathname !== "/sources") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
      >
        <FileUp size={17} />
        {intakeT(locale, "importTitle")}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/35 p-4 backdrop-blur-sm sm:p-8">
          <div className="mx-auto max-w-4xl">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-10 place-items-center rounded-xl bg-white text-slate-700 shadow"
                aria-label={locale === "zh-CN" ? "关闭" : "Close"}
              >
                <X size={18} />
              </button>
            </div>
            <SourceFileImportUi workspaceId={workspaceId} />
          </div>
        </div>
      ) : null}
    </>
  );
}
