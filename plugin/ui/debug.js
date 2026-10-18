/* AOS debug recorder: inert unless the URL has ?debug=1. Shows a small on-screen log of anything that flips
   (label text, particle canvas size/visibility, graph size, tab visibility, window size, page reloads, frame rate)
   with timestamps, plus Copy/Clear buttons. Read-only: it never changes the page's behaviour. */
(function () {
  'use strict';
  try {
    if (!/[?&]debug=1(&|$)/.test(location.search)) return;
    var L = window.__flickerLog = [], MAX = 400, last = '', t0 = Date.now();
    function ts() { return ((Date.now() - t0) / 1000).toFixed(1) + 's'; }
    function log(s) { L.push(ts() + '  ' + s); if (L.length > MAX) L.shift(); render(); }
    var box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;width:min(560px,92vw);max-height:42vh;overflow:auto;background:rgba(10,14,23,.94);color:#e8e1d2;font:11px/1.45 ui-monospace,Menlo,monospace;border:1px solid rgba(232,225,210,.25);padding:6px 8px;border-radius:4px;pointer-events:auto';
    var bar = document.createElement('div'); bar.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:4px;position:sticky;top:0;background:rgba(10,14,23,.97)';
    var title = document.createElement('b'); title.textContent = 'AOS debug (' + location.host + ')'; bar.appendChild(title);
    function btn(label, fn) { var b = document.createElement('button'); b.textContent = label; b.style.cssText = 'font:inherit;color:inherit;background:transparent;border:1px solid rgba(232,225,210,.35);border-radius:3px;padding:1px 8px;cursor:pointer'; b.onclick = fn; bar.appendChild(b); return b; }
    var msg = document.createElement('span'); msg.style.opacity = '.7';
    btn('Copy', function () {
      var txt = L.join('\n'), done = function () { msg.textContent = 'copied ' + L.length + ' lines'; };
      try { navigator.clipboard.writeText(txt).then(done, function () { fallback(txt); done(); }); } catch (e) { fallback(txt); done(); }
    });
    btn('Clear', function () { L.length = 0; render(); });
    bar.appendChild(msg); box.appendChild(bar);
    var pre = document.createElement('pre'); pre.style.cssText = 'margin:0;white-space:pre-wrap'; box.appendChild(pre);
    function fallback(txt) { var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta); }
    function render() { pre.textContent = L.slice(-14).join('\n'); }
    function attach() { if (document.body) document.body.appendChild(box); else setTimeout(attach, 50); }
    attach();

    function sig() {
      var c = document.querySelector('canvas'), s = null, best = 0; [].forEach.call(document.querySelectorAll('svg'), function (v) { var a = v.clientWidth * v.clientHeight; if (a > best) { best = a; s = v; } });
      var texts = [].slice.call(document.querySelectorAll('svg text')).map(function (x) { return x.textContent || ''; }).filter(function (x) { return x.length > 3; });
      var ell = texts.filter(function (x) { return x.indexOf('…') >= 0; }).length;
      var fs = 0; try { var f = document.querySelector('svg text'); fs = f ? parseFloat(getComputedStyle(f).fontSize) : 0; } catch (e) {}
      return ['labels=' + texts.length, 'truncated=' + ell, 'labelChars=' + texts.join('').length, 'font=' + fs,
        'canvas=' + (c ? c.width + 'x' + c.height + (getComputedStyle(c).display === 'none' ? '(hidden)' : '') : 'none'),
        'svg=' + (s ? s.clientWidth + 'x' + s.clientHeight : '-'), 'body=' + document.body.className,
        'win=' + innerWidth + 'x' + innerHeight, 'dpr=' + devicePixelRatio, 'vis=' + document.visibilityState,
        'banner=' + (document.querySelector('#banner') && !document.querySelector('#banner').hidden ? 'SHOWN' : 'off')].join(' ');
    }
    setInterval(function () { var s = sig(); if (s !== last) { log((last ? 'CHANGE ' : 'START  ') + s); last = s; } }, 100);
    document.addEventListener('visibilitychange', function () { log('visibilitychange -> ' + document.visibilityState); });
    addEventListener('resize', function () { log('resize ' + innerWidth + 'x' + innerHeight); });
    addEventListener('focus', function () { log('window focus'); }); addEventListener('blur', function () { log('window blur'); });
    addEventListener('pagehide', function () { log('pagehide'); }); addEventListener('pageshow', function (e) { log('pageshow persisted=' + e.persisted); });
    /* frame-rate dips (particle engine throttling shows up as fps drops) */
    var frames = 0, tf = performance.now();
    (function tick(now) { frames++; if (now - tf >= 2000) { var fps = Math.round(frames * 1000 / (now - tf)); if (fps < 40) log('low fps ' + fps); frames = 0; tf = now; } requestAnimationFrame(tick); })(tf);
    /* did the page itself reload? (a reload resets the clock, so note the load) */
    log('page loaded; navigation type ' + (performance.getEntriesByType && performance.getEntriesByType('navigation')[0] ? performance.getEntriesByType('navigation')[0].type : '?'));
  } catch (e) { /* debug recorder must never break the page */ }
})();
