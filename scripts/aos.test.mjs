// Tests for scripts/aos.mjs: `stop` is port-scoped; doctor flags a foreign aos-dash and explains a missing hook log;
// link / unlink touch only their own launchers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AOS = path.join(REPO, 'scripts', 'aos.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aos-test-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

// Fake monitors: a file literally named monitor.mjs, listening on a given port.
const fake = path.join(tmp, 'plugin', 'monitor.mjs');
fs.mkdirSync(path.dirname(fake), { recursive: true });
fs.writeFileSync(fake, "import http from 'node:http'; http.createServer((q,r)=>r.end('ok')).listen(Number(process.env.PORT),'127.0.0.1');");
const free = () => 41000 + Math.floor(Math.random() * 2000);
const pa = free(), pb = pa + 2001;
const kids = [pa, pb].map((p) => spawn(process.execPath, [fake], { env: { ...process.env, PORT: String(p) }, stdio: 'ignore' }));
await sleep(700);
assert.ok(kids.every((k) => alive(k.pid)), 'fake monitors up');
const r = spawnSync(process.execPath, [AOS, 'stop'], { env: { ...process.env, PORT: String(pa) }, encoding: 'utf8' });
await sleep(300);
assert.match(r.stdout, new RegExp(`:${pa} stopped`));
assert.equal(alive(kids[0].pid), false, 'monitor on PORT stopped');
assert.equal(alive(kids[1].pid), true, 'monitor on another port untouched');
kids[1].kill();

// doctor: foreign aos-dash on PATH and missing hook log
// (Windows: no symlinks without admin, so the foreign install is a .cmd shim; os.homedir() reads USERPROFILE)
const WIN = process.platform === 'win32';
const home = path.join(tmp, 'home'); fs.mkdirSync(path.join(home, 'bin'), { recursive: true });
const other = path.join(tmp, 'other-install'); fs.mkdirSync(other);
fs.writeFileSync(path.join(other, 'aos-dash'), '#!/bin/sh\n', { mode: 0o755 });
if (WIN) fs.writeFileSync(path.join(home, 'bin', 'aos-dash.cmd'), `@echo off\r\nnode "${path.join(other, 'aos-dash')}" %*\r\n`);
else fs.symlinkSync(path.join(other, 'aos-dash'), path.join(home, 'bin', 'aos-dash'));
const sysPath = WIN ? [path.join(process.env.SystemRoot || 'C:\\Windows', 'System32')] : ['/usr/bin', '/bin'];
const doctor = (h, dirs) => spawnSync(process.execPath, [AOS, 'doctor'], { env: { HOME: h, USERPROFILE: h, PATH: [...dirs, ...sysPath].join(path.delimiter), PORT: '1' }, encoding: 'utf8' });
const d = doctor(home, [path.join(home, 'bin')]);
assert.match(d.stdout, /different install: .* -> .*other-install[\\/]aos-dash/, 'doctor names what the foreign launcher runs');
assert.match(d.stdout, /normal before your first session/);

