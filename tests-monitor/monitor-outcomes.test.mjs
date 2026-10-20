// Per-task / per-goal outcome summary in /api/goals(+/:id). Fixtures are golden goal dirs (generated once from the real engine; see fixtures/README.md).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const MONITOR = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'monitor.mjs');
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aos-monout-')));
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const get = (port, p) => new Promise((resolve, reject) => { http.get({ host: '127.0.0.1', port, path: p, agent: false }, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(b), text: b })); }).on('error', reject); });
const put = (fx, id) => { const d = path.join(ORCH, 'goals', id); fs.cpSync(path.join(FIXTURES, fx, 'goals', id), d, { recursive: true }); return d; };
const patch = (f, fn) => { const j = JSON.parse(fs.readFileSync(f, 'utf8')); fn(j); fs.writeFileSync(f, JSON.stringify(j)); };

let ORCH, M, port;
before(async () => {
  ORCH = path.join(TMP, 'orch'); fs.mkdirSync(path.join(ORCH, 'goals'), { recursive: true }); fs.mkdirSync(path.join(TMP, 'live'));
  put('escalation', 'g-esc');   // haiku fails checks, sonnet succeeds
  put('failed', 'g-fail');      // t1 fails on every tier; t2 depends on it and is never run
  // fabricated waiting states (timestamps relative to now): pending approval 10 min old for t1, plan awaiting since 20 min ago
  const w = put('waiting', 'g-wait');
  patch(path.join(w, 'approvals', 'A-1.json'), (a) => { a.requested_at = new Date(Date.now() - 600e3).toISOString(); });
  patch(path.join(put('plan', 'g-plan'), 'goal.json'), (g) => { g.orch.plan_awaiting_since_ms = Date.now() - 1200e3; });
  port = await freePort();
  const pr = spawn(process.execPath, [MONITOR], { env: { ...process.env, PORT: String(port), AOS_LIVE_DIR: path.join(TMP, 'live'), AOS_ORCH_DIR: ORCH }, stdio: ['ignore', 'pipe', 'pipe'] });
  M = pr;
  await new Promise((res, rej) => { pr.stdout.on('data', (d) => { if (String(d).includes('live monitor on')) res(); }); pr.on('exit', () => rej(new Error('monitor exited'))); setTimeout(() => rej(new Error('timeout')), 8000); });
});
after(() => { try { M.kill('SIGKILL'); } catch {} fs.rmSync(TMP, { recursive: true, force: true }); });
const detail = async (id) => (await get(port, '/api/goals/' + id)).json.goal;

test('escalated task: outcome, tier path, tokens, cost; goal roll-up', async () => {
  const d = await detail('g-esc'), t = d.tasks[0];
  assert.equal(d.status, 'achieved'); assert.equal(t.outcome, 'escalated'); assert.equal(t.retries, 1); assert.deepEqual(t.tier_path, ['haiku', 'sonnet']);
  assert.equal(t.attempts, 2); assert.ok(t.new_tokens > 0); assert.equal(t.check_summary, 'checks passed');
  assert.equal(typeof t.cost_usd, 'number'); assert.ok(t.cost_usd >= 0);
  assert.equal(t.waiting_s, null);
  assert.equal(d.outcome.merged, 1); assert.equal(d.outcome.discarded, 0); assert.equal(d.outcome.tokens_per_accepted, d.budget.used_new_tokens);
  assert.equal(d.outcome.waiting_s, null); assert.equal(d.outcome.waiting_on, null); assert.equal(typeof d.outcome.cost_usd, 'number');
});

test('failed goal: failed + never-run tasks count as discarded, nothing merged, tokens-per-accepted null', async () => {
  const d = await detail('g-fail'), [t1, t2] = d.tasks;
  assert.equal(t1.outcome, 'failed'); assert.deepEqual(t1.tier_path, ['haiku', 'sonnet', 'opus']); assert.equal(t1.retries, 2); assert.equal(t1.attempts, 3);
  assert.equal(t2.outcome, 'pending'); assert.deepEqual(t2.tier_path, []);
  assert.equal(d.outcome.merged, 0); assert.equal(d.outcome.discarded, 1); assert.equal(d.outcome.tokens_per_accepted, null);
});

test('waiting on you: oldest pending approval / plan awaiting approval age', async () => {
  const a = await detail('g-wait');
  assert.ok(Math.abs(a.outcome.waiting_s - 600) <= 30 && a.outcome.waiting_on === 'approval', JSON.stringify(a.outcome));
  assert.ok(Math.abs(a.tasks[0].waiting_s - 600) <= 30 && a.tasks[0].waiting_for_human === true && a.tasks[0].outcome === 'escalated');
  const p = await detail('g-plan');
  assert.ok(Math.abs(p.outcome.waiting_s - 1200) <= 30 && p.outcome.waiting_on === 'plan', JSON.stringify(p.outcome));
});

test('list carries the roll-up, keeps the {goals} / {goal} wrappers and leaks no paths', async () => {
  const r = await get(port, '/api/goals');
  assert.deepEqual(Object.keys(r.json), ['goals']);
  const byId = Object.fromEntries(r.json.goals.map((g) => [g.id, g]));
  assert.equal(byId['g-esc'].outcome.merged, 1); assert.equal(byId['g-fail'].outcome.discarded, 1);
  assert.deepEqual(Object.keys(byId['g-esc'].outcome).sort(), ['cost_usd', 'discarded', 'merged', 'tokens_per_accepted', 'waiting_on', 'waiting_s']);
  assert.deepEqual(Object.keys((await get(port, '/api/goals/g-esc')).json), ['goal']);
  for (const x of [r.text, JSON.stringify(await detail('g-fail'))]) assert.ok(!x.includes('/Users/') && !x.includes('/fixture') && !x.includes(TMP) && !x.includes(os.tmpdir()));
});
