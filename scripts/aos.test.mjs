// Tests for scripts/aos.mjs: `stop` is port-scoped; doctor flags a foreign aos-dash and explains a missing hook log.
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
const home = path.join(tmp, 'home'); fs.mkdirSync(path.join(home, 'bin'), { recursive: true });
const other = path.join(tmp, 'other-install'); fs.mkdirSync(other);
fs.writeFileSync(path.join(other, 'aos-dash'), '#!/bin/sh\n', { mode: 0o755 });
fs.symlinkSync(path.join(other, 'aos-dash'), path.join(home, 'bin', 'aos-dash'));
const d = spawnSync(process.execPath, [AOS, 'doctor'], { env: { HOME: home, PATH: `${path.join(home, 'bin')}:/usr/bin:/bin`, PORT: '1' }, encoding: 'utf8' });
assert.match(d.stdout, /different install:.*other-install\/aos-dash/);
assert.match(d.stdout, /normal before your first session/);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('aos.mjs: all tests passed');
