/* AOS-1 boot sequence and HUD effects. Owner: boot agent.
 * Progressive enhancement: vanilla ES5, no deps, never throws, no-op when targets are missing.
 */
(function () {
  'use strict';

  function safe(fn) { try { return fn(); } catch (e) { return undefined; } }
  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hms(total) {
    var h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
    return pad(h) + ':' + pad(m) + ':' + pad(s);
  }
  function utcHms() {
    var d = new Date();
    return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
  }

  var reduced = !!safe(function () {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  function bootedBefore() {
    return safe(function () { return window.sessionStorage.getItem('aos-booted') === '1'; }) === true;
  }
  function markBooted() {
    safe(function () { window.sessionStorage.setItem('aos-booted', '1'); });
  }

  var CSS = [
    '@keyframes aos-power-on{0%{opacity:0;transform:translateY(8px)}6%{opacity:.85}10%{opacity:.12}16%{opacity:.9}22%{opacity:.3}30%{opacity:1;transform:translateY(0)}100%{opacity:1;transform:none}}',
    '@keyframes aos-row-flash{0%{background-color:rgba(196,163,90,.30)}100%{background-color:rgba(196,163,90,0)}}',
    'body.booting #stats:not(.boot-on),body.booting .top:not(.boot-on),body.booting #graph:not(.boot-on),body.booting #dock:not(.boot-on){opacity:0}',
    'body.booting .boot-on{animation:aos-power-on .6s linear both}',
    '#events tr.row.row-flash td{animation:aos-row-flash 1.3s ease-out both}',
    '#aos-clock{position:fixed;top:2px;left:50%;transform:translateX(-50%);z-index:5;pointer-events:none;margin:0;font:500 10px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.08em;color:#8d93ab;opacity:.75;white-space:nowrap}'
  ].join('\n');

  function injectCss() {
    if ($('boot-css')) return;
    var st = document.createElement('style');
    st.id = 'boot-css';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------- 1) boot sequence ---------- */
  var BOOT_STEPS = [['.top', 0], ['#stats', 120], ['#graph', 240], ['#dock', 360]];
  var bootTimers = [];

  function clearBootTimers() {
    while (bootTimers.length) clearTimeout(bootTimers.pop());
  }

  function runBoot() {
    clearBootTimers();
    var body = document.body;
    if (!body) return;
    body.classList.add('booting');
    BOOT_STEPS.forEach(function (s) {
      var p = document.querySelector(s[0]);
      if (p) p.classList.remove('boot-on');
    });
    void body.offsetWidth; /* force reflow so re-added classes restart the animation */
    BOOT_STEPS.forEach(function (s) {
      bootTimers.push(setTimeout(function () {
        var p = document.querySelector(s[0]);
        if (p) p.classList.add('boot-on');
      }, s[1]));
    });
    /* always release the hidden state, even if a panel is missing */
    bootTimers.push(setTimeout(function () { body.classList.remove('booting'); }, 1600));
  }

  function startBoot() {
    if (reduced || bootedBefore()) return;
    markBooted();
    runBoot();
  }

  /* ---------- 2) mission clock ---------- */
  function initClock() {
    var t0 = Date.now();
    var mc = $('mission-clock'), uc = $('utc-clock'), readout = null;
    if (!mc && !uc) {
      readout = document.createElement('div');
      readout.id = 'aos-clock';
      readout.setAttribute('aria-hidden', 'true');
      document.body.appendChild(readout);
    }
    function tick() {
      safe(function () {
        var tp = 'T+ ' + hms(Math.floor((Date.now() - t0) / 1000));
        var ut = 'UTC ' + utcHms();
        if (readout) readout.textContent = tp + '  ' + ut;
        if (mc) mc.textContent = tp;
        if (uc) uc.textContent = ut;
      });
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- 3) title decode ---------- */
  var GLYPHS = '!<>-_\\/[]{}=+*^?#0123456789ABCDEFabcdef';
  var DECODE_MS = 700;

  function initDecode() {
    var gt = $('goal-title');
    if (!gt || reduced || !window.MutationObserver) return;
    var started = false, done = false, timer = null, shown = null, target = '', t0 = 0, thresholds = [], mo = null;

    function finish() {
      done = true;
      if (timer) clearTimeout(timer);
      timer = null;
      if (mo) { mo.disconnect(); mo = null; }
      /* only land on the real value if nothing else wrote to the element meanwhile */
      if (gt.textContent === shown) gt.textContent = target;
    }

    function frame() {
      timer = null;
      if (done) return;
      if (gt.textContent !== shown) { finish(); return; } /* app changed the title: its value wins */
      var p = (Date.now() - t0) / DECODE_MS;
      if (p >= 1) { finish(); return; }
      var out = '';
      for (var j = 0; j < target.length; j++) {
        var ch = target.charAt(j);
        if (ch === ' ' || p >= thresholds[j]) out += ch;
        else out += GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
      }
      shown = out;
      gt.textContent = out;
      timer = setTimeout(frame, 40);
    }

    function start(text) {
      started = true;
      target = text;
      shown = gt.textContent; /* baseline: the value the app just wrote */
      t0 = Date.now();
      for (var j = 0; j < text.length; j++) {
        thresholds[j] = 0.15 + 0.7 * (j / text.length) + Math.random() * 0.15;
      }
      frame();
    }

    function check() {
      if (started || done) return;
      var t = gt.textContent;
      if (t && t.indexOf('Loading') !== 0) start(t);
    }

    mo = new MutationObserver(function () { safe(check); });
    mo.observe(gt, { childList: true, characterData: true, subtree: true });
    check();
  }

  /* ---------- 4) telemetry row flash ---------- */
  function initFlash() {
    var host = $('events');
    if (!host || !window.MutationObserver) return;
    var CAP = 20, prev = null;

    function keyOf(tr) {
      var c = tr.cells;
      return (c[0] ? c[0].getAttribute('data-ts') || '' : '') + '|' +
        (c[1] ? c[1].textContent : '') + '|' + (c[2] ? c[2].textContent : '') + '|' +
        (c[3] ? c[3].textContent : '');
    }

    function flash(tr) {
      tr.classList.add('row-flash');
      setTimeout(function () { tr.classList.remove('row-flash'); }, 1400);
    }

    function scan() {
      var rows = host.querySelectorAll('tbody tr.row');
      if (!rows.length) return;
      var cur = {}, fresh = [];
      for (var i = 0; i < rows.length; i++) {
        var k = keyOf(rows[i]), n = 2, base = k;
        while (cur[k]) k = base + '#' + (n++);
        cur[k] = 1;
        if (prev && !prev[k]) fresh.push(rows[i]);
      }
      /* first populated render is the baseline: no flash for the whole history */
      if (prev) fresh.slice(-CAP).forEach(flash);
      prev = cur;
    }

    new MutationObserver(function () { safe(scan); }).observe(host, { childList: true, subtree: true });
    scan();
  }

  /* ---------- public hook ---------- */
  window.AOSBoot = {
    replay: function () {
      safe(function () { if (!reduced) runBoot(); });
    }
  };

  try {
    injectCss();
  } catch (e) { /* ignore */ }
  safe(startBoot);
  safe(initClock);
  safe(initDecode);
  safe(initFlash);
})();
