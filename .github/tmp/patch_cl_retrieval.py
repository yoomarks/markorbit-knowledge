from pathlib import Path

path = Path('packages/persistence/src/retrieval-relevance-audit.ts')
text = path.read_text()
anchor = '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },\n'
if anchor not in text:
    raise SystemExit('Canada retrieval anchor not found')
block = r'''  {
    id: "cl-trademarks-name",
    targetId: "cl-inapi-trademarks",
    query: "Chile INAPI trademark portal registration search filing classification",
  },
  {
    id: "cl-trademark-filing-name",
    targetId: "cl-inapi-trademark-filing",
    query: "Chile INAPI online trademark application filing payment",
  },
  {
    id: "cl-trademark-search-name",
    targetId: "cl-inapi-trademark-search",
    query: "Chile INAPI trademark database search application registration owner class status",
  },
  {
    id: "cl-trademark-fees-name",
    targetId: "cl-inapi-trademark-fees",
    query: "Chile INAPI trademark fees UTM filing registration renewal",
  },
  {
    id: "cl-trademark-classification-name",
    targetId: "cl-inapi-trademark-classification",
    query: "Chile INAPI goods services classifier Nice NIZA accepted descriptions",
  },
  {
    id: "cl-trademark-directives-2026-name",
    targetId: "cl-inapi-trademark-directives-2026",
    query: "Chile INAPI Trademark Directives 2026 examination registration opposition appeal",
  },
  {
    id: "cl-trademark-law-name",
    targetId: "cl-inapi-trademark-law",
    query: "Chile INAPI industrial property law trademark legislation regulations",
  },
  {
    id: "cl-trademark-proceedings-name",
    targetId: "cl-inapi-trademark-proceedings",
    query: "Chile INAPI trademark opposition proceedings nullity appeal online filing",
  },
'''
text = text.replace(anchor, block + anchor, 1)
path.write_text(text)
