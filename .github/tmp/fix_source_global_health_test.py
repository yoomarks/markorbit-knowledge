from pathlib import Path

path = Path("apps/admin/src/server/__tests__/source-collection-health.test.ts")
text = path.read_text()
text = text.replace(
    'import { ensureWorkerExecutionRegistry } from "@markorbit/persistence/controlled-worker-execution";\n',
    '',
    1,
)
text = text.replace(
    '''      ensureWorkerExecutionRegistry(database);\n      database.exec("PRAGMA foreign_keys = OFF;");\n''',
    '''      ensureExecutionLedger(database);\n      database.exec(`\n        CREATE TABLE execution_attempts (\n          id TEXT PRIMARY KEY,\n          job_id TEXT NOT NULL,\n          job_attempt INTEGER NOT NULL,\n          status TEXT NOT NULL,\n          document_json TEXT NOT NULL,\n          completed_at TEXT,\n          updated_at TEXT NOT NULL\n        ) STRICT;\n      `);\n      database.exec("PRAGMA foreign_keys = OFF;");\n''',
    1,
)
text = text.replace(
    '''      database.prepare(`\n        INSERT INTO execution_attempts (\n          id, workspace_id, run_id, job_id, job_attempt, lease_id, worker_id,\n          status, executor_id, executor_version, executor_mode, document_json,\n          started_at, completed_at, updated_at\n        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n      `).run(\n        "exa_failure_detail",\n        WORKSPACE_ID,\n        "run_failure_detail",\n        "job_failure_detail",\n        1,\n        "lease_failure_detail",\n        "worker_failure_detail",\n        "FAILED",\n        "crawl4ai-python",\n        "1.0.0",\n        "PRODUCTION",\n''',
    '''      database.prepare(`\n        INSERT INTO execution_attempts (\n          id, job_id, job_attempt, status, document_json, completed_at, updated_at\n        ) VALUES (?, ?, ?, ?, ?, ?, ?)\n      `).run(\n        "exa_failure_detail",\n        "job_failure_detail",\n        1,\n        "FAILED",\n''',
    1,
)
text = text.replace(
    '''        }),\n        "2026-08-15T12:00:01.000Z",\n        "2026-08-15T12:00:08.000Z",\n        "2026-08-15T12:00:08.000Z",\n      );\n''',
    '''        }),\n        "2026-08-15T12:00:08.000Z",\n        "2026-08-15T12:00:08.000Z",\n      );\n''',
    1,
)
path.write_text(text)
