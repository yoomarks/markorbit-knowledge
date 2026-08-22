import { extractCountryIndexPublicInventory } from "./country-index-public-inventory";
import { buildLiveAcquisitionProfileEvidence } from "./live-acquisition-profile-evidence";

const DEFAULT_URI = "https://www.country-index.com/";

async function main(): Promise<void> {
  const sourceUri = process.env.MARKORBIT_COUNTRY_INDEX_URI?.trim() || DEFAULT_URI;
  const startedAt = new Date().toISOString();
  const response = await fetch(sourceUri, {
    headers: {
      "user-agent": "MarkOrbit-Knowledge/1.0 public-corpus-inventory",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) throw new Error(`Country Index returned HTTP ${response.status}`);
  const html = await response.text();
  const finishedAt = new Date().toISOString();
  const inventory = extractCountryIndexPublicInventory(html, sourceUri);
  const learning = buildLiveAcquisitionProfileEvidence({
    profileId: "jurisdiction-index-html-v1",
    runId: `canary_country_index_${Date.parse(finishedAt)}`,
    sourceId: "country-index-public",
    startedAt,
    finishedAt,
    discovered: 1,
    attempted: 1,
    fetched: 1,
    accepted: 1,
    knownCorpus: 1,
    bytes: Buffer.byteLength(html),
    httpStatusCounts: { [String(response.status)]: 1 },
    surfaceOutcomes: [
      {
        surface: "COUNTRY_INDEX",
        discovered: inventory.itemCount,
        accepted: inventory.itemCount,
        knownCorpus: null,
      },
    ],
    rendering: { used: false },
    changeDetection: {
      etagObserved: response.headers.has("etag"),
      lastModifiedObserved: response.headers.has("last-modified"),
      validator304Count: 0,
      digestChanges: 0,
    },
    evidenceRefs: [
      `country-index:${inventory.sourceUri}`,
      `country-index:enumerated-items:${inventory.itemCount}`,
    ],
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        event: "country-index.public.inventory",
        ...inventory,
        acquisitionLearning: learning,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
