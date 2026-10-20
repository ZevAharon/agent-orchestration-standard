// node ui/mobile.test.mjs : static CSS/JS checks for the <=720px polish (the layout itself was measured in a real browser at 390/375/320px:
// no horizontal scroll, goal title not truncated, header 147px, stats inside the viewport).
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url)); let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n); };
const css = fs.readFileSync(path.join(dir, 'global.css'), 'utf8'), html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), orch = fs.readFileSync(path.join(dir, 'orch.js'), 'utf8');
const m = css.slice(css.indexOf('mobile polish'));
const block = (m.match(/@media \(max-width:720px\)\{([\s\S]*?)\n\}/) || [])[1] || '';
const rule = (sel) => (block.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}')) || [])[1] || '';
ok('mobile block exists', block.length > 100);
ok('goal title wraps instead of ellipsis', /white-space:normal/.test(rule('.goalbar .goal-title')) && /overflow:visible/.test(rule('.goalbar .goal-title')));
ok('goalbar may grow to two lines', /flex-wrap:wrap/.test(rule('.goalbar')) && /height:auto/.test(rule('.goalbar')));
ok('stats stay inside the viewport', /max-width:calc\(100% - 28px\)/.test(rule('.stats')) && /left:auto/.test(rule('.stats')));
ok('header buttons are icon-only', /display:none/.test(rule('.streams-btn .theme-l,.theme-btn .theme-l')));
ok('touch targets >= 36px, drawer close 44px', /min-height:36px/.test(rule('.orch-hbtn,.theme-btn,.streams-btn,.live-ind,.aos-replay-btn')) && /width:44px;height:44px/.test(rule('#dr-close')));
ok('global.css cache-busted', /global\.css\?v=([3-9]|\d\d)/.test(html));
ok('GOALS header badge is labelled active-only', /R\.n\.textContent = n \+ ' active'/.test(orch));
console.log(fails ? fails + ' FAILED' : 'mobile: all ok'); process.exit(fails ? 1 : 0);
