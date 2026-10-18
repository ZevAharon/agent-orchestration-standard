# aos-dashboard (Claude Code plugin)

A local, read-only live dashboard for agent orchestration (AOS-1). Hooks log one compact line per Claude Code event to a local file; a monitor serves the folded state at http://127.0.0.1:4318. The plugin also ships an `aos` MCP server (read-only tools) and a `dashboard` skill.

## Build

Run from the repo root after changing `monitor.mjs`, `hooks/aos-hook.mjs`, `ui/` or `cli/`:

```sh
node plugin/build.mjs
```

It copies the sources into `plugin/` (with a small data-dir patch on the copies only), validates the plugin, and prints a table of files.

## Install

These are the install steps. Run them yourself:

```sh
claude plugin marketplace add /Users/tom/agent-orchestration-standard
claude plugin install aos-dashboard@aos-local
```

Dev test without installing:

```sh
claude --plugin-dir /Users/tom/agent-orchestration-standard/plugin
```

Uninstall:

```sh
claude plugin uninstall aos-dashboard@aos-local
claude plugin marketplace remove aos-local
```

**Before installing:** remove the hand-added hooks from `~/.claude/settings.json`. The plugin registers the same events, so keeping both would log every event twice. Keep a backup of that file first.

## Use

Open http://127.0.0.1:4318 (on macOS: `open http://127.0.0.1:4318`). The monitor starts automatically at session start. Terminal view: `node ${CLAUDE_PLUGIN_ROOT}/cli/dash.mjs`.

## Autostart and AOS_NO_AUTOSTART

A SessionStart hook starts the monitor if nothing answers on the port. It is idempotent and silent. To turn it off, set `AOS_NO_AUTOSTART=1` in the environment Claude Code runs in. `AOS_PORT` (or `PORT`) changes the port.

## Privacy

- Everything stays on this machine. The monitor binds 127.0.0.1 only and nothing is sent anywhere.
- The dashboard is read-only.
- The hooks do not store prompts, command text, file contents, tool output or environment values.
- They do store event and tool names, truncated session IDs, agent IDs and types, basenames of most tool targets, the first word of a Bash command (when it is a plain word), the full path of files edited by Edit/Write tools, transcript paths, and notification types.
- Data lives in `${CLAUDE_PLUGIN_DATA}/live` (or `AOS_LIVE_DIR`). Delete that folder to erase it.

## Layout

- `.claude-plugin/plugin.json`: manifest
- `hooks/hooks.json`: hook registrations (async)
- `hooks/aos-hook.mjs`, `monitor.mjs`, `ui/`, `cli/`: copies made by `build.mjs`
- `hooks/ensure-monitor.mjs`: SessionStart autostart
- `defaults/`: starter `config.json` and `prices.json` (prices blank)
- `.mcp.json`, `mcp/`: the `aos` MCP server
- `skills/dashboard/SKILL.md`: the dashboard skill
