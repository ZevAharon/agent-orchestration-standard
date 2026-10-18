---
name: dash
description: Show a snapshot of the AOS agent dashboard (agents, status, models, tokens, file conflicts) as a terminal frame inside this session. Use when the user types /aos-dashboard:dash or asks to see the agent dashboard here.
disable-model-invocation: true
---

Run this command with the Bash tool and show the output to the user exactly as printed, in a code block, with no extra commentary:

```
aos-dash --once --no-color
```

If `aos-dash` is not found, run `node "${CLAUDE_PLUGIN_ROOT}/cli/dash.mjs" --once --no-color` instead.
If the output says the monitor is not reachable, tell the user the AOS monitor starts automatically when a session opens (unless AOS_NO_AUTOSTART=1) and that the web dashboard is at http://127.0.0.1:4318. Do not start any other process.
The live full-screen version is `aos-dash` in a separate terminal pane (press q to quit).
