# AOS notify

Branded macOS banners for the AOS monitor. A tiny AppleScript applet, `AOS Notifier.app`
(bundle id `dev.aos.notifier`, name "AOS", no Dock icon, custom icon), posts the banner so
macOS shows the AOS icon instead of Script Editor. No third-party installs.

- Build or rebuild: `node build-notifier.mjs` (idempotent; `--force` to rebuild). Icon: `python3 make-icon.py`.
- Installed to `${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugins/data/aos-dashboard-aos-local}/AOS Notifier.app`.
- Monitor usage: `import { notify, formatNotification } from './notify/aos-notify.mjs'`;
  `notify({ ...formatNotification({ kind, agent, text, project }) })` or `notify({ kind, agent, text })`.
  Kinds: needs_input, stuck, error, session_end, finished. Falls back to `osascript` if the app is unusable.
- CLI: `node aos-notify.mjs --kind stuck --agent "Opus: foo" --text "3 min"`. `AOS_NOTIFY_DRY=1` prints instead of sending.
- Tests: `node test.mjs` (add `--live` to send one real banner).
- Remove: delete the `AOS Notifier.app` folder (and this folder).
- First use: macOS may ask to allow notifications for "AOS". If no banner appears, open System Settings >
  Notifications, find "AOS" in the list, turn on "Allow Notifications", pick Banners or Alerts. Also check Focus is off.
