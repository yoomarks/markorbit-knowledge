"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileCog, Plus, Search, SlidersHorizontal } from "lucide-react";
import {
  ARTIFACT_KINDS,
  CONVERSION_PROFILE_STATUSES,
  CONVERTER_RUNTIMES,
  CONVERTER_STATUSES,
  type ConversionProfile,
  type ConversionProfileStatus,
  type ConverterStatus,
} from "@markorbit/contracts";
import type {
  ConversionProfileListResult,
  ConverterListResult,
} from "@markorbit/persistence/converters";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";

const WORKSPACE_ID = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const PAGE_SIZE = 20;

type ManifestDraft = {
  converterId: string;
  displayName: string;
  version: string;
  runtime: string;
  artifactKind: string;
  mimePatterns: string;
};
type ProfileDraft = {
  name: string;
  converterKey: string;
  artifactKind: string;
  mimePattern: string;
  targetPathTemplate: string;
  precedence: string;
  autoConvert: boolean;
  configuration: string;
};

const manifestDraft: ManifestDraft = {
  converterId: "",
  displayName: "",
  version: "1.0.0",
  runtime: "BUILT_IN",
  artifactKind: "TEXT",
  mimePatterns: "text/plain",
};
const profileDraft: ProfileDraft = {
  name: "",
  converterKey: "",
  artifactKind: "TEXT",
  mimePattern: "text/plain",
  targetPathTemplate: "00_Inbox/{sourceSlug}/{artifactId}.md",
  precedence: "100",
  autoConvert: false,
  configuration: "{}",
};

function statusClass(status: string): string {
  if (status === "ACTIVE") return "bg-emerald-50 text-emerald-700";
  if (status === "DEPRECATED" || status === "PAUSED") return "bg-amber-50 text-amber-800";
  return "bg-slate-200 text-slate-600";
}

function parseConfiguration(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Configuration 必须是有效 JSON 对象。");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Configuration 必须是 JSON 对象。");
  }
  return parsed as Record<string, unknown>;
}

