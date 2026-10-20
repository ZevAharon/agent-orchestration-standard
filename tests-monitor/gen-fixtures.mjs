// MANUAL regeneration of tests-monitor/fixtures/* from the REAL orchestrator engine + fake claude. NOT run by the tests.
// Usage (from the repo root while ./orchestrator is still present):  node tests-monitor/gen-fixtures.mjs
// This is the ONLY file in tests-monitor/ allowed to reference the orchestrator. See tests-monitor/fixtures/README.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { mkSandbox, drive, ptask, crit, edit } = await import(path.join(HERE, '..', 'orchestrator', 'test', 'helpers.mjs'));
const OUT = path.join(HERE, 'fixtures'), FIX = '/fixture';
const KEEP = ['goal.json', 'tasks.json', 'events.ndjson', 'approvals'];   // everything monitor.mjs reads
const wrong = (n) => ({ behavior: 'fail_checks', edits: [{ path: 'a.txt', content: `wrong ${n}\n` }] });

function scrubInto(sb, src, dest, id) {
  fs.mkdirSync(dest, { recursive: true });
  for (const n of KEEP) {
    const f = path.join(src, n); if (!fs.existsSync(f)) continue;
    if (fs.statSync(f).isDirectory()) { fs.cpSync(f, path.join(dest, n), { recursive: true }); continue; }
    fs.writeFileSync(path.join(dest, n), fs.readFileSync(f, 'utf8').split(sb.root).join(FIX));
  }
  const g = JSON.parse(fs.readFileSync(path.join(dest, 'goal.json'), 'utf8')); if (g.id !== id) throw new Error('id mismatch ' + g.id);
}
async function make(name, id, scenarioTasks, spec, derive) {
  const sb = mkSandbox('aos-fixgen');
  try {
    sb.scenario({ tasks: scenarioTasks });
    const { dir } = await sb.goal({ id, ...spec });
    await drive(sb.engine(dir));
    const dest = path.join(OUT, name, 'goals', id);
    fs.rmSync(path.join(OUT, name), { recursive: true, force: true });
    scrubInto(sb, dir, dest, id);
    return { sb, dest };
  } finally { sb.cleanup(); }
}
const onePlan = (...tasks) => ({ tasks, risks: [] });
const ALL3 = { id: 'c1', text: 'a, b and c present', check: { argv: ['node', '-e', "const f=require('fs');for(const [n,w] of [['a.txt','alpha'],['b.txt','beta'],['c.txt','gamma']])if(f.readFileSync(n,'utf8').trim()!==w)process.exit(1)"], timeout_s: 30 } };

{ // all-success: scenarios/all-success-3-tasks.json (3 tasks, all haiku, first try)
  const sb = mkSandbox('aos-fixgen');
  try {
    sb.scenario(JSON.parse(fs.readFileSync(path.join(HERE, '..', 'orchestrator', 'test', 'scenarios', 'all-success-3-tasks.json'), 'utf8')));
    const { dir } = await sb.goal({ id: 'g-test', success_criteria: [ALL3] });
    await drive(sb.engine(dir));
    fs.rmSync(path.join(OUT, 'all-success'), { recursive: true, force: true });
    scrubInto(sb, dir, path.join(OUT, 'all-success', 'goals', 'g-test'), 'g-test');
  } finally { sb.cleanup(); }
}
// escalation: haiku fails checks, sonnet succeeds
await make('escalation', 'g-esc', { t1: [wrong(1), edit('a.txt', 'alpha')] }, { success_criteria: [crit('a.txt', 'alpha')], plan: onePlan(ptask('t1', 'a.txt', 'alpha')) });
// failed: t1 fails on every tier, t2 (depends on t1) never runs
await make('failed', 'g-fail', { t1: [wrong(1), wrong(2), wrong(3)] }, { success_criteria: [crit('b.txt', 'beta')], plan: onePlan(ptask('t1', 'a.txt', 'alpha'), ptask('t2', 'b.txt', 'beta', { deps: ['t1'] })) });
// fabricated states derived from escalation. Timestamps are placeholders (epoch); tests rewrite them relative to "now".
const esc = path.join(OUT, 'escalation', 'goals', 'g-esc');
const wait = path.join(OUT, 'waiting', 'goals', 'g-wait'); fs.rmSync(path.join(OUT, 'waiting'), { recursive: true, force: true }); fs.cpSync(esc, wait, { recursive: true });
let g = JSON.parse(fs.readFileSync(path.join(wait, 'goal.json'), 'utf8')); g.id = 'g-wait'; fs.writeFileSync(path.join(wait, 'goal.json'), JSON.stringify(g, null, 2) + '\n');
fs.mkdirSync(path.join(wait, 'approvals'), { recursive: true });
fs.writeFileSync(path.join(wait, 'approvals', 'A-1.json'), JSON.stringify({ id: 'A-1', task_id: 't1', status: 'pending', requested_at: '1970-01-01T00:00:00.000Z' }, null, 2) + '\n');
const plan = path.join(OUT, 'plan', 'goals', 'g-plan'); fs.rmSync(path.join(OUT, 'plan'), { recursive: true, force: true }); fs.cpSync(esc, plan, { recursive: true });
g = JSON.parse(fs.readFileSync(path.join(plan, 'goal.json'), 'utf8')); g.id = 'g-plan'; g.status = 'draft'; g.orch.plan_state = 'awaiting_approval'; g.orch.plan_awaiting_since_ms = 0;
fs.writeFileSync(path.join(plan, 'goal.json'), JSON.stringify(g, null, 2) + '\n');
console.log('fixtures written to', OUT);
