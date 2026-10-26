// Reasoning effort comes from the transcript's assistant lines (top-level `effort`, else `perTurnEffort`); the latest turn wins, and only the fixed vocabulary is exposed.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sleep, tmpDir, hookEv, startMonitor } from './harness.mjs';

const TMP = tmpDir('aos-moneff-'); let M; const now = Date.now(), at = (m) => new Date(now + m * 60e3).toISOString();
const turn = (id, extra) => JSON.stringify({ type: 'assistant', ...extra, message: { id, model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }) + '\n';
before(async () => {
  const live = path.join(TMP, 'live'), orch = path.join(TMP, 'orch'), tr = path.join(TMP, 'tr'); for (const d of [live, orch, tr]) fs.mkdirSync(d, { recursive: true });
  const t1 = path.join(tr, 'eff1.jsonl'), t2 = path.join(tr, 'eff2.jsonl'), t3 = path.join(tr, 'eff3.jsonl'), ts = path.join(tr, 'sub1.jsonl');
  fs.writeFileSync(t1, turn('m1', { effort: 'high' }) + turn('m2', { effort: 'xhigh', perTurnEffort: 'xhigh' }));
  fs.writeFileSync(t2, turn('m3', { effort: 'turbo' }) + turn('m4', {})); // not in the vocabulary, then no effort at all
  fs.writeFileSync(t3, turn('m5', { perTurnEffort: 'low' }));
  fs.writeFileSync(ts, turn('m6', { effort: 'medium' }));
  const w = { cwd: 'proj', cwdp: '/x/proj' }, L = [];
  L.push(hookEv({ ts: at(-5), ev: 'SessionStart', sid: 'eff1aaaa', tp: t1, ...w }));
  L.push(hookEv({ ts: at(-4), ev: 'SubagentStart', sid: 'eff1aaaa', agent_id: 'sub1', agent_type: 'workflow-subagent', ...w }));
  L.push(hookEv({ ts: at(-3), ev: 'SubagentStop', sid: 'eff1aaaa', agent_id: 'sub1', tp: ts, ...w }));
  L.push(hookEv({ ts: at(-5), ev: 'SessionStart', sid: 'eff2bbbb', tp: t2, ...w }));
  L.push(hookEv({ ts: at(-5), ev: 'SessionStart', sid: 'eff3cccc', tp: t3, ...w }));
  L.push(hookEv({ ts: at(-0.1), ev: 'PreToolUse', sid: 'eff1aaaa', tool: 'Read', ...w }));
  fs.writeFileSync(path.join(live, 'hook-events.ndjson'), L.join(''));
  M = await startMonitor({ orch, live }); await sleep(300);
});
after(async () => { await M.stop(); fs.rmSync(TMP, { recursive: true, force: true }); });

const agent = (s, needle) => s.agents.find((a) => String(a.id).includes(needle));

test('a session reports the effort of its latest turn', async () => {
  const s = (await M.get('/api/state')).json;
  assert.equal(agent(s, 'Claude Code·eff1').effort, 'xhigh');
});
test('a subagent reports the effort from its own transcript', async () => {
  const s = (await M.get('/api/state')).json;
  const sub = agent(s, '·sub1');
  assert.ok(sub, JSON.stringify(s.agents.map((a) => a.id)));
  assert.equal(sub.effort, 'medium');
});
test('perTurnEffort is used when effort is absent', async () => {
  const s = (await M.get('/api/state')).json;
  assert.equal(agent(s, 'Claude Code·eff3').effort, 'low');
});
test('a value outside the vocabulary, or none, leaves effort off', async () => {
  const s = (await M.get('/api/state')).json;
  const a = agent(s, 'Claude Code·eff2');
  assert.ok(a); assert.equal('effort' in a, false);
});
