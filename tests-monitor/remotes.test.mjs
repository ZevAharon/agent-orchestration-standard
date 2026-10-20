// Cross-machine: target validation, merge/namespacing, size cap, offline/backoff (fake runner, no real ssh), plus a two-monitor
// integration run through a fake `ssh` shim on PATH that just curls 127.0.0.1.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateRemote, parseRemotes, sshArgv, parseState, createCollector, mergeState, sshRunner } from '../remotes.mjs';
import { hookEv, sleep, tmpDir, startMonitor } from './harness.mjs';

const ok = { name: 'laptop2', ssh: 'me@host.example.com', port: 4318 };
test('validateRemote accepts normal targets', () => {
  assert.deepEqual(validateRemote(ok), ok);
  assert.equal(validateRemote({ name: 'a', ssh: '10.0.0.5' }).port, 4318);
  assert.equal(validateRemote({ name: 'a', ssh: 'ssh-alias_1' }).ssh, 'ssh-alias_1');
});
test('validateRemote rejects injection attempts', () => {
  const bad = ['-oProxyCommand=evil', '-v', 'a b', 'me@host;rm -rf /', 'me@host$(id)', 'me@host`id`', 'me@host|x', 'me@host&x', 'me@host\nx', "me@ho'st", 'me@-host', '@host', 'me@', 'a@b@c', 'ho..st', '', 'host/../x', 'me@host:22', '$HOME', 'a>b', '--help'];
  for (const ssh of bad) assert.throws(() => validateRemote({ name: 'x', ssh }), /ssh|target/, ssh);
  for (const name of ['', '-x', 'a b', 'a:b', 'local', 'LOCAL', 'x'.repeat(33), '<b>', 5]) assert.throws(() => validateRemote({ name, ssh: 'h' }), undefined, String(name));
  for (const port of [0, 70000, 1.5, '4318', '4318; id', -1, NaN, null]) assert.throws(() => validateRemote({ name: 'x', ssh: 'h', port }), /port/, String(port));
  for (const r of [null, 'x', [], 5]) assert.throws(() => validateRemote(r));
});
test('parseRemotes keeps valid, drops invalid/duplicate with warnings', () => {
  const w = [];
  const l = parseRemotes([ok, { name: 'bad', ssh: '-x' }, { ...ok, ssh: 'other' }, { name: 'b', ssh: 'h', port: 1 }], (m) => w.push(m));
  assert.deepEqual(l.map((r) => r.name), ['laptop2', 'b']); assert.equal(w.length, 2);
  assert.deepEqual(parseRemotes(undefined), []); assert.deepEqual(parseRemotes('x', () => {}), []);
});
test('ssh argv is a plain array, target after --, port numeric', () => {
  const a = sshArgv(ok);
  assert.deepEqual(a.slice(0, 5), ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', '--']);
  assert.equal(a[5], ok.ssh); assert.match(a[6], /^curl -sf --max-time 4 'http:\/\/127\.0\.0\.1:4318\/api\/state\?local=1'$/);
});

const mk = (extra = {}) => ({ agents: [{ id: 'Claude Code·ab12', status: 'running', project: 'proj', project_id: 'proj', current_task: null }, { id: 'sub·cd34', status: 'idle', project: 'proj', project_id: 'proj', current_task: 't-sub·cd34', goal_id: 'g1' }],
  tasks: [{ id: 't-sub·cd34', goal_id: 'live-goal', assignee: 'sub·cd34', depends_on: ['t-x'] }], projects: [{ id: 'proj', name: 'proj', agents: ['Claude Code·ab12', 'sub·cd34'] }],
  alerts: [{ ts: '2026-01-01T00:00:02Z', agent: 'sub·cd34', project: 'proj', kind: 'stuck' }], collisions: [{ file: 'a/b.js', agents: ['sub·cd34', 'Claude Code·ab12'] }],
  events: [{ ts: '2026-01-01T00:00:01Z', seq: 0, actor: 'sub·cd34', task_id: 't-sub·cd34', goal_id: 'g1' }, { ts: '2026-01-01T00:00:03Z', seq: 1, actor: 'human' }],
  goals: [{ id: 'g1', title: 'T' }], cost: { total_usd_est: 1.5, tokens_total: 100, by_model: { m1: { input: 1, output: 2, cache_read: 3, cache_write: 4, usd_est: 1.5 } } }, server_time: '2026-01-01T00:00:05Z', ...extra });
const local = () => ({ agents: [{ id: 'Claude Code·ab12', status: 'running', project: 'proj', project_id: 'proj' }], tasks: [], projects: [{ id: 'proj', name: 'proj', agents: ['Claude Code·ab12'] }],
  alerts: [], collisions: [], events: [{ ts: '2026-01-01T00:00:02Z', seq: 0, actor: 'human' }], goals: [], goal: { id: 'live-goal' }, server_time: '2026-01-01T00:00:06Z',
  cost: { total_usd_est: 0.5, tokens_total: 50, by_model: { m1: { input: 10, output: 0, cache_read: 0, cache_write: 0, usd_est: 0.5 } } } });
const snap = (data, o = {}) => ({ name: 'laptop2', ok: true, last_seen: '2026-01-01T00:00:05Z', data: parseState(JSON.stringify(data)), ...o });

test('merge: tags machines, namespaces ids, no collisions, aggregates totals', () => {
  const m = mergeState(local(), [snap(mk())]);
  assert.equal(m.agents.length, 3);
  assert.equal(m.agents[0].machine, 'local'); assert.equal(m.agents[0].id, 'Claude Code·ab12');
  const ids = m.agents.map((a) => a.id); assert.equal(new Set(ids).size, 3);
  const r = m.agents.find((a) => a.id === 'laptop2:sub·cd34');
  assert.equal(r.machine, 'laptop2'); assert.equal(r.current_task, 'laptop2:t-sub·cd34'); assert.equal(r.goal_id, 'laptop2:g1'); assert.equal(r.project, 'proj @laptop2'); assert.equal(r.project_id, 'laptop2:proj');
  assert.equal(m.agents.find((a) => a.id === 'laptop2:Claude Code·ab12').current_task, undefined);
  assert.deepEqual(m.tasks[0] && m.tasks[0].machine, 'laptop2'); assert.equal(m.tasks[0].assignee, 'laptop2:sub·cd34'); assert.deepEqual(m.tasks[0].depends_on, ['laptop2:t-x']);
  const p = m.projects.find((x) => x.machine === 'laptop2'); assert.deepEqual(p.agents, ['laptop2:Claude Code·ab12', 'laptop2:sub·cd34']);
  assert.equal(m.alerts.find((a) => a.machine === 'laptop2').agent, 'laptop2:sub·cd34');
  assert.deepEqual(m.collisions[0].agents, ['laptop2:sub·cd34', 'laptop2:Claude Code·ab12']);
  const ev = m.events.filter((e) => e.machine === 'laptop2'); assert.equal(ev[0].actor, 'laptop2:sub·cd34'); assert.equal(ev[1].actor, 'human');
  assert.deepEqual(m.events.map((e) => e.seq), [0, 1, 2]);
  assert.equal(m.goals[0].id, 'laptop2:g1');
  assert.equal(m.cost.tokens_total, 150); assert.equal(m.cost.total_usd_est, 2); assert.equal(m.cost.by_model.m1.input, 11);
  assert.deepEqual(m.cost.by_machine, { local: { tokens_total: 50, total_usd_est: 0.5 }, laptop2: { tokens_total: 100, total_usd_est: 1.5 } });
  assert.deepEqual(m.machines.map((x) => [x.name, x.ok, x.totals.agents]), [['local', true, 1], ['laptop2', true, 2]]);
  assert.equal(m.totals.agents, 3); assert.equal(m.totals.running, 2); assert.equal(m.totals.machines, 2);
});
test('merge: no remotes -> local only, input not mutated', () => {
  const l = local(), m = mergeState(l, []);
  assert.equal(m.machines.length, 1); assert.equal(m.agents[0].machine, 'local'); assert.equal(l.agents[0].machine, undefined); assert.deepEqual(m.goals, []);
});
test('merge: offline machine reported, its stale-expired data omitted; error shown', () => {
  const m = mergeState(local(), [{ name: 'laptop2', ok: false, last_seen: null, error: 'timed out', data: null }]);
  assert.equal(m.agents.length, 1); assert.deepEqual(m.machines[1], { name: 'laptop2', ok: false, last_seen: null, error: 'timed out', totals: m.machines[1].totals }); assert.equal(m.machines[1].totals.agents, 0);
});
test('merge: hostile remote data cannot pollute prototypes or break shape', () => {
  const evil = mk({ cost: { by_model: JSON.parse('{"__proto__":{"input":9},"x":5}'), tokens_total: 'lots' }, agents: [5, null, { id: 7 }, { id: '<img src=x onerror=1>', status: 'running' }] });
  const m = mergeState(local(), [snap(evil)]);
  assert.equal({}.input, undefined); assert.equal(m.agents.length, 2); assert.equal(m.agents[1].id, 'laptop2:<img src=x onerror=1>'); assert.equal(m.cost.tokens_total, 50);
});

test('parseState: size cap, bad JSON, wrong shape', () => {
  assert.throws(() => parseState('x'.repeat(101), 100), /too large/);
  assert.throws(() => parseState('{nope'), /invalid JSON/);
  assert.throws(() => parseState('[]'), /not an AOS state/); assert.throws(() => parseState('{"agents":5}'), /not an AOS state/);
  assert.equal(parseState(JSON.stringify({ agents: Array.from({ length: 5000 }, (_, i) => ({ id: 'a' + i })) })).agents.length, 2000);
});
test('sshRunner maps child errors (maxBuffer, timeout, enoent, exit)', async () => {
  const run = (err, stderr = '') => sshRunner((b, a, o, cb) => cb(err, '', stderr))([]);
  await assert.rejects(run(Object.assign(new Error('x'), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' })), /too large/);
  await assert.rejects(run(Object.assign(new Error('x'), { killed: true })), /timed out/);
  await assert.rejects(run(Object.assign(new Error('x'), { code: 'ENOENT' })), /not found/);
  await assert.rejects(run(Object.assign(new Error('x'), { code: 255 }), 'Permission denied (publickey).\nmore'), /exit 255\): Permission denied/);
});

test('collector: poll success, failure with exponential backoff, recovery', async () => {
  let t = 1000, mode = 'ok', calls = 0, argvSeen;
  const run = async (argv) => { calls++; argvSeen = argv; if (mode === 'fail') throw new Error('ssh failed (exit 255): denied'); if (mode === 'big') return 'x'.repeat(200); return JSON.stringify(mk()); };
  const c = createCollector({ remotes: [ok], run, now: () => t, intervalMs: 5000, maxBackoffMs: 60000, maxBytes: 100000 });
  await c.tick(); assert.equal(calls, 1); assert.deepEqual(argvSeen, sshArgv(ok));
  let s = c.snapshot()[0]; assert.equal(s.ok, true); assert.equal(s.data.agents.length, 2); assert.equal(s.error, undefined);
  t += 1000; await c.tick(); assert.equal(calls, 1, 'not due yet');
  t += 5000; mode = 'fail'; await c.tick(); assert.equal(calls, 2);
  s = c.snapshot()[0]; assert.equal(s.ok, false); assert.match(s.error, /denied/); assert.ok(s.data, 'recent data still served briefly');
  const delays = [];
  for (let i = 0; i < 6; i++) { const before = calls; t += 1; await c.tick(); assert.equal(calls, before, 'backoff holds'); const n = c.snapshot()[0].next_in_s; delays.push(n); t += n * 1000 + 1000; await c.tick(); assert.equal(calls, before + 1); }
  assert.ok(delays[1] > delays[0] && delays[delays.length - 1] <= 60, 'grows, capped: ' + delays);
  t += 120000; mode = 'ok'; await c.tick(); s = c.snapshot()[0]; assert.equal(s.ok, true); assert.equal(s.fails, 0);
});
test('collector: oversized response is an error, not data; stale data expires', async () => {
  let t = 0, body = 'x'.repeat(6000);
  const c = createCollector({ remotes: [ok], run: async () => body, now: () => t, maxBytes: 5000 });
  await c.tick(); let s = c.snapshot()[0]; assert.equal(s.ok, false); assert.match(s.error, /too large/); assert.equal(s.data, null);
  body = JSON.stringify(mk()); t += 10 * 60000; await c.tick(); assert.equal(c.snapshot()[0].ok, true);
  body = 'garbage'; t += 10 * 60000; await c.tick(); t += 30000; assert.equal(c.snapshot()[0].data, null, 'stale data dropped after expiry');
});

// ---- integration: two real monitors, remote reached through a fake ssh shim ----
test('integration: aggregated /api/state through a fake ssh shim', async () => {
  const TMP = tmpDir('aos-xmach-');
  const bin = path.join(TMP, 'bin'); fs.mkdirSync(bin);
  // fake ssh: ssh -o .. -o .. -- <host> "<cmd>"  -> run the cmd's URL locally with curl (the "remote" is just another local monitor)
  fs.writeFileSync(path.join(bin, 'ssh'), '#!/bin/sh\nwhile [ "$1" != "--" ]; do shift; done; shift; host="$1"; shift\necho "$host" >> "' + path.join(TMP, 'ssh-hosts') + '"\nurl=$(printf %s "$1" | sed "s/.*\'\\(http[^\']*\\)\'.*/\\1/")\nexec curl -sf --max-time 4 "$url"\n', { mode: 0o755 });
  const mkLive = (name, sid) => { const live = path.join(TMP, name + '-live'), orch = path.join(TMP, name + '-orch'); fs.mkdirSync(live, { recursive: true }); fs.mkdirSync(orch, { recursive: true });
    fs.writeFileSync(path.join(live, 'hook-events.ndjson'), hookEv({ ev: 'SessionStart', sid, cwd: name, cwdp: '/tmp/x/' + name }) + hookEv({ ev: 'UserPromptSubmit', sid, cwd: name, cwdp: '/tmp/x/' + name })); return { live, orch }; };
  const R = await startMonitor({ ...mkLive('remote', 'rem1aaaa') });
  const env = { PATH: bin + path.delimiter + process.env.PATH, AOS_REMOTES: JSON.stringify([{ name: 'laptop2', ssh: 'me@box.example', port: R.port }, { name: 'dead', ssh: 'me@nowhere', port: 1 }]) };
  const L = await startMonitor({ ...mkLive('local', 'loc1aaaa'), env });
  try {
    let st; for (let i = 0; i < 40; i++) { await sleep(500); st = (await L.get('/api/state')).json; if (st.machines.find((m) => m.name === 'laptop2' && m.ok)) break; }
    const mm = Object.fromEntries(st.machines.map((m) => [m.name, m]));
    assert.equal(mm.local.ok, true); assert.equal(mm.laptop2.ok, true, JSON.stringify(st.machines));
    assert.equal(mm.dead.ok, false); assert.ok(mm.dead.error);
    assert.ok(st.agents.some((a) => a.machine === 'local')); assert.ok(st.agents.some((a) => a.machine === 'laptop2' && a.id.startsWith('laptop2:')));
    assert.equal(st.totals.agents, st.agents.length); assert.equal(new Set(st.agents.map((a) => a.id)).size, st.agents.length);
    assert.ok(fs.readFileSync(path.join(TMP, 'ssh-hosts'), 'utf8').includes('me@box.example'));
    const raw = (await L.get('/api/state?local=1')).json; assert.equal(raw.machines, undefined, 'local=1 is never re-aggregated');
    assert.ok(raw.agents.every((a) => a.machine === undefined));
  } finally { await L.stop(); await R.stop(); fs.rmSync(TMP, { recursive: true, force: true }); }
});
