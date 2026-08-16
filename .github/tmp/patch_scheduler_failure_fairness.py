from pathlib import Path

scheduler_path = Path("packages/persistence/src/collection-scheduler.ts")
test_path = Path("packages/persistence/tests/collection-scheduler.test.ts")

scheduler = scheduler_path.read_text(encoding="utf-8")
old_order = '''         ORDER BY CASE WHEN s.plan_id IS NULL THEN 0 ELSE 1 END,
                  CASE WHEN s.next_due_at IS NULL THEN 0 ELSE 1 END,
                  s.next_due_at ASC,
                  p.id ASC
         LIMIT ?`,
      )
      .all(limit)'''
new_order = '''         ORDER BY CASE WHEN s.plan_id IS NULL THEN 0 ELSE 1 END,
                  CASE
                    WHEN s.last_error_at IS NOT NULL
                      AND (s.next_due_at IS NULL OR s.next_due_at <= ?)
                      THEN s.last_error_at
                    ELSE COALESCE(s.next_due_at, '')
                  END ASC,
                  p.id ASC
         LIMIT ?`,
      )
      .all(now.toISOString(), limit)'''

if old_order in scheduler:
    if scheduler.count(old_order) != 1:
        raise SystemExit("expected exactly one scheduler ordering block")
    scheduler = scheduler.replace(old_order, new_order)
elif new_order not in scheduler:
    raise SystemExit("scheduler ordering block not found")

scheduler_path.write_text(scheduler, encoding="utf-8")

tests = test_path.read_text(encoding="utf-8")
test_name = 'rotates failed due plans so tick limits do not starve later work'
if test_name not in tests:
    marker = "\n});\n"
    index = tests.rfind(marker)
    if index < 0:
        raise SystemExit("collection scheduler describe terminator not found")
    regression = r'''

  it("rotates failed due plans so tick limits do not starve later work", () => {
    const { database, sources, plans, scheduler, setNow } = repositories();
    const planIds = Array.from({ length: 3 }, (_, index) => {
      const uri = `https://example.com/source-${index}`;
      const source = sources.create(
        sourceInput({
          name: `Source ${index}`,
          slug: `source-${index}`,
          canonicalUri: uri,
          entrypoints: [{ uri }],
        }),
      );
      return plans.create(planInput(source.id, { name: `Plan ${index}` })).plan.id;
    });

    scheduler.tick({ limit: 2 });
    scheduler.tick({ limit: 2 });
    setNow("2026-08-12T01:30:00.000Z");
    database
      .prepare("DELETE FROM connector_manifests WHERE connector_id = ?")
      .run("crawl4ai-web");

    const first = scheduler.tick({ limit: 2 });
    expect(first.errors).toBe(2);
    expect(first.items.map((item) => item.planId)).not.toContain(planIds[2]);

    const second = scheduler.tick({ limit: 2 });
    expect(second.items.map((item) => item.planId)).toContain(planIds[2]);
    expect(second.items.find((item) => item.planId === planIds[2])).toMatchObject({
      outcome: "ERROR",
      errorCode: "SCHEDULER_CONNECTOR_NOT_FOUND",
    });
    database.close();
  });
'''
    tests = tests[:index] + regression + tests[index:]

test_path.write_text(tests, encoding="utf-8")
