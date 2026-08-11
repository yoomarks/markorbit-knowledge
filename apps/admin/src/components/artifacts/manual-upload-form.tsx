"use client";

import { FormEvent, useState } from "react";

type Result = {
  requestId: string;
  replayed: boolean;
  runId: string;
  artifact: { id: string; originalName: string; artifactKind: string; sizeBytes: number };
};

export function ManualUploadForm() {
  const [workspaceId, setWorkspaceId] = useState("wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV");
  const [actorId, setActorId] = useState("local-admin");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("file", file);
    try {
      const response = await fetch("/api/artifacts/manual-uploads", {
        method: "POST",
        headers: {
          "x-markorbit-workspace-id": workspaceId,
          "x-markorbit-admin-actor-id": actorId,
          "idempotency-key": crypto.randomUUID(),
        },
        body: form,
      });
      const body = (await response.json()) as Result & { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Manual upload failed");
      setResult(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Manual upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={submit}>
        <label>Workspace <input value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} /></label>
        <label>Operator <input value={actorId} onChange={(e) => setActorId(e.target.value)} /></label>
        <label>File <input type="file" accept=".md,.txt,.pdf,.docx,.csv,.json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        <button type="submit" disabled={!file || busy}>{busy ? "Uploading..." : "Upload to RawArtifact"}</button>
      </form>
      <p>Files are limited to 25 MiB and enter immutable RawArtifact storage only; this action does not bypass Staging or Vault review.</p>
      {error ? <p role="alert">{error}</p> : null}
      {result ? (
        <div>
          <p>RawArtifact: {result.artifact.id}</p>
          <p>Run: {result.runId}</p>
          <p>File: {result.artifact.originalName} ({result.artifact.artifactKind}, {result.artifact.sizeBytes} bytes)</p>
          <a href={`/artifacts/${encodeURIComponent(result.artifact.id)}`}>Inspect artifact and provenance</a>
        </div>
      ) : null}
    </div>
  );
}
