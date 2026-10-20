# Screenshots

All screenshots use a synthetic demo dataset (no real projects or paths).

<table>
<tr>
<td><a href="screenshots/01-graph-dark.png"><img src="screenshots/01-graph-dark.png" width="420" alt="Project graph: heart, project hubs, agents, live streams"></a><br><sub>Project graph: heart, project hubs, agents, live streams</sub></td>
<td><a href="screenshots/02-graph-light.png"><img src="screenshots/02-graph-light.png" width="420" alt="Same scene in the light theme"></a><br><sub>Same scene in the light theme</sub></td>
</tr>
<tr>
<td><a href="screenshots/03-agent-drawer-dark.png"><img src="screenshots/03-agent-drawer-dark.png" width="420" alt="Agent drawer: current tool, tool feed, tokens, run time, model"></a><br><sub>Agent drawer: current tool, tool feed, tokens, run time, model</sub></td>
<td><a href="screenshots/04-project-drawer-dark.png"><img src="screenshots/04-project-drawer-dark.png" width="420" alt="Project drawer: every agent in the project"></a><br><sub>Project drawer: every agent in the project</sub></td>
</tr>
<tr>
<td><a href="screenshots/05-conflict-and-alerts-dark.png"><img src="screenshots/05-conflict-and-alerts-dark.png" width="420" alt="File conflict popover and an alert toast"></a><br><sub>File conflict popover and an alert toast</sub></td>
<td><a href="screenshots/06-replay-dark.png"><img src="screenshots/06-replay-dark.png" width="420" alt="Replay: scrub back through the last hours"></a><br><sub>Replay: scrub back through the last hours</sub></td>
</tr>
<tr>
<td><a href="screenshots/07-telemetry-dark.png"><img src="screenshots/07-telemetry-dark.png" width="420" alt="Telemetry dock with the event stream"></a><br><sub>Telemetry dock with the event stream</sub></td>
<td><a href="screenshots/08-terminal.png"><img src="screenshots/08-terminal.png" width="420" alt="Terminal dashboard (aos-dash)"></a><br><sub>Terminal dashboard (aos-dash)</sub></td>
</tr>
</table>

Regenerate with `make screenshots` (needs playwright-core and the monitor running; ffmpeg for the GIF). The data comes from `scripts/demo-state.mjs`, served to the real UI through request interception.
