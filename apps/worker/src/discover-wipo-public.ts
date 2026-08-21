import {
  WIPO_TRADEMARK_CORPUS_SEEDS,
  extractWipoTrademarkLinks,
  summarizeWipoDomains,
  type WipoDiscoveredLink,
} from "./wipo-public-corpus-discovery";

async function main(): Promise<void> {
  const discovered = new Map<string, WipoDiscoveredLink>();
  const failures: Array<{ uri: string; error: string }> = [];

  for (const seed of WIPO_TRADEMARK_CORPUS_SEEDS) {
    try {
      const response = await fetch(seed.uri, {
        headers: {
          "user-agent": "MarkOrbit-Knowledge/1.0 corpus-discovery",
          accept: "text/html,application/xhtml+xml",
        },
      });
      if (!response.ok) throw new Error(`${seed.uri} returned HTTP ${response.status}`);
      const html = await response.text();
      for (const link of extractWipoTrademarkLinks(html, seed.uri)) {
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
        event: "wipo.trademark.corpus.discovery",
        seedCount: WIPO_TRADEMARK_CORPUS_SEEDS.length,
        successfulSeedCount: WIPO_TRADEMARK_CORPUS_SEEDS.length - failures.length,
        failedSeedCount: failures.length,
        discoveredLinkCount: links.length,
        domainCounts: summarizeWipoDomains(links),
        failures,
        links,
      },
      null,
      2,
    )}\n`,
  );

  if (failures.length > 0) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
