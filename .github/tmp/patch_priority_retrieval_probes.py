from pathlib import Path

source = Path("packages/persistence/src/retrieval-relevance-audit.ts")
text = source.read_text()
anchor = "] satisfies readonly RetrievalRelevanceProbe[];"
if text.count(anchor) != 1:
    raise SystemExit(f"probe array anchor mismatch: {text.count(anchor)}")

addition = r'''  { id: "cn-trademark-portal-name", targetId: "cn-cnipa-trademark-portal", query: "商标" },
  {
    id: "cn-trademark-filing-name",
    targetId: "cn-cnipa-trademark-filing-guide",
    query: "商标注册申请",
  },
  { id: "cn-trademark-search-name", targetId: "cn-cnipa-trademark-search", query: "商标查询" },
  { id: "cn-trademark-fees-name", targetId: "cn-cnipa-trademark-fees", query: "收费" },
  {
    id: "cn-trademark-guidelines-name",
    targetId: "cn-cnipa-trademark-examination-guidelines",
    query: "审查审理指南",
  },
  { id: "cn-trademark-law-name", targetId: "cn-cnipa-trademark-law", query: "商标法" },
  {
    id: "jp-trademark-procedures-name",
    targetId: "jp-jpo-trademark-procedures",
    query: "trademark",
  },
  {
    id: "jp-trademark-step-name",
    targetId: "jp-jpo-trademark-step-by-step",
    query: "step-by-step trademark",
  },
  { id: "jp-trademark-fees-name", targetId: "jp-jpo-fees", query: "fees" },
  {
    id: "jp-trademark-guidelines-name",
    targetId: "jp-jpo-trademark-examination-guidelines",
    query: "examination guidelines",
  },
  {
    id: "jp-similar-goods-services-name",
    targetId: "jp-jpo-similar-goods-services-guidelines",
    query: "similar goods services",
  },
  { id: "kr-trademark-system-name", targetId: "kr-moip-trademark-system", query: "trademark system" },
  {
    id: "kr-trademark-application-name",
    targetId: "kr-moip-trademark-application-procedure",
    query: "application procedure",
  },
  { id: "kr-trademark-fees-name", targetId: "kr-moip-trademark-fees", query: "fees" },
  { id: "kr-trademark-laws-name", targetId: "kr-moip-trademark-laws", query: "trademark act" },
  {
    id: "kr-trademark-trials-name",
    targetId: "kr-moip-trademark-trials-appeals",
    query: "trials appeals",
  },
  {
    id: "gb-register-trademark-name",
    targetId: "gb-ukipo-register-trademark",
    query: "register trade mark",
  },
  {
    id: "gb-trademark-filing-name",
    targetId: "gb-ukipo-trademark-filing",
    query: "start application",
  },
  {
    id: "gb-trademark-search-name",
    targetId: "gb-ukipo-trademark-search",
    query: "search trade mark",
  },
  {
    id: "gb-trademark-forms-fees-name",
    targetId: "gb-ukipo-trademark-forms-fees",
    query: "forms fees",
  },
  {
    id: "gb-trademark-timeline-name",
    targetId: "gb-ukipo-trademark-timeline",
    query: "trade marks timeline",
  },
  {
    id: "gb-trademark-journal-name",
    targetId: "gb-ukipo-trademark-journal",
    query: "trade marks journal",
  },
  { id: "au-trademarks-name", targetId: "au-ipaustralia-trademarks", query: "trade marks" },
  {
    id: "au-trademark-search-name",
    targetId: "au-ipaustralia-trademark-search",
    query: "trade mark search",
  },
  {
    id: "au-trademark-fees-name",
    targetId: "au-ipaustralia-trademark-fees-timeframes",
    query: "timeframes fees",
  },
  {
    id: "au-trademark-filing-name",
    targetId: "au-ipaustralia-trademark-filing",
    query: "apply trade mark",
  },
  {
    id: "au-trademark-manual-name",
    targetId: "au-ipaustralia-trademark-manual",
    query: "trade marks manual",
  },
  {
    id: "au-goods-services-name",
    targetId: "au-ipaustralia-goods-services-picklist",
    query: "classification search",
  },
  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },
  {
    id: "ca-trademarks-guide-name",
    targetId: "ca-cipo-trademarks-guide",
    query: "trademarks guide",
  },
  {
    id: "ca-trademark-search-name",
    targetId: "ca-cipo-trademark-search",
    query: "trademark search",
  },
  { id: "ca-trademark-fees-name", targetId: "ca-cipo-trademark-fees", query: "fees trademarks" },
  {
    id: "ca-trademark-services-name",
    targetId: "ca-cipo-trademark-online-services",
    query: "online services forms",
  },
  {
    id: "ca-trademark-opposition-name",
    targetId: "ca-cipo-trademark-opposition",
    query: "opposition proceedings",
  },
'''
text = text.replace(anchor, addition + anchor, 1)
source.write_text(text)

test = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")
test_text = test.read_text()
if test_text.count("toHaveLength(29)") != 2 or test_text.count("toBe(29)") != 1:
    raise SystemExit("retrieval relevance expected-count anchors changed")
test_text = test_text.replace("toHaveLength(29)", "toHaveLength(63)")
test_text = test_text.replace("toBe(29)", "toBe(63)")
test.write_text(test_text)
