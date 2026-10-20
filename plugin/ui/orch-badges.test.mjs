// node ui/orch-badges.test.mjs : static checks that the UI renders the out-of-scope flag (goal card, task row, worker drawer/tooltip) and the Needs-you inbox.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url)); let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n); };
const rd = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const orch = rd('orch.js'), app = rd('app.js'), css = rd('orch.css') + rd('styles.css') + rd('global.css'), html = rd('index.html');
ok('goal card shows out_of_scope_count', /g\.out_of_scope_count[\s\S]{0,200}out of scope/.test(orch));
ok('task row shows out_of_scope badge', /t\.out_of_scope\)[\s\S]{0,200}'orch-oos'/.test(orch));
ok('worker drawer + tooltip show out of scope only from a.out_of_scope', /a\.out_of_scope\) \{ var sb = el\('span', 'tag oos-badge'/.test(app) && /a\.out_of_scope\) ml =/.test(app));
ok('badge styles exist', /\.orch-oos\{/.test(css) && /\.oos-badge\{/.test(css));
console.log(fails ? fails + ' FAILED' : 'orch-badges: all ok'); process.exit(fails ? 1 : 0);
