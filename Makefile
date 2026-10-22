# AOS: one-command setup for the Claude Code live dashboard.   Run `make` for the list of targets.
# Requires: Node 18+, the Claude Code CLI (`claude`), macOS for the branded notifier (everything else is portable).

SHELL      := /bin/bash
REPO       := $(CURDIR)
PLUGIN     := aos-dashboard@aos-local
MARKET     := aos-local
PORT       ?= 4318
DATA       := $(HOME)/.claude/plugins/data/aos-dashboard-aos-local
AOS        := node scripts/aos.mjs
ENSURE     := CLAUDE_PLUGIN_ROOT="$(REPO)/plugin" CLAUDE_PLUGIN_DATA="$(DATA)" AOS_PORT=$(PORT) node plugin/hooks/ensure-monitor.mjs

.DEFAULT_GOAL := help
.PHONY: help install uninstall build validate test doctor start stop restart open link unlink statusline statusline-off notifier screenshots

help: ## Show this list
	@echo "AOS: Claude Code live dashboard"; echo
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*## "}{printf "  make %-16s %s\n", $$1, $$2}'
	@echo; echo "First time:  make install   then start a NEW Claude Code session and open http://127.0.0.1:$(PORT)"

install: check build validate ## Install everything: build, register + install the plugin, link `aos-dash`, build the notifier, start the monitor
	@echo "==> registering the local marketplace"
	@claude plugin marketplace add "$(REPO)" 2>&1 | tail -1 || true
	@echo "==> installing $(PLUGIN)"
	@claude plugin install $(PLUGIN) 2>&1 | tail -1 || true
	@$(MAKE) --no-print-directory link
	@$(MAKE) --no-print-directory notifier
	@$(MAKE) --no-print-directory start
	@echo; echo "Done. Next:"
	@echo "  1. Start a NEW Claude Code session (existing sessions keep their old hooks; or type /reload-plugins)"
	@echo "  2. Open http://127.0.0.1:$(PORT)   (or run: aos-dash)"
	@echo "  3. Optional status line:  make statusline"
	@echo "  4. Check everything:      make doctor"
	@echo "Troubleshooting: aos-dash not found -> add this to your shell profile: export PATH=\"\$$HOME/.local/bin:\$$PATH\"; empty dashboard -> normal until a Claude Code session has run (it fills from hook events)."
	@echo "NOTE: if you previously added AOS hooks to ~/.claude/settings.json by hand, remove them (they would log every event twice)."

uninstall: stop unlink statusline-off ## Remove the plugin, marketplace entry, aos-dash link and status line (your data stays)
	-@claude plugin uninstall $(PLUGIN) 2>&1 | tail -1
	-@claude plugin marketplace remove $(MARKET) 2>&1 | tail -1
	@echo "Removed. Activity history is kept in $(DATA) (delete it to erase)."

check:
	@command -v node >/dev/null || { echo "node not found (need 18+)"; exit 1; }
	@node -e 'process.exit(+process.versions.node.split(".")[0] >= 18 ? 0 : 1)' || { echo "node 18+ required"; exit 1; }
	@command -v claude >/dev/null || { echo "claude CLI not found: install Claude Code first"; exit 1; }

build: ## Regenerate plugin/ copies (monitor, hooks, ui, cli) from the sources
	@set -o pipefail; node plugin/build.mjs | tail -3

validate: ## Validate the plugin manifest with the Claude CLI
	@set -o pipefail; claude plugin validate ./plugin 2>&1 | tail -2

test: ## Run every test suite
	@set -o pipefail; echo "==> terminal dashboard"; node cli/test.mjs | tail -1
	@set -o pipefail; echo "==> MCP server"; node plugin/mcp/test.mjs | tail -1
	@if [ "$$(uname)" = "Darwin" ]; then set -o pipefail; echo "==> notifier"; node plugin/notify/test.mjs | tail -1; else echo "==> notifier: skipped (macOS only)"; fi
	@set -o pipefail; echo "==> aos helper (stop/doctor)"; node scripts/aos.test.mjs | tail -1
	@echo "==> theme contrast"; out="$$(node ui/theme-tokens.test.mjs)" || { echo "$$out"; exit 1; }; echo "$$out" | head -1
	@echo "==> streams quiet mode"; out="$$(node ui/streams-quiet.test.mjs)" || { echo "$$out" | grep FAIL; exit 1; }; echo "$$out" | tail -1
	@echo "==> mobile layout"; out="$$(node ui/mobile.test.mjs)" || { echo "$$out" | grep FAIL; exit 1; }; echo "$$out" | tail -1
	@echo "==> orch badges"; out="$$(node ui/orch-badges.test.mjs)" || { echo "$$out" | grep FAIL; exit 1; }; echo "$$out" | tail -1
	@echo "==> orch rules + draft"; out="$$(node ui/orch-rules.test.mjs)" || { echo "$$out" | grep FAIL; exit 1; }; echo "$$out" | tail -1
	@echo "==> orch presence"; out="$$(node ui/orch-presence.test.mjs)" || { echo "$$out" | grep FAIL; exit 1; }; echo "$$out" | tail -1
	@echo "==> needs-you"; out="$$(node ui/needs-you.test.mjs)" || { echo "$$out" | grep FAIL; exit 1; }; echo "$$out" | tail -1
	@echo "==> guard view"; out="$$(node ui/guard.test.mjs)" || { echo "$$out" | grep FAIL; exit 1; }; echo "$$out" | tail -1
	@echo "==> machines (cross-machine UI)"; out="$$(node ui/machines.test.mjs)" || { echo "$$out" | grep FAIL; exit 1; }; echo "$$out" | tail -1
	@echo "==> timeline"; out="$$(node ui/timeline.test.mjs)" || { echo "$$out" | grep FAIL; exit 1; }; echo "$$out" | tail -1
	@echo "==> monitor goals, verdicts + hooks"; out="$$(node --test tests-monitor/*.test.mjs 2>&1)" || { echo "$$out" | grep -E "^not ok|error:" | head -20; exit 1; }; echo "$$out" | grep -E '^# (pass|fail)' | tr '\n' ' '; echo

doctor: ## Check the whole setup and say what to fix
	@$(AOS) doctor

start: ## Start the live monitor (normally automatic when a session opens)
	@$(ENSURE); sleep 1; curl -s -o /dev/null -m 2 -w "monitor on :$(PORT): HTTP %{http_code}\n" http://127.0.0.1:$(PORT)/api/state || echo "monitor did not start: see make doctor"

stop: ## Stop the live monitor on PORT (other AOS monitors are left alone)
	@PORT=$(PORT) $(AOS) stop

restart: stop start ## Restart the monitor (needed after `make build` changes monitor.mjs)

open: ## Open the web dashboard
	@open http://127.0.0.1:$(PORT) 2>/dev/null || xdg-open http://127.0.0.1:$(PORT)

link: ## Put `aos-dash` on your PATH (symlink in ~/.local/bin; launcher scripts on Windows)
	@$(AOS) link

unlink: ## Remove the `aos-dash` link
	@$(AOS) unlink

statusline: ## (optional) Show an AOS summary in Claude Code's status line (edits ~/.claude/settings.json, with backup)
	@$(AOS) statusline

statusline-off: ## Remove the AOS status line
	@$(AOS) statusline-off

notifier: ## (macOS) Build the branded notification app
	@node plugin/notify/build-notifier.mjs 2>&1 | tail -2

screenshots: ## Regenerate docs/screenshots + docs/hero.gif from synthetic demo data (needs the monitor running, playwright-core; ffmpeg for the GIF)
	@node scripts/screenshots.mjs
