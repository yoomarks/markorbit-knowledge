from pathlib import Path

path = Path('packages/persistence/src/retrieval-relevance-audit.ts')
text = path.read_text()
anchor = '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },\n'
if anchor not in text:
    raise SystemExit('Canada retrieval anchor not found')
block = r'''  {
    id: "is-trademarks-name",
    targetId: "is-isipo-trademarks",
    query: "Iceland ISIPO trademark registration filing search classification opposition",
  },
  {
    id: "is-trademark-filing-name",
    targetId: "is-isipo-trademark-filing",
    query: "Iceland ISIPO online trademark application electronic certificate filing",
  },
  {
    id: "is-trademark-search-name",
    targetId: "is-isipo-trademark-search",
    query: "Iceland ISIPO trademark database search classes status advanced search",
  },
  {
    id: "is-trademark-forms-name",
    targetId: "is-isipo-trademark-forms",
    query: "Iceland ISIPO trademark forms collective certification renewal assignment power attorney",
  },
  {
    id: "is-trademark-fees-name",
    targetId: "is-isipo-trademark-fees",
    query: "Iceland ISIPO trademark fees application renewal opposition revocation appeal",
  },
  {
    id: "is-trademark-classification-name",
    targetId: "is-isipo-trademark-classification",
    query: "Iceland ISIPO Nice classification goods services 45 classes 2026",
  },
  {
    id: "is-trademark-law-name",
    targetId: "is-isipo-trademark-law",
    query: "Iceland Trademark Act 45 1997 Regulation 850 2020 Advertisement 1355 2025",
  },
  {
    id: "is-trademark-proceedings-name",
    targetId: "is-isipo-trademark-proceedings",
    query: "Iceland ISIPO trademark opposition two months proceedings appeal",
  },
'''
text = text.replace(anchor, block + anchor, 1)
path.write_text(text)
