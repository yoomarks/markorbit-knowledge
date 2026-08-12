import { describe, expect, it, vi } from "vitest";
import type { ArtifactBackedExecutionContext } from "../src/artifact-backed-collection-executor";
import {
  CollectionAcquisitionError,
  RssArtifactAcquirer,
  type ApiTransportRequest,
  type RssEntryEnvelopeV1,
} from "../src/index";

function context(
  connectorConfig: Record<string, unknown> = {
    feedUrl: "https://feeds.example.test/news.xml",
  },
): ArtifactBackedExecutionContext {
  return {
    workerId: "wrk_00000000000000000000000000",
    leaseToken: "lease-token",
    lease: { id: "lse_00000000000000000000000000" },
    job: {
      jobType: "WEB_CRAWL",
      connector: { connectorId: "rss-worker", version: "1.0.0" },
      sourceSnapshot: {
        sourceType: "RSS",
        connectorConfig,
      },
    },
  } as unknown as ArtifactBackedExecutionContext;
}

function response(
  body: string,
  contentType = "application/rss+xml; charset=utf-8",
  statusCode = 200,
) {
  return {
    statusCode,
    headers: { "content-type": contentType },
    body: Buffer.from(body, "utf8"),
  };
}

function acquirerFor(body: string, contentType?: string, statusCode?: number) {
  return new RssArtifactAcquirer({
    resolver: async () => [{ address: "93.184.216.34", family: 4 }],
    transport: async () => response(body, contentType, statusCode),
  });
}

async function acquisitionError(promise: Promise<unknown>): Promise<CollectionAcquisitionError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CollectionAcquisitionError);
    return error as CollectionAcquisitionError;
  }
  throw new Error("Expected CollectionAcquisitionError");
}

function entryEnvelopes(artifacts: Awaited<ReturnType<RssArtifactAcquirer["acquire"]>>) {
  return artifacts
    .filter((artifact) => artifact.artifactKind === "JSON")
    .map((artifact) => ({
      artifact,
      envelope: JSON.parse(Buffer.from(artifact.content).toString("utf8")) as RssEntryEnvelopeV1,
    }));
}

const RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>MarkOrbit News</title>
    <item>
      <guid isPermaLink="false">news-002</guid>
      <title>Second item</title>
      <link>https://example.test/news/2#fragment</link>
      <pubDate>Wed, 12 Aug 2026 06:30:00 GMT</pubDate>
      <dc:creator>Editor Two</dc:creator>
      <category>Trademark</category>
      <description><![CDATA[Short <b>summary</b>.]]></description>
      <content:encoded><![CDATA[Long content body.]]></content:encoded>
    </item>
    <item>
      <guid>news-001</guid>
      <title>First item</title>
      <link>/news/1</link>
      <pubDate>Wed, 12 Aug 2026 05:30:00 GMT</pubDate>
      <category>Law</category>
      <category>Law</category>
      <description>First &amp; important.</description>
    </item>
  </channel>
</rss>`;

const ATOM_FEED = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Updates</title>
  <entry>
    <id>tag:example.test,2026:item-1</id>
    <title>Atom item</title>
    <updated>2026-08-12T06:40:00Z</updated>
    <link rel="self" href="https://feeds.example.test/entry/1" />
    <link rel="alternate" href="https://example.test/articles/1" />
    <author><name>Atom Author</name></author>
    <category term="Updates" />
    <summary>Hello <b>ordered</b> world</summary>
  </entry>
</feed>`;

