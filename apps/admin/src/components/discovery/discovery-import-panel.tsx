"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import {
  AUTHORITY_LEVELS,
  SOURCE_CATEGORIES,
  type AuthorityLevel,
  type SourceCategory,
} from "@markorbit/contracts";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";
import { useAdminI18n } from "@/lib/i18n";

type ImportRow = {
  rowNumber: number;
  locator: string;
  origin?: string;
  status: "VALID" | "INVALID" | "DUPLICATE";
  issues: string[];
  intake: {
    category?: SourceCategory;
    authorityLevel?: AuthorityLevel;
    jurisdictions?: string[];
    languages?: string[];
    note?: string;
    tags?: string[];
  };
};

type ImportPreview = {
  fileName: string;
  format: "CSV" | "TSV" | "XLSX";
  sheetName?: string;
  rows: ImportRow[];
  summary: {
    parsed: number;
    valid: number;
    invalid: number;
    duplicate: number;
    truncated: boolean;
  };
};

type BatchResult = {
  summary: {
    submitted: number;
    uniqueOrigins: number;
    started: number;
    skippedDuplicateInput: number;
    skippedExistingSource: number;
    failed: number;
    candidateCount: number;
  };
};

function readMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? fallback;
  } catch {
    return fallback;
  }
}

function categoryLabel(value: SourceCategory, zh: boolean): string {
  if (!zh) {
    return value
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  const labels: Record<SourceCategory, string> = {
    OFFICIAL_AUTHORITY: "官方机构",
    OFFICIAL_GUIDANCE: "官方指南",
    LAW_FIRM: "律所 / 代理机构",
    NEWS: "新闻",
    RESEARCH: "研究资料",
    TECHNICAL: "技术资料",
    INTERNAL: "内部资料",
    USER_PROVIDED: "用户提供",
    OTHER: "其他",
  };
  return labels[value];
}

function authorityLabel(value: AuthorityLevel, zh: boolean): string {
  if (!zh) return value.replaceAll("_", " ");
  const labels: Record<AuthorityLevel, string> = {
    PRIMARY_OFFICIAL: "一级官方",
    SECONDARY_OFFICIAL: "二级官方",
    INTERNAL: "内部来源",
    PROFESSIONAL: "专业来源",
    INDUSTRY: "行业来源",
    COMMUNITY: "社区来源",
    UNKNOWN: "未评估",
  };
  return labels[value];
}

function splitList(value: string, uppercase = false): string[] {
  return [
    ...new Set(
      value
        .split(/[;,|\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => (uppercase ? item.toUpperCase() : item)),
    ),
  ];
}

export function DiscoveryImportPanel() {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);

  const copy = zh
    ? {
        title: "从表格批量导入来源",
        description:
          "支持 CSV、TSV 和 Excel .xlsx。先预览校验，再选择最多 100 个网站进入 Discovery；每一行可以单独覆盖分类、权威等级、国家、语言和备注。",
        choose: "选择 CSV / Excel",
        template:
          "推荐表头：url, category, authority, jurisdiction, language, note, tags。只有 url 必填。",
        previewing: "正在解析表格…",
        parsed: "解析",
        valid: "有效",
        invalid: "无效",
        duplicate: "文件内重复",
        row: "行",
        website: "网站",
        category: "分类",
        authority: "权威",
        jurisdiction: "国家/地区",
        language: "语言",
        note: "备注",
        selected: "已选",
        import: "导入并开始发现",
        importing: "正在启动发现…",
        limit: "每次最多选择 100 个不同网站 Origin。文件内重复和无效行不会进入采集。",
        reset: "清除",
        selectFirst: "选择前 100 个有效网站",
        success: "批量导入已完成",
        sources: "前往 Sources 审批",
        truncated: "文件超过 500 行，当前只预览前 500 行。",
      }
    : {
        title: "Import sources from a spreadsheet",
        description:
          "Supports CSV, TSV and Excel .xlsx. Preview and validate first, then select up to 100 websites for Discovery. Each row can override category, authority, jurisdiction, language and note.",
        choose: "Choose CSV / Excel",
        template:
          "Recommended headers: url, category, authority, jurisdiction, language, note, tags. Only url is required.",
        previewing: "Parsing spreadsheet…",
        parsed: "Parsed",
        valid: "Valid",
        invalid: "Invalid",
        duplicate: "Duplicates",
        row: "Row",
        website: "Website",
        category: "Category",
        authority: "Authority",
        jurisdiction: "Jurisdiction",
        language: "Language",
        note: "Note",
        selected: "Selected",
        import: "Import and start discovery",
        importing: "Starting discovery…",
        limit:
          "Select at most 100 distinct website origins per run. Invalid and duplicate rows are never collected.",
        reset: "Clear",
        selectFirst: "Select first 100 valid websites",
        success: "Batch import completed",
        sources: "Review in Sources",
        truncated: "The file exceeds 500 rows; only the first 500 rows are previewed.",
      };

  const selectedRows = useMemo(
    () => rows.filter((row) => selected.has(row.rowNumber) && row.status === "VALID"),
    [rows, selected],
  );

  function defaultSelection(items: ImportRow[]): Set<number> {
    return new Set(
      items
        .filter((row) => row.status === "VALID")
        .slice(0, 100)
        .map((row) => row.rowNumber),
    );
  }

  async function loadFile(file: File) {
    setPreviewing(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/discovery/import-preview", { method: "POST", body: form });
      if (!response.ok) {
        throw new Error(
          await responseMessage(response, zh ? "无法解析导入文件" : "Unable to parse import file"),
        );
      }
      const next = (await response.json()) as ImportPreview;
      setPreview(next);
      setRows(next.rows);
      setSelected(defaultSelection(next.rows));
    } catch (loadError) {
      setPreview(null);
      setRows([]);
      setSelected(new Set());
      setError(readMessage(loadError, zh ? "无法解析导入文件" : "Unable to parse import file"));
    } finally {
      setPreviewing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function updateRow(rowNumber: number, update: Partial<ImportRow["intake"]>) {
    setRows((current) =>
      current.map((row) =>
        row.rowNumber === rowNumber ? { ...row, intake: { ...row.intake, ...update } } : row,
      ),
    );
  }

  function toggle(row: ImportRow) {
    if (row.status !== "VALID") return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(row.rowNumber)) next.delete(row.rowNumber);
      else if (next.size < 100) next.add(row.rowNumber);
      return next;
    });
  }

  async function startImport() {
    if (selectedRows.length === 0 || selectedRows.length > 100) return;
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const headers = await adminBrowserMutationHeaders({
        "content-type": "application/json",
      });
      const response = await fetch("/api/discovery/batch", {
        method: "POST",
        headers,
        body: JSON.stringify({
          entries: selectedRows.map((row) => ({
            locator: row.locator,
            intake: row.intake,
          })),
          maxDepth: 1,
          maxCandidates: 100,
          deniedUrlPatterns: ["/login", "/signin", "/logout"],
        }),
      });
      if (!response.ok) {
        throw new Error(
          await responseMessage(response, zh ? "批量导入失败" : "Batch import failed"),
        );
      }
      setResult((await response.json()) as BatchResult);
    } catch (importError) {
      setError(readMessage(importError, zh ? "批量导入失败" : "Batch import failed"));
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setPreview(null);
    setRows([]);
    setSelected(new Set());
    setError(null);
    setResult(null);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/20 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <FileSpreadsheet size={17} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-950">{copy.title}</h2>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">{copy.description}</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-slate-500">{copy.template}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {preview ? (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-600"
            >
              <XCircle size={15} /> {copy.reset}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={previewing || importing}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {previewing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {previewing ? copy.previewing : copy.choose}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadFile(file);
            }}
          />
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          {error}
        </div>
      ) : null}

      {preview ? (
        <div className="mt-5 space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {preview.fileName} · {preview.format}
                {preview.sheetName ? ` · ${preview.sheetName}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full bg-white px-2.5 py-1 text-slate-600">
                  {copy.parsed} {preview.summary.parsed}
                </span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                  {copy.valid} {preview.summary.valid}
                </span>
                <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">
                  {copy.invalid} {preview.summary.invalid}
                </span>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                  {copy.duplicate} {preview.summary.duplicate}
                </span>
              </div>
              {preview.summary.truncated ? (
                <p className="mt-2 text-[11px] font-medium text-amber-700">{copy.truncated}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setSelected(defaultSelection(rows))}
              className="self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
            >
              {copy.selectFirst}
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[1180px] text-left text-xs">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3 font-medium"></th>
                  <th className="px-3 py-3 font-medium">{copy.row}</th>
                  <th className="px-3 py-3 font-medium">{copy.website}</th>
                  <th className="px-3 py-3 font-medium">{copy.category}</th>
                  <th className="px-3 py-3 font-medium">{copy.authority}</th>
                  <th className="px-3 py-3 font-medium">{copy.jurisdiction}</th>
                  <th className="px-3 py-3 font-medium">{copy.language}</th>
                  <th className="px-3 py-3 font-medium">{copy.note}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {rows.slice(0, 150).map((row) => (
                  <tr
                    key={row.rowNumber}
                    className={row.status === "VALID" ? "" : "bg-slate-50/70"}
                  >
                    <td className="px-3 py-3 align-top">
                      <input
                        type="checkbox"
                        checked={selected.has(row.rowNumber)}
                        disabled={row.status !== "VALID"}
                        onChange={() => toggle(row)}
                        className="size-4 rounded border-slate-300"
                      />
                    </td>
                    <td className="px-3 py-3 align-top text-slate-500">{row.rowNumber}</td>
                    <td className="max-w-[280px] px-3 py-3 align-top">
                      <p className="truncate font-medium text-slate-800">{row.locator}</p>
                      {row.status !== "VALID" ? (
                        <p className="mt-1 text-[10px] leading-4 text-rose-600">
                          {row.issues.join(" · ")}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <select
                        value={row.intake.category ?? "OTHER"}
                        disabled={row.status !== "VALID"}
                        onChange={(event) =>
                          updateRow(row.rowNumber, {
                            category: event.target.value as SourceCategory,
                          })
                        }
                        className="w-40 rounded-lg border border-slate-200 bg-white px-2 py-2"
                      >
                        {SOURCE_CATEGORIES.map((value) => (
                          <option key={value} value={value}>
                            {categoryLabel(value, zh)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <select
                        value={row.intake.authorityLevel ?? "UNKNOWN"}
                        disabled={row.status !== "VALID"}
                        onChange={(event) =>
                          updateRow(row.rowNumber, {
                            authorityLevel: event.target.value as AuthorityLevel,
                          })
                        }
                        className="w-36 rounded-lg border border-slate-200 bg-white px-2 py-2"
                      >
                        {AUTHORITY_LEVELS.map((value) => (
                          <option key={value} value={value}>
                            {authorityLabel(value, zh)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <input
                        value={(row.intake.jurisdictions ?? ["GLOBAL"]).join(", ")}
                        disabled={row.status !== "VALID"}
                        onChange={(event) =>
                          updateRow(row.rowNumber, {
                            jurisdictions: splitList(event.target.value, true),
                          })
                        }
                        className="w-28 rounded-lg border border-slate-200 px-2 py-2"
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <input
                        value={(row.intake.languages ?? ["und"]).join(", ")}
                        disabled={row.status !== "VALID"}
                        onChange={(event) =>
                          updateRow(row.rowNumber, { languages: splitList(event.target.value) })
                        }
                        className="w-28 rounded-lg border border-slate-200 px-2 py-2"
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <input
                        value={row.intake.note ?? ""}
                        disabled={row.status !== "VALID"}
                        maxLength={1000}
                        onChange={(event) => updateRow(row.rowNumber, { note: event.target.value })}
                        className="w-56 rounded-lg border border-slate-200 px-2 py-2"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {copy.selected} {selectedRows.length} / 100
              </p>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">{copy.limit}</p>
            </div>
            <button
              type="button"
              onClick={() => void startImport()}
              disabled={importing || selectedRows.length === 0 || selectedRows.length > 100}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300"
            >
              {importing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {importing ? copy.importing : copy.import}
            </button>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">{copy.success}</p>
          <p className="mt-1 text-xs leading-5 text-emerald-800">
            {zh
              ? `启动 ${result.summary.started} 个网站；跳过已有来源 ${result.summary.skippedExistingSource} 个；失败 ${result.summary.failed} 个；共发现 ${result.summary.candidateCount} 个候选。`
              : `Started ${result.summary.started} websites; skipped ${result.summary.skippedExistingSource} existing sources; ${result.summary.failed} failed; ${result.summary.candidateCount} candidates discovered.`}
          </p>
          <Link
            href="/sources"
            className="mt-3 inline-flex rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
          >
            {copy.sources}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
