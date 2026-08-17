import { getRepresentativeSourceLiveCanaries } from "@markorbit/persistence/representative-source-live-canaries";
import { DEFAULT_WORKSPACE_ID } from "./source-coverage-bootstrap";

type JsonRecord = Record<string, unknown>;

type Receipt = {
  id: string;
  jurisdiction: string;
  targetId: string;
  status: "DISPATCHED" | "PROVEN";
  lastProofStatus: "UNCHECKED" | "INCOMPLETE" | "FAILED" | "PROVEN";
};

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function argument(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function argumentsFor(name: string): string[] {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .filter((value) => value.startsWith(prefix))
    .map((value) => value.slice(prefix.length).trim().toUpperCase())
    .filter(Boolean);
}

function normalizedBaseUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Control-plane URL must use http or https");
  }
  return url.toString().replace(/\/$/, "");
}

async function requestJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = record(record(payload)?.error);
    const message = typeof error?.message === "string" ? error.message : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function parseReceipt(value: unknown): Receipt | null {
  const item = record(value);
  if (
    !item ||
    typeof item.id !== "string" ||
    typeof item.jurisdiction !== "string" ||
    typeof item.targetId !== "string" ||
    (item.status !== "DISPATCHED" && item.status !== "PROVEN") ||
    !["UNCHECKED", "INCOMPLETE", "FAILED", "PROVEN"].includes(String(item.lastProofStatus))
  ) {
    return null;
  }
  return item as Receipt;
}

async function main(): Promise<void> {
  const baseUrl = normalizedBaseUrl(
    process.env.MARKORBIT_CONTROL_PLANE_URL?.trim() ||
      argument("--control-plane") ||
      "http://127.0.0.1:3000",
  );
  const workspaceId = argument("--workspace") || DEFAULT_WORKSPACE_ID;
  const requested = [...new Set(argumentsFor("--jurisdiction"))];
  const canaries = getRepresentativeSourceLiveCanaries();
  const supported = new Set(canaries.map((item) => item.jurisdiction));
  const unknown = requested.filter((value) => !supported.has(value));
  if (unknown.length > 0) throw new Error(`Unsupported representative jurisdiction: ${unknown.join(", ")}`);
  const allowed = requested.length > 0 ? new Set(requested) : supported;

  const query = new URLSearchParams({ workspaceId, status: "DISPATCHED", limit: "100" });
  const listed = record(
    await requestJson(`${baseUrl}/api/source-supply-promotion-receipts?${query.toString()}`),
  );
  const receipts = (Array.isArray(listed?.items) ? listed.items : [])
    .map(parseReceipt)
    .filter((item): item is Receipt => !!item && allowed.has(item.jurisdiction));
  const results: Array<{
    receiptId: string;
    jurisdiction: string;
    targetId: string;
    status: string;
    lastProofStatus: string;
    error: string | null;
  }> = [];

  for (const receipt of receipts) {
    try {
      const payload = record(
        await requestJson(
          `${baseUrl}/api/source-supply-promotion-receipts/${encodeURIComponent(receipt.id)}/reconcile`,
          { method: "POST" },
        ),
      );
      const updated = parseReceipt(payload?.receipt);
      if (!updated) throw new Error(`Receipt ${receipt.id} returned an invalid reconciliation response`);
      results.push({
        receiptId: updated.id,
        jurisdiction: updated.jurisdiction,
        targetId: updated.targetId,
        status: updated.status,
        lastProofStatus: updated.lastProofStatus,
        error: null,
      });
    } catch (error) {
      results.push({
        receiptId: receipt.id,
        jurisdiction: receipt.jurisdiction,
        targetId: receipt.targetId,
        status: receipt.status,
        lastProofStatus: receipt.lastProofStatus,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const output = {
    version: "REPRESENTATIVE_SUPPLY_RECEIPT_RECONCILIATION_V1",
    workspaceId,
    selectedJurisdictions: [...allowed],
    mutationScope: "PROMOTION_RECEIPT_ONLY",
    collectionRunCreated: false,
    results,
    summary: {
      reconciled: results.length,
      proven: results.filter((item) => item.status === "PROVEN").length,
      incomplete: results.filter(
        (item) => item.status === "DISPATCHED" && item.lastProofStatus === "INCOMPLETE",
      ).length,
      failed: results.filter((item) => item.error || item.lastProofStatus === "FAILED").length,
    },
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (output.summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
