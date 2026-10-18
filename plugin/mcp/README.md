# AOS monitor MCP server

Zero-dependency, read-only stdio MCP server (Node 18+) exposing the AOS live monitor to Claude.

Run: `node plugin/mcp/server.mjs` (normally launched by the plugin's `.mcp.json`).

- Connects only to `http://127.0.0.1:${AOS_PORT:-4318}` (AOS_PORT must be an integer 1024-65535, else 4318). No host/URL/path is ever accepted from env or client. 2s timeout.
- Tools (all `readOnlyHint: true`): `aos_status` (optional `include_events` 0-50), `aos_agent {id}`, `aos_cost`, `aos_conflicts`, `aos_alerts`, `aos_history {limit?}`, `aos_state_at {at}`.
- "New tokens" = input + output + cache_write; cache reads are reported separately.
- Monitor down: tool result has `isError: true` with a start hint. Protocol errors: -32601 unknown method, -32602 bad params/unknown tool.
- Logs go to stderr only; stdout carries JSON-RPC only.

Test: `node plugin/mcp/test.mjs` (uses a fake monitor on a spare port).
