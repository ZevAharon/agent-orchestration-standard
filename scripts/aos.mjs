#!/usr/bin/env node
// Helper for the Makefile: doctor / link / unlink / statusline / statusline-off.
// Zero dependencies. Every change to user config makes a timestamped backup first and is reversible.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = os.homedir();
const PLUGIN_ID = 'aos-dashboard@aos-local';
const DATA = path.join(HOME, '.claude', 'plugins', 'data', 'aos-dashboard-aos-local');
const SETTINGS = path.join(HOME, '.claude', 'settings.json');
const BIN = process.env.BIN || path.join(HOME, '.local', 'bin');
const PORT = Number(process.env.PORT || process.env.AOS_PORT) || 4318;
const STATUSLINE_CMD = `node "${path.join(REPO, 'plugin', 'bin', 'aos-statusline.mjs')}"`;

const ok = (s) => console.log(`  ✓ ${s}`), bad = (s) => console.log(`  ✗ ${s}`), warn = (s) => console.log(`  ! ${s}`);
const run = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 }); } catch (e) { return null; } };
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const stamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
function backup(f) { if (fs.existsSync(f)) { const b = `${f}.bak-aos-${stamp()}`; fs.copyFileSync(f, b); return b; } return null; }
function probe(timeout = 800) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/api/state', timeout }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('timeout', () => { req.destroy(); resolve(false); }); req.on('error', () => resolve(false));
  });
}

async function doctor() {
  let essential = 0;
  console.log('AOS doctor\n');
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  nodeMajor >= 18 ? ok(`node ${process.versions.node}`) : (bad(`node ${process.versions.node} (need 18 or newer)`), essential++);
  const ver = run('claude', ['--version']);
  ver ? ok(`claude CLI ${ver.trim()}`) : (bad('claude CLI not found on PATH (install Claude Code first)'), essential++);
  const list = ver ? run('claude', ['plugin', 'list']) : null;
  if (list && list.includes('aos-dashboard') && /enabled/.test(list.split('aos-dashboard')[1] || '')) ok(`plugin ${PLUGIN_ID} installed and enabled`);
  else { bad(`plugin ${PLUGIN_ID} not installed (run: make install)`); essential++; }
  const settings = readJSON(SETTINGS);
  settings && settings.extraKnownMarketplaces && settings.extraKnownMarketplaces['aos-local'] ? ok('marketplace aos-local registered') : warn('marketplace aos-local not registered');
  const hooksLog = path.join(DATA, 'live', 'hook-events.ndjson');
  if (fs.existsSync(hooksLog)) { const age = (Date.now() - fs.statSync(hooksLog).mtimeMs) / 3600000; age < 24 ? ok(`hooks are logging (last event ${age < 1 ? Math.round(age * 60) + ' min' : age.toFixed(1) + ' h'} ago)`) : warn(`hook log is ${age.toFixed(0)} h old: open a NEW Claude Code session (existing ones keep their old hooks; or /reload-plugins)`); }
  else warn('no hook log yet: normal before your first session. Start a new Claude Code session and it appears');
  (await probe()) ? ok(`monitor reachable at http://127.0.0.1:${PORT}`) : warn(`monitor not running on :${PORT} (it starts with a session, or: make start)`);
  const onPath = run('which', ['aos-dash']);
  if (!onPath) warn('aos-dash not on PATH (make link)');
  else {
    const found = onPath.trim(); let real = found; try { real = fs.realpathSync(found); } catch {}
    let repoReal = REPO; try { repoReal = fs.realpathSync(REPO); } catch {}
    const mine = path.join(repoReal, 'plugin', 'bin') + path.sep;
    real.startsWith(mine) ? ok(`aos-dash on PATH (${found})`) : warn(`aos-dash on PATH is a different install: ${found} -> ${real} (not in this checkout ${REPO}; run: make link)`);
  }
  settings && settings.statusLine && String(settings.statusLine.command || '').includes('aos-statusline') ? ok('status line configured') : warn('status line not configured (optional: make statusline)');
  fs.existsSync(path.join(DATA, 'AOS Notifier.app')) ? ok('notifier app built (branded macOS alerts)') : warn('notifier app not built (optional: make notifier)');
  console.log(essential ? `\n${essential} essential problem(s).` : '\nAll essentials OK.');
  process.exit(essential ? 1 : 0);
}

// Stop only the AOS monitor listening on PORT (never other monitors).
async function stop() {
  const pids = (run('lsof', ['-ti', `tcp:${PORT}`, '-sTCP:LISTEN']) || '').split('\n').filter(Boolean);
  const mine = pids.filter((p) => /monitor\.mjs/.test(run('ps', ['-p', p, '-o', 'command=']) || ''));
  if (!mine.length) { console.log(`monitor was not running on :${PORT}`); return; }
  for (const p of mine) { try { process.kill(Number(p)); } catch {} }
  for (let i = 0; i < 20 && mine.some((p) => { try { process.kill(Number(p), 0); return true; } catch { return false; } }); i++) await new Promise((r) => setTimeout(r, 100));
  console.log(`monitor on :${PORT} stopped (other AOS monitors left alone)`);
}

function link() {
  const src = path.join(REPO, 'plugin', 'bin', 'aos-dash'), dst = path.join(BIN, 'aos-dash');
  if (!fs.existsSync(src)) { bad(`missing ${src} (run: make build)`); process.exit(1); }
  fs.mkdirSync(BIN, { recursive: true });
  try { if (!fs.lstatSync(dst).isSymbolicLink()) { bad(`${dst} exists and is not a symlink: left alone`); process.exit(1); } fs.unlinkSync(dst); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  fs.symlinkSync(src, dst); ok(`linked ${dst} -> ${src}`);
  if (!(process.env.PATH || '').split(':').includes(BIN)) warn(`${BIN} is not on your PATH. Add this line to your shell profile (~/.zshrc or ~/.bashrc):\n      export PATH="${BIN === path.join(HOME, '.local', 'bin') ? '$HOME/.local/bin' : BIN}:$PATH"`);
}
function unlink() { const dst = path.join(BIN, 'aos-dash'); try { if (fs.lstatSync(dst).isSymbolicLink()) { fs.unlinkSync(dst); ok(`removed ${dst}`); } else warn(`${dst} is not a symlink: left alone`); } catch { ok('aos-dash link not present'); } }

function statusline(on) {
  const s = readJSON(SETTINGS);
  if (!s) { bad(`cannot read ${SETTINGS}`); process.exit(1); }
  if (on) {
    if (s.statusLine && !String(s.statusLine.command || '').includes('aos-statusline')) { warn(`you already have a different status line (${JSON.stringify(s.statusLine)}): left alone`); return; }
    const b = backup(SETTINGS); s.statusLine = { type: 'command', command: STATUSLINE_CMD };
    fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n'); ok(`status line enabled (backup: ${b})`);
  } else {
    if (!s.statusLine || !String(s.statusLine.command || '').includes('aos-statusline')) { ok('status line is not ours: nothing to remove'); return; }
    const b = backup(SETTINGS); delete s.statusLine; fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n'); ok(`status line removed (backup: ${b})`);
  }
}

const cmd = process.argv[2];
({ doctor, stop, link, unlink, statusline: () => statusline(true), 'statusline-off': () => statusline(false) }[cmd] || (() => { console.error('usage: aos.mjs doctor|stop|link|unlink|statusline|statusline-off'); process.exit(2); }))();