// doctor: an aos-dash that reaches this checkout through an alias (junction on Windows, symlink elsewhere) is ours
const alias = path.join(tmp, 'alias'); fs.symlinkSync(REPO, alias, WIN ? 'junction' : 'dir');
try {
  const viaAlias = path.join(alias, 'plugin', 'bin', 'aos-dash');
  const home2 = path.join(tmp, 'home2'); fs.mkdirSync(path.join(home2, 'bin'), { recursive: true });
  if (WIN) fs.writeFileSync(path.join(home2, 'bin', 'aos-dash.cmd'), `@echo off\r\nnode "${viaAlias}" %*\r\n`);
  else fs.symlinkSync(viaAlias, path.join(home2, 'bin', 'aos-dash'));
  const d2 = doctor(home2, [path.join(home2, 'bin')]);
  assert.match(d2.stdout, /aos-dash on PATH \(/, 'aliased checkout recognised as this install');
  assert.doesNotMatch(d2.stdout, /different install/);
} finally { fs.unlinkSync(alias); } // never leave a link into the live checkout behind in the temp folder

// link / unlink: own launchers are replaced and removed; a foreign file is left alone
const bin = path.join(tmp, 'linkbin'), names = WIN ? ['aos-dash', 'aos-dash.cmd'] : ['aos-dash'];
const aos = (c) => spawnSync(process.execPath, [AOS, c], { env: { ...process.env, BIN: bin }, encoding: 'utf8' });
for (let i = 0; i < 2; i++) assert.equal(aos('link').status, 0, 'link (twice: replaces its own launchers)');
assert.ok(names.every((n) => fs.existsSync(path.join(bin, n))), 'launchers written');
assert.match(doctor(home, [bin]).stdout, /aos-dash on PATH \(/, 'doctor reads back the launchers link wrote');
if (WIN) {
  // cmd and PowerShell run the first PATHEXT match on PATH, so a foreign .bat ahead of the shims is what they get
  const early = path.join(tmp, 'early'); fs.mkdirSync(early); fs.writeFileSync(path.join(early, 'aos-dash.bat'), '@echo off\r\n');
  assert.match(doctor(home, [early, bin]).stdout, /different install: .*early[\\/]aos-dash\.bat/, 'doctor checks what cmd runs, not just any .cmd');
}
aos('unlink');
assert.ok(names.every((n) => !fs.existsSync(path.join(bin, n))), 'launchers removed');
fs.writeFileSync(path.join(bin, 'aos-dash'), 'not ours\n');
assert.equal(aos('link').status, 1, 'link refuses to replace a foreign aos-dash');
aos('unlink');
assert.equal(fs.readFileSync(path.join(bin, 'aos-dash'), 'utf8'), 'not ours\n', 'unlink leaves a foreign aos-dash alone');
if (WIN) {
  // Refusal changes nothing: own sh shim + foreign .cmd must leave the sh shim in place
  fs.unlinkSync(path.join(bin, 'aos-dash'));
  assert.equal(aos('link').status, 0);
  const ownSh = fs.readFileSync(path.join(bin, 'aos-dash'), 'utf8');
  fs.writeFileSync(path.join(bin, 'aos-dash.cmd'), '@echo off\r\nrem someone else\r\n');
  assert.equal(aos('link').status, 1, 'link refuses when the .cmd is foreign');
  assert.equal(fs.readFileSync(path.join(bin, 'aos-dash'), 'utf8'), ownSh, 'refusal left the own sh shim untouched');
  assert.match(fs.readFileSync(path.join(bin, 'aos-dash.cmd'), 'utf8'), /someone else/, 'refusal left the foreign .cmd untouched');

  // Both launchers survive a checkout path with non-ASCII and shell-special characters (a copy of this script
  // in such a folder, with a stand-in aos-dash that echoes its arguments; 0x142 is the Polish l with stroke)
  const odd = path.join(tmp, `Micha${String.fromCharCode(0x142)} 100% $x 'q' a&b`);
  fs.mkdirSync(path.join(odd, 'scripts'), { recursive: true }); fs.mkdirSync(path.join(odd, 'plugin', 'bin'), { recursive: true });
  fs.copyFileSync(AOS, path.join(odd, 'scripts', 'aos.mjs'));
  fs.writeFileSync(path.join(odd, 'plugin', 'bin', 'aos-dash'), 'console.log(JSON.stringify(process.argv.slice(2)));\n');
  const oddBin = path.join(tmp, 'oddbin');
  assert.equal(spawnSync(process.execPath, [path.join(odd, 'scripts', 'aos.mjs'), 'link'], { env: { ...process.env, BIN: oddBin }, encoding: 'utf8' }).status, 0);
  const viaCmd = spawnSync('cmd.exe', ['/d', '/c', path.join(oddBin, 'aos-dash.cmd'), 'a b', 'c'], { encoding: 'utf8' });
  assert.match(viaCmd.stdout, /\["a b","c"\]/, `cmd launcher ran the odd path: ${viaCmd.stderr}`);
  const viaSh = spawnSync('sh', [path.join(oddBin, 'aos-dash'), 'a b', 'c'], { encoding: 'utf8' });
  if (!viaSh.error) assert.match(viaSh.stdout, /\["a b","c"\]/, `sh launcher ran the odd path: ${viaSh.stderr}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('aos.mjs: all tests passed');
