# NEXT: queued work (resume after token reset)

Status written 2026-10-18. The monitor (:4318) and demo (:4317) are plain background processes: restart with
`node monitor.mjs` / `node server.mjs` from this folder if they are not running.

## In flight when this was written (3 background agents, disjoint files)
- plugin/ (scaffold, hooks.json, monitor autostart, skill, marketplace.json, build script)  [Haiku]
- plugin/mcp/ (read-only stdio MCP server over the monitor API)  [Sonnet]
- cli/ (terminal/ASCII dashboard, `node cli/dash.mjs`)  [Sonnet]
If any is unfinished, re-run it from its brief in this list: check each folder for README/test output first.


## STATUS 2026-10-18 afternoon (read this first)
- DONE and deployed (plugin v0.1.0 installed, monitor autostarts): hooks (16 events), cost/new-token readout, tool feed, replay, alerts, file-conflict detection, errored/stalled states, time ran + tok/min per agent (web drawers/tooltip/Manifest, terminal view, MCP), project grouping by project root (marker-aware), branded macOS notifier (plugin/notify, icon app in plugin data dir), status line (settings.json), `aos-dash` command (~/.local/bin symlink), /aos-dashboard:dash skill, MCP server (7 read-only tools).
- WEB UI is now the Obsidian-style PROJECT GRAPH (heart -> project hubs -> agents, free physics with hard no-overlap rules, tidy at rest, draggable). User confirmed the Safari 'blinking' is fixed by it; ui/debug.js (inert unless ?debug=1) kept for any recurrence.
- IN FLIGHT when written: Opus agent refining layout (agents cluster around their hub, full labels, centre the graph); particles agent raising idle-stream density.
- STILL OPEN: user has NOT yet answered whether to (a) lengthen the 'stuck' threshold for long-thinking agents and (b) stop one failed command turning an agent red (both small monitor.mjs changes). Terminal view and MCP/status line do not yet group by project. Plugin hook changes only apply to sessions started after a change. Deploy = `node plugin/build.mjs` (copies ui/, monitor, hooks, cli) then restart monitor: kill the plugin monitor and run plugin/hooks/ensure-monitor.mjs with CLAUDE_PLUGIN_ROOT/CLAUDE_PLUGIN_DATA set (see earlier commands in this file).

## DONE 2026-10-18 (morning)
- cli/, plugin/ (+ plugin/mcp), and the marketplace were built; plugin INSTALLED (aos-dashboard@aos-local, user scope; reads from ./plugin).
- Hand-added hooks REMOVED from ~/.claude/settings.json (backup: ~/.claude/settings.json.bak-aos-*). Plugin hooks fire in real sessions (verified with headless `claude -p`).
- Monitor now autostarts from the plugin on SessionStart; data dir ~/.claude/plugins/data/aos-dashboard-aos-local/live (history merged in). Re-run `node plugin/build.mjs` after changing monitor.mjs/ui/hooks sources.
- Notifications ON for needs_input + stuck (idle_prompt muted). Prices left null (user is on a plan: no $ estimates wanted).

## Queue after the agents finish (needs the user's OK where marked)
1. Integration test: run a throwaway session with `claude --plugin-dir ./plugin`, confirm hooks fire and the monitor autostarts; check `/mcp` shows the server. Verify whether plugin hooks fire in the desktop app 'This computer' sessions (UNVERIFIED).
2. [NEEDS USER OK] Install the plugin from the local marketplace and REMOVE the 9 hand-added hooks from ~/.claude/settings.json (they would double-fire). Keep a backup copy first.
3. Add better hook events to the plugin: PostToolUseFailure / StopFailure (errored state), PermissionRequest (needs input), TaskCreated / TaskCompleted, PreModelSwitch / PostModelSwitch.
4. UI polish: top-of-ring label overlapped by particle stream; try REPLAY on live data; chip position beside the agents summary.
5. [NEEDS USER OK] Real macOS notifications: restart monitor without AOS_NOTIFY_DRY=1 (config in live/config.json).
6. Fill in live/prices.json to get dollar estimates (user supplies current prices).
7. Optional: launchd job so the monitor survives reboot (the plugin autostart may make this unnecessary).
8. Later: knowledge-graph view (graphify), control surface (approve/deny, autonomous goal runs: needs spend cap + approval rules).

Conventions: Haiku for mechanical work, Sonnet for design-heavy work, Opus for extra-hard problems. Verify with numeric checks, at most 1-2 screenshots.
