#!/usr/bin/env node
// Measures monitor.mjs CPU% and RSS: idle, idle with one dashboard polling, and under a synthetic hook-event load.
// Starts a TEST monitor on a spare port with a temp data dir; never touches a running monitor or ~/.claude.
// Usage: node scripts/overhead.mjs [--port 4399] [--secs 30] [--rate 50]
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const PORT = arg('port', 4399), SECS = arg('secs', 30), RATE = arg('rate', 50);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aos-overhead-'));
const live = path.join(tmp, 'live'); fs.mkdirSync(live, { recursive: true });
const FILE = path.join(live, 'hook-events.ndjson');
fs.writeFileSync(FILE, '');
const child = spawn(process.execPath, [path.join(ROOT, 'monitor.mjs')], {
  env: { ...process.env, PORT: String(PORT), AOS_LIVE_DIR: live, AOS_ORCH_DIR: path.join(tmp, 'orch'), CLAUDE_PLUGIN_DATA: tmp, AOS_NOTIFY_DRY: '1' },
  stdio: 'ignore',
});
const cleanup = () => { try { child.kill('SIGKILL'); } catch {} fs.rmSync(tmp, { recursive: true, force: true }); };
process.on('SIGINT', () => { cleanup(); process.exit(1); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ps = () => ({ rssMb: Number(execFileSync('ps', ['-o', 'rss=', '-p', String(child.pid)]).toString()) / 1024 });
// CPU% from cumulative CPU-time deltas (ps time=, 10 ms resolution), not ps %cpu, which is a lifetime average
const cpuSecs = () => execFileSync('ps', ['-o', 'time=', '-p', String(child.pid)]).toString().trim().split(':').map(Number).reduce((a, v) => a * 60 + v, 0);

const EVS = ['PreToolUse', 'PostToolUse'], TOOLS = ['Read', 'Edit', 'Bash', 'Grep', 'Write'];
let n = 0;
function line() {
  n++;
  const sid = 's' + (n % 6).toString().padStart(7, '0'), proj = 'proj' + (n % 3);
  const r = { ts: new Date().toISOString(), ev: EVS[n % 2], sid, cwd: proj, cwdp: '/tmp/aos-overhead/' + proj, tool: TOOLS[n % TOOLS.length], sum: 'file' + (n % 20) + '.js' };
  if (r.tool === 'Edit' || r.tool === 'Write') r.f = r.cwdp + '/file' + (n % 20) + '.js';
  return JSON.stringify(r) + '\n';
}

async function ready() { for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/state`); return; } catch { await sleep(200); } } throw new Error('monitor did not start'); }

// one phase: optional dashboard poll (every 2 s, like POLL_MS in ui/app.js), optional event writer at RATE/s; samples RSS each second
async function phase(name, { poll, rate }) {
  const c0 = cpuSecs(), t0 = Date.now(), rss = []; let reqs = 0, lat = [];
  const pt = poll ? setInterval(async () => { const s = performance.now(); try { await (await fetch(`http://127.0.0.1:${PORT}/api/state`)).text(); lat.push(performance.now() - s); reqs++; } catch {} }, 2000) : null;
  const wt = rate ? setInterval(() => { let b = ''; for (let i = 0; i < rate / 10; i++) b += line(); fs.appendFileSync(FILE, b); }, 100) : null;
  const st = setInterval(() => rss.push(ps().rssMb), 1000);
  await sleep(SECS * 1000);
  clearInterval(pt); clearInterval(wt); clearInterval(st);
  const wall = (Date.now() - t0) / 1000, cpu = (cpuSecs() - c0) / wall * 100;
  lat.sort((a, b) => a - b);
  return { name, cpuPct: +cpu.toFixed(2), rssMbMax: +Math.max(...rss).toFixed(1), rssMbEnd: +rss.at(-1).toFixed(1), reqs, p95ms: lat.length ? +lat[Math.floor(lat.length * 0.95)].toFixed(1) : null };
}

try {
  await ready(); await sleep(2000);
  const out = [];
  out.push(await phase('idle (no client)', {}));
  out.push(await phase('idle + 1 dashboard polling /api/state every 2 s', { poll: true }));
  out.push(await phase(`loaded: ${RATE} events/s + 1 dashboard`, { poll: true, rate: RATE }));
  console.log(`machine: ${os.cpus()[0].model}, ${os.cpus().length} cores, ${(os.totalmem() / 2 ** 30).toFixed(0)} GB, ${os.platform()} ${os.release()}`);
  console.log(`node ${process.version}, ${SECS}s per phase, events written: ${n}, final log size: ${(fs.statSync(FILE).size / 1024).toFixed(0)} KB`);
  console.table(out);
} finally { cleanup(); }