export function ConverterControl() {
  const [manifestQuery, setManifestQuery] = useState("");
  const [manifestRuntime, setManifestRuntime] = useState("");
  const [manifestStatus, setManifestStatus] = useState("");
  const [manifestArtifactKind, setManifestArtifactKind] = useState("");
  const [profileQuery, setProfileQuery] = useState("");
  const [profileStatus, setProfileStatus] = useState("");
  const [manifestOffset, setManifestOffset] = useState(0);
  const [profileOffset, setProfileOffset] = useState(0);
  const [manifests, setManifests] = useState<ConverterListResult | null>(null);
  const [profiles, setProfiles] = useState<ConversionProfileListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showManifestForm, setShowManifestForm] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [newManifest, setNewManifest] = useState(manifestDraft);
  const [newProfile, setNewProfile] = useState(profileDraft);
  const [editingProfile, setEditingProfile] = useState<ConversionProfile | null>(null);

  const manifestParams = useMemo(() => {
    const params = new URLSearchParams({
      q: manifestQuery,
      limit: String(PAGE_SIZE),
      offset: String(manifestOffset),
    });
    if (manifestRuntime) params.set("runtime", manifestRuntime);
    if (manifestStatus) params.set("status", manifestStatus);
    if (manifestArtifactKind) params.set("artifactKind", manifestArtifactKind);
    return params.toString();
  }, [manifestArtifactKind, manifestOffset, manifestQuery, manifestRuntime, manifestStatus]);
  const profileParams = useMemo(() => {
    const params = new URLSearchParams({
      workspaceId: WORKSPACE_ID,
      q: profileQuery,
      limit: String(PAGE_SIZE),
      offset: String(profileOffset),
    });
    if (profileStatus) params.set("status", profileStatus);
    return params.toString();
  }, [profileOffset, profileQuery, profileStatus]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [manifestResponse, profileResponse] = await Promise.all([
        fetch(`/api/converters?${manifestParams}`),
        fetch(`/api/conversion-profiles?${profileParams}`),
      ]);
      const manifestBody = await manifestResponse.json();
      const profileBody = await profileResponse.json();
      if (!manifestResponse.ok)
        throw new Error(manifestBody.error?.message ?? "Unable to load converters");
      if (!profileResponse.ok)
        throw new Error(profileBody.error?.message ?? "Unable to load profiles");
      setManifests(manifestBody as ConverterListResult);
      setProfiles(profileBody as ConversionProfileListResult);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load conversion control plane",
      );
    } finally {
      setLoading(false);
    }
  }, [manifestParams, profileParams]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function request(url: string, init: RequestInit) {
    setError(null);
    setMessage(null);
    const headers = await adminBrowserMutationHeaders(init.headers ?? {});
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    const response = await fetch(url, {
      ...init,
      headers,
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? "Request failed");
    return body;
  }

  async function registerManifest(event: React.FormEvent) {
    event.preventDefault();
    try {
      await request("/api/converters", {
        method: "POST",
        body: JSON.stringify({
          converterId: newManifest.converterId,
          displayName: newManifest.displayName,
          version: newManifest.version,
          runtime: newManifest.runtime,
          capabilities: ["CONVERT"],
          inputs: {
            artifactKinds: [newManifest.artifactKind],
            mimePatterns: newManifest.mimePatterns
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          },
          outputFormat: "MARKDOWN",
          deterministic: true,
          configurationSchema: { type: "object", properties: {}, additionalProperties: false },
          resourceHints: { maxInputBytes: 10485760, timeoutSeconds: 30 },
          status: "ACTIVE",
        }),
      });
      setNewManifest(manifestDraft);
      setShowManifestForm(false);
      setMessage("ConverterManifest 版本已登记；尚未加载或执行任何转换代码。");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Registration failed");
    }
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    const [converterId, version] = newProfile.converterKey.split("@");
    try {
      const payload = {
        name: newProfile.name,
        converter: { converterId, version },
        input: {
          artifactKinds: [newProfile.artifactKind],
          mimePatterns: [newProfile.mimePattern],
        },
        outputFormat: "MARKDOWN",
        targetPathTemplate: newProfile.targetPathTemplate,
        configuration: parseConfiguration(newProfile.configuration),
        precedence: Number(newProfile.precedence),
        autoConvert: newProfile.autoConvert,
      };
      if (editingProfile) {
        await request(`/api/conversion-profiles/${editingProfile.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            ...payload,
            expectedUpdatedAt: editingProfile.updatedAt,
          }),
        });
        setMessage("Conversion Profile 已更新；未执行任何转换。");
      } else {
        await request("/api/conversion-profiles", {
          method: "POST",
          body: JSON.stringify({
            workspaceId: WORKSPACE_ID,
            status: "PAUSED",
            ...payload,
          }),
        });
        setMessage("Conversion Profile 已保存为 PAUSED；尚未创建 ConversionRun。");
      }
      setNewProfile(profileDraft);
      setEditingProfile(null);
      setShowProfileForm(false);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Profile save failed");
    }
  }

  async function changeManifestStatus(
    converterId: string,
    version: string,
    status: ConverterStatus,
  ) {
    try {
      await request(
        `/api/converters/${encodeURIComponent(converterId)}/${encodeURIComponent(version)}/status`,
        { method: "POST", body: JSON.stringify({ status }) },
      );
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Status update failed");
    }
  }

  async function changeProfileStatus(profile: ConversionProfile, status: ConversionProfileStatus) {
    try {
      await request(`/api/conversion-profiles/${profile.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status, expectedUpdatedAt: profile.updatedAt }),
      });
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Status update failed");
    }
  }

  function startNewProfile() {
    setEditingProfile(null);
    setNewProfile(profileDraft);
    setShowProfileForm(true);
    setMessage(null);
    setError(null);
  }

  function editProfile(profile: ConversionProfile) {
    setEditingProfile(profile);
    setNewProfile({
      name: profile.name,
      converterKey: `${profile.converter.converterId}@${profile.converter.version}`,
      artifactKind: profile.input.artifactKinds[0] ?? "TEXT",
      mimePattern: profile.input.mimePatterns[0] ?? "text/plain",
      targetPathTemplate: profile.targetPathTemplate,
      precedence: String(profile.precedence),
      autoConvert: profile.autoConvert,
      configuration: JSON.stringify(profile.configuration, null, 2),
    });
    setShowProfileForm(true);
    setMessage(null);
    setError(null);
  }

  function cancelProfileEdit() {
    setEditingProfile(null);
    setNewProfile(profileDraft);
    setShowProfileForm(false);
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        当前模块只管理 Converter 契约和 Conversion Profile 意图。没有转换进程正在运行，也不会生成
        Markdown、ConversionRun 或 Obsidian 文件。
      </div>
      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <h2 className="font-semibold text-slate-950">Converter Registry</h2>
            <p className="mt-1 text-sm text-slate-500">
              精确版本、输入覆盖和生命周期；Runtime Health 尚未评估。
            </p>
          </div>
          <button
            onClick={() => setShowManifestForm((value) => !value)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white"
          >
            <Plus size={17} /> 注册新版本
          </button>
        </header>
        {showManifestForm ? (
          <form
            onSubmit={registerManifest}
            className="grid gap-3 border-b border-slate-200 bg-slate-50 p-5 md:grid-cols-3"
          >
            <Input
              label="Converter ID"
              value={newManifest.converterId}
              onChange={(value) =>
                setNewManifest((current) => ({ ...current, converterId: value }))
              }
              required
            />
            <Input
              label="显示名称"
              value={newManifest.displayName}
              onChange={(value) =>
                setNewManifest((current) => ({ ...current, displayName: value }))
              }
              required
            />
            <Input
              label="SemVer"
              value={newManifest.version}
              onChange={(value) => setNewManifest((current) => ({ ...current, version: value }))}
              required
            />
            <Select
              label="Runtime"
              value={newManifest.runtime}
              values={CONVERTER_RUNTIMES}
              onChange={(value) => setNewManifest((current) => ({ ...current, runtime: value }))}
            />
            <Select
              label="Artifact Kind"
              value={newManifest.artifactKind}
              values={ARTIFACT_KINDS}
              onChange={(value) =>
                setNewManifest((current) => ({ ...current, artifactKind: value }))
              }
            />
            <Input
              label="MIME patterns（逗号分隔）"
              value={newManifest.mimePatterns}
              onChange={(value) =>
                setNewManifest((current) => ({ ...current, mimePatterns: value }))
              }
              required
            />
            <div className="md:col-span-3">
              <button className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white">
                保存 Manifest
              </button>
            </div>
          </form>
        ) : null}
        <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-4">
          <label className="relative block">
            <Search className="absolute left-3 top-3 text-slate-400" size={17} />
            <input
              value={manifestQuery}
              onChange={(event) => {
                setManifestQuery(event.target.value);
                setManifestOffset(0);
              }}
              placeholder="搜索 Converter ID 或名称"
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm"
            />
          </label>
          <FilterSelect
            value={manifestRuntime}
            label="全部 Runtime"
            values={CONVERTER_RUNTIMES}
            onChange={(value) => {
              setManifestRuntime(value);
              setManifestOffset(0);
            }}
          />
          <FilterSelect
            value={manifestStatus}
            label="全部状态"
            values={CONVERTER_STATUSES}
            onChange={(value) => {
              setManifestStatus(value);
              setManifestOffset(0);
            }}
          />
          <FilterSelect
            value={manifestArtifactKind}
            label="全部 Artifact Kind"
            values={ARTIFACT_KINDS}
            onChange={(value) => {
              setManifestArtifactKind(value);
              setManifestOffset(0);
            }}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Converter</th>
                <th className="px-5 py-3">Runtime</th>
                <th className="px-5 py-3">Inputs</th>
                <th className="px-5 py-3">Capabilities</th>
                <th className="px-5 py-3">Profiles</th>
                <th className="px-5 py-3">状态</th>
                <th className="px-5 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {manifests?.items.map(({ manifest, boundProfileCount }) => (
                <tr key={`${manifest.converterId}@${manifest.version}`}>
                  <td className="px-5 py-4">
                    <Link
                      href={`/converters/${encodeURIComponent(manifest.converterId)}/${encodeURIComponent(manifest.version)}`}
                      className="font-medium text-slate-950 hover:text-emerald-700"
                    >
                      {manifest.displayName}
                    </Link>
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      {manifest.converterId}@{manifest.version}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <p>{manifest.runtime}</p>
                    <p className="mt-1 text-xs text-slate-500">Health: not evaluated</p>
                  </td>
                  <td className="px-5 py-4">
                    <p>{manifest.inputs.artifactKinds.join(", ")}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {manifest.inputs.mimePatterns.join(", ")}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-600">
                    {manifest.capabilities.join(", ")}
                  </td>
                  <td className="px-5 py-4">{boundProfileCount}</td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(manifest.status)}`}
                    >
                      {manifest.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <select
                      value={manifest.status}
                      onChange={(event) =>
                        void changeManifestStatus(
                          manifest.converterId,
                          manifest.version,
                          event.target.value as ConverterStatus,
                        )
                      }
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                    >
                      {CONVERTER_STATUSES.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          offset={manifestOffset}
          total={manifests?.total ?? 0}
          onChange={setManifestOffset}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <h2 className="font-semibold text-slate-950">Conversion Profiles</h2>
            <p className="mt-1 text-sm text-slate-500">
              声明 RawArtifact 与精确 Converter 版本的匹配和未来 Staging 路径。
            </p>
          </div>
          <button
            onClick={startNewProfile}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white"
          >
            <SlidersHorizontal size={17} /> 新建 Profile
          </button>
        </header>
        {showProfileForm ? (
          <form
            onSubmit={saveProfile}
            className="grid gap-3 border-b border-slate-200 bg-slate-50 p-5 md:grid-cols-3"
          >
            <Input
              label="Profile 名称"
              value={newProfile.name}
              onChange={(value) => setNewProfile((current) => ({ ...current, name: value }))}
              required
            />
            <Select
              label="Converter 精确版本"
              value={newProfile.converterKey}
              values={
                manifests?.items.map(
                  ({ manifest }) => `${manifest.converterId}@${manifest.version}`,
                ) ?? []
              }
              onChange={(value) => {
                const manifest = manifests?.items.find(
                  (item) => `${item.manifest.converterId}@${item.manifest.version}` === value,
                )?.manifest;
                setNewProfile((current) => ({
                  ...current,
                  converterKey: value,
                  artifactKind: manifest?.inputs.artifactKinds[0] ?? current.artifactKind,
                  mimePattern: manifest?.inputs.mimePatterns[0] ?? current.mimePattern,
                }));
              }}
              required
            />
            <Input
              label="目标路径模板"
              value={newProfile.targetPathTemplate}
              onChange={(value) =>
                setNewProfile((current) => ({ ...current, targetPathTemplate: value }))
              }
              required
            />
            <Select
              label="Artifact Kind"
              value={newProfile.artifactKind}
              values={ARTIFACT_KINDS}
              onChange={(value) =>
                setNewProfile((current) => ({ ...current, artifactKind: value }))
              }
            />
            <Input
              label="MIME pattern"
              value={newProfile.mimePattern}
              onChange={(value) => setNewProfile((current) => ({ ...current, mimePattern: value }))}
              required
            />
            <Input
              label="优先级"
              value={newProfile.precedence}
              onChange={(value) => setNewProfile((current) => ({ ...current, precedence: value }))}
              required
            />
            <label className="md:col-span-3 text-sm font-medium text-slate-700">
              Configuration JSON
              <textarea
                value={newProfile.configuration}
                onChange={(event) =>
                  setNewProfile((current) => ({ ...current, configuration: event.target.value }))
                }
                rows={5}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newProfile.autoConvert}
                onChange={(event) =>
                  setNewProfile((current) => ({ ...current, autoConvert: event.target.checked }))
                }
              />{" "}
              自动转换意图（仅记录，不执行）
            </label>
            <div className="md:col-span-3">
              <button
                disabled={!newProfile.converterKey}
                className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {editingProfile ? "保存修改" : "保存为 PAUSED"}
              </button>
              <button
                type="button"
                onClick={cancelProfileEdit}
                className="ml-3 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"
              >
                取消
              </button>
            </div>
          </form>
        ) : null}
        <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <label className="relative block">
            <Search className="absolute left-3 top-3 text-slate-400" size={17} />
            <input
              value={profileQuery}
              onChange={(event) => {
                setProfileQuery(event.target.value);
                setProfileOffset(0);
              }}
              placeholder="搜索 Profile 名称"
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm"
            />
          </label>
          <FilterSelect
            value={profileStatus}
            label="全部 Profile 状态"
            values={CONVERSION_PROFILE_STATUSES}
            onChange={(value) => {
              setProfileStatus(value);
              setProfileOffset(0);
            }}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Profile</th>
                <th className="px-5 py-3">Converter</th>
                <th className="px-5 py-3">Input</th>
                <th className="px-5 py-3">Path / Intent</th>
                <th className="px-5 py-3">状态</th>
                <th className="px-5 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {profiles?.items.map((profile) => (
                <tr key={profile.id}>
                  <td className="px-5 py-4">
                    <p className="font-medium text-slate-950">{profile.name}</p>
                    <p className="mt-1 font-mono text-xs text-slate-500">{profile.id}</p>
                  </td>
                  <td className="px-5 py-4 font-mono text-xs">
                    {profile.converter.converterId}@{profile.converter.version}
                  </td>
                  <td className="px-5 py-4">
                    <p>{profile.input.artifactKinds.join(", ")}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {profile.input.mimePatterns.join(", ")}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-mono text-xs">{profile.targetPathTemplate}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      precedence {profile.precedence} · auto {profile.autoConvert ? "on" : "off"}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(profile.status)}`}
                    >
                      {profile.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={profile.status === "ARCHIVED"}
                        onClick={() => editProfile(profile)}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs disabled:opacity-50"
                      >
                        编辑
                      </button>
                      <select
                        disabled={profile.status === "ARCHIVED"}
                        value={profile.status}
                        onChange={(event) =>
                          void changeProfileStatus(
                            profile,
                            event.target.value as ConversionProfileStatus,
                          )
                        }
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs disabled:opacity-50"
                      >
                        {CONVERSION_PROFILE_STATUSES.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && profiles?.items.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <FileCog className="mx-auto text-slate-400" />
            <p className="mt-3 font-medium text-slate-950">尚无 Conversion Profile</p>
          </div>
        ) : null}
        <Pagination
          offset={profileOffset}
          total={profiles?.total ?? 0}
          onChange={setProfileOffset}
        />
      </section>
      {loading ? (
        <p className="text-center text-sm text-slate-500">正在读取 Converter Control Plane…</p>
      ) : null}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1.5 block font-medium text-slate-700">{label}</span>
      <input
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
      />
    </label>
  );
}
function Select({
  label,
  value,
  values,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  values: readonly string[];
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1.5 block font-medium text-slate-700">{label}</span>
      <select
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
      >
        <option value="">请选择</option>
        {values.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}
function FilterSelect({
  value,
  label,
  values,
  onChange,
}: {
  value: string;
  label: string;
  values: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
    >
      <option value="">{label}</option>
      {values.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function Pagination({
  offset,
  total,
  onChange,
}: {
  offset: number;
  total: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm text-slate-500">
      <span>
        第 {Math.floor(offset / PAGE_SIZE) + 1} / {Math.max(1, Math.ceil(total / PAGE_SIZE))} 页 ·
        共 {total} 条
      </span>
      <div className="flex gap-2">
        <button
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - PAGE_SIZE))}
          className="rounded-lg border border-slate-300 p-2 disabled:opacity-40"
        >
          <ChevronLeft size={17} />
        </button>
        <button
          disabled={offset + PAGE_SIZE >= total}
          onClick={() => onChange(offset + PAGE_SIZE)}
          className="rounded-lg border border-slate-300 p-2 disabled:opacity-40"
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
