// node ui/orch-rules.test.mjs : static checks of the rules chip, human-review criteria, and the draft-from-prompt form (read-only display; the draft only posts to the control server).
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import vm from 'node:vm';
const dir = path.dirname(fileURLToPath(import.meta.url)); let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n); };
const rd = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const orch = rd('orch.js'), css = rd('orch.css');
ok('goal card shows the rules chip from g.rules only', /isObj\(g\.rules\)\) r2\.appendChild\(rulesChip\(g\.rules\)\)/.test(orch));
ok('chip shows profile, hash and loosenings', /clip\(r\.profile[\s\S]{0,80}clip\(r\.hash, 12\)[\s\S]{0,120}loosening/.test(orch));
ok('detail has a rules section listing loosening and not-applied ids', /paint\(D\.rules[\s\S]{0,900}loosening_ids[\s\S]{0,200}dropped_ids/.test(orch) && /'rules', 'budget'/.test(orch));
ok('human-review criterion shows "needs confirmation" and the CLI hint, with no confirm button', /c\.verify === 'human'/.test(orch) && /needs confirmation/.test(orch) && /aos-orch confirm/.test(orch) && !/creq\('POST', '\/api\/goals\/' \+ enc\([^)]*\) \+ '\/confirm/.test(orch));
ok('draft posts only to /api/goals/draft and creates nothing by itself', /creq\('POST', '\/api\/goals\/draft'/.test(orch) && (orch.match(/creq\('POST', '\/api\/goals'/g) || []).length === 1);
ok('draft output is cleaned of control/bidi characters and rendered as text', /function cleanTxt/.test(orch) && !/innerHTML\s*=\s*[^'"]*(draft|j\.)/.test(orch.replace(/R\.close\.innerHTML[^\n]*/, '')));
ok('draft rounds are capped at 2 and questions at 3', /DRAFT_ROUNDS = 2/.test(orch) && /slice\(0, 3\)/.test(orch));
ok('styles exist', /\.orch-rules\{/.test(css) && /\.orch-human\{/.test(css) && /\.orch-critmeta\{/.test(css));

console.log(fails ? fails + ' FAILED' : 'orch-rules: all ok'); process.exit(fails ? 1 : 0);
