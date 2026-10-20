// Out-of-scope flag: attempt_log outcome 'scope_violation' -> task.out_of_scope, goal out_of_scope_count; other goals unaffected.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES, hookEv, sleep, tmpDir, startMonitor } from './harness.mjs';

const TMP = tmpDir('aos-monscope-'); let M;
before(async () => {
  const orch = path.join(TMP, 'orch'), live = path.join(TMP, 'live');
  fs.mkdirSync(live, { recursive: true });
  fs.cpSync(path.join(FIXTURES, 'scope', 'goals', 'g-scope'), path.join(orch, 'goals', 'g-scope'), { recursive: true });
  fs.cpSync(path.join(FIXTURES, 'escalation', 'goals', 'g-esc'), path.join(orch, 'goals', 'g-esc'), { recursive: true });
  fs.writeFileSync(path.join(live, 'hook-events.ndjson'), hookEv({ ev: 'SessionStart', sid: 'wrk1aaaa', cwd: 't1', cwdp: '/tmp/x/t1', gid: 'g-scope', tid: 't1' }) + hookEv({ ev: 'UserPromptSubmit', sid: 'wrk1aaaa', cwd: 't1', cwdp: '/tmp/x/t1', gid: 'g-scope', tid: 't1' }) + hookEv({ ev: 'SessionStart', sid: 'plainbbb', cwd: 'y', cwdp: '/tmp/y' }));
  M = await startMonitor({ orch, live }); await sleep(1300);
});
after(async () => { await M.stop(); fs.rmSync(TMP, { recursive: true, force: true }); });

test('scope fixture: task flagged, goal counted', async () => {
  const g = (await M.get('/api/goals/g-scope')).json.goal;
  assert.equal(g.out_of_scope_count, 1);
  const t1 = g.tasks.find((t) => t.id === 't1'); assert.equal(t1.out_of_scope, true); assert.equal(t1.scope_violations, 1);
  assert.equal(g.tasks.filter((t) => t.out_of_scope).length, 1);
});
test('goal list carries the count; clean goal has none', async () => {
  const gs = (await M.get('/api/goals')).json.goals, by = Object.fromEntries(gs.map((g) => [g.id, g]));
  assert.equal(by['g-scope'].out_of_scope_count, 1); assert.equal(by['g-esc'].out_of_scope_count, 0);
  const e = (await M.get('/api/goals/g-esc')).json.goal; assert.ok(e.tasks.every((t) => t.out_of_scope === false && t.scope_violations === 0));
});
test('only the tagged worker is flagged; an ordinary session never is', async () => {
  const ag = (await M.get('/api/state')).json.agents;
  assert.ok(ag.some((a) => a.goal_id === 'g-scope')); assert.ok(ag.some((a) => !a.goal_id));
  assert.ok(ag.filter((a) => a.goal_id !== 'g-scope').every((a) => !a.out_of_scope));
  assert.ok(ag.filter((a) => a.goal_id === 'g-scope').every((a) => a.out_of_scope === true));
});
