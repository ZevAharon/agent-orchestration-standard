// Plan-limit pause: goal limit_paused/resume_at + the tasks whose newest attempt was rate_limited (they will rerun).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES, sleep, tmpDir, startMonitor } from './harness.mjs';

const TMP = tmpDir('aos-monrl-'); let M;
const RESUME = new Date(Date.now() + 3600e3).toISOString();
before(async () => {
  const orch = path.join(TMP, 'orch'), live = path.join(TMP, 'live'), gd = path.join(orch, 'goals', 'g-esc');
  fs.mkdirSync(live, { recursive: true });
  fs.cpSync(path.join(FIXTURES, 'escalation', 'goals', 'g-esc'), gd, { recursive: true });
  const g = JSON.parse(fs.readFileSync(path.join(gd, 'goal.json'), 'utf8'));
  Object.assign(g, { status: 'active' }); Object.assign(g.orch, { paused_reason: 'plan limit (five_hour): rate_limit_event rejected', resume_at: RESUME });
  fs.writeFileSync(path.join(gd, 'goal.json'), JSON.stringify(g));
  const t = JSON.parse(fs.readFileSync(path.join(gd, 'tasks.json'), 'utf8'));
  // t1: requeued after a rate-limited attempt; t2 (if any): a done task whose old attempt was rate limited must NOT count
  t[0].status = 'ready'; t[0].orch.attempt_log.push({ n: 9, tier: 'sonnet', started_at: new Date().toISOString(), ended_at: new Date().toISOString(), outcome: 'rate_limited', counted: false });
  if (t[1]) { t[1].orch.attempt_log.push({ n: 9, tier: 'haiku', outcome: 'rate_limited', counted: false }); t[1].status = 'done'; }
  fs.writeFileSync(path.join(gd, 'tasks.json'), JSON.stringify(t));
  M = await startMonitor({ orch, live }); await sleep(300);
});
after(async () => { await M.stop(); fs.rmSync(TMP, { recursive: true, force: true }); });

test('limit pause exposes limit_paused, resume_at and the interrupted tasks', async () => {
  const g = (await M.get('/api/goals/g-esc')).json.goal;
  assert.equal(g.limit_paused, true); assert.equal(g.resume_at, RESUME); assert.equal(g.rerun_count, 1);
  const rr = g.tasks.filter((t) => t.rerun).map((t) => t.id);
  assert.deepEqual(rr, ['t1']);
  assert.equal((await M.get('/api/goals')).json.goals[0].rerun_count, 1);
});
