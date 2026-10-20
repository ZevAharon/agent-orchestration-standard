// Orchestrator worker: requested tier (tasks.json) vs served model (hook SessionStart model).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES, sleep, tmpDir, hookEv, startMonitor } from './harness.mjs';

const TMP = tmpDir('aos-montier-'); let M;
before(async () => {
  const orch = path.join(TMP, 'orch'), live = path.join(TMP, 'live');
  fs.mkdirSync(path.join(orch, 'goals'), { recursive: true }); fs.mkdirSync(live, { recursive: true });
  fs.cpSync(path.join(FIXTURES, 'all-success', 'goals', 'g-test'), path.join(orch, 'goals', 'g-test'), { recursive: true }); // all tasks tier haiku
  const at = (ms) => new Date(Date.now() + ms).toISOString(), WT = '/fixture/repo.aos-worktrees/g-test/';
  const w = (sid, tid, m) => [hookEv({ ts: at(-9000), ev: 'SessionStart', sid, cwd: tid, cwdp: WT + tid, gid: 'g-test', tid, ...(m ? { m } : {}) }), hookEv({ ts: at(-5000), ev: 'UserPromptSubmit', sid, cwd: tid, cwdp: WT + tid, gid: 'g-test', tid })].join('');
  fs.writeFileSync(path.join(live, 'hook-events.ndjson'), w('wmis1aaa', 't1', 'claude-sonnet-4-6') + w('wokk2aaa', 't2', 'claude-haiku-4-5') + w('wunk3aaa', 't3', null));
  M = await startMonitor({ orch, live }); await sleep(1200);
});
after(async () => { await M.stop(); fs.rmSync(TMP, { recursive: true, force: true }); });

test('requested_tier + model_mismatch only when tier and served model families differ', async () => {
  const ag = (await M.get('/api/state')).json.agents, by = (t) => ag.find((a) => a.task_id === t);
  assert.equal(by('t1').requested_tier, 'haiku'); assert.equal(by('t1').model_mismatch, true);
  assert.equal(by('t2').requested_tier, 'haiku'); assert.equal(by('t2').model_mismatch, undefined);
  assert.equal(by('t3').requested_tier, 'haiku'); assert.equal(by('t3').model_mismatch, undefined, 'unknown served model is never flagged');
  assert.ok(ag.filter((a) => !a.task_id).every((a) => a.requested_tier === undefined));
});
