from pathlib import Path

path = Path("apps/admin/src/server/conversion-failure-recovery.ts")
text = path.read_text()
old = """           WHERE c.workspace_id = r.workspace_id
             AND (c.root_run_id = r.id OR c.latest_run_id = r.id)
         )"""
new = """           WHERE c.workspace_id = r.workspace_id
             AND (
               c.root_run_id = r.id
               OR c.latest_run_id = r.id
               OR EXISTS (
                 SELECT 1
                 FROM json_each(c.document_json, '$.replacementRunIds') replacements
                 WHERE replacements.value = r.id
               )
               OR r.idempotency_key LIKE 'failure-retry:' || c.id || ':%'
               OR r.idempotency_key LIKE 'operator-retry:' || c.id || ':%'
             )
         )"""
if old not in text:
    raise SystemExit("candidate query pattern not found")
path.write_text(text.replace(old, new))
