/* AOS-1 particle streams: one <canvas> over the SVG graph. Public API: window.AosFx = { sync(data), onState(state, prev) }.
   Fine dust streams flow along invisible curved lanes between nodes. Particle state lives in typed arrays (no per-particle
   objects); colours come from CSS custom properties; an adaptive quality guard keeps frame cost low. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var graph = $('graph'); if (!graph || !document.createElement('canvas').getContext) return;
  var nmMode = false, am = {}, dying = [], gsA = 1, gsI = 1, capNext = null;
  var state = null, prev = null, CX = 500, CY = 300, OX = 500, OY = 300, dirty = false, RAD = { o: 66, a: 0 }, scaleBy = [], anyScale = false, LM = { mobile: false, cw: 24, ch: 24 };
  var POOL = 13000;
  var P_on = new Uint8Array(POOL), P_free = new Uint8Array(POOL), P_kind = new Uint8Array(POOL), P_dir = new Int8Array(POOL), P_arr = new Uint8Array(POOL), P_slot = new Uint8Array(POOL);
  var P_e = new Int32Array(POOL);
  var P_u = new Float32Array(POOL), P_speed = new Float32Array(POOL), P_v = new Float32Array(POOL), P_swf = new Float32Array(POOL), P_sph = new Float32Array(POOL),
    P_swa = new Float32Array(POOL), P_size = new Float32Array(POOL), P_alpha = new Float32Array(POOL), P_delay = new Float32Array(POOL), P_age = new Float32Array(POOL),
    P_life = new Float32Array(POOL), P_x = new Float32Array(POOL), P_y = new Float32Array(POOL), P_vx = new Float32Array(POOL), P_vy = new Float32Array(POOL), P_flick = new Float32Array(POOL);
  var freeStack = new Int32Array(POOL), freeTop = 0, hi = 0, liveN = 0, liveCap = POOL, i0;
  for (i0 = POOL - 1; i0 >= 0; i0--) freeStack[freeTop++] = i0;
  var KD = 0, KA = 1, KR = 2, KE = 3;               /* dispatch, ambient, return, errored(flicker+stall) */

  var cv = document.createElement('canvas'); cv.id = 'fx'; cv.setAttribute('aria-hidden', 'true');
  var ctx = cv.getContext('2d');
  graph.parentNode.insertBefore(cv, graph.nextSibling);
  var rm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion:reduce)') : null;
  var cm = window.matchMedia ? window.matchMedia('(prefers-color-scheme:light)') : null;
  var enabled = !!ctx && !(rm && rm.matches), raf = 0, last = 0, throttled = false, quality = 1;
  var etab = [], eN = 0, fe = {}, fd = {}, M = [1, 0, 0, 1, 0, 0], SC = 1, DPR = Math.min(4, window.devicePixelRatio || 1), geomTick = 0, colKey = '';
  var KS = 1, col = null, slots = [], light = false, spriteDpr = 0;
  var lastSeq = null, lastEv = null, lastGoal = null, evRate = 0, celebrated = 0, T = { t: 0, sm: 1, now: 0 };
  var tmp = { x: 0, y: 0 }, live = { l: 'dead' }, liveT = 0, emitAcc = 0;
  var warm = 0, cbuf = new Float32Array(90), cpos = 0, cfill = 0, p95 = 0, gTick = 0, lastCost = 0;
  var S_DISP = 0, S_BACK = 1, S_ERR = 2, S_STALL = 3, S_IDLE = 4, S_DEPRUN = 5, S_DEPACC = 6, S_ACC = 7, S_BONE = 8, S_RUN = 9;

  /* ---------- colours (CSS custom properties, with fallbacks) ---------- */
  function parseCol(str, def) {
    str = (str || '').trim(); var m;
    if ((m = /^#([0-9a-f]{3})$/i.exec(str))) return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16)];
    if ((m = /^#([0-9a-f]{6})/i.exec(str))) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    if ((m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(str))) return [+m[1], +m[2], +m[3]];
    var v = str.split(/[\s,\/]+/).map(Number);
    return v.length >= 3 && v.every(function (n) { return !isNaN(n); }) ? v.slice(0, 3) : def;
  }
  function soft(c) { return c.map(function (n) { return Math.round(n * 0.86 + 128 * 0.14); }); }
  /* sprites are generated in DEVICE pixels and blitted 1:1 at integer device coordinates (no resampling):
     3 hard-edged disc sizes (1px antialiased rim) per colour, plus one soft glow used only on the brightest dots */
  var DISC_CSS = [1.1, 1.6, 2.2], GLOW_CSS = 7;
  function mix(a, b, t) { return [Math.round(a[0] * (1 - t) + b[0] * t), Math.round(a[1] * (1 - t) + b[1] * t), Math.round(a[2] * (1 - t) + b[2] * t)]; }
  function mkSprite(glow, core) {
    var fill = mix(core, glow, 0.3), out = { disc: [], glow: null }, k;
    for (k = 0; k < 3; k++) {
      var D = Math.max(1, Math.round(DISC_CSS[k] * DPR)), W = D + 2, c = document.createElement('canvas'); c.width = c.height = W;
      var g = c.getContext('2d'); g.fillStyle = 'rgb(' + fill.join(',') + ')'; g.beginPath(); g.arc(W / 2, W / 2, D / 2, 0, 6.2832); g.fill();
      out.disc.push({ c: c, o: Math.round(W / 2) });      /* o: offset from the dot centre to the sprite's top-left */
    }
    var G = Math.round(GLOW_CSS * DPR), gc = document.createElement('canvas'); gc.width = gc.height = G;
    var gg = gc.getContext('2d'), gr = gg.createRadialGradient(G / 2, G / 2, 0, G / 2, G / 2, G / 2);
    gr.addColorStop(0, 'rgba(' + glow.join(',') + ',0.5)'); gr.addColorStop(0.45, 'rgba(' + glow.join(',') + ',0.12)'); gr.addColorStop(1, 'rgba(' + glow.join(',') + ',0)');
    gg.fillStyle = gr; gg.fillRect(0, 0, G, G); out.glow = { c: gc, o: Math.round(G / 2) };
    return out;
  }
  function buildSprites() { if (!col) return; var n = col, idleC = light ? mix(n.idle, n.bone, 0.6) : mix(n.idle, n.bone, 0.15); var pairs = [[n.acc, n.bone], [n.run, n.bone], [n.err, n.err], [n.stall, n.stall], [idleC, idleC], [n.run, n.bone], [n.acc, n.bone], [n.acc, n.acc], [n.bone, n.bone], [n.run, n.run]]; slots = pairs.map(function (p) { return mkSprite(p[0], p[1]); }); spriteDpr = DPR; }
  function readColors() {
    var cs = getComputedStyle(document.documentElement), g = function (n) { return cs.getPropertyValue(n); };
    var dt = document.documentElement.getAttribute('data-theme'); light = dt === 'light' ? true : dt === 'dark' ? false : !!(cm && cm.matches);
    var n = {
      bone: parseCol(g('--text'), light ? [20, 24, 31] : [232, 225, 210]),
      run: soft(parseCol(g('--running-rgb'), [196, 163, 90])), err: soft(parseCol(g('--errored-rgb'), [194, 87, 77])),
      stall: soft(parseCol(g('--stalled-rgb'), [217, 142, 58])), idle: soft(parseCol(g('--idle-rgb'), [118, 128, 150])),
      acc: soft(parseCol(g('--accent-rgb') || g('--accent'), [196, 163, 90]))
    };
    var key = JSON.stringify(n) + light;
    if (key === colKey) return; colKey = key; col = n;
    buildSprites();
  }

  /* ---------- geometry ---------- */
  function sample(elm) {
    try {
      var len = elm.getTotalLength(); if (!(len > 2)) return null;
      var N = Math.max(8, Math.min(72, Math.ceil(len / 8))), pts = new Float32Array((N + 1) * 2), nrm = new Float32Array((N + 1) * 2), i;
      for (i = 0; i <= N; i++) { var q = elm.getPointAtLength(len * i / N); pts[i * 2] = q.x; pts[i * 2 + 1] = q.y; }
      for (i = 0; i <= N; i++) {
        var a = Math.max(0, i - 1), c = Math.min(N, i + 1), tx = pts[c * 2] - pts[a * 2], ty = pts[c * 2 + 1] - pts[a * 2 + 1], tl = Math.sqrt(tx * tx + ty * ty) || 1;
        nrm[i * 2] = -ty / tl; nrm[i * 2 + 1] = tx / tl;
      }
      return { pts: pts, nrm: nrm, N: N, len: len };
    } catch (e) { return null; }
  }
  /* real node radius from the SVG (circle r, or half the larger rect side) */
  function nodeR(sel, def) {
    var ns = document.querySelectorAll(sel), best = 0;
    for (var i = 0; i < ns.length; i++) {
      var r = parseFloat(ns[i].getAttribute('r'));
      if (!(r > 2)) { var w = parseFloat(ns[i].getAttribute('width')), h = parseFloat(ns[i].getAttribute('height')); r = w > 2 && h > 2 ? Math.min(w, h) / 2 : 0; }
      if (r > best) best = r;
    }
    return best || def;
  }
  /* invisible flowing lane: two offset boundary curves around the centre path (offsets vary along the length and sway);
     v in [0,1] picks a spot between them, m scales the spread so streams fan out from the source and funnel into the target */
  function atLane(e, d, v, m, sway) {
    var g = e.g; if (d < 0) d = 0; else if (d > g.len) d = g.len;
    var s = d / g.len, f = s * g.N, i = Math.min(g.N - 1, f | 0), k = f - i, p = g.pts, n = g.nrm, i2 = i * 2;
    var x = p[i2] + (p[i2 + 2] - p[i2]) * k, y = p[i2 + 1] + (p[i2 + 3] - p[i2 + 1]) * k;
    var nx = n[i2] + (n[i2 + 2] - n[i2]) * k, ny = n[i2 + 1] + (n[i2 + 3] - n[i2 + 1]) * k;
    var W = e.W, tt = T.t;
    var bL = W * (0.55 + 0.45 * Math.sin(6.283 * 1.1 * s + e.ph + tt * 0.35));
    var bR = W * (0.55 + 0.45 * Math.sin(6.283 * 0.8 * s + e.ph2 - tt * 0.3));
    var c0 = W * 0.22 * Math.sin(6.283 * 0.7 * s + e.ph3 + tt * 0.5);
    var vv = 0.5 + (v - 0.5 + sway) * m, off = c0 * m + (vv > 0.5 ? (vv - 0.5) * 2 * bL : (vv - 0.5) * 2 * bR);
    tmp.x = x + nx * off; tmp.y = y + ny * off;
  }
  function funnel(f) { f = f < 0 ? 0 : f > 1 ? 1 : f; return 0.18 + 0.82 * Math.pow(Math.sin(Math.PI * f), 0.7); }
  /* canvas is placed from measured screen rects and mapped through getScreenCTM (never assume 1:1 pixels) */
  function refreshGeom() {
    var ctm = graph.getScreenCTM && graph.getScreenCTM(), r = graph.getBoundingClientRect();
    if (!ctm || r.width < 2 || r.height < 2) return;
    var dpr = Math.min(4, window.devicePixelRatio || 1);       /* never silently drop to dpr 1 */
    var w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    cv.style.left = '0px'; cv.style.top = '0px';
    var c0 = cv.getBoundingClientRect();
    /* place the canvas on an integer DEVICE pixel and size it so backing px map 1:1 to device px */
    var tl = Math.round(r.left * dpr) / dpr, tt = Math.round(r.top * dpr) / dpr;
    cv.style.left = (tl - c0.left) + 'px'; cv.style.top = (tt - c0.top) + 'px';
    cv.style.width = (w / dpr) + 'px'; cv.style.height = (h / dpr) + 'px';
    M = [dpr * ctm.a, dpr * ctm.b, dpr * ctm.c, dpr * ctm.d, dpr * (ctm.e - tl), dpr * (ctm.f - tt)];
    SC = Math.sqrt(ctm.a * ctm.a + ctm.b * ctm.b) || 1;
    if (dpr !== DPR) { DPR = dpr; buildSprites(); watchDpr(); }
  }
  var dprMq = null;
  function watchDpr() {   /* browser zoom / moving between monitors */
    if (!window.matchMedia) return;
    if (dprMq && dprMq.removeEventListener) dprMq.removeEventListener('change', onDpr);
    dprMq = window.matchMedia('(resolution: ' + DPR + 'dppx)');
    if (dprMq.addEventListener) dprMq.addEventListener('change', onDpr); else if (dprMq.addListener) dprMq.addListener(onDpr);
  }
  function onDpr() { dirty = true; refreshGeom(); kick(); }
  function mkRec(id, isDep) {
    var r = { id: id, dep: isDep, el: null, sig: '', rk: '', g: null, s0: 0, s1: 0, W: 10, ph: Math.random() * 6.28, ph2: Math.random() * 6.28, ph3: Math.random() * 6.28, acc: [0, 0, 0], thr: [1, 1, 1], filled: false, idx: eN++,
      nm: false, kind: '', act: 1, br: 1, k: 'idle', rv: [0, 0, 26], rs: 0, rt: 0, need: 0, dead: false, dt0: 0, agent: null, px: null };
    etab[r.idx] = r; return r;
  }
  function geomSig(el) { return el.getAttribute('d') || (el.getAttribute('x1') + ',' + el.getAttribute('y1') + ',' + el.getAttribute('x2') + ',' + el.getAttribute('y2')); }
  function endPos(r) { var g = r.g; return g ? { x: g.pts[g.N * 2], y: g.pts[g.N * 2 + 1] } : null; }
  var flipBy = [], offBy = [];
  /* queue a remap of live particles after a lane length change: u' = scale*u (+ mirror when the endpoints swapped) */
  function queueRemap(r, oldR, newR, flip) {
    if (!(oldR > 8 && newR > 8)) return;
    if (!flip && Math.abs(newR - oldR) <= 0.01) return;
    var sc = newR / oldR; scaleBy[r.idx] = flip ? -sc : sc; offBy[r.idx] = flip ? newR : 0; flipBy[r.idx] = flip; anyScale = true;
  }
  /* re-read an edge's path geometry; existing particles keep their normalised progress t (u is rescaled by the new/old lane length),
     so streams bend and follow a moving node instead of popping */
  function reshape(r, force) {
    if (!r.el) return;
    var sig = geomSig(r.el), rk = RAD.o + ',' + RAD.a + (LM.mobile ? 'm' : 'd');
    if (!force && sig === r.sig && rk === r.rk) return;
    var g = sample(r.el); r.sig = sig; r.rk = rk; if (!g) return;
    var oldR = r.s1 - r.s0, s0, s1;
    if (r.dep) { s0 = 0; s1 = g.len; r.W = 9 * KS; }
    else {
      var ex;
      if (RAD.a > 0) ex = RAD.a + 3;
      else { var dx = Math.abs(g.pts[g.N * 2] - g.pts[0]) / g.len, dy = Math.abs(g.pts[g.N * 2 + 1] - g.pts[1]) / g.len; ex = Math.min(dx > 1e-3 ? (LM.cw / 2) / dx : 1e9, dy > 1e-3 ? (LM.ch / 2) / dy : 1e9) + 2; }
      s0 = Math.min(RAD.o + 3, g.len * 0.35); s1 = Math.max(s0 + 12, g.len - ex); r.W = Math.min(30, g.len * 0.1) * KS;
    }
    r.g = g; r.s0 = s0; r.s1 = s1; r.rs = RAD.o; r.rt = RAD.a || 12;
    if (!r.dep) { OX = g.pts[0]; OY = g.pts[1]; r.sx = OX; r.sy = OY; r.tx = g.pts[g.N * 2]; r.ty = g.pts[g.N * 2 + 1]; }
    queueRemap(r, oldR, s1 - s0, false);
  }
  /* ---- explicit-endpoint edges (hierarchical graph): lane = gentle quadratic curve, bend side/size from a hash of the id ---- */
  var NSEG = 36;
  function hash01(s, salt) {
    var h = (2166136261 ^ salt) >>> 0, i;
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296;
  }
  function reshapeNM(r, d) {
    var x1 = +d.x1, y1 = +d.y1, x2 = +d.x2, y2 = +d.y2, r1 = d.r1 > 0 ? +d.r1 : 0, r2 = d.r2 > 0 ? +d.r2 : 0, cv_ = d.curve === undefined ? NaN : +d.curve;
    if (!isFinite(x1 + y1 + x2 + y2)) return;
    var p = r.px;
    if (r.g && p && p[0] === x1 && p[1] === y1 && p[2] === x2 && p[3] === y2 && p[4] === r1 && p[5] === r2) return;
    var dx = x2 - x1, dy = y2 - y1, L0 = Math.sqrt(dx * dx + dy * dy);
    if (L0 < 2) return;                                   /* nodes overlap: keep the previous lane */
    var flip = false;
    if (r.g && p) {
      var dSame = Math.abs(x1 - p[0]) + Math.abs(y1 - p[1]) + Math.abs(x2 - p[2]) + Math.abs(y2 - p[3]);
      var dSwap = Math.abs(x1 - p[2]) + Math.abs(y1 - p[3]) + Math.abs(x2 - p[0]) + Math.abs(y2 - p[1]);
      flip = dSame > 4 && dSwap < dSame * 0.5;
    }
    if (!p) p = r.px = [0, 0, 0, 0, 0, 0];
    p[0] = x1; p[1] = y1; p[2] = x2; p[3] = y2; p[4] = r1; p[5] = r2;
    var cs = (x1 > x2 || (x1 === x2 && y1 > y2)) ? -1 : 1, nx = -dy / L0, ny = dx / L0;
    var sag = isFinite(cv_) ? cv_ * L0 : (hash01(r.id, 7) < 0.5 ? -1 : 1) * Math.min(20, (0.03 + 0.07 * hash01(r.id, 91)) * L0);
    var off = 2 * sag * cs, qx = (x1 + x2) / 2 + nx * off, qy = (y1 + y2) / 2 + ny * off;
    var g = r.g; if (!g) { g = r.g = { pts: new Float32Array((NSEG + 1) * 2), nrm: new Float32Array((NSEG + 1) * 2), N: NSEG, len: 1 }; }
    var pts = g.pts, nrm = g.nrm, i, len = 0;
    for (i = 0; i <= NSEG; i++) {
      var t = i / NSEG, m = 1 - t;
      pts[i * 2] = m * m * x1 + 2 * m * t * qx + t * t * x2; pts[i * 2 + 1] = m * m * y1 + 2 * m * t * qy + t * t * y2;
      if (i) { var ex_ = pts[i * 2] - pts[i * 2 - 2], ey_ = pts[i * 2 + 1] - pts[i * 2 - 1]; len += Math.sqrt(ex_ * ex_ + ey_ * ey_); }
    }
    for (i = 0; i <= NSEG; i++) {
      var a = i > 0 ? i - 1 : 0, c = i < NSEG ? i + 1 : NSEG, tx = pts[c * 2] - pts[a * 2], ty = pts[c * 2 + 1] - pts[a * 2 + 1], tl = Math.sqrt(tx * tx + ty * ty) || 1;
      nrm[i * 2] = -ty / tl; nrm[i * 2 + 1] = tx / tl;
    }
    g.len = len;
    var oldR = r.s1 - r.s0, s0 = Math.min(r1 + 3, len * 0.35), s1 = Math.max(s0 + 12, len - r2 - 3);
    r.s0 = s0; r.s1 = s1; r.sx = x1; r.sy = y1; r.tx = x2; r.ty = y2; r.rs = r1; r.rt = r2;
    queueRemap(r, oldR, s1 - s0, flip);
  }
  function setW(r) { if (r.nm) { var a = Math.min(8, r.act); r.W = KS * Math.min(30, r.g ? r.g.len * 0.1 : 10) * (r.kind === 'trunk' ? 1 + 0.06 * a : 1); } }

  /* ---------- node grid: every node (centre + radius, SVG units) so free and lane particles never draw on/inside any node ---------- */
  var GN = 0, GX = new Float32Array(128), GY = new Float32Array(128), GR = new Float32Array(128);
  var gx0 = 0, gy0 = 0, gcell = 48, gcw = 0, gch = 0, gStart = new Int32Array(4100), gItems = new Int32Array(512);
  function gridReset() { GN = 0; }
  function gridAdd(x, y, r) {
    if (!(isFinite(x) && isFinite(y) && r > 0)) return;
    if (GN >= GX.length) { var n = GX.length * 2, a = new Float32Array(n); a.set(GX); GX = a; a = new Float32Array(n); a.set(GY); GY = a; a = new Float32Array(n); a.set(GR); GR = a; }
    GX[GN] = x; GY[GN] = y; GR[GN] = r; GN++;
  }
  function gridBuild() {
    if (!GN) { gcw = gch = 0; return; }
    var i, minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (i = 0; i < GN; i++) { var e = GR[i] + 12; if (GX[i] - e < minx) minx = GX[i] - e; if (GY[i] - e < miny) miny = GY[i] - e; if (GX[i] + e > maxx) maxx = GX[i] + e; if (GY[i] + e > maxy) maxy = GY[i] + e; }
    gx0 = minx; gy0 = miny; gcell = Math.max(48, Math.sqrt((maxx - minx) * (maxy - miny) / 4000));
    gcw = Math.ceil((maxx - minx) / gcell) + 1; gch = Math.ceil((maxy - miny) / gcell) + 1;
    var nc = gcw * gch, c, pass;
    if (gStart.length < nc + 1) gStart = new Int32Array(nc + 1);
    for (c = 0; c <= nc; c++) gStart[c] = 0;
    for (pass = 0; pass < 2; pass++) {
      for (i = 0; i < GN; i++) {
        var rr = GR[i] + 12, ix0 = Math.max(0, ((GX[i] - rr - gx0) / gcell) | 0), ix1 = Math.min(gcw - 1, ((GX[i] + rr - gx0) / gcell) | 0), iy0 = Math.max(0, ((GY[i] - rr - gy0) / gcell) | 0), iy1 = Math.min(gch - 1, ((GY[i] + rr - gy0) / gcell) | 0), ix, iy;
        for (iy = iy0; iy <= iy1; iy++) for (ix = ix0; ix <= ix1; ix++) { c = iy * gcw + ix; if (pass === 0) gStart[c + 1]++; else gItems[gFill[c]++] = i; }
      }
      if (pass === 0) {
        for (c = 0; c < nc; c++) gStart[c + 1] += gStart[c];
        if (gItems.length < gStart[nc]) gItems = new Int32Array(gStart[nc] * 2);
        if (!gFill || gFill.length < nc) gFill = new Int32Array(nc + 64);
        for (c = 0; c < nc; c++) gFill[c] = gStart[c];
      }
    }
  }
  var gFill = null;
  /* distance from (x,y) to the nearest node rim (+2 margin); 99 when far from all */
  function clearance(x, y) {
    var ix = ((x - gx0) / gcell) | 0, iy = ((y - gy0) / gcell) | 0;
    if (!(x >= gx0 && y >= gy0) || ix >= gcw || iy >= gch) return 99;
    var c = iy * gcw + ix, j = gStart[c], je = gStart[c + 1], best = 99;
    for (; j < je; j++) { var n = gItems[j], dx = x - GX[n], dy = y - GY[n], dd = Math.sqrt(dx * dx + dy * dy) - GR[n] - 2; if (dd < best) best = dd; }
    return best;
  }
  function legacyGrid() {
    gridReset(); gridAdd(OX, OY, RAD.o); var k; for (k in fe) { var f = fe[k]; if (f.tx !== undefined) gridAdd(f.tx, f.ty, RAD.a || 12); }
    gridBuild();
  }
  function nodeSet(data, edges) {
    var i, j;
    gridReset();
    if (data.nodes) for (i = 0; i < data.nodes.length; i++) { var n = data.nodes[i]; if (n) gridAdd(+n.x, +n.y, +n.r); }
    var have = GN;
    for (i = 0; i < edges.length; i++) {
      var d = edges[i]; if (d.x1 === undefined) continue;
      for (var e = 0; e < 2; e++) {
        var x = e ? +d.x2 : +d.x1, y = e ? +d.y2 : +d.y1, r = e ? +d.r2 : +d.r1, dup = false;
        if (!(r > 0)) continue;
        for (j = 0; j < GN; j++) if (Math.abs(GX[j] - x) < 1 && Math.abs(GY[j] - y) < 1 && GR[j] >= r - 0.5) { dup = true; break; }
        if (!dup) gridAdd(x, y, r);
      }
    }
    gridBuild();
  }
  function sync(data) {
    if (!data) return;
    state = data.state; LM = { mobile: !!data.mobile, cw: data.cw || 24, ch: data.ch || 24 };
    if (data.graph && data.graph !== graph) graph = data.graph;
    var edges = data.edges || [], deps = data.deps || [], i, nm = false;
    for (i = 0; i < edges.length; i++) if (edges[i].x1 !== undefined) { nm = true; break; }
    nmMode = nm; CX = data.cx; CY = data.cy; KS = data.k > 0 && data.k <= 1 ? data.k : 1;
    refreshGeom();
    if (!nm) RAD = { o: nodeR('.orch .body, .orch .core-bg', 66), a: nodeR('.agent .card, .agent .av', 0) };
    else {
      var hr = 0, n, mx = 0;
      if (!isFinite(CX) || !isFinite(CY)) { for (i = 0; i < edges.length; i++) if (edges[i].kind === 'trunk') { CX = +edges[i].x1; CY = +edges[i].y1; break; } }
      if (data.nodes) for (i = 0; i < data.nodes.length; i++) { n = data.nodes[i]; if (Math.abs(n.x - CX) < 4 && Math.abs(n.y - CY) < 4 && n.r > hr) hr = n.r; }
      if (!hr) for (i = 0; i < edges.length; i++) if (edges[i].kind === 'trunk' && edges[i].r1 > hr) hr = +edges[i].r1;
      RAD = { o: hr || 66, a: 0 }; OX = CX; OY = CY;
    }
    var ne = {}, nd = {}, nam = {};
    edges.forEach(function (d) {
      var dep = d.kind === 'dep' && d.x1 !== undefined, map = dep ? fd : fe, r = map[d.id] || mkRec(d.id, dep), had = !!r.g;
      r.el = d.el; r.status = d.status || 'idle'; r.kind = d.kind || ''; r.nm = d.x1 !== undefined; r.p = { x: d.x, y: d.y };
      r.act = d.activity >= 0 ? Math.min(12, +d.activity) : 1; if (d.agent) { r.agent = d.agent; nam[d.agent] = r; }
      if (r.nm) { reshapeNM(r, d); setW(r); } else reshape(r, false);
      if (dep) { if (!had) r.filled = false; nd[d.id] = r; } else ne[d.id] = r;
    });
    deps.forEach(function (d) { var r = fd[d.id] || mkRec(d.id, true), had = r.g; r.el = d.el; r.status = d.status; reshape(r, false); if (!had) r.filled = false; nd[d.id] = r; });
    Object.keys(fe).forEach(function (k) { if (!ne[k]) retire(fe[k]); });
    Object.keys(fd).forEach(function (k) { if (!nd[k]) retire(fd[k]); });
    fe = ne; fd = nd; am = nam; if (!edges.length) { OX = CX; OY = CY; }
    if (nm) nodeSet(data, edges);
    kick();
  }
  /* removed edge: its particles fade out over ~0.5s, then the record is recycled */
  function retire(r) { if (r.dead) return; r.dead = true; r.dt0 = T.t; dying.push(r); }
  /* called by the graph code when node/edge geometry moved (e.g. dragging); processed once at the start of the next frame */
  function invalidate() { dirty = true; kick(); }
  function checkGeom() {
    var k;
    if (dirty) { dirty = false; refreshGeom(); if (!nmMode) RAD = { o: nodeR('.orch .body, .orch .core-bg', 66), a: nodeR('.agent .card, .agent .av', 0) }; }
    for (k in fe) if (!fe[k].nm) reshape(fe[k], false);
    for (k in fd) if (!fd[k].nm) reshape(fd[k], false);
    if (anyScale) {
      anyScale = false;
      for (var i = 0; i < hi; i++) {
        if (!P_on[i] || P_free[i]) continue; var ei = P_e[i], sc = scaleBy[ei]; if (!sc) continue;
        P_u[i] = sc * P_u[i] + offBy[ei];
        if (flipBy[ei]) { P_dir[i] = -P_dir[i]; P_v[i] = 1 - P_v[i]; if (P_u[i] < 0) P_u[i] = 0; }
      }
      scaleBy.length = 0; offBy.length = 0; flipBy.length = 0;
    }
  }

  /* ---------- particle pool ---------- */
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function alloc() {
    if (!freeTop || liveN >= liveCap) return -1;
    var i = freeStack[--freeTop]; P_on[i] = 1; liveN++; if (i >= hi) hi = i + 1;
    P_free[i] = 0; P_delay[i] = 0; P_age[i] = 0; P_u[i] = 0; P_arr[i] = 0; P_kind[i] = KD; return i;
  }
  function kill(i) { P_on[i] = 0; liveN--; freeStack[freeTop++] = i; }
  /* o: slot, size, speed, alpha, delay, life, narrow, arrive */
  function spawn(r, dir, kind, slot, size, speed, alpha, delay, life, narrow, arrive) {
    if (!r || !r.g || r.dead || r.s1 - r.s0 < 8) return -1;
    var i = alloc(); if (i < 0) return -1;
    P_e[i] = r.idx; P_dir[i] = dir; P_kind[i] = kind; P_slot[i] = slot; P_size[i] = size; P_speed[i] = speed; P_alpha[i] = alpha; P_delay[i] = delay || 0; P_life[i] = life || 99; P_arr[i] = arrive || 0; P_alpha[i] = alpha * r.br;
    P_v[i] = narrow ? (dir > 0 ? rnd(0.55, 0.8) : rnd(0.2, 0.45)) : (dir > 0 ? rnd(0.54, 1) : rnd(0, 0.46));
    P_swf[i] = rnd(0.8, 2.4); P_sph[i] = Math.random() * 6.28; P_swa[i] = rnd(0.04, 0.14); P_flick[i] = rnd(7, 19);
    return i;
  }
  function free(x, y, a, v, life, slot, size, alpha, delay) {
    var i = alloc(); if (i < 0) return -1;
    P_free[i] = 1; P_x[i] = x; P_y[i] = y; P_vx[i] = Math.cos(a) * v; P_vy[i] = Math.sin(a) * v; P_life[i] = life; P_size[i] = size; P_alpha[i] = alpha; P_slot[i] = slot; P_delay[i] = delay || 0; P_sph[i] = Math.random() * 6.28;
    return i;
  }
  /* radial puff that starts at a node's rim (rad) and moves outward, never inside the orb */
  function puff(x, y, n, slot, v0, v1, life, alpha, rad) { for (var i = 0; i < n; i++) { var a = Math.random() * 6.2832; free(x + Math.cos(a) * (rad || 0), y + Math.sin(a) * (rad || 0), a, rnd(v0, v1), rnd(life * 0.6, life), slot, rnd(0.6, 1.1), alpha, 0); } }

  /* constant streams: rv = [outPerSec, backPerSec, speed] per edge, k = look ('run'|'err'|'stall'|'idle'); activity scales running
     density (a^0.75) and brightness, a global budget in stepSpawn keeps the total live count bounded for any number of edges */
  function setRates(r, thin) {
    var st = r.status, a = Math.min(8, Math.max(0.25, r.act)), o = r.rv;
    if (st === 'running') { var f = Math.pow(a, 0.75); o[0] = 420 * f; o[1] = 230 * f; o[2] = 130; r.k = 'run'; r.br = 0.85 + 0.15 * Math.sqrt(a); }
    else if (st === 'errored') { o[0] = 190; o[1] = 0; o[2] = 70; r.k = 'err'; r.br = 1; }
    else if (st === 'stalled') { o[0] = 70; o[1] = 40; o[2] = 34; r.k = 'stall'; r.br = 1; }
    else { o[0] = 29 * thin; o[1] = 20 * thin; o[2] = 26; r.k = 'idle'; r.br = 1; }
  }
  var IDLE_MINLEN = 90, QI = function (q) { return q > 0.55 ? q : 0.55 + (q - 0.12) * 0.1; };   /* idle quality is cut far less than running quality */
  function depRate(r) { var s = r.status; return s === 'running' ? 60 : s === 'done' ? 30 : (r.nm && s !== 'stopped') ? 14 : 0; }
  function depSpeed(r) { return r.status === 'running' ? 72 : 40; }
  function liveness() {
    var hb = state && state.heartbeat;
    if (!hb || !hb.ts || !hb.interval_s) return 'dead';
    if (hb.status === 'stopped' || hb.status === 'paused') return hb.status;
    var age = (Date.now() - Date.parse(hb.ts)) / 1000; if (isNaN(age)) return 'dead';
    return age < 1.5 * hb.interval_s ? 'alive' : age < 3 * hb.interval_s ? 'late' : 'dead';
  }
  function steady(r, idx, rt, dt, sp) {
    r.acc[idx] += rt * dt; var n = 0;
    while (r.acc[idx] >= r.thr[idx] && n++ < 260) {
      r.acc[idx] -= r.thr[idx]; r.thr[idx] = rnd(0.6, 1.4);
      if (idx === 0) mkOut(r, r.k, sp); else if (idx === 1) mkBack(r, r.k, sp); else mkDep(r);
    }
  }
  function mkOut(r, k, sp) {
    if (k === 'err') return spawn(r, 1, KE, S_ERR, rnd(0.55, 1), sp * rnd(0.7, 1.3), 0.85, 0, rnd(1.1, 2.4));
    if (k === 'stall') return spawn(r, 1, KD, S_STALL, rnd(0.55, 0.95), sp * rnd(0.7, 1.2), 0.7);
    if (k === 'run') return spawn(r, 1, KD, S_DISP, rnd(0.55, 1.15), sp * rnd(0.6, 1.4), rnd(0.6, 1));
    return spawn(r, 1, KA, S_IDLE, rnd(0.55, 0.95), sp * rnd(0.7, 1.3), rnd(0.7, 1));
  }
  function mkBack(r, k, sp) {
    if (k === 'run') return spawn(r, -1, KR, S_BACK, rnd(0.5, 0.95), 105 * rnd(0.7, 1.3), rnd(0.5, 0.8));
    return spawn(r, -1, KA, k === 'stall' ? S_STALL : S_IDLE, rnd(0.5, 0.85), sp * rnd(0.8, 1.2), k === 'stall' ? rnd(0.45, 0.7) : rnd(0.58, 0.88));
  }
  function mkDep(r) {
    var run = r.status === 'running';
    return spawn(r, 1, KA, run ? S_DEPRUN : S_DEPACC, rnd(0.5, 0.9), (run ? 72 : 40) * rnd(0.8, 1.2), run ? 0.75 : 0.5);
  }
  /* populate a lane immediately so streams are complete on the first frame */
  function prefill(r, gs) {
    if (!r.g) return;
    var R = r.s1 - r.s0; if (R < 8) return;
    r.filled = true;
    var specs;
    if (r.dep) { var dr = depRate(r); specs = dr ? [[dr, 1, depSpeed(r)]] : []; }
    else { specs = [[r.rv[0], 1, r.rv[2]]]; if (r.rv[1]) specs.push([r.rv[1], -1, r.rv[2]]); }
    specs.forEach(function (sp) {
      var n = Math.min(3200, Math.round(sp[0] * (R / (sp[1] < 0 && r.k === 'run' ? 105 : (sp[2] || 60))) * (r.k === 'idle' ? QI(quality) : quality) * gs));
      for (var j = 0; j < n; j++) {
        var i = r.dep ? mkDep(r) : (sp[1] > 0 ? mkOut(r, r.k, sp[2]) : mkBack(r, r.k, sp[2]));
        if (i < 0) return;
        P_u[i] = rnd(0, R * 0.97); if (P_kind[i] === KE) { P_u[i] = rnd(0, R * 0.25); P_age[i] = rnd(0, P_life[i] * 0.85); }
      }
    });
  }
  function stepSpawn(dt) {
    var g = state && state.goal, lv = live.l, isLive = state && state.mode === 'live', k, r, j;
    var stopped = lv === 'stopped' || lv === 'paused' || (g && ['achieved', 'failed', 'cancelled'].indexOf(g.status) >= 0);
    for (j = dying.length - 1; j >= 0; j--) if (T.t - dying[j].dt0 > 0.6) { etab[dying[j].idx] = null; dying.splice(j, 1); }
    var running = 0, nE = 0; for (k in fe) { nE++; if (fe[k].status === 'running') running++; }
    var inten = Math.min(3, 0.35 * running + Math.min(evRate, 2) * 0.5), rmul = 1 + 0.3 * inten; T.sm = 1 + 0.2 * inten;
    var q = quality, thin = 1, nAct = 0, nIdle = 0, R;
    /* budget: estimated steady-state live count per edge; idle trickles take at most 40% of the cap, active edges share the rest */
    for (k in fe) {
      r = fe[k]; setRates(r, thin); R = r.s1 - r.s0; r.need = 0; if (!r.g || R < 8) continue;
      if (r.k === 'idle' && R < IDLE_MINLEN) { var fl = Math.min(3, IDLE_MINLEN / R); r.rv[0] *= fl; r.rv[1] *= fl; }   /* short ribbons keep a visible floor */
      r.need = R * (r.rv[0] / r.rv[2] + r.rv[1] / (r.k === 'run' ? 105 : r.rv[2])) * (r.k === 'run' ? rmul : 1);
      if (r.k === 'idle') nIdle += r.need * QI(q); else nAct += r.need * q;
    }
    for (k in fd) { r = fd[k]; R = r.s1 - r.s0; r.need = r.g && R >= 8 ? R * depRate(r) / depSpeed(r) : 0; nAct += r.need; }
    var B = Math.min(liveCap, POOL) * 0.78, idleUse = Math.min(nIdle, B * 0.6);
    gsI = nIdle > 1e-6 ? Math.min(1, Math.max(0.6, idleUse / nIdle)) : 1;      /* idle ribbons never drop below 60% of nominal */
    gsA = nAct > 1e-6 ? Math.min(1, Math.max(0.1, (B - Math.min(nIdle * gsI, B * 0.7)) / nAct)) : 1;
    for (k in fe) {
      r = fe[k]; var act = r.k === 'run', gs = r.k === 'idle' ? gsI : gsA;
      if (!r.filled) prefill(r, gs);
      if (r.status === 'stopped' || (stopped && r.k === 'idle')) continue;
      var m = (act ? rmul : 1) * (act || r.k !== 'idle' ? q : QI(q)) * gs, sp = r.rv[2] * (act ? T.sm : 1);
      steady(r, 0, r.rv[0] * m, dt, sp);
      if (r.rv[1]) steady(r, 1, r.rv[1] * m, dt, sp);
    }
    for (k in fd) {
      r = fd[k]; if (!r.filled) prefill(r, gsA);
      var rt = depRate(r); if (rt && r.status !== 'stopped') steady(r, 2, rt * q * gsA, dt, 0);
    }
  }
  function stepParts(dt) {
    var T_sm = T.sm, eo = 0;
    for (var i = 0; i < hi; i++) {
      if (!P_on[i]) continue;
      if (P_delay[i] > 0) { P_delay[i] -= dt; continue; }
      P_age[i] += dt;
      if (P_free[i]) {
        P_x[i] += P_vx[i] * dt; P_y[i] += P_vy[i] * dt; var dr = Math.exp(-1.5 * dt); P_vx[i] *= dr; P_vy[i] *= dr;
        if (P_age[i] > P_life[i]) kill(i);
        continue;
      }
      var e = etab[P_e[i]]; if (!e || !e.g || (e.dead && T.t - e.dt0 > 0.55)) { kill(i); continue; }
      var R = e.s1 - e.s0, sp = P_speed[i] * T_sm * KS;
      if (P_kind[i] === KE) { sp *= Math.max(0.04, 1 - (P_age[i] / P_life[i]) * 1.15); if (P_age[i] > P_life[i]) { kill(i); continue; } }
      P_u[i] += sp * dt;
      if (P_u[i] >= R) {
        if (P_arr[i] === 1) { if (e.sx !== undefined) puff(e.sx, e.sy, 24, S_RUN, 20, 60, 0.7, 0.6, e.rs + 4); }
        else if (P_arr[i] === 2) { var ep = endPos(e); if (ep) puff(ep.x, ep.y, 24, S_ACC, 15, 50, 0.7, 0.6, (e.rt || 12) + 4); }
        kill(i);
      }
    }
    while (hi > 0 && !P_on[hi - 1]) hi--;
  }
  function drawParts() {
    var aK = light ? 1.3 : 1, tt = T.t, i, a0 = M[0], b0 = M[1], c0 = M[2], d0 = M[3], e0 = M[4], f0 = M[5];
    var glowN = 0, cap = capNext ? [] : null;
    if (!nmMode) legacyGrid();
    for (i = 0; i < hi; i++) {
      if (!P_on[i] || P_delay[i] > 0) continue;
      var x, y, al;
      if (P_free[i]) {
        var f = 1 - P_age[i] / P_life[i]; al = P_alpha[i] * f * f * aK; x = P_x[i]; y = P_y[i];
        var cm_ = clearance(x, y);
        if (cm_ <= 0) continue; if (cm_ < 8) al *= cm_ / 8;
      } else {
        var e = etab[P_e[i]]; if (!e) continue;
        var R = e.s1 - e.s0, u = P_u[i], fr = u / R, sn = Math.sin(Math.PI * (fr < 0 ? 0 : fr > 1 ? 1 : fr));
        var env = Math.pow(sn, 0.55) * (0.6 + 0.4 * sn); if (env <= 0.01) continue;
        var a = tt * P_swf[i] + P_sph[i];
        al = P_alpha[i] * env * aK * (0.8 + 0.2 * Math.cos(a * 2.3));          /* sparkle via brightness, not blur */
        if (P_kind[i] === KE) { var fl = 0.5 + 0.5 * Math.sin(tt * P_flick[i] + P_sph[i]); al *= (0.25 + 0.75 * fl) * (1 - P_age[i] / P_life[i]); }
        atLane(e, P_dir[i] > 0 ? e.s0 + u : e.s1 - u, P_v[i], 0.18 + 0.82 * Math.pow(sn, 0.7), Math.sin(a) * P_swa[i]);
        x = tmp.x; y = tmp.y;
        if (e.dead) { var df = 1 - (tt - e.dt0) * 2; if (df <= 0) continue; al *= df; }
        if (!e.dep || e.nm) {   /* stop at every node rim (the lane's own end orbs and any node in the way) with a short fade */
          var dm = clearance(x, y);
          if (dm <= 0) continue; if (dm < 8) al *= dm * 0.125;
        }
      }
      if (al <= 0.02) continue;
      if (cap) cap.push(x, y, P_free[i] ? -1 : P_e[i]);
      var sp = slots[P_slot[i]], sz = P_size[i], cls = sz < 0.72 ? 0 : sz < 1.0 ? 1 : 2;
      var X = Math.round(a0 * x + c0 * y + e0), Y = Math.round(b0 * x + d0 * y + f0), sd = sp.disc[cls];
      ctx.globalAlpha = al > 1 ? 1 : al; ctx.drawImage(sd.c, X - sd.o, Y - sd.o);
      if (al > 0.8 && cls === 2 && (i & 3) === 0 && glowN < 500) { glowN++; ctx.globalAlpha = 0.5 * (al > 1 ? 1 : al); ctx.drawImage(sp.glow.c, X - sp.glow.o, Y - sp.glow.o); }
    }
    if (cap) { var cb = capNext; capNext = null; cb(cap, etab.map(function (e) { return e ? e.id : null; })); }
  }

  /* ---------- events -> streams ---------- */
  function resolveAgent(e) {
    var d = e.data || {}, c = [e.actor, d.agent, d.agent_id, d.assignee, d.to, d.from];
    for (var i = 0; i < c.length; i++) if (c[i] && (fe[c[i]] || am[c[i]])) return fe[c[i]] || am[c[i]];
    var t = e.task_id && ((state && state.tasks) || []).filter(function (x) { return x.id === e.task_id; })[0];
    return t && t.assignee && (fe[t.assignee] || am[t.assignee]) || null;
  }
  function startBurst(r) {
    if (r.sx !== undefined) puff(r.sx, r.sy, 40, S_ACC, 25, 70, 0.8, 0.6, r.rs + 4);
    for (var i = 0; i < 120; i++) spawn(r, 1, KD, S_DISP, rnd(0.7, 1.3), rnd(170, 240), 1, i * 0.005, 0, true, i === 119 ? 2 : 0);
  }
  function doneBurst(r, bad) {
    var s = bad ? S_ERR : S_BACK;
    var ep = r && endPos(r); if (ep) puff(ep.x, ep.y, 40, bad ? S_ERR : S_RUN, 25, 70, 0.8, 0.7, ((r && r.rt) || 12) + 4);
    for (var i = 0; i < 120; i++) spawn(r, -1, KR, s, rnd(0.7, 1.3), rnd(190, 250), 1, i * 0.005, 0, true, i === 119 ? 1 : 0);
  }
  function celebrate() {
    if (T.now - celebrated < 3) return; celebrated = T.now;
    var cs = [S_ACC, S_RUN, S_STALL, S_BONE], i;
    for (i = 0; i < 900; i++) { var ca = Math.random() * 6.2832, cr = RAD.o + 4; free(OX + Math.cos(ca) * cr, OY + Math.sin(ca) * cr, ca, rnd(70, 360), rnd(0.9, 1.9), cs[i % 4], rnd(0.7, 1.4), 1, 0); }
    var ids = Object.keys(fe), np = Math.max(8, Math.min(60, Math.round(1100 / Math.max(1, ids.length))));
    ids.forEach(function (id) {
      var r = fe[id];
      for (var j = 0; j < np; j++) { spawn(r, 1, KD, S_DISP, 1.2, 230, 1, j * 0.006, 0, false, j === np - 1 ? 2 : 0); spawn(r, -1, KR, S_BACK, 1.1, 230, 1, 0.5 + j * 0.006); }
    });
  }
  /* heartbeat tick: a wave of dust streams out from the core along the hierarchy: trunks first, branches a little later */
  function tick() {
    var nE = 0, k; for (k in fe) nE++;
    var cnt = nE > 20 ? 0.6 : 1;
    for (k in fe) {
      var r = fe[k]; if (r.status === 'errored') continue;
      var late = live.l === 'late', trunk = r.kind === 'trunk', base = r.kind === 'branch' ? 0.45 : 0.04;
      var n = Math.round((late ? 30 : trunk ? 150 : 110) * cnt * Math.max(0.35, quality));
      for (var i = 0; i < n; i++) spawn(r, 1, KD, S_DISP, rnd(0.6, 1.1), rnd(150, 210), 0.95, base + i * 0.0035, 0, true);
    }
  }
  function onState(st, pv) {
    state = st; prev = pv;
    if (!state) return;
    T.now = Date.now() / 1000; live.l = liveness();
    var hb = state.heartbeat, evs = state.events || [], go = state.goal, lv = enabled && !document.hidden && prev;
    if (hb && lastSeq != null && hb.seq !== lastSeq && lv && live.l !== 'stopped' && live.l !== 'paused') tick();
    if (hb) lastSeq = hb.seq;
    var mx = 0; evs.forEach(function (e) { if (e.seq > mx) mx = e.seq; });
    if (lastEv == null || mx < lastEv) lastEv = mx;
    else if (mx > lastEv) {
      var fresh = evs.filter(function (e) { return e.seq > lastEv; }).sort(function (a, b) { return a.seq - b.seq; });
      lastEv = mx; evRate += Math.min(fresh.length, 8) * 0.5;
      if (lv) fresh.slice(-8).forEach(function (e) {
        var t = String(e.type || ''), r = resolveAgent(e);
        if (/^goal\.(achieved|completed)/.test(t)) celebrate();
        else if (r && /^task\.(started|assigned|dispatched)/.test(t)) startBurst(r);
        else if (r && /^task\.(completed|done|succeeded)/.test(t)) doneBurst(r, false);
        else if (r && /^task\.(failed|errored)/.test(t)) doneBurst(r, true);
      });
    }
    if (go) { if (lv && lastGoal && lastGoal !== 'achieved' && go.status === 'achieved') celebrate(); lastGoal = go.status; }
    kick();
  }

  /* ---------- loop + adaptive quality ---------- */
  function percentile95() {
    var n = cfill, a = Array.prototype.slice.call(cbuf, 0, n).sort(function (x, y) { return x - y; }); return a[Math.min(n - 1, Math.floor(n * 0.95))] || 0;
  }
  function frame(now) {
    raf = 0;
    if (!enabled || document.hidden) return;
    raf = requestAnimationFrame(frame);
    var dms = now - last; if (throttled && dms < 28) return;
    var dt = Math.min(0.066, last ? dms / 1000 : 0.016); last = now;
    var t0 = performance.now(); T.t += dt;
    if ((geomTick = (geomTick + 1) % 20) === 0) dirty = true;
    checkGeom();
    if ((liveT -= dt) <= 0) { liveT = 0.5; live.l = liveness(); }
    evRate *= Math.exp(-dt / 6);
    stepSpawn(dt); stepParts(dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.imageSmoothingEnabled = false; ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
    drawParts(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    lastCost = performance.now() - t0;
    if (++warm > 90) { cbuf[cpos] = lastCost; cpos = (cpos + 1) % cbuf.length; if (cfill < cbuf.length) cfill++; }
    if (++gTick >= 30 && cfill >= 30) {            /* p95 of our own per-frame work drives quality: degrade spawn rate, then live count */
      gTick = 0; p95 = percentile95();
      if (p95 > 12) { quality = Math.max(0.12, quality * 0.85); throttled = quality < 0.4; }
      else if (p95 < 8) { quality = Math.min(1, quality * 1.15); if (quality > 0.6) throttled = false; }
      liveCap = Math.max(4800, Math.round(POOL * Math.min(1, quality * 1.3)));
    }
  }
  function kick() { if (enabled && !raf && !document.hidden && col) { last = 0; raf = requestAnimationFrame(frame); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  function killAll() { for (var i = 0; i < hi; i++) if (P_on[i]) kill(i); hi = 0; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); }

  readColors(); watchDpr();
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else { refreshGeom(); kick(); } });
  var chg = function () { enabled = !(rm && rm.matches); if (!enabled) { stop(); killAll(); } else kick(); };
  if (rm) { if (rm.addEventListener) rm.addEventListener('change', chg); else if (rm.addListener) rm.addListener(chg); }
  if (cm) { if (cm.addEventListener) cm.addEventListener('change', readColors); else if (cm.addListener) cm.addListener(readColors); }
  setInterval(readColors, 4000);   /* theme tokens may change without a colour-scheme flip */
  if (window.ResizeObserver) new ResizeObserver(refreshGeom).observe(graph);
  window.addEventListener('resize', refreshGeom); window.addEventListener('scroll', refreshGeom, true); window.addEventListener('load', refreshGeom);
  window.__aosFx = { dpr: function () { return DPR; }, canvas: function () { return cv; }, active: function () { return liveN; }, cost: function () { return lastCost; }, p95: function () { return p95; }, throttled: function () { return throttled; }, enabled: function () { return enabled; }, quality: function () { return quality; }, capture: function (cb) { capNext = cb; kick(); }, edgeCount: function () { var o = {}, i; for (i = 0; i < hi; i++) if (P_on[i] && !P_free[i] && etab[P_e[i]]) { var id = etab[P_e[i]].id; o[id] = (o[id] || 0) + 1; } return o; }, nodes: function () { var o = [], i; for (i = 0; i < GN; i++) o.push([GX[i], GY[i], GR[i]]); return o; }, matrix: function () { return M.slice(); } };
  /* theme toggle: re-read tokens at once (sprites rebuilt when they changed); colKey is exposed for tests */
  function refreshColors() { readColors(); if (typeof invalidate === 'function') invalidate(); kick(); return colKey; }
  window.addEventListener('aos-theme', refreshColors);
  window.AosFx = { sync: sync, onState: onState, invalidate: invalidate, refreshColors: refreshColors, refreshView: function () { refreshGeom(); kick(); }, colorKey: function () { return colKey; } };
})();
