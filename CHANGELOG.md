# Changelog

No tagged releases yet; entries are by theme, newest first.

## Unreleased
- Spec and orchestrator split out into their own repos (aos-1-spec, aos-orchestrator); this repo keeps the UI, monitor and plugin.
- Monitor tests decoupled from the orchestrator via golden goal fixtures; on-disk contract documented.
- Goals view: per-task outcome summary; goals UI backed by the orchestrator control server.
- Web UI: streams modes (Full / Quiet / Lines), semantic zoom, fixes for reduced motion.
- CI on Linux and macOS (Node 18 and 22); notifier tests run on macOS only.

## Earlier
- Pre-release security and privacy hardening; fixes for malformed-log crashes, prototype-key cost bug, paths with spaces.
- Static project-graph layout with pan and zoom, light/dark theme, scaled terminal view, make-based setup, MIT license.
- Initial commit: live dashboard for Claude Code (hooks, monitor, web UI, terminal UI, MCP server).
