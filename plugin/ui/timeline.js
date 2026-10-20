/* AOS-1 waterfall timeline: agents as horizontal bars over time (start -> end, colour by status, activity ticks), from GET /api/timeline
 * (same fold as /api/state; ?at= when the replay scrubber is open). Canvas, only visible rows/ticks are drawn. Vanilla ES5, read-only.
 * Pan: drag / wheel (shift = horizontal). Zoom: ctrl+wheel, pinch, +/- buttons. Click a bar to open the agent. Esc closes.
 */
(function () {
  'use strict';
  var ROW_H = 22, AXIS_H = 26;

  /* ---------- pure core (unit-tested) ---------- */
  var STEPS = [1e3, 2e3, 5e3, 10e3, 15e3, 30e3, 60e3, 120e3, 300e3, 600e3, 900e3, 1800e3, 3600e3, 7200e3, 21600e3, 86400e3];
  function niceStep(msPerPx, minPx) { var want = msPerPx * minPx; for (var i = 0; i < STEPS.length; i++) if (STEPS[i] >= want) return STEPS[i]; return STEPS[STEPS.length - 1]; }
  function clampScale(s) { return Math.max(1 / 600000, Math.min(0.5, s)); }   /* px per ms: 1 px = 10 min .. 1 px = 2 ms */
  function fit(from, to, width) { var span = Math.max(to - from, 60e3); return { t0: from - span * 0.02, pxMs: clampScale(width / (span * 1.04)) }; }
  function zoomAbout(v, factor, x) { var tAt = v.t0 + x / v.pxMs, p = clampScale(v.pxMs * factor); return { t0: tAt - x / p, pxMs: p }; }
  function visibleRows(n, sy, h) { var first = Math.max(0, Math.floor(sy / ROW_H)), last = Math.min(n - 1, Math.ceil((sy + h) / ROW_H)); return last < first ? [] : [first, last]; }
  function barRect(r, v, to) { var s = Date.parse(r.start), e = r.end ? Date.parse(r.end) : to; return { x0: (s - v.t0) * v.pxMs, x1: Math.max((s - v.t0) * v.pxMs + 2, (e - v.t0) * v.pxMs), open: !r.end }; }
  /* ticks inside [xa, xb] px, at most one per pixel column */
  function visibleTicks(ticks, v, xa, xb) { var out = [], last = -1e9; for (var i = 0; i < ticks.length; i++) { var x = Math.round((ticks[i] - v.t0) * v.pxMs); if (x < xa || x > xb || x === last) continue; last = x; out.push(x); } return out; }
  function hitRow(y, sy, n) { var i = Math.floor((y - AXIS_H + sy) / ROW_H); return y >= AXIS_H && i >= 0 && i < n ? i : -1; }
  var core = { niceStep: niceStep, fit: fit, zoomAbout: zoomAbout, visibleRows: visibleRows, barRect: barRect, visibleTicks: visibleTicks, hitRow: hitRow, clampScale: clampScale, ROW_H: ROW_H, AXIS_H: AXIS_H };
  window.AosTimeline = { core: core };
  if (typeof document === 'undefined' || !document.getElementById) return;

  /* ---------- UI ---------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hms(ms, sec) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + (sec ? ':' + pad(d.getSeconds()) : ''); }
  var S = { open: false, data: { rows: [] }, v: null, sy: 0, W: 0, H: 0, dpr: 1, labelW: 150, timer: null, colors: null, raf: 0, hover: -1, pt: {}, userView: false };

  function colors() {
    if (S.colors) return S.colors;
    var cs = getComputedStyle(document.documentElement), g = function (n) { return cs.getPropertyValue(n).trim(); };
    S.colors = { run: g('--running-rgb') || '52 211 153', stall: g('--stalled-rgb') || '251 191 36', err: g('--errored-rgb') || '251 100 116',
      text: g('--text') || '#ddd', text2: g('--text-2') || '#aaa', muted: g('--muted') || '#888', line: g('--line') || 'rgba(128,128,128,.2)', line2: g('--line-2') || 'rgba(128,128,128,.4)' };
    return S.colors;
  }
  function rgba(rgb, a) { return 'rgb(' + rgb.split(/\s+/).join(',') + ',' + a + ')'; }
  function barColor(st, a) { var c = colors(); return st === 'running' ? rgba(c.run, a) : st === 'errored' ? rgba(c.err, a) : st === 'stalled' ? rgba(c.stall, a) : null; }

  function build() {
    if (S.panel) return;
    var top = document.querySelector('header.top'), theme = $('theme-btn');
    var b = el('button', 'orch-hbtn tl-hbtn', 'Timeline'); b.type = 'button'; b.id = 'tl-btn'; b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'tl-panel');
    if (top) { if (theme && theme.parentNode === top) top.insertBefore(b, theme); else top.appendChild(b); }
    b.addEventListener('click', function () { S.open ? close() : openP(); });
    var p = el('section', 'tl-panel'); p.id = 'tl-panel'; p.hidden = true; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Agent timeline');
    var bar = el('div', 'tl-bar'); bar.appendChild(el('h2', 'tl-title', 'Timeline')); S.info = el('span', 'tl-info'); bar.appendChild(S.info);
    function btn(t, label, fn) { var x = el('button', 'tl-btn', t); x.type = 'button'; x.setAttribute('aria-label', label); x.addEventListener('click', fn); bar.appendChild(x); return x; }
    btn('−', 'Zoom out', function () { zoom(1 / 1.6); }); btn('+', 'Zoom in', function () { zoom(1.6); });
    btn('Fit', 'Fit all agents', function () { S.userView = false; doFit(); draw(); }); btn('Now', 'Jump to the latest time', function () { goNow(); draw(); });
    btn('Close', 'Close timeline', close); p.appendChild(bar);
    var wrap = el('div', 'tl-wrap'); S.cv = el('canvas', 'tl-cv'); S.cv.setAttribute('role', 'img'); S.cv.tabIndex = 0; wrap.appendChild(S.cv);
    S.tip = el('div', 'tl-tip'); S.tip.hidden = true; wrap.appendChild(S.tip); S.wrap = wrap; p.appendChild(wrap);
    p.appendChild(el('div', 'tl-key', 'Bars: start to end. Filled and dashed = running, amber stalled, red errored, grey idle or done. Ticks: agent activity (heartbeat).'));
    document.body.appendChild(p); S.panel = p; S.btn = b; S.ctx = S.cv.getContext('2d');
    S.cv.addEventListener('wheel', onWheel, { passive: false });
    S.cv.addEventListener('pointerdown', onDown); S.cv.addEventListener('pointermove', onMove); S.cv.addEventListener('pointerup', onUp); S.cv.addEventListener('pointercancel', onUp); S.cv.addEventListener('pointerleave', function () { S.hover = -1; S.tip.hidden = true; });
    document.addEventListener('keydown', function (e) { if (S.open && e.key === 'Escape') close(); });
    window.addEventListener('resize', function () { if (S.open) { size(); draw(); } });
    window.addEventListener('aos-theme', function () { S.colors = null; if (S.open) draw(); });
    try { var mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', function () { S.colors = null; if (S.open) draw(); }); } catch (e) {}
  }
  function size() {
    var r = S.wrap.getBoundingClientRect(); S.dpr = Math.min(2, window.devicePixelRatio || 1); S.W = Math.max(200, Math.floor(r.width)); S.H = Math.max(120, Math.floor(r.height));
    S.labelW = S.W < 520 ? 92 : 150; S.cv.width = Math.round(S.W * S.dpr); S.cv.height = Math.round(S.H * S.dpr); S.cv.style.width = S.W + 'px'; S.cv.style.height = S.H + 'px';
  }
  function bounds() { var d = S.data, to = Date.parse(d.to) || Date.now(); return { from: Date.parse(d.from) || to - 60e3, to: to }; }
  function plotW() { return S.W - S.labelW; }
  function doFit() { var b = bounds(); S.v = fit(b.from, b.to, plotW()); }
  function goNow() { var b = bounds(); S.v = { t0: b.to - plotW() * 0.95 / S.v.pxMs, pxMs: S.v.pxMs }; S.userView = true; }
  function zoom(f) { if (!S.v) return; S.v = zoomAbout(S.v, f, plotW() / 2); S.userView = true; draw(); }
  function maxSy() { return Math.max(0, S.data.rows.length * ROW_H - (S.H - AXIS_H)); }

  function draw() {
    if (!S.open || S.raf) return;
    S.raf = requestAnimationFrame(function () { S.raf = 0; paint(); });
  }
  function paint() {
    var c = colors(), x = S.ctx, rows = S.data.rows, b = bounds(), W = S.W, H = S.H, LW = S.labelW, v = S.v; if (!v) return;
    x.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); x.clearRect(0, 0, W, H);
    S.sy = Math.max(0, Math.min(maxSy(), S.sy));
    var step = niceStep(1 / v.pxMs, 80), tA = v.t0, tB = v.t0 + plotW() / v.pxMs;
    x.font = '10.5px ui-monospace,Menlo,monospace'; x.textBaseline = 'middle';
    x.save(); x.beginPath(); x.rect(LW, 0, W - LW, H); x.clip();
    for (var t = Math.ceil(tA / step) * step; t <= tB; t += step) {   /* gridlines + axis labels */
      var gx = LW + (t - v.t0) * v.pxMs; x.strokeStyle = c.line; x.lineWidth = 1; x.beginPath(); x.moveTo(Math.round(gx) + .5, AXIS_H - 4); x.lineTo(Math.round(gx) + .5, H); x.stroke();
      x.fillStyle = c.muted; x.fillText(hms(t, step < 60e3), gx + 4, AXIS_H / 2);
    }
    var vr = visibleRows(rows.length, S.sy, H - AXIS_H);
    if (vr.length) for (var i = vr[0]; i <= vr[1]; i++) {
      var r = rows[i], y = AXIS_H + i * ROW_H - S.sy, br = barRect(r, v, b.to), xa = LW + br.x0, xb = LW + br.x1;
      if (xb < LW || xa > W) continue;
      var col = barColor(r.status, 1) || c.line2, fill = barColor(r.status, r.kind === 'session' ? 0.38 : 0.55) || c.line;
      x.fillStyle = fill; x.fillRect(xa, y + 4, xb - xa, ROW_H - 8);
      x.strokeStyle = col; x.lineWidth = i === S.hover ? 2 : 1; x.setLineDash(br.open ? [4, 3] : []); x.strokeRect(xa + .5, y + 4.5, Math.max(1, xb - xa - 1), ROW_H - 9); x.setLineDash([]);
      var tk = visibleTicks(r.ticks || [], { t0: v.t0, pxMs: v.pxMs }, Math.max(xa - LW, 0), Math.min(xb - LW, W - LW));   /* heartbeat ticks */
      x.strokeStyle = c.text; x.globalAlpha = 0.55; x.beginPath();
      for (var k = 0; k < tk.length; k++) { x.moveTo(LW + tk[k] + .5, y + 7); x.lineTo(LW + tk[k] + .5, y + ROW_H - 7); } x.stroke(); x.globalAlpha = 1;
    }
    var nx = LW + (b.to - v.t0) * v.pxMs;   /* newest time (now, or the replay position) */
    if (nx >= LW && nx <= W) { x.strokeStyle = barColor('running', 0.9); x.lineWidth = 1; x.beginPath(); x.moveTo(Math.round(nx) + .5, 0); x.lineTo(Math.round(nx) + .5, H); x.stroke(); }
    x.restore();
    x.fillStyle = c.line; x.fillRect(0, AXIS_H - 1, W, 1);   /* sticky label column */
    x.save(); x.beginPath(); x.rect(0, AXIS_H, LW - 4, H - AXIS_H); x.clip();
    if (vr.length) for (var j = vr[0]; j <= vr[1]; j++) { var rr = rows[j], yy = AXIS_H + j * ROW_H - S.sy; x.fillStyle = j === S.hover ? c.text : c.text2; x.fillText((rr.kind === 'session' ? '● ' : '  ') + rr.id, 6, yy + ROW_H / 2); }
    x.restore();
    if (!rows.length) { x.fillStyle = c.muted; x.fillText('No agents in this window.', LW + 12, AXIS_H + 24); }
    S.info.textContent = rows.length + (rows.length === 1 ? ' agent' : ' agents') + (S.data.replay ? ' · replay ' + hms(b.to, true) : '');
    S.cv.setAttribute('aria-label', 'Timeline of ' + rows.length + ' agents from ' + hms(b.from, true) + ' to ' + hms(b.to, true));
  }

  /* ---------- input ---------- */
  function pos(e) { var r = S.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function onWheel(e) {
    e.preventDefault(); if (!S.v) return;
    if (e.ctrlKey || e.metaKey) { S.v = zoomAbout(S.v, Math.exp(-e.deltaY * 0.01), Math.max(0, pos(e).x - S.labelW)); }
    else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) S.v = { t0: S.v.t0 + (e.shiftKey ? e.deltaY : e.deltaX) / S.v.pxMs, pxMs: S.v.pxMs };
    else S.sy += e.deltaY;
    S.userView = true; draw();
  }
  function pinchDist() { var k = Object.keys(S.pt); if (k.length < 2) return 0; var a = S.pt[k[0]], b = S.pt[k[1]]; return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)); }
  function onDown(e) { try { S.cv.setPointerCapture(e.pointerId); } catch (x) {} var p = pos(e); S.pt[e.pointerId] = { x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false }; S.pd = pinchDist(); }
  function onMove(e) {
    var p = pos(e), q = S.pt[e.pointerId], n = Object.keys(S.pt).length;
    if (!q) { var h = hitRow(p.y, S.sy, S.data.rows.length); if (h !== S.hover) { S.hover = h; draw(); } showTip(h, e); return; }
    if (n >= 2) { var d = pinchDist(); q.x = p.x; q.y = p.y; if (S.pd && d) { S.v = zoomAbout(S.v, d / S.pd, Math.max(0, p.x - S.labelW)); S.userView = true; draw(); } S.pd = d; q.moved = true; return; }
    var dx = p.x - q.x, dy = p.y - q.y; if (Math.abs(p.x - q.sx) + Math.abs(p.y - q.sy) > 4) q.moved = true;
    if (q.moved) { S.v = { t0: S.v.t0 - dx / S.v.pxMs, pxMs: S.v.pxMs }; S.sy -= dy; S.userView = true; draw(); }
    q.x = p.x; q.y = p.y;
  }
  function onUp(e) {
    var q = S.pt[e.pointerId]; delete S.pt[e.pointerId]; S.pd = 0;
    if (q && !q.moved) { var h = hitRow(q.y, S.sy, S.data.rows.length); if (h >= 0 && window.AosApp && window.AosApp.selectAgent) { var id = S.data.rows[h].id; close(); window.AosApp.selectAgent(id); } }
  }
  function showTip(h, e) {
    if (h < 0) { S.tip.hidden = true; return; }
    var r = S.data.rows[h], s = Date.parse(r.start), en = r.end ? Date.parse(r.end) : bounds().to, dur = Math.max(0, Math.round((en - s) / 1000));
    S.tip.textContent = r.id + ' · ' + r.project + ' · ' + r.status + ' · ' + hms(s, true) + ' to ' + (r.end ? hms(en, true) : 'now') + ' (' + (dur >= 60 ? Math.floor(dur / 60) + 'm ' + (dur % 60) + 's' : dur + 's') + ')';
    S.tip.hidden = false; var p = pos(e); S.tip.style.left = Math.max(4, Math.min(S.W - 260, p.x + 12)) + 'px'; S.tip.style.top = (p.y + 16) + 'px';
  }

  /* ---------- data ---------- */
  function load() {
    var at = window.AosReplay && window.AosReplay.at ? window.AosReplay.at() : null;
    fetch('/api/timeline' + (at ? '?at=' + encodeURIComponent(new Date(Math.floor(at / 1000) * 1000).toISOString()) : ''), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !S.open || !Array.isArray(j.rows)) return; S.data = j; if (!S.v || !S.userView) doFit(); draw();
    }, function () {});
  }
  function openP() {
    build(); if (!S.panel) return; S.open = true; S.panel.hidden = false; S.btn.setAttribute('aria-expanded', 'true'); S.btn.classList.add('on'); S.colors = null;
    size(); S.userView = false; S.sy = 0; if (!S.v) S.v = fit(Date.now() - 3600e3, Date.now(), plotW()); load(); S.timer = setInterval(load, 3000); draw();
  }
  function close() { S.open = false; if (S.panel) S.panel.hidden = true; if (S.btn) { S.btn.setAttribute('aria-expanded', 'false'); S.btn.classList.remove('on'); } clearInterval(S.timer); }
  function init() { try { build(); } catch (e) {} }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
