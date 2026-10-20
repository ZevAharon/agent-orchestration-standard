# AOS-1: Agent Orchestration Standard

AOS-1 is a minimal, runtime-agnostic contract for orchestrating several AI agents toward one standing **Goal**. A periodic **Heartbeat** re-evaluates the Goal, reaps stalled work, plans, dispatches ready Tasks, and enforces budgets until the Goal is achieved, blocked, or cancelled. All state lives in plain files, and an append-only event log is the source of truth. The normative text is in [SPEC.md](SPEC.md).

The repo holds the spec, JSON Schemas, a zero-dependency conformance validator, a reference server and heartbeat runner, and a read-only live dashboard for Claude Code sessions.

<p align="center">
  <a href="docs/screenshots.md"><img src="docs/hero.gif" alt="AOS live dashboard: a project graph of agents with streaming activity" width="900"></a><br>
  <sub>The live dashboard on a synthetic demo dataset. <a href="docs/screenshots.md">More screenshots</a>.</sub>
</p>

## Install the dashboard

Needs Node 18+ and the Claude Code CLI. No dependencies to install.

```sh
make install        # builds, installs the local plugin, links `aos-dash`, starts the monitor
make doctor         # checks the whole setup and tells you what to fix
make                # lists every target
```

Then start a new Claude Code session and open http://127.0.0.1:4318. Local-only, read-only; hooks log event and tool names, never prompts or file contents. Status: personal project, macOS-first. [MIT License](LICENSE).

## Quick usage of the spec tools

```sh
node server.mjs                       # reference dashboard + API at http://127.0.0.1:4317
node conformance/validate.mjs         # validate ./state against the schemas and the spec's MUSTs
node conformance/validate.mjs --selftest
```

## Docs

- [SPEC.md](SPEC.md): normative specification; [ROADMAP.md](ROADMAP.md): status and known limits
- [docs/dashboard.md](docs/dashboard.md): the Claude Code dashboard, highlights, debugging, security and threat model
- [docs/architecture.md](docs/architecture.md): how events flow from hooks to the UI
- [docs/reference-runner.md](docs/reference-runner.md): server, validator checks, directory map, dispatch config, keeping it running
- [docs/screenshots.md](docs/screenshots.md): screenshot gallery
- [docs/overhead.md](docs/overhead.md): measured monitor CPU and memory
- [docs/orchestrator-design.md](docs/orchestrator-design.md): orchestrator engine design
- [plugin/README.md](plugin/README.md): plugin details and the exact privacy field list

## Contributing

Issues and small pull requests are welcome. Edit the sources in the repo root (`monitor.mjs`, `hooks/`, `ui/`, `cli/`), then run `make build` and `make test`; keep it zero-dependency and Node 18 compatible.
