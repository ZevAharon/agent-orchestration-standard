---
name: dashboard
description: "The AOS dashboard: a read-only live monitor of Claude Code agents (agents, tasks, cost, file conflicts, alerts, history) served at http://127.0.0.1:4318. Use when the user asks about the AOS dashboard, live agent status, what agents are doing, session cost, file collisions between agents, or how to open or disable the monitor."
---

# AOS dashboard

The AOS dashboard is a local, read-only web view of Claude Code activity in AOS-1 form. The plugin's hooks log one compact line per hook event (session start and end, prompts, tool calls, subagents, stops, notifications) to a local file. A small monitor folds that log into an AOS-1 state view and serves it.

## Open it

- URL: http://127.0.0.1:4318
- macOS: `open http://127.0.0.1:4318`
- Terminal version: `node ${CLAUDE_PLUGIN_ROOT}/cli/dash.mjs`

## Autostart

A SessionStart hook (`hooks/ensure-monitor.mjs`) starts the monitor when it is not already answering. It is idempotent: it probes `GET /api/state` on 127.0.0.1 first, takes a lock so two sessions cannot start two monitors, waits up to 3 seconds for the monitor to come up, and always exits silently. The monitor binds 127.0.0.1 only.

To disable autostart, set `AOS_NO_AUTOSTART=1` in the environment Claude Code starts in. Then start the monitor yourself if you want it, or leave it off.

The monitor port can be changed with `AOS_PORT` (or `PORT`) for the autostart check and the monitor.

## Data and privacy

- Read-only. The dashboard and the MCP tools never change agent state.
- Local only. Nothing leaves the machine.
- Stored data lives in the plugin data directory (`${CLAUDE_PLUGIN_DATA}/live`, or `AOS_LIVE_DIR` if set).
- The hooks store no prompts, no command text, no file contents, no tool output and no environment values. They keep event names, tool names, session IDs (truncated), agent IDs and types, basenames of most tool targets, the first word of Bash commands (only when it is a plain word), the full path of files touched by Edit/Write tools, transcript paths, and a notification type.

## MCP tools

The `aos` MCP server exposes read-only views of the same state:

- `aos_status`: overall state of sessions and agents
- `aos_agent`: one agent's activity
- `aos_cost`: token and cost estimates (dollar values need prices in `prices.json`)
- `aos_conflicts`: files touched by more than one agent
- `aos_alerts`: stuck or needs-input alerts
- `aos_history`: recent events
- `aos_state_at`: state at a past timestamp

## Settings

- `live/config.json`: `stuck_after_s` and `notify` settings. Defaults are copied in on first run and never overwritten.
- `live/prices.json`: per-model USD per million tokens. Left empty by default, so cost stays unknown until filled in.
