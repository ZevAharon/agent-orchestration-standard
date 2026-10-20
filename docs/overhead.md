# Monitor overhead

How much CPU and memory the live monitor (`monitor.mjs`) uses. These are measurements on one machine, not guarantees.

## Method

`node scripts/overhead.mjs [--port 4399] [--secs 30] [--rate 50]` starts a **test** monitor on a spare port with a temporary data dir (`AOS_LIVE_DIR`, `AOS_ORCH_DIR`, `CLAUDE_PLUGIN_DATA` all point into a fresh temp folder; `AOS_NOTIFY_DRY=1`), so it never touches a running monitor or `~/.claude`. It then runs three 30 s phases:

1. **idle**: no client connected.
2. **idle + dashboard**: one client fetching `/api/state` every 2 s, like an open browser tab (`POLL_MS` in `ui/app.js`).
3. **loaded**: the same client plus synthetic hook events appended to `hook-events.ndjson` at 50 events/s (batched every 100 ms), in the format `hooks/aos-hook.mjs` writes (`ts`, `ev`, `sid`, `cwd`, `cwdp`, `tool`, `sum`, and `f` for Edit/Write), spread over 6 sessions and 3 projects.

CPU% is the delta of the process's cumulative CPU time (`ps -o time=`) over wall time, so 100% means one full core. RSS is sampled once per second via `ps`. The latency column is the client-side p95 of `/api/state` responses. The monitor ingests the log when it is requested, so the dashboard client is part of the load phase on purpose.

## Results

Apple M4 (10 cores), 16 GB, macOS (Darwin 27.0.0), Node v22.22.0, 30 s per phase. Two consecutive runs on a machine that was also running other work:

| Phase | CPU % (run 1 / run 2) | RSS max MB (run 1 / run 2) | `/api/state` p95 ms |
|---|---|---|---|
| idle (no client) | 0.1 / 0.1 | 48 / 48 | n/a |
| idle + 1 dashboard (2 s poll) | 0.13 / 0.1 | 50 / 46 | 9.7 / 12.1 |
| loaded: 50 events/s + 1 dashboard | 0.53 / 0.27 | 65 / 47 | 8.7 / 13.6 |

(Run 1 used a 1 s poll interval in the dashboard phases; the script was then changed to 2 s to match the UI. Run 2 is the current script.)

## Caveats

- ~1,500 events were ingested per load phase; the in-memory record cap and longer sessions are not exercised. RSS growth over hours is not measured.
- 50 events/s is far above what real Claude Code sessions produce, so treat it as a stress figure.
- The hook process itself (one short `node` start per event, in the Claude Code session) is not included; only the long-running monitor is measured.
- Run-to-run variance is visible (RSS in the loaded phase differed by about 18 MB between runs), so re-run on your own machine.
