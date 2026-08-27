# KG-008 implementation notes

The implementation intentionally leaves `/api/knowledge` unchanged for blank-query/list browsing and adds `/api/knowledge/search` for non-empty hybrid search. The Native Workspace search page is `/knowledge/search`.

This separation keeps existing list behavior stable while allowing full-text retrieval to find terms that exist only inside indexed canonical Markdown.
