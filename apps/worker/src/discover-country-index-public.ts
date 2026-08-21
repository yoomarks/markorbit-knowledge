import { extractCountryIndexPublicInventory } from "./country-index-public-inventory";

const DEFAULT_URI = "https://www.country-index.com/";

async function main(): Promise<void> {
  const sourceUri = process.env.MARKORBIT_COUNTRY_INDEX_URI?.trim() || DEFAULT_URI;
  const response = await fetch(sourceUri, {
    headers: {
      "user-agent": "MarkOrbit-Knowledge/1.0 public-corpus-inventory",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) throw new Error(`Country Index returned HTTP ${response.status}`);
  const html = await response.text();
  const inventory = extractCountryIndexPublicInventory(html, sourceUri);
  process.stdout.write(`${JSON.stringify({ event: "country-index.public.inventory", ...inventory }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
