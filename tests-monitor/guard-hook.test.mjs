// Opt-in guard auto-verify Stop hook (hooks/aos-guard.mjs): off unless configured, argv-only spawn (no shell), detached, one run per repo.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, tmpDir, sleep } from './harness.mjs';

const TMP = tmpDir('aos-guardhook-'), LIVE = path.join(TMP, 'live'), HOOK = path.join(ROOT, 'hooks', 'aos-guard.mjs');
const REPO = path.join(TMP, 're po;$(touch PWNED)'), OUTSIDE = path.join(TMP, 'outside'), CLI = path.join(TMP, 'fake-cli.mjs'), REC = path.join(TMP, 'argv.ndjson');
let H;
const cfg = (guard) => fs.writeFileSync(path.join(LIVE, 'config.json'), JSON.stringify(guard === undefined ? { stuck_after_s: 180 } : { guard }));
const calls = []; const fakeSpawn = (cmd, args, opts) => { calls.push({ cmd, args, opts }); return { on() {}, unref() {} }; };
const input = (o) => JSON.stringify({ hook_event_name: 'Stop', session_id: 'abc-123', cwd: path.join(REPO, 'src'), ...o });
before(async () => {
  fs.mkdirSync(path.join(REPO, 'src'), { recursive: true }); fs.mkdirSync(OUTSIDE); fs.mkdirSync(LIVE);
  fs.symlinkSync(OUTSIDE, path.join(REPO, 'escape'));
  // fake orchestrator CLI: records its argv and cwd, then sleeps a little (the hook must not wait for it)
  fs.writeFileSync(CLI, `import fs from 'node:fs';\nfs.appendFileSync(${JSON.stringify(REC)}, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }) + '\\n');\nconsole.log('verify output');\nsetTimeout(() => {}, 1200);\n`);
  process.env.AOS_LIVE_DIR = LIVE;
  H = await import(HOOK + '?t=' + Date.now());
});
after(() => { fs.rmSync(TMP, { recursive: true, force: true }); });
const lock = () => H.lockPath(fs.realpathSync(REPO));

test('not configured (or invalid config) -> does nothing', () => {
  for (const g of [undefined, null, {}, { repos: [REPO] }, { repos: [REPO], cli: 'relative/cli.mjs' }, { repos: [REPO], cli: path.join(TMP, 'missing.mjs') }, { repos: ['relative'], cli: CLI }, { repos: [CLI], cli: CLI }, { repos: REPO, cli: CLI }, { repos: [REPO], cli: TMP }]) {
    cfg(g); assert.equal(H.hookMain(input(), fakeSpawn), null, JSON.stringify(g));
  }
  assert.equal(calls.length, 0); assert.ok(!fs.existsSync(path.join(LIVE, 'guard')));
  assert.equal(H.hookMain('not json', fakeSpawn), null);
});

test('configured -> one detached runner, argv array, no shell; second Stop while running is skipped', () => {
  cfg({ repos: [REPO, OUTSIDE + '/../outside'], cli: CLI, timeout_s: 5 });
  const r = H.hookMain(input(), fakeSpawn), repo = fs.realpathSync(REPO);
  assert.ok(r); assert.equal(calls.length, 1);
  const c = calls[0];
  assert.equal(c.cmd, process.execPath);
  assert.deepEqual(c.args.slice(1), ['--run', repo, 'abc-123']);
  assert.equal(c.opts.detached, true); assert.equal(c.opts.shell, false); assert.equal(c.opts.stdio, 'ignore');
  assert.ok(fs.existsSync(lock()));
  assert.equal(H.hookMain(input(), fakeSpawn), null); assert.equal(calls.length, 1);   // concurrent run guard
  assert.match(fs.readFileSync(path.join(LIVE, 'guard', 'guard.log'), 'utf8'), /skip re po;\$\(touch PWNED\): a verify run is already in progress/);
  // the CLI argv the runner will use
  assert.deepEqual(H.planRun(JSON.parse(input()), H.guardConfig({ guard: { repos: [REPO], cli: CLI } })).argv, [fs.realpathSync(CLI), 'verify', '--repo', repo, '--source', 'hook', '--session', 'abc-123']);
  fs.unlinkSync(lock());
});

