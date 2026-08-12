from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    return text.replace(old, new, 1)


index = Path("packages/worker-runtime/src/index.ts")
text = index.read_text()
anchor = 'export * from "./api-acquirer";\n'
if 'export * from "./rss-acquirer";' not in text:
    text = replace_once(
        text,
        anchor,
        anchor
        + 'export * from "./public-network-policy";\n'
        + 'export * from "./rss-acquirer";\n',
        "worker-runtime exports",
    )
index.write_text(text)

api = Path("packages/worker-runtime/src/api-acquirer.ts")
text = api.read_text()
text = replace_once(
    text,
    'import { BlockList, isIP } from "node:net";',
    'import { isIP } from "node:net";',
    "API net import",
)
import_anchor = '} from "./artifact-backed-collection-executor";\n'
shared_import = (
    'import { isPublicNetworkAddress, normalizedUrlHostname } from "./public-network-policy";\n'
)
if shared_import not in text:
    text = replace_once(text, import_anchor, import_anchor + shared_import, "API shared import")
text, count = re.subn(
    r"const NON_PUBLIC_ADDRESSES = new BlockList\(\);.*?\nexport type ApiAuthBinding",
    "export type ApiAuthBinding",
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("API private-network block not removed exactly once")
text, count = re.subn(
    r"function normalizedEndpointHostname\(url: URL\): string \{.*?\n\}\n\n",
    "",
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("API hostname helper not removed exactly once")
text, count = re.subn(
    r"function publicAddress\(address: string, family: 4 \| 6\): boolean \{.*?\n\}\n\n",
    "",
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("API public-address helper not removed exactly once")
text = text.replace("normalizedEndpointHostname", "normalizedUrlHostname")
text = text.replace("publicAddress", "isPublicNetworkAddress")
api.write_text(text)

rss = Path("packages/worker-runtime/src/rss-acquirer.ts")
text = rss.read_text()
text = replace_once(
    text,
    'import { BlockList, isIP } from "node:net";',
    'import { isIP } from "node:net";',
    "RSS net import",
)
if shared_import not in text:
    text = replace_once(text, import_anchor, import_anchor + shared_import, "RSS shared import")
text, count = re.subn(
    r"const NON_PUBLIC_ADDRESSES = new BlockList\(\);.*?\ntype RssSourceConfig",
    "type RssSourceConfig",
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("RSS private-network block not removed exactly once")
text, count = re.subn(
    r"function normalizedEndpointHostname\(url: URL\): string \{.*?\n\}\n\n",
    "",
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("RSS hostname helper not removed exactly once")
text, count = re.subn(
    r"function publicAddress\(address: string, family: 4 \| 6\): boolean \{.*?\n\}\n\n",
    "",
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("RSS public-address helper not removed exactly once")
text = text.replace("normalizedEndpointHostname", "normalizedUrlHostname")
text = text.replace("publicAddress", "isPublicNetworkAddress")
text = replace_once(
    text,
    "  children: XmlNode[];\n  text: string[];\n};",
    "  children: XmlNode[];\n  text: string[];\n  segments: Array<string | XmlNode>;\n};",
    "RSS XmlNode segments",
)
text = replace_once(
    text,
    'const documentRoot: XmlNode = { name: "#document", attributes: {}, children: [], text: [] };',
    'const documentRoot: XmlNode = { name: "#document", attributes: {}, children: [], text: [], segments: [] };',
    "RSS document root",
)
text = replace_once(
    text,
    'const node: XmlNode = { name: parsed.name, attributes: parsed.attributes, children: [], text: [] };',
    'const node: XmlNode = { name: parsed.name, attributes: parsed.attributes, children: [], text: [], segments: [] };',
    "RSS node init",
)
text = replace_once(
    text,
    "if (tail.trim()) stack[stack.length - 1]!.text.push(decodeXmlEntities(tail));",
    """if (tail.trim()) {
      const decoded = decodeXmlEntities(tail);
      stack[stack.length - 1]!.text.push(decoded);
      stack[stack.length - 1]!.segments.push(decoded);
    }""",
    "RSS tail text",
)
text = replace_once(
    text,
    "if (text) stack[stack.length - 1]!.text.push(decodeXmlEntities(text));",
    """if (text) {
      const decoded = decodeXmlEntities(text);
      stack[stack.length - 1]!.text.push(decoded);
      stack[stack.length - 1]!.segments.push(decoded);
    }""",
    "RSS text",
)
text = replace_once(
    text,
    "stack[stack.length - 1]!.text.push(xml.slice(opening + 9, end));",
    """const cdata = xml.slice(opening + 9, end);
      stack[stack.length - 1]!.text.push(cdata);
      stack[stack.length - 1]!.segments.push(cdata);""",
    "RSS CDATA",
)
text = replace_once(
    text,
    "stack[stack.length - 1]!.children.push(node);",
    """stack[stack.length - 1]!.children.push(node);
    stack[stack.length - 1]!.segments.push(node);""",
    "RSS child ordering",
)
text = replace_once(
    text,
    """function nodeText(node: XmlNode): string {
  const parts = [...node.text];
  for (const nested of node.children) parts.push(nodeText(nested));
  return parts.join(" ").replace(/\\s+/g, " ").trim();
}""",
    """function nodeText(node: XmlNode): string {
  const parts = node.segments.map((segment) =>
    typeof segment === "string" ? segment : nodeText(segment),
  );
  return parts.join(" ").replace(/\\s+/g, " ").trim();
}""",
    "RSS nodeText",
)
rss.write_text(text)

readme = Path("README.md")
text = readme.read_text()
for old, new in [
    (
        "DATABASE, GITHUB and RSS connector breadth can be added later through the existing contracts without reopening the trunk architecture.",
        "DATABASE and GITHUB connector breadth can be added later through the existing contracts without reopening the trunk architecture.",
    ),
    (
        "- production governed HTTPS API Worker with runtime-only endpoint/auth bindings, DNS/IP SSRF fail-closed controls, pinned-IP TLS transport, bounded structured responses and safe logical provenance;\n",
        "- production governed HTTPS API Worker with runtime-only endpoint/auth bindings, DNS/IP SSRF fail-closed controls, pinned-IP TLS transport, bounded structured responses and safe logical provenance;\n- production governed RSS 2.0 / Atom 1.0 Worker with exact feed evidence, deterministic entry envelopes, stable RawArtifact version identity, shared public-network SSRF controls and bounded XML parsing;\n",
    ),
    (
        "- additional DATABASE, GITHUB and RSS production connector implementations;",
        "- additional DATABASE and GITHUB production connector implementations;",
    ),
    (
        "Use [.env.example](.env.example) for storage, Worker, Core intake, Vault, Local Folder, API and conversion configuration.",
        "Use [.env.example](.env.example) for storage, Worker, Core intake, Vault, Local Folder, API, RSS and conversion configuration.",
    ),
    (
        "- [API Connector V1](docs/operations/API_CONNECTOR_V1.md)\n",
        "- [API Connector V1](docs/operations/API_CONNECTOR_V1.md)\n- [RSS Connector V1](docs/operations/RSS_CONNECTOR_V1.md)\n",
    ),
]:
    text = replace_once(text, old, new, f"README: {old[:40]}")
readme.write_text(text)

env = Path(".env.example")
text = env.read_text()
text = replace_once(
    text,
    "# Collection provider for this Worker process: crawl4ai (default), local-folder, or api.\n",
    "# Collection provider for this Worker process: crawl4ai (default), local-folder, api, or rss.\n",
    ".env provider",
)
text = replace_once(
    text,
    """MARKORBIT_API_MAX_RESPONSE_BYTES=10485760

# Production Conversion Worker.""",
    """MARKORBIT_API_MAX_RESPONSE_BYTES=10485760

# Production governed RSS 2.0 / Atom 1.0 Worker. Feed URL is public Source configuration; credentials are unsupported in v1.
MARKORBIT_RSS_FEED_URL=
MARKORBIT_RSS_SOURCE_NAME=
MARKORBIT_RSS_TIMEOUT_MS=30000
MARKORBIT_RSS_MAX_RESPONSE_BYTES=5242880
MARKORBIT_RSS_MAX_ENTRIES=100

# Production Conversion Worker.""",
    ".env RSS block",
)
env.write_text(text)
