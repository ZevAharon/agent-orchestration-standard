# Golden goal fixtures

Each `<name>/goals/<gid>/` is a real orchestrator goal dir (only the files the monitor reads: `goal.json`, `tasks.json`,
`events.ndjson`, `approvals/`), with the sandbox root rewritten to `/fixture`. Tests copy one into a temp `AOS_ORCH_DIR`.

| Fixture | gid | State |
|---|---|---|
| `all-success` | `g-test` | 3 tasks, all haiku, first try, achieved |
| `escalation` | `g-esc` | haiku fails checks, sonnet succeeds, achieved |
| `failed` | `g-fail` | t1 fails on every tier, t2 never runs |
| `waiting` | `g-wait` | `escalation` + pending approval A-1 (placeholder `requested_at`; the test rewrites it) |
| `plan` | `g-plan` | `escalation` as a draft awaiting plan approval (`plan_awaiting_since_ms: 0`; the test rewrites it) |

Regenerate (only while `./orchestrator` exists; uses the fake claude, never a real one):

    node tests-monitor/gen-fixtures.mjs

`gen-fixtures.mjs` is the only file in `tests-monitor/` that may reference the orchestrator, and the tests never run it.
Timestamps are kept as generated; tests do not depend on their values except where they patch them relative to "now".
Contract the fixtures must satisfy: `docs/orch-state-contract.md`.
