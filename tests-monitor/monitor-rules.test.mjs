// Rule sets (R11): goal.orch.rules -> GoalSummary.rules / GoalDetail.rules, human-review criteria, engine rule ids on events. Older goals (no rules) -> null.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES, sleep, tmpDir, startMonitor } from './harness.mjs';

const TMP = tmpDir('aos-monrules-'); let M;
before(async () => {
  const orch = path.join(TMP, 'orch'), live = path.join(TMP, 'live');
  fs.mkdirSync(live, { recursive: true });
  fs.cpSync(path.join(FIXTURES, 'rules', 'goals', 'g-rules'), path.join(orch, 'goals', 'g-rules'), { recursive: true });
  fs.cpSync(path.join(FIXTURES, 'escalation', 'goals', 'g-esc'), path.join(orch, 'goals', 'g-esc'), { recursive: true });
  M = await startMonitor({ orch, live }); await sleep(1300);
});
after(async () => { await M.stop(); fs.rmSync(TMP, { recursive: true, force: true }); });

test('summary carries the rules chip data: hash, profile, counts (no ids, no values)', async () => {
  const by = Object.fromEntries((await M.get('/api/goals')).json.goals.map((g) => [g.id, g]));
  assert.deepEqual(by['g-rules'].rules, { hash: 'a1b2c3d4e5f6', profile: 'node-library', legacy: false, loosenings: 1, dropped: 1 });
  assert.equal(by['g-esc'].rules, null, 'a goal from before rule sets has no rules');
});
test('detail adds layers and rule ids with the content binding shortened to 8 characters', async () => {
  const g = (await M.get('/api/goals/g-rules')).json.goal;
  assert.deepEqual(g.rules.layers.map((l) => l.layer), ['default', 'user', 'repo', 'goal']);
  assert.deepEqual(g.rules.loosening_ids, [{ rule_id: 'goal:budgets.max_usd@abababab', layer: 'goal' }]);
  assert.deepEqual(g.rules.dropped_ids, [{ rule_id: 'repo:checks.allowlist.node-test@cdcdcdcd', layer: 'repo', reason: 'loosening' }]);
  assert.ok(!/[0-9a-f]{20}/.test(JSON.stringify(g.rules.loosening_ids)));
  assert.equal((await M.get('/api/goals/g-esc')).json.goal.rules, null);
});
test('a human-review criterion shows needs_confirmation until it is met; ordinary criteria are unchanged', async () => {
  const g = (await M.get('/api/goals/g-rules')).json.goal;
  const c = Object.fromEntries(g.criteria.map((x) => [x.id, x]));
  assert.deepEqual([c.c2.verify, c.c2.needs_confirmation, c.c2.met], ['human', true, false]);
  assert.deepEqual(Object.keys(c.c1).sort(), ['id', 'met', 'text'], 'ordinary criteria keep their shape');
});
test('the engine rule id on an event reaches the event text (data.rule)', async () => {
  const g = (await M.get('/api/goals/g-rules')).json.goal;
  assert.ok(g.last_events.some((e) => e.type === 'task.retried' && /rule=retry\.ladder/.test(e.text)), JSON.stringify(g.last_events.map((e) => e.text)));
});
test('hostile rules fields are bounded and cleaned', async () => {
  const f = path.join(TMP, 'orch', 'goals', 'g-rules', 'goal.json'); const g = JSON.parse(fs.readFileSync(f, 'utf8'));
  g.orch.rules.profile = 'x\u001b[2J'.repeat(30); g.orch.rules.loosenings = Array.from({ length: 100 }, (_, i) => ({ rule_id: `goal:p${i}‮@${'f'.repeat(32)}`, layer: 'goal' })); g.orch.rules.dropped = 'nope';
  fs.writeFileSync(f, JSON.stringify(g)); await sleep(1300);
  const d = (await M.get('/api/goals/g-rules')).json.goal.rules;
  assert.ok(d.profile.length <= 24 && !/[\u001b]/.test(d.profile)); assert.equal(d.loosenings, 100); assert.equal(d.loosening_ids.length, 30); assert.equal(d.dropped, 0);
  assert.ok(d.loosening_ids.every((x) => !/‮/.test(x.rule_id) && /@ffffffff$/.test(x.rule_id)));
});
