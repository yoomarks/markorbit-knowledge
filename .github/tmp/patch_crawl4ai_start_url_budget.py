from pathlib import Path

path = Path("packages/worker-runtime/src/crawl4ai-subprocess-acquirer.ts")
text = path.read_text()

old = 'const PROTOCOL_VERSION = "1.0" as const;\n'
new = 'const PROTOCOL_VERSION = "1.0" as const;\nexport const CRAWL4AI_MAX_START_URLS = 500;\n'
if text.count(old) != 1:
    raise SystemExit(f"protocol anchor count={text.count(old)}")
text = text.replace(old, new, 1)

old = '''  if (startUrls(context).length === 0) {
    throw new CollectionAcquisitionError(
      "SOURCE_ENTRYPOINT_REQUIRED",
      "Crawl4AI production collection requires at least one Source entrypoint",
      false,
    );
  }
'''
new = '''  const urls = startUrls(context);
  if (urls.length === 0) {
    throw new CollectionAcquisitionError(
      "SOURCE_ENTRYPOINT_REQUIRED",
      "Crawl4AI production collection requires at least one Source entrypoint",
      false,
    );
  }
  if (urls.length > CRAWL4AI_MAX_START_URLS) {
    throw new CollectionAcquisitionError(
      "CRAWL_START_URL_BUDGET_EXCEEDED",
      `Crawl4AI Source snapshot contains ${urls.length} unique start URLs; the governed limit is ${CRAWL4AI_MAX_START_URLS}`,
      false,
    );
  }
'''
if text.count(old) != 1:
    raise SystemExit(f"entrypoint assertion anchor count={text.count(old)}")
text = text.replace(old, new, 1)
path.write_text(text)

py_path = Path("workers/crawl4ai/acquire.py")
py = py_path.read_text()
old = 'PROTOCOL_VERSION = "1.0"\nSUPPORTED_OUTPUT_KINDS = {"HTML", "MARKDOWN"} | set(SUPPORTED_ATTACHMENT_KINDS)\n'
new = 'PROTOCOL_VERSION = "1.0"\nMAX_START_URLS = 500\nSUPPORTED_OUTPUT_KINDS = {"HTML", "MARKDOWN"} | set(SUPPORTED_ATTACHMENT_KINDS)\n'
if py.count(old) != 1:
    raise SystemExit(f"python constant anchor count={py.count(old)}")
py = py.replace(old, new, 1)
old = '''    if not isinstance(start_urls, list) or not start_urls or len(start_urls) > 50:
        raise SafetyError("INVALID_REQUEST", "startUrls must contain between 1 and 50 URLs")
'''
new = '''    if not isinstance(start_urls, list) or not start_urls or len(start_urls) > MAX_START_URLS:
        raise SafetyError(
            "INVALID_REQUEST",
            f"startUrls must contain between 1 and {MAX_START_URLS} URLs",
        )
'''
if py.count(old) != 1:
    raise SystemExit(f"python budget anchor count={py.count(old)}")
py = py.replace(old, new, 1)
py_path.write_text(py)