test('cwd outside the listed repos (also via a symlink out of the repo) -> nothing; bad session id is left out', () => {
  const g = H.guardConfig({ guard: { repos: [REPO], cli: CLI } });
  assert.equal(H.planRun({ cwd: OUTSIDE, session_id: 'x' }, g), null);
  assert.equal(H.planRun({ cwd: path.join(REPO, 'escape'), session_id: 'x' }, g), null);
  assert.equal(H.planRun({ cwd: REPO + '-sibling', session_id: 'x' }, g), null);
  assert.equal(H.planRun({ cwd: 'relative', session_id: 'x' }, g), null);
  assert.ok(!H.planRun({ cwd: REPO, session_id: '$(rm -rf ~)' }, g).argv.includes('--session'));
  cfg({ repos: [REPO], cli: CLI }); const n = calls.length;
  assert.equal(H.hookMain(input({ cwd: OUTSIDE }), fakeSpawn), null); assert.equal(calls.length, n);
});

test('a stale lock (crashed runner) is taken over', () => {
  cfg({ repos: [REPO], cli: CLI, timeout_s: 10 });
  fs.mkdirSync(path.join(LIVE, 'guard'), { recursive: true }); fs.writeFileSync(lock(), '1');
  const old = new Date(Date.now() - 200 * 1000); fs.utimesSync(lock(), old, old);
  assert.ok(H.hookMain(input(), fakeSpawn)); fs.unlinkSync(lock());
});

test('end to end: the hook returns at once, silently; the runner calls the CLI with the exact argv, logs to the data dir, releases the lock', async () => {
  cfg({ repos: [REPO], cli: CLI, timeout_s: 30 });
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [HOOK], { input: input(), env: { ...process.env, AOS_LIVE_DIR: LIVE }, encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 0); assert.equal(r.stdout, ''); assert.equal(r.stderr, '');
  assert.ok(Date.now() - t0 < 1000 + 1500, 'hook waited for the CLI');                  // fake CLI sleeps 1.2 s; node start-up dominates
  let rec = null; for (let i = 0; i < 50 && !rec; i++) { await sleep(100); try { rec = JSON.parse(fs.readFileSync(REC, 'utf8').trim().split('\n').pop()); } catch {} }
  assert.ok(rec, 'cli never ran');
  assert.deepEqual(rec.argv, ['verify', '--repo', fs.realpathSync(REPO), '--source', 'hook', '--session', 'abc-123']);
  assert.equal(rec.cwd, path.join(LIVE, 'guard'));                                        // never runs inside the repo
  assert.ok(!fs.existsSync(path.join(TMP, 'PWNED')) && !fs.existsSync(path.join(REPO, 'PWNED')), 'shell metacharacters were interpreted');
  for (let i = 0; i < 50 && fs.existsSync(lock()); i++) await sleep(100);
  assert.ok(!fs.existsSync(lock()), 'lock not released');
  assert.match(fs.readFileSync(path.join(LIVE, 'guard', 'guard.log'), 'utf8'), /done re po;\$\(touch PWNED\): exit 0 in \d+s/);
  assert.ok(fs.readdirSync(path.join(LIVE, 'guard')).some((f) => /^last-[0-9a-f]{16}\.log$/.test(f)));
  assert.deepEqual(fs.readdirSync(REPO).sort(), ['escape', 'src']);                       // repo untouched
});

test('plugin registers the guard hook on Stop, async', () => {
  const h = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugin', 'hooks', 'hooks.json'), 'utf8')).hooks.Stop[0].hooks;
  const g = h.find((x) => /aos-guard\.mjs/.test(x.command)); assert.ok(g && g.async === true);
});
