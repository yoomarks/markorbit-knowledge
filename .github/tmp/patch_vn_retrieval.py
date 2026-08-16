from pathlib import Path

path = Path('packages/persistence/src/retrieval-relevance-audit.ts')
text = path.read_text()
anchor = '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },\n'
if anchor not in text:
    raise SystemExit('Canada retrieval anchor not found')
block = r'''  {
    id: "vn-trademarks-name",
    targetId: "vn-ipvn-trademarks",
    query: "Vietnam IPVN trademark services portal procedures search classification",
  },
  {
    id: "vn-trademark-filing-name",
    targetId: "vn-ipvn-trademark-filing",
    query: "Vietnam IPVN trademark filing forms online application procedures 2026",
  },
  {
    id: "vn-trademark-search-name",
    targetId: "vn-ipvn-trademark-search",
    query: "Vietnam IPVN WIPO Publish trademark search published registered marks",
  },
  {
    id: "vn-trademark-fees-name",
    targetId: "vn-ipvn-trademark-fees",
    query: "Vietnam IPVN trademark fees charges filing examination registration renewal",
  },
  {
    id: "vn-trademark-classification-name",
    targetId: "vn-ipvn-trademark-classification",
    query: "Vietnam IPVN Nice Classification 13-2026 goods services trademark",
  },
  {
    id: "vn-trademark-law-name",
    targetId: "vn-ipvn-trademark-law",
    query: "Vietnam IPVN intellectual property law trademark decree circular legal documents",
  },
'''
text = text.replace(anchor, block + anchor, 1)
path.write_text(text)
