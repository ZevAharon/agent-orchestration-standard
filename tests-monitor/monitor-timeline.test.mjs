// /api/timeline: per-agent bars (start/end/status) + activity ticks from the same fold as /api/state; ?at= slices like replay.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sleep, tmpDir, hookEv, startMonitor } from './harness.mjs';

const TMP = tmpDir('aos-montl-'); let M; const now = Date.now(), at = (m) => new Date(now + m * 60e3).toISOString();
before(async () => {
  const live = path.join(TMP, 'live'), orch = path.join(TMP, 'orch'); fs.mkdirSync(live, { recursive: true }); fs.mkdirSync(orch, { recursive: true });
  const w = { cwd: 'proj', cwdp: '/x/proj' }, L = [];
  L.push(hookEv({ ts: at(-30), ev: 'SessionStart', sid: 'tls1aaaa', ...w }));
  for (let i = 0; i < 10; i++) L.push(hookEv({ ts: at(-29 + i), ev: 'PreToolUse', sid: 'tls1aaaa', tool: 'Read', ...w }));
  L.push(hookEv({ ts: at(-20), ev: 'SubagentStart', sid: 'tls1aaaa', agent_id: 'sa1', agent_type: 'Explore', ...w }));
  for (let i = 0; i < 4; i++) L.push(hookEv({ ts: at(-19 + i), ev: 'PreToolUse', sid: 'tls1aaaa', agent_id: 'sa1', tool: 'Grep', ...w }));
  L.push(hookEv({ ts: at(-10), ev: 'SubagentStop', sid: 'tls1aaaa', agent_id: 'sa1', ...w }));
  fs.writeFileSync(path.join(live, 'hook-events.ndjson'), L.join(''));
  M = await startMonitor({ orch, live }); await sleep(300);
});
after(async () => { await M.stop(); fs.rmSync(TMP, { recursive: true, force: true }); });

test('timeline rows: bars, status and ticks', async () => {
  const r = await M.get('/api/timeline'); assert.equal(r.status, 200);
  const t = r.json; assert.equal(t.replay, false); assert.equal(t.rows.length, 2);
  const sub = t.rows.find((x) => x.kind === 'subagent'), ses = t.rows.find((x) => x.kind === 'session');
  assert.ok(sub && ses);
  assert.equal(Date.parse(sub.start), Date.parse(at(-20))); assert.equal(Date.parse(sub.end), Date.parse(at(-10)));
  assert.ok(sub.ticks.length >= 4 && sub.ticks.every((x) => x >= Date.parse(sub.start) && x <= Date.parse(sub.end)));
  assert.ok(ses.ticks.length >= 10); assert.equal(t.from, ses.start);
  assert.ok(t.rows.every((x, i, a) => !i || a[i - 1].start <= x.start));
});

test('timeline ?at= slices the same way as replay; bad at is 400', async () => {
  const r = (await M.get('/api/timeline?at=' + encodeURIComponent(at(-15)))).json;
  assert.equal(r.replay, true); const sub = r.rows.find((x) => x.kind === 'subagent');
  assert.equal(sub.end, null); assert.equal(Date.parse(r.to), Date.parse(at(-15)));
  assert.ok(sub.ticks.every((x) => x <= Date.parse(at(-15))));
  assert.equal((await M.get('/api/timeline?at=zzz')).status, 400);
  assert.equal((await M.get('/api/timeline?at=' + encodeURIComponent(at(-40)))).json.rows.length, 0);
});
