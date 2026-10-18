#!/usr/bin/env node
// Regenerates docs/screenshots/*.png (and docs/hero.gif) from a SYNTHETIC demo dataset (scripts/demo-state.mjs).
// The deployed web UI is served by the running monitor; /api/state and /api/history are intercepted in the browser and
// answered from the demo data, so the real page pipeline runs against fictional data. The monitor's data is never touched.
// Needs: the monitor running (make start), playwright-core + a Chromium build, and (for the GIF only) ffmpeg.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildDemoState, buildDemoHistory, DEMO_WINDOW_MS } from './demo-state.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(REPO, 'docs', 'screenshots');
const BASE = process.env.AOS_URL || 'http://127.0.0.1:4318';
const MAX_BYTES = 900 * 1024;
const VIEW = { width: 1600, height: 900 };

function loadPlaywright() {
  const attempts = [
    () => createRequire(path.join(REPO, 'package.json'))('playwright-core'),
    () => process.env.PLAYWRIGHT_PATH && createRequire(path.join(process.env.PLAYWRIGHT_PATH, 'x.js'))(process.env.PLAYWRIGHT_PATH),
  ];
  for (const f of attempts) { try { const m = f(); if (m) return m; } catch {} }
  console.error('playwright-core not found (looked in the repo node_modules and $PLAYWRIGHT_PATH (path to the playwright-core package folder)).\nInstall it with:\n  npm i -D playwright-core && npx playwright-core install chromium');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = { fresh: 0 };
const RUN_NOW = Date.now();

async function newPage(browser, { theme = 'dark', scale = 2, viewport = VIEW } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, colorScheme: theme, reducedMotion: 'no-preference' });
  await ctx.addInitScript((t) => { try { localStorage.setItem('aos.theme', t); localStorage.setItem('aos.dock', 'closed'); } catch {} }, theme);
  await ctx.route('**/api/history*', (r) => r.fulfill({ json: buildDemoHistory() }));
  await ctx.route('**/api/state*', (r) => {
    const u = new URL(r.request().url());
    const at = u.searchParams.get('at');
    if (at) return r.fulfill({ json: buildDemoState('main', { at: Date.parse(at) }) });
    return r.fulfill({ json: buildDemoState('main', { freshAlert: state.fresh || 0, alertBase: RUN_NOW }) });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn('  page error:', e.message));
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForSelector('#g-agents > *', { timeout: 15000 });
  return { page, ctx };
}

// resolves once the DOM has been quiet for 800 ms (clocks and the "updated" label are ignored)
async function settle(page, quiet = 800, max = 8000) {
  await page.evaluate(({ quiet, max }) => new Promise((resolve) => {
    let t = setTimeout(done, quiet); const hard = setTimeout(done, max);
    const mo = new MutationObserver((ms) => {
      if (ms.every((m) => m.target.closest && m.target.closest('#mission-clock,#utc-clock,#updated,.clock'))) return;
      clearTimeout(t); t = setTimeout(done, quiet);
    });
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    function done() { mo.disconnect(); clearTimeout(hard); resolve(); }
  }), { quiet, max });
}

async function setDock(page, open) {
  const cur = (await page.getAttribute('#dock-toggle', 'aria-expanded')) === 'true';
  if (cur !== open) await page.click('#dock-toggle');
}

const idOf = (page, prefix) => page.evaluate((p) => window.AosApp.getState().agents.find((a) => a.id.startsWith(p)).id, prefix);

// each shot: [file, theme, prep(page)]
const SHOTS = [
  ['01-graph-dark.png', 'dark', async () => {}],
  ['02-graph-light.png', 'light', async () => {}],
  ['03-agent-drawer-dark.png', 'dark', async (page) => {
    const id = await idOf(page, 'Add rate limiting');
    await page.evaluate((i) => window.AosApp.selectAgent(i), id);
  }],
  ['04-project-drawer-dark.png', 'dark', async (page) => { await page.evaluate(() => window.AosApp.selectProject('web-storefront')); }],
  ['05-conflict-and-alerts-dark.png', 'dark', async (page) => {
    state.fresh = Date.now(); await sleep(2600); // next 2 s poll delivers a fresh alert -> toast
    await page.click('#conflict-chip');
    await sleep(700);
    return 'noSettle'; // the toast lives 8 s: capture right away
  }],
  ['06-replay-dark.png', 'dark', async (page) => {
    await page.click('.aos-replay-btn');
    await page.waitForSelector('.aos-track');
    const b = await page.locator('.aos-track').boundingBox();
    await page.mouse.click(b.x + b.width * 0.55, b.y + b.height / 2);
    await sleep(1200);
  }],
  ['07-telemetry-dark.png', 'dark', async (page) => { await setDock(page, true); }],
];

async function takePng(browser, file, theme, prep) {
  for (const scale of [2, 1.5, 1.25]) {
    state.fresh = 0;
    const { page, ctx } = await newPage(browser, { theme, scale });
    try {
      await settle(page);
      const r = await prep(page);
      if (r !== 'noSettle') await settle(page);
      const buf = await page.screenshot({ type: 'png' });
      if (buf.length <= MAX_BYTES || scale === 1.25) {
        fs.writeFileSync(path.join(OUT, file), buf);
        console.log(`  ${file}  ${(buf.length / 1024).toFixed(0)} KB  (dsf ${scale})`);
        return;
      }
    } finally { await ctx.close(); }
  }
}

