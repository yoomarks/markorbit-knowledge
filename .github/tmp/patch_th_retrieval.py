from pathlib import Path

path = Path('packages/persistence/src/retrieval-relevance-audit.ts')
text = path.read_text()
anchor = '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },\n'
if anchor not in text:
    raise SystemExit('Canada retrieval anchor not found')
block = r'''  {
    id: "th-trademarks-name",
    targetId: "th-dip-trademarks",
    query: "Thailand DIP trademark services e-filing search forms fees law",
  },
  {
    id: "th-trademark-filing-name",
    targetId: "th-dip-trademark-filing",
    query: "Thailand DIP trademark electronic filing e-Filing registration application",
  },
  {
    id: "th-trademark-search-name",
    targetId: "th-dip-trademark-search",
    query: "Thailand DIP public trademark search database similar mark",
  },
  {
    id: "th-trademark-forms-name",
    targetId: "th-dip-trademark-forms",
    query: "Thailand DIP trademark forms ก.01 ก.02 application opposition guide",
  },
  {
    id: "th-trademark-fees-name",
    targetId: "th-dip-trademark-fees",
    query: "Thailand DIP trademark fees application registration opposition renewal",
  },
  {
    id: "th-trademark-goods-services-name",
    targetId: "th-dip-trademark-goods-services",
    query: "Thailand DIP recommended trademark goods services classification list",
  },
  {
    id: "th-trademark-law-name",
    targetId: "th-dip-trademark-law",
    query: "Thailand Trademark Act B.E. 2534 amended 2559 regulations DIP",
  },
  {
    id: "th-trademark-examination-manual-name",
    targetId: "th-dip-trademark-examination-manual",
    query: "Thailand DIP trademark registration examination manual 2565 2022",
  },
'''
text = text.replace(anchor, block + anchor, 1)
path.write_text(text)
