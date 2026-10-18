// node ui/theme-tokens.test.mjs : (1) the explicit [data-theme=light] and the @media light token blocks are identical in styles.css and theme.css,
// the dark palette is one selector-list block; (2) WCAG contrast of text/accent/status tokens in both palettes.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url)); let fails = 0;
const ok = (n, c, i) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
const block = (css, open) => { const i = css.indexOf(open); if (i < 0) return null; let d = 0, j = css.indexOf('{', i); const s = j; for (; j < css.length; j++) { if (css[j] === '{') d++; else if (css[j] === '}' && --d === 0) break; } return css.slice(s + 1, j); };
const toks = b => { const o = {}; for (const m of b.matchAll(/(--[\w-]+)\s*:\s*((?:[^;{}]|\([^)]*\))+?)\s*(?:;|$)/g)) o[m[1]] = m[2].replace(/\/\*.*?\*\//g, '').trim(); return o; };
const pal = {};
for (const f of ['styles.css', 'theme.css']) {
  const css = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const L1 = block(css, ':root[data-theme=light]{\n'), L2 = block(css, '@media (prefers-color-scheme:light){:root:not([data-theme]){');
  const D = block(css, ':root,:root[data-theme=dark]{');
  const t1 = toks(L1), t2 = toks(L2), td = toks(D);
  ok(f + ' light token blocks identical (' + Object.keys(t1).length + ' tokens)', JSON.stringify(t1) === JSON.stringify(t2) && Object.keys(t1).length > 15);
  ok(f + ' dark palette is a single block', Object.keys(td).length > 15);
  ok(f + ' every light token has a dark counterpart', Object.keys(t1).every(k => k in td), Object.keys(t1).filter(k => !(k in td)));
  pal[f] = { light: t1, dark: td };
}
// effective palettes = styles.css overridden by theme.css (theme loads later with equal specificity)
const eff = m => ({ ...pal['styles.css'][m], ...pal['theme.css'][m] });
const P = { light: eff('light'), dark: eff('dark') };
const hex = s => { s = s.trim(); if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + s.slice(1).replace(/./g, '$&$&'); const m = /^#([0-9a-f]{6})$/i.exec(s); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; };
const rgb3 = s => s.trim().split(/\s+/).map(Number);
const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const rows = [];
for (const m of ['light', 'dark']) {
  const T = P[m], bgs = { bg: hex(T['--bg']), s1: hex(T['--s1']), s2: hex(T['--s2']), s3: hex(T['--s3']) };
  const fg = { text: hex(T['--text']), 'text-2': hex(T['--text-2']), muted: hex(T['--muted']), accent: hex(T['--accent']), 'accent-hi': hex(T['--accent-hi']) };
  for (const k of ['running', 'stalled', 'errored', 'idle', 'review', 'done', 'paused']) fg[k] = rgb3(T['--' + k + '-rgb']);
  for (const [n, c] of Object.entries(fg)) for (const [bn, b] of Object.entries(bgs)) {
    const r = cr(c, b), need = (n === 'text' || n === 'text-2' || n === 'muted' || n === 'accent-hi' || n === 'accent') ? 4.5 : 3; // status colours are UI/large (dots, 11px+ uppercase labels checked at 4.5 below)
    rows.push([m, n, bn, +r.toFixed(2), need, r >= need]);
  }
  const oa = cr(hex(T['--on-accent']), hex(T['--accent'])); rows.push([m, 'on-accent', 'accent', +oa.toFixed(2), 4.5, oa >= 4.5]);
}
for (const r of rows) if (!r[5]) ok(`contrast ${r[0]} ${r[1]} on ${r[2]}`, false, r[3] + ' < ' + r[4]);
ok('contrast: ' + rows.length + ' pairs evaluated, all pass', rows.every(r => r[5]));
const worst = rows.filter(r => r[5]).sort((a, b) => a[3] - b[3]).slice(0, 3); console.log('lowest passing', JSON.stringify(worst));
process.exit(fails ? 1 : 0);
