import {
  USPTO_TRADEMARK_CORPUS_SEEDS,
  extractUsptoTrademarkLinks,
  summarizeUsptoDomains,
  type UsptoDiscoveredLink,
} from "./uspto-public-corpus-discovery";

async function fetchHtml(uri: string): Promise<string> {
  const response = await fetch(uri, {
    headers: {
      "user-agent": "MarkOrbit-Knowledge/1.0 corpus-discovery",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) throw new Error(`${uri} returned HTTP ${response.status}`);
  return response.text();
}

async function main(): Promise<void> {
  const discovered = new Map<string, UsptoDiscoveredLink>();
  const failures: Array<{ uri: string; error: string }> = [];

  for (const seed of USPTO_TRADEMARK_CORPUS_SEEDS) {
    try {
      const html = await fetchHtml(seed.uri);
      for (const link of extractUsptoTrademarkLinks(html, seed.uri)) {
        if (!discovered.has(link.uri)) discovered.set(link.uri, link);
      }
    } catch (error) {
      failures.push({
        uri: seed.uri,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const links = [...discovered.values()].sort((left, right) => left.uri.localeCompare(right.uri));
  process.stdout.write(
    `${JSON.stringify(
      {
        event: "uspto.trademark.corpus.discovery",
        seedCount: USPTO_TRADEMARK_CORPUS_SEEDS.length,
        successfulSeedCount: USPTO_TRADEMARK_CORPUS_SEEDS.length - failures.length,
        failedSeedCount: failures.length,
        discoveredLinkCount: links.length,
        domainCounts: summarizeUsptoDomains(links),
        failures,
        links,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
