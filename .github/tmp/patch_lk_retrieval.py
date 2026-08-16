from pathlib import Path

path = Path('packages/persistence/src/retrieval-relevance-audit.ts')
text = path.read_text()
anchor = '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },\n'
if anchor not in text:
    raise SystemExit('Canada retrieval anchor not found')
block = r'''  {
    id: "lk-trademarks-name",
    targetId: "lk-nipo-trademarks",
    query: "Sri Lanka NIPO trademark services registration search forms fees",
  },
  {
    id: "lk-trademark-filing-name",
    targetId: "lk-nipo-trademark-filing",
    query: "Sri Lanka NIPO trademark registration procedure M1 examination Gazette opposition",
  },
  {
    id: "lk-trademark-search-name",
    targetId: "lk-nipo-trademark-search",
    query: "Sri Lanka NIPO online public trademark search database",
  },
  {
    id: "lk-trademark-forms-name",
    targetId: "lk-nipo-trademark-forms",
    query: "Sri Lanka NIPO trademark forms M01 M02 renewal assignment publication",
  },
  {
    id: "lk-trademark-fees-name",
    targetId: "lk-nipo-trademark-fees",
    query: "Sri Lanka NIPO trademark fees application opposition registration renewal Gazette",
  },
  {
    id: "lk-intellectual-property-act-name",
    targetId: "lk-nipo-intellectual-property-act",
    query: "Sri Lanka Intellectual Property Act 36 2003 trademarks marks registration",
  },
  {
    id: "lk-intellectual-property-regulations-name",
    targetId: "lk-nipo-intellectual-property-regulations",
    query: "Sri Lanka NIPO Intellectual Property Regulations 2006 trademark 2026 amendment",
  },
'''
text = text.replace(anchor, block + anchor, 1)
path.write_text(text)
