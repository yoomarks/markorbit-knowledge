"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";

type EligibleArtifact = {
  id: string;
  sourceId: string;
  artifactKind: string;
  mimeType: string;
  sha256: string;
  sizeBytes: number;
  capturedAt: string;
  createdAt: string;
  version: number;
};
type CompatibleProfile = {
  profileId: string;
  name: string;
  converterId: string;
  converterVersion: string;
  outputFormat: "MARKDOWN";
  targetPathTemplate: string;
};

const defaultWorkspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";

export function ConversionDispatch() {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId);
  const [artifacts, setArtifacts] = useState<EligibleArtifact[]>([]);
  const [profiles, setProfiles] = useState<CompatibleProfile[]>([]);
  const [artifactId, setArtifactId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [idempotencyKey, setKey] = useState("");
  const [loadingArtifacts, setLoadingArtifacts] = useState(false);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedArtifact = artifacts.find((item) => item.id === artifactId);
  const selectedProfile = profiles.find((item) => item.profileId === profileId);
  const canSubmit = workspaceId && selectedArtifact && selectedProfile && idempotencyKey;

  async function loadArtifacts() {
    setLoadingArtifacts(true);
    setError(null);
    setArtifactId("");
    setProfileId("");
    setProfiles([]);
    try {
      const res = await fetch(
        `/api/raw-artifacts/eligible-for-conversion?workspaceId=${encodeURIComponent(workspaceId)}&limit=100`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(json));
      setArtifacts(json.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load eligible artifacts");
    } finally {
      setLoadingArtifacts(false);
    }
  }

  async function selectArtifact(nextArtifactId: string) {
    setArtifactId(nextArtifactId);
    setProfileId("");
    setProfiles([]);
    if (!nextArtifactId) return;
    setLoadingProfiles(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/raw-artifacts/${nextArtifactId}/compatible-conversion-profiles?workspaceId=${encodeURIComponent(
          workspaceId,
        )}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(json));
      setProfiles(json.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load compatible profiles");
    } finally {
      setLoadingProfiles(false);
    }
  }

  const confirmation = useMemo(() => {
    if (!selectedArtifact || !selectedProfile) return null;
    return {
      workspaceId,
      rawArtifactId: selectedArtifact.id,
      conversionProfileId: selectedProfile.profileId,
      converter: `${selectedProfile.converterId}@${selectedProfile.converterVersion}`,
      output: selectedProfile.outputFormat,
      targetPathTemplate: selectedProfile.targetPathTemplate,
    };
  }, [workspaceId, selectedArtifact, selectedProfile]);

  function generateKey() {
    setKey(`manual-${globalThis.crypto.randomUUID()}`);
  }

  async function submit() {
    if (!selectedArtifact || !selectedProfile) return;
    setMessage("Creating durable PENDING ConversionRun…");
    setError(null);
    const headers = await adminBrowserMutationHeaders({ "Content-Type": "application/json" });
    const res = await fetch("/api/conversion-runs", {
      method: "POST",
      headers,
      body: JSON.stringify({
        workspaceId,
        rawArtifactId: selectedArtifact.id,
        conversionProfileId: selectedProfile.profileId,
        requestedOutput: {
          format: selectedProfile.outputFormat,
          targetPathTemplate: selectedProfile.targetPathTemplate,
        },
        trigger: "MANUAL",
        idempotencyKey,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(JSON.stringify(json));
      setMessage(null);
      return;
    }
    const runId = json.record.run.id;
    setMessage("Awaiting conversion runtime");
    router.push(`/conversion-runs/${runId}?workspaceId=${encodeURIComponent(workspaceId)}`);
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
      <p className="text-sm text-slate-600">
        Controlled Manual Dispatch creates only a durable PENDING ConversionRun and CREATED event.
        <strong> Awaiting conversion runtime</strong>; it does not generate Markdown, create Staging
        Documents or sync Obsidian.
      </p>
      <label className="block text-sm font-medium text-slate-700">
        Workspace
        <input
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm"
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
        />
      </label>
      <button
        type="button"
        onClick={loadArtifacts}
        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
      >
        {loadingArtifacts ? "Loading eligible artifacts…" : "Load eligible RawArtifacts"}
      </button>
      {artifacts.length === 0 && !loadingArtifacts ? (
        <p className="rounded-xl bg-slate-50 p-3 text-sm">
          No eligible READY_FOR_CONVERSION RawArtifacts for this Workspace.
        </p>
      ) : null}
      {artifacts.length > 0 ? (
        <label className="block text-sm font-medium text-slate-700">
          Eligible RawArtifact
          <select
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            value={artifactId}
            onChange={(e) => void selectArtifact(e.target.value)}
          >
            <option value="">Select an artifact…</option>
            {artifacts.map((artifact) => (
              <option key={artifact.id} value={artifact.id}>
                {artifact.id} · {artifact.artifactKind} · {artifact.mimeType}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {selectedArtifact ? (
        <dl className="grid gap-2 rounded-xl bg-slate-50 p-3 text-sm md:grid-cols-2">
          <dt>Source</dt>
          <dd className="font-mono">{selectedArtifact.sourceId}</dd>
          <dt>Kind</dt>
          <dd>{selectedArtifact.artifactKind}</dd>
          <dt>MIME</dt>
          <dd>{selectedArtifact.mimeType}</dd>
          <dt>SHA-256</dt>
          <dd className="break-all font-mono">{selectedArtifact.sha256}</dd>
          <dt>Size</dt>
          <dd>{selectedArtifact.sizeBytes} bytes</dd>
        </dl>
      ) : null}
      {artifactId && loadingProfiles ? (
        <p className="text-sm">Loading compatible Profiles…</p>
      ) : null}
      {artifactId && !loadingProfiles && profiles.length === 0 ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm">
          No compatible ACTIVE ConversionProfile with an ACTIVE exact ConverterManifest.
        </p>
      ) : null}
      {profiles.length > 0 ? (
        <label className="block text-sm font-medium text-slate-700">
          Compatible Profile
          <select
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
          >
            <option value="">Select a profile…</option>
            {profiles.map((profile) => (
              <option key={profile.profileId} value={profile.profileId}>
                {profile.name} · {profile.converterId}@{profile.converterVersion}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {selectedProfile ? (
        <dl className="grid gap-2 rounded-xl bg-slate-50 p-3 text-sm md:grid-cols-2">
          <dt>Converter</dt>
          <dd className="font-mono">
            {selectedProfile.converterId}@{selectedProfile.converterVersion}
          </dd>
          <dt>Output</dt>
          <dd>{selectedProfile.outputFormat}</dd>
          <dt>Target path</dt>
          <dd className="font-mono">{selectedProfile.targetPathTemplate}</dd>
        </dl>
      ) : null}
      <label className="block text-sm font-medium text-slate-700">
        Idempotency key
        <input
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm"
          value={idempotencyKey}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={generateKey}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
        >
          Generate idempotency key
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          Confirm PENDING dispatch
        </button>
      </div>
      {confirmation ? (
        <pre className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs">
          {JSON.stringify(confirmation, null, 2)}
        </pre>
      ) : null}
      {message ? <p className="rounded-xl bg-emerald-50 p-3 text-sm">{message}</p> : null}
      {error ? (
        <pre className="whitespace-pre-wrap rounded-xl bg-red-50 p-3 text-xs">{error}</pre>
      ) : null}
    </div>
  );
}
