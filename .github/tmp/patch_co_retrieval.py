from pathlib import Path

path = Path('packages/persistence/src/retrieval-relevance-audit.ts')
text = path.read_text()
anchor = '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },\n'
if anchor not in text:
    raise SystemExit('Canada retrieval anchor not found')
block = r'''  {
    id: "co-trademarks-name",
    targetId: "co-sic-trademarks",
    query: "Colombia SIC trademark portal registration SIPI search filing classification",
  },
  {
    id: "co-trademark-filing-name",
    targetId: "co-sic-trademark-filing",
    query: "Colombia SIC online trademark registration SIPI filing application",
  },
  {
    id: "co-trademark-search-name",
    targetId: "co-sic-trademark-search",
    query: "Colombia SIC SIPI trademark search distinctive signs database status documents",
  },
  {
    id: "co-trademark-fees-name",
    targetId: "co-sic-trademark-fees",
    query: "Colombia SIC 2026 trademark fees registration opposition cancellation assignment",
  },
  {
    id: "co-trademark-classification-name",
    targetId: "co-sic-trademark-classification",
    query: "Colombia SIC Nice Classification goods services trademark classes",
  },
  {
    id: "co-trademark-procedure-2026-name",
    targetId: "co-sic-trademark-procedure-2026",
    query: "Colombia SIC PI01-P01 v12 2026 trademark registration examination procedure",
  },
  {
    id: "co-trademark-law-name",
    targetId: "co-sic-trademark-law",
    query: "Colombia SIC Decision 486 trademark law industrial property regulations",
  },
  {
    id: "co-trademark-proceedings-name",
    targetId: "co-sic-trademark-proceedings",
    query: "Colombia SIC trademark opposition cancellation non-use notoriety proceedings",
  },
'''
text = text.replace(anchor, block + anchor, 1)
path.write_text(text)