describe("RssArtifactAcquirer", () => {
  it("emits exact feed evidence plus deterministic per-entry JSON artifacts", async () => {
    let captured: ApiTransportRequest | null = null;
    const acquirer = new RssArtifactAcquirer({
      resolver: async () => [{ address: "93.184.216.34", family: 4 }],
      transport: async (request) => {
        captured = request;
        return response(RSS_FEED);
      },
    });

    const artifacts = await acquirer.acquire(context());
    expect(captured).not.toBeNull();
    expect(captured!.hostname).toBe("feeds.example.test");
    expect(captured!.resolvedAddress).toBe("93.184.216.34");
    expect(captured!.servername).toBe("feeds.example.test");
    expect(captured!.path).toBe("/news.xml");
    expect(artifacts).toHaveLength(3);

    const raw = artifacts[0]!;
    expect(raw.artifactKind).toBe("XML");
    expect(raw.sourceUri).toBe("https://feeds.example.test/news.xml");
    expect(raw.canonicalUri).toMatch(/^rss:\/\/[a-f0-9]{64}\/feed$/);
    expect(Buffer.from(raw.content).toString("utf8")).toBe(RSS_FEED);

    const entries = entryEnvelopes(artifacts);
    expect(entries).toHaveLength(2);
    const first = entries.find(({ envelope }) => envelope.stableEntryId === "guid:news-001")!;
    expect(first.envelope.feedFormat).toBe("RSS_2_0");
    expect(first.envelope.feedTitle).toBe("MarkOrbit News");
    expect(first.envelope.canonicalLink).toBe("https://feeds.example.test/news/1");
    expect(first.envelope.categories).toEqual(["Law"]);
    expect(first.envelope.summary).toBe("First & important.");
    expect(first.envelope.publishedAt).toBe("2026-08-12T05:30:00.000Z");
    expect(first.artifact.canonicalUri).toMatch(/^rss:\/\/[a-f0-9]{64}\/entry\/[a-f0-9]{64}$/);
  });

  it("parses Atom alternate links, author, categories, and mixed-content text in source order", async () => {
    const artifacts = await acquirerFor(ATOM_FEED, "application/atom+xml").acquire(context());
    const [{ envelope }] = entryEnvelopes(artifacts);
    expect(envelope.stableEntryId).toBe("atom-id:tag:example.test,2026:item-1");
    expect(envelope.feedFormat).toBe("ATOM_1_0");
    expect(envelope.canonicalLink).toBe("https://example.test/articles/1");
    expect(envelope.author).toBe("Atom Author");
    expect(envelope.categories).toEqual(["Updates"]);
    expect(envelope.summary).toBe("Hello ordered world");
    expect(envelope.updatedAt).toBe("2026-08-12T06:40:00.000Z");
  });

  it("keeps canonical entry identity stable while changed entry bytes create versionable evidence", async () => {
    const before = await acquirerFor(RSS_FEED).acquire(context());
    const after = await acquirerFor(
      RSS_FEED.replace("First &amp; important.", "First &amp; revised."),
    ).acquire(context());
    const beforeEntry = entryEnvelopes(before).find(
      ({ envelope }) => envelope.stableEntryId === "guid:news-001",
    )!;
    const afterEntry = entryEnvelopes(after).find(
      ({ envelope }) => envelope.stableEntryId === "guid:news-001",
    )!;
    expect(afterEntry.artifact.canonicalUri).toBe(beforeEntry.artifact.canonicalUri);
    expect(
      Buffer.from(afterEntry.artifact.content).equals(Buffer.from(beforeEntry.artifact.content)),
    ).toBe(false);
  });

  it("uses deterministic fallback identity when id and link are absent", async () => {
    const feed = `<rss version="2.0"><channel><title>Fallback</title><item><title>A</title><description>Body</description></item></channel></rss>`;
    const first = entryEnvelopes(await acquirerFor(feed).acquire(context()))[0]!;
    const second = entryEnvelopes(await acquirerFor(feed).acquire(context()))[0]!;
    expect(first.envelope.stableEntryId).toMatch(/^fallback:[a-f0-9]{64}$/);
    expect(first.artifact.canonicalUri).toBe(second.artifact.canonicalUri);
    expect(Buffer.from(first.artifact.content).equals(Buffer.from(second.artifact.content))).toBe(
      true,
    );
  });

  it("sorts entry artifacts by stable canonical URI so feed order does not change upload identity", async () => {
    const reversed = RSS_FEED.replace(
      /(<item>[\s\S]*?<guid isPermaLink="false">news-002[\s\S]*?<\/item>)\s*(<item>[\s\S]*?<guid>news-001[\s\S]*?<\/item>)/,
      "$2$1",
    );
    const left = (await acquirerFor(RSS_FEED).acquire(context()))
      .slice(1)
      .map((item) => item.canonicalUri);
    const right = (await acquirerFor(reversed).acquire(context()))
      .slice(1)
      .map((item) => item.canonicalUri);
    expect(right).toEqual(left);
  });

  it("rejects HTTP, credential-like query parameters, localhost and non-default ports before DNS", async () => {
    const acquirer = new RssArtifactAcquirer();
    for (const feedUrl of [
      "http://feeds.example.test/news.xml",
      "https://feeds.example.test/news.xml?access_token=secret",
      "https://localhost/news.xml",
      "https://feeds.example.test:8443/news.xml",
    ]) {
      const error = await acquisitionError(acquirer.acquire(context({ feedUrl })));
      expect(error.retryable).toBe(false);
    }
  });

  it("fails closed for private or mixed DNS answers and never calls transport", async () => {
    const transport = vi.fn(async () => response(RSS_FEED));
    const privateTarget = new RssArtifactAcquirer({
      resolver: async () => [{ address: "10.10.0.2", family: 4 }],
      transport,
    });
    expect((await acquisitionError(privateTarget.acquire(context()))).code).toBe(
      "RSS_NETWORK_TARGET_REJECTED",
    );

    const mixed = new RssArtifactAcquirer({
      resolver: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "192.168.1.10", family: 4 },
      ],
      transport,
    });
    expect((await acquisitionError(mixed.acquire(context()))).code).toBe(
      "RSS_NETWORK_TARGET_REJECTED",
    );
    expect(transport).not.toHaveBeenCalled();
  });

  it("normalizes IPv6 literals before public-network classification", async () => {
    const transport = vi.fn(async () => response(RSS_FEED));
    const privateTarget = new RssArtifactAcquirer({ transport });
    const error = await acquisitionError(
      privateTarget.acquire(context({ feedUrl: "https://[::1]/feed.xml" })),
    );
    expect(error.code).toBe("RSS_NETWORK_TARGET_REJECTED");
    expect(transport).not.toHaveBeenCalled();
  });

  it("rejects redirects and classifies server failures as retryable", async () => {
    const redirect = await acquisitionError(
      acquirerFor(RSS_FEED, "application/rss+xml", 302).acquire(context()),
    );
    expect(redirect.code).toBe("RSS_REDIRECT_REJECTED");
    expect(redirect.retryable).toBe(false);

    const serverError = await acquisitionError(
      acquirerFor(RSS_FEED, "application/rss+xml", 503).acquire(context()),
    );
    expect(serverError.code).toBe("RSS_HTTP_STATUS_REJECTED");
    expect(serverError.retryable).toBe(true);
  });

  it("requires RSS 2.0 version and the Atom 1.0 namespace", async () => {
    const rssOne = `<rss version="1.0"><channel><title>x</title></channel></rss>`;
    expect((await acquisitionError(acquirerFor(rssOne).acquire(context()))).code).toBe(
      "RSS_FORMAT_UNSUPPORTED",
    );

    const atomWithoutNamespace = `<feed><title>x</title></feed>`;
    expect(
      (
        await acquisitionError(
          acquirerFor(atomWithoutNamespace, "application/atom+xml").acquire(context()),
        )
      ).code,
    ).toBe("RSS_FORMAT_UNSUPPORTED");
  });

  it("enforces XML attribute and Atom link field bounds independently of the feed byte limit", async () => {
    const oversizedAttribute = "x".repeat(64 * 1024 + 1);
    const oversizedXml = `<rss version="2.0" data-big="${oversizedAttribute}"><channel><title>x</title></channel></rss>`;
    expect((await acquisitionError(acquirerFor(oversizedXml).acquire(context()))).code).toBe(
      "RSS_XML_LIMIT_EXCEEDED",
    );

    const oversizedHref = `https://example.test/${"x".repeat(8_192)}`;
    const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>x</title><entry><id>one</id><link rel="alternate" href="${oversizedHref}"/></entry></feed>`;
    expect(
      (await acquisitionError(acquirerFor(atom, "application/atom+xml").acquire(context()))).code,
    ).toBe("RSS_ENTRY_FIELD_TOO_LARGE");
  });

  it("rejects non-feed MIME types, DTD/entity declarations, unsupported RDF, and non-UTF8 declarations", async () => {
    expect(
      (await acquisitionError(acquirerFor(RSS_FEED, "text/html").acquire(context()))).code,
    ).toBe("RSS_CONTENT_TYPE_REJECTED");
    const dtd = `<!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><rss version="2.0"><channel><title>x</title></channel></rss>`;
    expect((await acquisitionError(acquirerFor(dtd).acquire(context()))).code).toBe(
      "RSS_XML_DTD_REJECTED",
    );
    const rdf = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"></rdf:RDF>`;
    expect((await acquisitionError(acquirerFor(rdf).acquire(context()))).code).toBe(
      "RSS_FORMAT_UNSUPPORTED",
    );
    const latin = `<?xml version="1.0" encoding="ISO-8859-1"?><rss version="2.0"><channel><title>x</title></channel></rss>`;
    expect((await acquisitionError(acquirerFor(latin).acquire(context()))).code).toBe(
      "RSS_XML_ENCODING_REJECTED",
    );
  });

  it("fails instead of silently truncating entry counts or accepting duplicate stable IDs", async () => {
    const limited = await acquisitionError(
      acquirerFor(RSS_FEED).acquire(
        context({ feedUrl: "https://feeds.example.test/news.xml", maxEntries: 1 }),
      ),
    );
    expect(limited.code).toBe("RSS_ENTRY_LIMIT_EXCEEDED");

    const duplicate = `<rss version="2.0"><channel><title>x</title><item><guid>same</guid><title>A</title></item><item><guid>same</guid><title>B</title></item></channel></rss>`;
    expect((await acquisitionError(acquirerFor(duplicate).acquire(context()))).code).toBe(
      "RSS_DUPLICATE_ENTRY_ID",
    );
  });

  it("fails closed when an entry has no deterministic identity material", async () => {
    const feed = `<rss version="2.0"><channel><title>x</title><item></item></channel></rss>`;
    const error = await acquisitionError(acquirerFor(feed).acquire(context()));
    expect(error.code).toBe("RSS_ENTRY_IDENTITY_MISSING");
  });
});
