// node ui/needs-you.test.mjs : numeric checks of the Needs-you aggregation + static wiring of the header badge / popover.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const dir = path.dirname(fileURLToPath(import.meta.url)); let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n); };
const { compute } = createRequire(import.meta.url)('./needs-you.js');
const rd = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
ok('empty / junk input -> 0', compute([]).total === 0 && compute(null).total === 0 && compute([null, 3, {}]).total === 0);
const G = [
  { id: 'a', title: 'A', status: 'active', approvals_pending: 2 },
  { id: 'b', title: 'B', status: 'draft', plan_state: 'awaiting_approval' },
  { id: 'c', title: 'C', status: 'blocked', blocked_reason: 'halted: budget' },
  { id: 'd', title: 'D', status: 'paused', limit_paused: true, resume_at: null },
  { id: 'e', title: 'E', status: 'paused', limit_paused: true, resume_at: '2030-01-01T00:00:00Z' },
  { id: 'f', title: 'F', status: 'achieved', approvals_pending: 5 },
  { id: 'g', title: 'G', status: 'active', plan_state: 'awaiting_approval', approvals_pending: 0 },
];
const r = compute(G);
ok('aggregates approvals(2)+plan(1)+blocked(1)+manual limit pause(1) = 5', r.total === 5);
ok('kinds per goal', r.items.map((i) => i.id + ':' + i.kind).join() === 'a:approval,b:plan,c:blocked,d:limit');
ok('auto-resuming limit pause, terminal goals and non-draft plan_state are not counted', !r.items.some((i) => ['e', 'f', 'g'].includes(i.id)));
ok('blocked reason is included', /halted: budget/.test(r.items[2].text));
const orch = rd('orch.js'), css = rd('orch.css'), html = rd('index.html');
ok('badge hidden at 0, shows count, opens list linking to detail', /R\.needs\.hidden = nd\.total <= 0/.test(orch) && /Needs you /.test(orch) && /goDetail\(it\.id\)/.test(orch));
ok('read-only: no fetch/POST in the inbox code', !/fetch|apiCall|POST/.test((orch.match(/function setNeedsOpen[\s\S]*?\n  \}\n  function renderNeeds[\s\S]*?\n  \}/) || [''])[0]));
ok('script loaded before orch.js', html.indexOf('needs-you.js') > 0 && html.indexOf('needs-you.js') < html.indexOf('orch.js'));
ok('mobile: popover fits viewport, 36px targets', /@media \(max-width:720px\)\{\.orch-needs\{[^}]*min-height:36px\}\.orch-needs-pop\{[^}]*left:12px;right:12px/.test(css) && /\.orch-needs-it\{[^}]*min-height:36px/.test(css));
console.log(fails ? fails + ' FAILED' : 'needs-you: all ok'); process.exit(fails ? 1 : 0);
