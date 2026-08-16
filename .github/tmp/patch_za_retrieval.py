from pathlib import Path

path = Path('packages/persistence/src/retrieval-relevance-audit.ts')
text = path.read_text()
anchor = '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },\n'
if anchor not in text:
    raise SystemExit('Canada retrieval anchor not found')
block = r'''  {
    id: "za-trademarks-name",
    targetId: "za-cipc-trademarks",
    query: "South Africa CIPC trade mark registration portal search filing classification",
  },
  {
    id: "za-trademark-filing-name",
    targetId: "za-cipc-trademark-filing",
    query: "South Africa CIPC IPOnline trade mark electronic filing application",
  },
  {
    id: "za-trademark-search-name",
    targetId: "za-cipc-trademark-search",
    query: "South Africa CIPC free trade mark register search IPOnline",
  },
  {
    id: "za-trademark-fees-name",
    targetId: "za-cipc-trademark-fees",
    query: "South Africa CIPC trade mark forms fees TM1 TM2 renewal assignment",
  },
  {
    id: "za-trademark-classification-name",
    targetId: "za-cipc-trademark-classification",
    query: "South Africa CIPC Nice Classification 13 2026 class headings explanatory notes",
  },
  {
    id: "za-trademark-law-name",
    targetId: "za-cipc-trademark-law",
    query: "South Africa Trade Marks Act 194 1993 Trade Mark Regulations CIPC",
  },
  {
    id: "za-trademark-maintenance-name",
    targetId: "za-cipc-trademark-maintenance",
    query: "South Africa CIPC trade mark maintenance renew restoration extension oppose prosecute",
  },
  {
    id: "za-trademark-guidelines-practice-notes-name",
    targetId: "za-cipc-trademark-guidelines-practice-notes",
    query: "South Africa CIPC trade mark guidelines practice notes registrar",
  },
'''
text = text.replace(anchor, block + anchor, 1)
path.write_text(text)
