from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    return text.replace(old, new, 1)


rss = Path("packages/worker-runtime/src/rss-acquirer.ts")
text = rss.read_text()
text = replace_once(
    text,
    "const MAX_ATTRIBUTES_PER_NODE = 100;\n",
    "const MAX_ATTRIBUTES_PER_NODE = 100;\nconst MAX_XML_NAME_LENGTH = 256;\nconst MAX_XML_ATTRIBUTE_VALUE_LENGTH = 64 * 1024;\n",
    "XML limit constants",
)
text = replace_once(
    text,
    """  const name = nameMatch[0];
  let offset = name.length;""",
    """  const name = nameMatch[0];
  if (name.length > MAX_XML_NAME_LENGTH) {
    throw new CollectionAcquisitionError(
      "RSS_XML_LIMIT_EXCEEDED",
      `RSS XML element name exceeds the ${MAX_XML_NAME_LENGTH}-character bound`,
      false,
    );
  }
  let offset = name.length;""",
    "element-name bound",
)
text = replace_once(
    text,
    """    const attributeName = attributeMatch[0];
    offset += attributeName.length;""",
    """    const attributeName = attributeMatch[0];
    if (attributeName.length > MAX_XML_NAME_LENGTH) {
      throw new CollectionAcquisitionError(
        "RSS_XML_LIMIT_EXCEEDED",
        `RSS XML attribute name exceeds the ${MAX_XML_NAME_LENGTH}-character bound`,
        false,
      );
    }
    offset += attributeName.length;""",
    "attribute-name bound",
)
text = replace_once(
    text,
    """    attributes[attributeName] = decodeXmlEntities(input.slice(offset, end));
    attributeCount += 1;""",
    """    const rawAttributeValue = input.slice(offset, end);
    if (rawAttributeValue.length > MAX_XML_ATTRIBUTE_VALUE_LENGTH) {
      throw new CollectionAcquisitionError(
        "RSS_XML_LIMIT_EXCEEDED",
        `RSS XML attribute value exceeds the ${MAX_XML_ATTRIBUTE_VALUE_LENGTH}-character bound`,
        false,
      );
    }
    attributes[attributeName] = decodeXmlEntities(rawAttributeValue);
    attributeCount += 1;""",
    "attribute-value bound",
)
text = replace_once(
    text,
    """      const closingName = raw.slice(1).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(closingName) || stack.length <= 1) {""",
    """      const closingName = raw.slice(1).trim();
      if (
        closingName.length > MAX_XML_NAME_LENGTH ||
        !/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(closingName) ||
        stack.length <= 1
      ) {""",
    "closing-name bound",
)
text = replace_once(
    text,
    """function parseCategories(nodes: XmlNode[], atom = false): string[] {
  const values: string[] = [];
  for (const node of nodes) {
    const raw = atom ? attribute(node, "term") : nodeText(node);""",
    """function boundedAttribute(
  node: XmlNode,
  name: string,
  field: string,
  max: number,
): string | undefined {
  const value = attribute(node, name)?.trim();
  if (!value) return undefined;
  if (value.length > max) {
    throw new CollectionAcquisitionError(
      "RSS_ENTRY_FIELD_TOO_LARGE",
      `RSS entry ${field} exceeds the ${max}-character bound`,
      false,
    );
  }
  return value;
}

function parseCategories(nodes: XmlNode[], atom = false): string[] {
  const values: string[] = [];
  for (const node of nodes) {
    const raw = atom
      ? boundedAttribute(node, "term", "category", MAX_CATEGORY_LENGTH)
      : nodeText(node);""",
    "bounded Atom attributes",
)
text = replace_once(
    text,
    """  const preferred = links.find((node) => {
    const rel = attribute(node, "rel")?.toLowerCase();
    return !rel || rel === "alternate";
  });
  return preferred ? attribute(preferred, "href") : undefined;""",
    """  const preferred = links.find((node) => {
    const rel = boundedAttribute(node, "rel", "link rel", 256)?.toLowerCase();
    return !rel || rel === "alternate";
  });
  return preferred
    ? boundedAttribute(preferred, "href", "link href", MAX_LINK_LENGTH)
    : undefined;""",
    "bounded Atom link attributes",
)
text = replace_once(
    text,
    """  const name = localName(root.name);
  if (name === "rss") return parseRss(root);
  if (name === "feed") return parseAtom(root);""",
    """  const name = localName(root.name);
  if (name === "rss") {
    if (root.attributes.version?.trim() !== "2.0") {
      throw new CollectionAcquisitionError(
        "RSS_FORMAT_UNSUPPORTED",
        "RSS Connector V1 requires an RSS 2.0 root with version=\"2.0\"",
        false,
      );
    }
    return parseRss(root);
  }
  if (name === "feed") {
    const separator = root.name.indexOf(":");
    const prefix = separator >= 0 ? root.name.slice(0, separator) : null;
    const namespaceUri = prefix
      ? root.attributes[`xmlns:${prefix}`]
      : root.attributes.xmlns;
    if (namespaceUri?.trim() !== "http://www.w3.org/2005/Atom") {
      throw new CollectionAcquisitionError(
        "RSS_FORMAT_UNSUPPORTED",
        "RSS Connector V1 requires the Atom 1.0 namespace on the feed root",
        false,
      );
    }
    return parseAtom(root);
  }""",
    "feed format identity",
)
rss.write_text(text)


tests = Path("packages/worker-runtime/tests/rss-acquirer.test.ts")
text = tests.read_text()
anchor = '  it("rejects non-feed MIME types, DTD/entity declarations, unsupported RDF, and non-UTF8 declarations", async () => {'
addition = '''  it("requires RSS 2.0 version and the Atom 1.0 namespace", async () => {
    const rssOne = `<rss version="1.0"><channel><title>x</title></channel></rss>`;
    expect((await acquisitionError(acquirerFor(rssOne).acquire(context()))).code).toBe(
      "RSS_FORMAT_UNSUPPORTED",
    );

    const atomWithoutNamespace = `<feed><title>x</title></feed>`;
    expect(
      (await acquisitionError(acquirerFor(atomWithoutNamespace, "application/atom+xml").acquire(context())))
        .code,
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
    expect((await acquisitionError(acquirerFor(atom, "application/atom+xml").acquire(context()))).code).toBe(
      "RSS_ENTRY_FIELD_TOO_LARGE",
    );
  });

'''
if anchor not in text:
    raise SystemExit("RSS parser hardening test anchor missing")
text = text.replace(anchor, addition + anchor, 1)
tests.write_text(text)


doc = Path("docs/operations/RSS_CONNECTOR_V1.md")
text = doc.read_text()
text = replace_once(
    text,
    """Supported feed roots:

- RSS 2.0 `<rss>`;
- Atom 1.0 `<feed>`.""",
    """Supported feed roots:

- RSS 2.0 `<rss version=\"2.0\">`;
- Atom 1.0 `<feed>` using `http://www.w3.org/2005/Atom` as its root namespace (default or matching root prefix).""",
    "runbook format identity",
)
text = replace_once(
    text,
    "- bounded XML nesting depth, node count, and attributes per node;",
    "- bounded XML nesting depth, node count, element/attribute names, attributes per node, and attribute values;",
    "runbook attribute bounds",
)
doc.write_text(text)
