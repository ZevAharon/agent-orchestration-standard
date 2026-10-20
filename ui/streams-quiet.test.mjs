// node ui/streams-quiet.test.mjs : STREAMS FULL/QUIET/LINES. (1) particles.js: per-edge particle counts idle vs running/stalled/errored in both
// modes, switching live, reduced-motion; (2) app.js toggle: default FULL, localStorage 'aos.streams' read/write (and throwing storage), Q key.
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm'; import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url)); let fails = 0;
const ok = (n, c, i) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };

function mkEl(tag) {
  const el = { tagName: tag, style: {}, attrs: {}, width: 0, height: 0, children: [], listeners: {}, textContent: '', title: '', parentNode: null, nextSibling: null,
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    insertBefore(c) { this.children.push(c); }, appendChild(c) { this.children.push(c); },
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 600 }; },
    getScreenCTM() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
    getContext() { return new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } }); },
    querySelector() { return label; } };
  return el;
}
const label = { textContent: '' };

function env({ reduced = false, storage = {}, throwing = false } = {}) {
  const doc = mkEl('document'); const graph = mkEl('svg'); graph.parentNode = mkEl('div'); doc.hidden = false;
  doc.documentElement = mkEl('html'); doc.body = mkEl('body');
  const els = { graph, 'streams-btn': mkEl('button') };
  doc.getElementById = id => els[id] || null;
  doc.createElement = t => mkEl(t); doc.querySelectorAll = () => [];
  const rafq = []; let rafCalls = 0; const store = { ...storage };
  const ls = throwing ? { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } }
    : { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const win = { devicePixelRatio: 1, document: doc, localStorage: ls, addEventListener() {}, dispatchEvent() {}, matchMedia: q => ({ matches: reduced && /reduced/.test(q), addEventListener() {} }) };
  const g = { window: win, document: doc, localStorage: ls, getComputedStyle: () => ({ getPropertyValue: () => '' }), matchMedia: win.matchMedia, setInterval() {}, performance: { now: () => 0 },
    requestAnimationFrame: f => { rafCalls++; rafq.push(f); return rafq.length; }, cancelAnimationFrame() {}, Date, Math, JSON, Float32Array, Int32Array, Uint8Array, Int8Array, Object, Array, Number, String, isFinite, isNaN, parseFloat, parseInt, console, CustomEvent: class {} };
  win.window = win; Object.assign(win, { getComputedStyle: g.getComputedStyle, requestAnimationFrame: g.requestAnimationFrame, performance: g.performance });
  const ctx = vm.createContext(Object.assign(g, win));
  let now = 0;
  const run = (file, from, to) => { let src = fs.readFileSync(path.join(dir, file), 'utf8'); if (from) { src = src.slice(src.indexOf(from), src.indexOf(to)); } vm.runInContext(src, ctx, { filename: file }); };
  const step = n => { for (let i = 0; i < n; i++) { const f = rafq.splice(0); now += 16; f.forEach(fn => fn(now)); } };
  return { ctx, win, doc, els, store, run, step, label, raf: () => rafCalls };
}
const edges = (st = {}) => ['i1', 'i2', 'r1', 's1', 'e1'].map((id, n) => ({ id, kind: 'branch', status: st[id] || ({ i1: 'idle', i2: 'idle', r1: 'running', s1: 'stalled', e1: 'errored' })[id], x1: 100, y1: 50 + n * 100, x2: 800, y2: 60 + n * 100, r1: 20, r2: 20, activity: 1 }));
const data = (ed) => ({ state: { mode: 'live', events: [], heartbeat: null }, edges: ed, nodes: [], deps: [], cx: 500, cy: 300, k: 1, graph: null });

function fx(opts = {}) {
  const e = env(opts); e.run('particles.js'); const A = e.win.AosFx; if (!A) throw new Error('AosFx missing');
  A.sync(Object.assign(data(edges()), { graph: e.win.document.getElementById('graph') })); e.step(120); return { e, A, cnt: () => e.win.__aosFx.edgeCount() };
}

