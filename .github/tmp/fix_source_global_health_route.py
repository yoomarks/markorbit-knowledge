from pathlib import Path

path = Path("apps/admin/src/app/api/sources/route.ts")
text = path.read_text()
old = '''    const result =
      url.searchParams.get("hideLegacySystem") === "true"
        ? listWithoutLegacySystemSources(filters)
        : getSourceRepository().list(filters);
    return NextResponse.json(withLatestAssessments(result));
'''
new = '''    const hideLegacySystem = url.searchParams.get("hideLegacySystem") === "true";
    const context = hideLegacySystem
      ? listWithoutLegacySystemSources(filters)
      : {
          result: getSourceRepository().list(filters),
          scopeSources: listMatchingSources(filters, false),
        };
    return NextResponse.json(withLatestAssessments(context.result, context.scopeSources));
'''
if text.count(old) != 1:
    raise SystemExit(f"route GET context anchor count={text.count(old)}")
path.write_text(text.replace(old, new, 1))