// ------------------------------------------------------------- terminal shot
function ansiToHtml(text) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let out = '', open = false;
  for (const part of text.split(/(\x1b\[[0-9;]*m)/)) {
    const m = /^\x1b\[([0-9;]*)m$/.exec(part);
    if (!m) { out += esc(part); continue; }
    if (open) { out += '</span>'; open = false; }
    const codes = m[1].split(';').map(Number);
    if (codes.length === 1 && (codes[0] === 0 || Number.isNaN(codes[0]))) continue;
    let style = '', i = 0;
    while (i < codes.length) {
      if (codes[i] === 1) style += 'font-weight:700;';
      else if (codes[i] === 38 && codes[i + 1] === 2) { style += `color:rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]});`; i += 4; }
      i++;
    }
    out += `<span style="${style}">`; open = true;
  }
  return out + (open ? '</span>' : '');
}

async function terminalShot(browser) {
  const { render } = await import(pathToFileURL(path.join(REPO, 'cli', 'dash.mjs')).href);
  const text = render(buildDemoState('main'), 150, 44, { color: 'true', view: 'auto' });
  const html = `<!doctype html><meta charset=utf-8><body style="margin:0;background:#2b2f3a;width:1400px;padding:36px 0;display:flex;justify-content:center">
<div style="width:1352px;border-radius:12px;overflow:hidden;background:#0e1014;box-shadow:0 20px 60px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.08)">
<div style="height:38px;background:#1b1e26;display:flex;align-items:center;padding:0 14px;gap:8px;position:relative">
<i style="width:12px;height:12px;border-radius:50%;background:#ff5f57"></i><i style="width:12px;height:12px;border-radius:50%;background:#febc2e"></i><i style="width:12px;height:12px;border-radius:50%;background:#28c840"></i>
<span style="position:absolute;left:0;right:0;text-align:center;color:#8b909c;font:13px -apple-system,'Helvetica Neue',sans-serif">aos-dash — 150×44</span></div>
<pre style="margin:0;padding:14px 8px 16px;font:15px/1.22 Menlo,'SF Mono',Monaco,'DejaVu Sans Mono',monospace;color:#e8e1d2;letter-spacing:0;white-space:pre;overflow:hidden">${ansiToHtml(text)}</pre></div>`;
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setContent(html);
  await sleep(300);
  const buf = await page.screenshot({ type: 'png', fullPage: true });
  fs.writeFileSync(path.join(OUT, '08-terminal.png'), buf);
  console.log(`  08-terminal.png  ${(buf.length / 1024).toFixed(0)} KB`);
  await ctx.close();
}

// ------------------------------------------------------------------- hero gif
async function heroGif(browser) {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); }
  catch { console.log('  hero.gif skipped: ffmpeg not found on PATH (brew install ffmpeg)'); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aos-gif-'));
  const { page, ctx } = await newPage(browser, { theme: 'dark', scale: 1, viewport: { width: 1280, height: 720 } });
  try {
    await settle(page);
    const FPS = 12, SECS = 7;
    let n = 0; const t0 = Date.now();
    while (n < FPS * SECS) {
      const target = t0 + (n * 1000) / FPS;
      const wait = target - Date.now(); if (wait > 0) await sleep(wait);
      fs.writeFileSync(path.join(tmp, `frame_${String(n).padStart(4, '0')}.png`), await page.screenshot({ type: 'png' }));
      n++;
    }
    const realFps = (n / ((Date.now() - t0) / 1000)).toFixed(2);
    const out = path.join(REPO, 'docs', 'hero.gif');
    for (const w of [960, 800, 640]) {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', realFps, '-i', path.join(tmp, 'frame_%04d.png'), '-vf',
        `fps=${Math.min(12, Math.floor(realFps))},scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
        '-loop', '0', out]);
      const size = fs.statSync(out).size;
      console.log(`  hero.gif  ${(size / 1024 / 1024).toFixed(2)} MB  (${w}px, captured at ${realFps} fps)`);
      if (size < 6 * 1024 * 1024) break;
    }
  } finally { await ctx.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ----------------------------------------------------------------------- main
async function main() {
  try { const r = await fetch(BASE + '/'); if (!r.ok) throw new Error(r.status); }
  catch (e) { console.error(`The web UI is not reachable at ${BASE} (${e.message}). Start the monitor first: make start`); process.exit(1); }
  const pw = loadPlaywright();
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await pw.chromium.launch();
  try {
    console.log('Screenshots (synthetic demo data):');
    for (const [file, theme, prep] of SHOTS) await takePng(browser, file, theme, prep);
    await terminalShot(browser);
    await heroGif(browser);
  } finally { await browser.close(); }
  console.log('Done: docs/screenshots/ (+ docs/hero.gif).');
}
main().catch((e) => { console.error(e); process.exit(1); });