{ // FULL (default): idle edges have particles, as do the active ones
  const { A, cnt } = fx(); const c = cnt();
  ok('default getQuiet() is false (FULL)', A.getQuiet() === false);
  ok('FULL: idle edges draw particles', (c.i1 || 0) > 0 && (c.i2 || 0) > 0, c);
  ok('FULL: running/stalled/errored draw particles', c.r1 > 0 && c.s1 > 0 && c.e1 > 0, c);
}
{ // QUIET set before first sync: no idle particles at all, active untouched
  const e = env(); e.run('particles.js'); const A = e.win.AosFx; A.setQuiet(true);
  A.sync(Object.assign(data(edges()), { graph: e.win.document.getElementById('graph') })); e.step(120); const c = e.win.__aosFx.edgeCount();
  ok('QUIET: idle edges draw zero particles', !c.i1 && !c.i2, c);
  ok('QUIET: running/stalled/errored keep streams', c.r1 > 0 && c.s1 > 0 && c.e1 > 0, c);
  ok('QUIET: running edge not thinner than FULL baseline', c.r1 >= fx().cnt().r1 * 0.5, [c.r1, fx().cnt().r1]);
}
{ // live switching both ways, and an edge changing status idle -> running while quiet
  const { e, A, cnt } = fx(); const full = cnt(); A.setQuiet(true);
  ok('FULL->QUIET clears idle particles at once', !cnt().i1 && !cnt().i2, cnt());
  e.step(120); ok('QUIET stays empty on idle after 120 frames', !cnt().i1 && !cnt().i2 && cnt().r1 > 0, cnt());
  A.sync(Object.assign(data(edges({ i1: 'running' })), { graph: e.win.document.getElementById('graph') })); e.step(120);
  ok('QUIET: edge turning running gets a stream, other idle stays empty', cnt().i1 > 0 && !cnt().i2, cnt());
  A.sync(Object.assign(data(edges()), { graph: e.win.document.getElementById('graph') })); A.setQuiet(false); e.step(120);
  ok('QUIET->FULL restores idle particles', cnt().i1 > 0 && cnt().i2 > 0, [cnt().i1, cnt().i2, full.i1]);
  ok('getQuiet() reflects state', A.getQuiet() === false);
}
{ // reduced motion: engine disabled, no particles either mode (setQuiet must not throw)
  const { A, cnt } = fx({ reduced: true }); A.setQuiet(true); A.setQuiet(false);
  ok('reduced-motion: no particles in either mode', Object.keys(cnt()).length === 0, cnt());
}
{ // reduced motion: leaving LINES must clear the static drawing (nothing redraws it afterwards)
  const e = env({ reduced: true }); e.run('particles.js'); const A = e.win.AosFx, X = e.win.__aosFx;
  A.setMode('lines'); A.sync(Object.assign(data(edges()), { graph: e.win.document.getElementById('graph') })); e.step(5);
  const drawn = X.lines(); A.setMode('full'); e.step(5);
  ok('reduced-motion: LINES drew lines, then FULL leaves zero drawn lines', drawn === 5 && X.lines() === 0 && X.active() === 0, [drawn, X.lines()]);
  A.setMode('lines'); e.step(5); A.setMode('quiet'); e.step(5);
  ok('reduced-motion: LINES -> QUIET leaves zero drawn lines', X.lines() === 0, X.lines());
}
{ // app.js toggle: default FULL, persistence, Q key
  const T = (storage, throwing) => { const e = env({ storage, throwing }); const calls = [];
    e.win.AosFx = e.ctx.AosFx = { setMode: v => calls.push(v) };
    e.run('app.js', '/*streams:begin*/', '/*streams:end*/'); return Object.assign(e, { calls }); };
  let t = T({}); ok('toggle default FULL (no storage)', t.win.AosStreams.get() === 'full' && t.els['streams-btn'].getAttribute('data-state') === 'full' && t.label.textContent === 'Streams: Full', t.label.textContent);
  t.win.AosStreams.toggle(); ok('toggle -> QUIET persists aos.streams=quiet', t.store['aos.streams'] === 'quiet' && t.calls.at(-1) === 'quiet' && t.label.textContent === 'Streams: Quiet', t.store);
  t.win.AosStreams.toggle(); ok('toggle -> LINES persists aos.streams=lines, label Streams: Lines', t.store['aos.streams'] === 'lines' && t.calls.at(-1) === 'lines' && t.label.textContent === 'Streams: Lines' && t.els['streams-btn'].getAttribute('data-state') === 'lines', t.store);
  t.win.AosStreams.toggle(); ok('toggle -> FULL clears key (cycle full>quiet>lines>full)', !('aos.streams' in t.store) && t.calls.at(-1) === 'full' && t.win.AosStreams.get() === 'full', t.store);
  t = T({ 'aos.streams': 'quiet' }); ok('reads stored quiet at load and applies it to AosFx', t.win.AosStreams.get() === 'quiet' && t.calls[0] === 'quiet');
  t = T({ 'aos.streams': 'lines' }); ok('reads stored lines at load and applies it', t.win.AosStreams.get() === 'lines' && t.calls[0] === 'lines');
  t = T({ 'aos.streams': 'full' }); ok('stored full valid', t.win.AosStreams.get() === 'full');
  t = T({ 'aos.streams': 'garbage' }); ok('unknown stored value -> FULL', t.win.AosStreams.get() === 'full');
  t = T({}, true); let threw = false; try { t.win.AosStreams.toggle(); } catch (e) { threw = true; }
  ok('throwing localStorage: no exception, still toggles in-memory', !threw && t.win.AosStreams.get() === 'quiet');
  t = T({}); const key = (k, o = {}) => { let p = 0; t.doc.listeners.keydown.forEach(f => f(Object.assign({ key: k, target: { tagName: 'DIV' }, preventDefault() { p++; } }, o))); };
  key('q'); ok('Q key toggles', t.win.AosStreams.get() === 'quiet'); key('Q'); ok('Shift+Q advances to lines', t.win.AosStreams.get() === 'lines'); key('q'); ok('Q wraps to full', t.win.AosStreams.get() === 'full');
  key('q', { target: { tagName: 'INPUT' } }); key('q', { ctrlKey: true }); key('q', { metaKey: true }); key('q', { repeat: true });
  ok('Q ignored in inputs / with modifiers / repeat', t.win.AosStreams.get() === 'full');
}
{ // LINES: zero particles for every status, static lines drawn, loop idles, resumes on leaving
  const mk = () => { const e = env(); e.run('particles.js'); const A = e.win.AosFx; A.setMode('lines'); return { e, A }; };
  const sync = (e, A, ed) => A.sync(Object.assign(data(ed), { graph: e.win.document.getElementById('graph') }));
  const { e, A } = mk(); sync(e, A, edges()); e.step(120); const X = e.win.__aosFx;
  ok('LINES: getMode', A.getMode() === 'lines' && A.getQuiet() === false);
  ok('LINES: zero live particles, all statuses', X.active() === 0 && Object.keys(X.edgeCount()).length === 0, [X.active(), X.edgeCount()]);
  ok('LINES: 5 edges drawn as lines', X.lines() === 5, X.lines());
  const s = X.lineStyles(); ok('LINES: status looks differ (color/dash/width)', s.r1[0] !== s.i1[0] && s.e1[0] !== s.s1[0] && s.r1[1] > s.i1[1] && s.e1[2] > 0 && s.s1[2] > 0 && s.i1[2] === 0 && s.r1[2] === 0 && s.i1[3] < s.r1[3], s);
  ok('LINES: idle loop, no rAF pending', X.rafPending() === false);
  const r0 = e.raf(); e.step(600); ok('LINES: 0 rAF calls over 600 idle frames', e.raf() === r0, e.raf() - r0);
  A.onState({ mode: 'live', events: [], heartbeat: { seq: 1, ts: new Date().toISOString(), interval_s: 5 } }, null);
  A.onState({ mode: 'live', events: [{ seq: 1, type: 'goal.achieved' }], heartbeat: { seq: 2, ts: new Date().toISOString(), interval_s: 5 } }, {});
  e.step(60); ok('LINES: tick wave / burst / celebrate spawn nothing', X.active() === 0, X.active());
  const rb = e.raf(); sync(e, A, edges({ i1: 'running' })); e.step(5); ok('LINES: state change redraws once (<=2 rAF), still idle', e.raf() - rb >= 1 && e.raf() - rb <= 2 && !X.rafPending() && X.lineStyles().i1[1] === s.r1[1], [e.raf() - rb, X.lineStyles().i1]);
  const rc = e.raf(); e.win.dispatchEvent && 0; A.refreshView(); e.step(5); ok('LINES: pan/zoom (refreshView) redraws', e.raf() - rc >= 1 && !X.rafPending(), e.raf() - rc);
  const rd = e.raf(); A.refreshColors(); A.invalidate(); e.step(5); ok('LINES: invalidate (drag) redraws and idles', e.raf() - rd >= 1 && !X.rafPending(), e.raf() - rd);
  A.setMode('full'); e.step(120); ok('LINES->FULL resumes loop and particles on all lanes', X.rafPending() && X.active() > 0 && X.edgeCount().i1 > 0 && X.edgeCount().r1 > 0, X.edgeCount());
  A.setMode('lines'); e.step(3); ok('FULL->LINES kills every particle at once, loop stops after one redraw', X.active() === 0 && !X.rafPending() && X.lines() === 5, X.active());
  A.setMode('quiet'); e.step(120); ok('LINES->QUIET resumes: active edges stream, idle empty', X.edgeCount().r1 > 0 && !X.edgeCount().i2, X.edgeCount());
  A.setMode('bogus'); ok('bad mode -> full', A.getMode() === 'full');
  // rAF volume: FULL schedules every frame, LINES ~none
  const f = fx(); const fr = f.e.raf(); f.e.step(600); const fullCalls = f.e.raf() - fr;
  const l = mk(); sync(l.e, l.A, edges()); l.e.step(5); const lr = l.e.raf(); l.e.step(600);
  ok('rAF calls over 600 frames: FULL vs LINES', fullCalls >= 590 && l.e.raf() - lr === 0, [fullCalls, l.e.raf() - lr]);
}
{ // LINES under reduced motion: lines still drawn (static), no particles; deps drawn
  const e = env({ reduced: true }); e.run('particles.js'); const A = e.win.AosFx; A.setMode('lines');
  A.sync(Object.assign(data(edges()), { graph: e.win.document.getElementById('graph') })); e.step(30);
  ok('reduced-motion + LINES: static lines drawn, no particles', e.win.__aosFx.lines() === 5 && e.win.__aosFx.active() === 0, e.win.__aosFx.lines());
}
console.log(fails ? fails + ' FAILED' : 'streams-quiet: all ok'); process.exit(fails ? 1 : 0);
