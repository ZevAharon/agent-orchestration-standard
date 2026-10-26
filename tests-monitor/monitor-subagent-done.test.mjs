// A subagent that sent SubagentStop is `done` (finished, listening for nothing); a session that is not running stays `idle`.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sleep, tmpDir, hookEv, startMonitor } from './harness.mjs';

const TMP = tmpDir('aos-mondone-'); let M; const now = Date.now(), at = (m) => new Date(now + m * 60e3).toISOString();
before(async () => {
  const live = path.join(TMP, 'live'), orch = path.join(TMP, 'orch'); fs.mkdirSync(live, { recursive: true }); fs.mkdirSync(orch, { recursive: true });
  const w = { cwd: 'proj', cwdp: '/x/proj' }, L = [];
  L.push(hookEv({ ts: at(-30), ev: 'SessionStart', sid: 'sdn1aaaa', ...w }));
  L.push(hookEv({ ts: at(-20), ev: 'SubagentStart', sid: 'sdn1aaaa', agent_id: 'fin1', agent_type: 'workflow-subagent', ...w }));
  L.push(hookEv({ ts: at(-19), ev: 'PreToolUse', sid: 'sdn1aaaa', agent_id: 'fin1', tool: 'Read', ...w }));
  L.push(hookEv({ ts: at(-18), ev: 'SubagentStop', sid: 'sdn1aaaa', agent_id: 'fin1', ...w }));
  L.push(hookEv({ ts: at(-0.05), ev: 'SubagentStart', sid: 'sdn1aaaa', agent_id: 'run1', agent_type: 'workflow-subagent', ...w }));
  L.push(hookEv({ ts: at(-0.02), ev: 'PreToolUse', sid: 'sdn1aaaa', agent_id: 'run1', tool: 'Grep', ...w }));
  // a second session that has ended: its finished subagent must not float on with no live parent
  L.push(hookEv({ ts: at(-25), ev: 'SessionStart', sid: 'sdn2bbbb', ...w }));
  L.push(hookEv({ ts: at(-24), ev: 'SubagentStart', sid: 'sdn2bbbb', agent_id: 'orf1', agent_type: 'workflow-subagent', ...w }));
  L.push(hookEv({ ts: at(-23), ev: 'SubagentStop', sid: 'sdn2bbbb', agent_id: 'orf1', ...w }));
  L.push(hookEv({ ts: at(-22), ev: 'SessionEnd', sid: 'sdn2bbbb', ...w }));
  fs.writeFileSync(path.join(live, 'hook-events.ndjson'), L.join(''));
  M = await startMonitor({ orch, live }); await sleep(300);
});
after(async () => { await M.stop(); fs.rmSync(TMP, { recursive: true, force: true }); });

const byAgent = (agents, aid) => agents.find((a) => String(a.id).endsWith('·' + aid.slice(0, 4)) || String(a.id).includes(aid));

test('a subagent that sent SubagentStop is done, with an end time', async () => {
  const s = (await M.get('/api/state')).json;
  const fin = byAgent(s.agents, 'fin1');
  assert.ok(fin, 'finished subagent is listed');
  assert.equal(fin.status, 'done');
  assert.equal(Date.parse(fin.ended_at), Date.parse(at(-18)));
});

test('a subagent still working is running, and the timeline carries the same statuses', async () => {
  const s = (await M.get('/api/state')).json;
  assert.equal(byAgent(s.agents, 'run1').status, 'running');
  const t = (await M.get('/api/timeline')).json;
  const subs = t.rows.filter((x) => x.kind === 'subagent').map((x) => x.status).sort();
  assert.deepEqual(subs, ['done', 'running']);
});

test('no subagent is ever reported idle; idle is a session state', async () => {
  const s = (await M.get('/api/state')).json;
  const session = s.agents.find((a) => String(a.id).startsWith('Claude Code·'));
  const subs = s.agents.filter((a) => a !== session);
  assert.equal(session.status, 'idle');
  assert.equal(subs.length, 2, JSON.stringify(subs.map((a) => a.id)));
  assert.ok(subs.every((a) => a.status !== 'idle'), JSON.stringify(subs.map((a) => [a.id, a.status])));
});

test('a done subagent leaves with its session; one of a live session stays', async () => {
  const s = (await M.get('/api/state')).json;
  assert.equal(byAgent(s.agents, 'orf1'), undefined, 'the ended session\'s finished subagent is gone');
  assert.ok(!s.agents.some((a) => String(a.id).includes('sdn2')), 'and so is the ended session');
  assert.equal(byAgent(s.agents, 'fin1').status, 'done', 'the live session\'s finished subagent stays');
});
