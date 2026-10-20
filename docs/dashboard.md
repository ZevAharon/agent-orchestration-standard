# Claude Code live dashboard (plugin)

Beyond the spec and the reference runner, this repo contains a read-only **live monitor for Claude Code sessions**: it shows every session, project and subagent as a graph (heart -> project hubs -> agents) with live streams, per-agent model, tokens, run time, tool feed, file conflicts, errors and alerts. It is local-only (binds 127.0.0.1) and stores only event and tool names, short labels, counts, and the local folder/file paths it needs for project grouping and file-conflict detection: never prompts, command lines (only a Bash command's first word), file contents, tool output or error messages. Full paths stay in the local log and are never shown in the dashboard, terminal view or MCP output (see [plugin/README.md](../plugin/README.md) for the exact list).

| Part | Where | What |
|---|---|---|
| Hooks | `hooks/aos-hook.mjs`, `plugin/hooks/hooks.json` | Claude Code hooks write sanitized one-line events |
| Monitor | `monitor.mjs` | Folds events into `/api/state`, `/api/history`, replay (`?at=`), alerts, notifications |
| Web UI | `ui/` | The graph, drawers, replay, cost readout, light/dark toggle |
| Terminal UI | `cli/dash.mjs` (`aos-dash`) | The same graph in the terminal (`--once` for a snapshot) |
| MCP server | `plugin/mcp/server.mjs` | Read-only tools so Claude can query the monitor |
| Notifier | `plugin/notify/` | Branded macOS notifications with an app icon |
| Plugin | `plugin/`, `.claude-plugin/marketplace.json` | Packages all of the above; `node plugin/build.mjs` regenerates the copies |

Install (needs Node 18+ and the Claude Code CLI):

```sh
make install        # builds, registers + installs the local plugin, links `aos-dash`, builds the notifier, starts the monitor
make doctor         # checks the whole setup and tells you what to fix
make                # lists every target (test, build, start/stop, statusline, uninstall, ...)
```

Then open http://127.0.0.1:4318 (the monitor starts automatically with a session; set `AOS_NO_AUTOSTART=1` to disable). New sessions pick up the hooks; existing ones need `/reload-plugins`. Project grouping, alerts and the stuck/errored rules can be tuned in the monitor's `live/config.json` (see [plugin/README.md](../plugin/README.md)). Status: personal project, macOS-first. Licensed under the [MIT License](../LICENSE).

## Highlights

- Privacy-first local telemetry: hooks log event and tool names, counts and short labels only, never prompts, command lines, file contents, tool output or error messages.
- Project-graph layout (heart, project hubs, agents) with node and label overlaps ruled out by construction; the terminal layout's no-overlap rules are covered by automated tests.
- Canvas particle streams (adaptive to frame time, paused in background tabs, crisp on high-DPI screens), tried in Safari and Chromium.
- Per-model stuck thresholds, plus errored-agent and file-conflict detection.
- Pan and zoom (wheel, trackpad, pinch, drag, keyboard) with the particle streams staying aligned to the graph.
- Replay: scrub the recorded timeline and see the graph as it was.
- Light and dark themes with checked contrast tokens.
- One plugin ships the hooks, the web UI, a terminal dashboard (`aos-dash`), a read-only MCP server and a macOS notifier.
- Automated test suites for the spec validator, terminal UI, MCP server, notifier and theme contrast (`make test`).

## Debugging

Open http://127.0.0.1:4318/?debug=1 to show a small on-screen recorder (`ui/debug.js`) that logs layout, canvas, visibility and frame-rate changes with Copy/Clear buttons. It is inert without the flag and never changes the page.

## Security

- **Threat model.** The monitor is a local, read-only observer. It binds `127.0.0.1` only, rejects requests whose `Host` or `Origin` is not `localhost`/`127.0.0.1` (DNS-rebinding and cross-site protection), sends no CORS headers, has no write endpoints, and serves only the files under `ui/` (dotfiles, traversal and symlinks out of `ui/` are refused). Anyone who can run code as your user can read the log anyway; the design goal is that nothing leaves the machine and no other site or user can reach it.
- **What is stored.** See the exact field list under Privacy in [plugin/README.md](../plugin/README.md). Agent names and task labels come from Claude Code tool calls, so the UI and terminal view treat them as untrusted text (never rendered as HTML or terminal escape codes). New log files are created owner-only (`0600`, directory `0700`).
- **How to erase.** Delete the data folder: `~/.claude/plugins/data/aos-dashboard-aos-local/live` (or your `AOS_LIVE_DIR`); `make uninstall` removes the plugin but keeps the data.
- **Reporting.** Please open a GitHub issue. For anything sensitive, open an issue asking for a private contact rather than posting details.
