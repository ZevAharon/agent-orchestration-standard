// Synthetic demo dataset for the README screenshots. Every name here is fictional.
// buildDemoState(variant, opts): variant 'main' (mid-day scene) | 'quiet' (everything idle).
// opts: { now = Date.now(), at = null (ms; builds a replay slice), freshAlert = false }
// buildDemoHistory(opts): the /api/history payload (first_ts, last_ts, count, markers).

const MIN = 60e3;
const WINDOW_MIN = 180;
const iso = (ms) => new Date(ms).toISOString();

const MODELS = {
  opus: { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  sonnet: { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  haiku: { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
};

// startAgo: minutes before "now"; dur: minutes (finished agents); w: relative token weight
// st: final status in the 'main' scene; tool: [name, summary] for running agents
const PROJECTS = [
  { name: 'atlas-api', hex: '7f3a', agents: [
    { n: 'Claude Code', m: 'sonnet', startAgo: 176, st: 'idle', w: 6 },
    { n: 'Plan auth refactor rollout', m: 'opus', startAgo: 150, dur: 9, w: 5, tools: [['Read', 'session.ts'], ['Grep', 'authorize'], ['Read', 'roles.ts']] },
    { n: 'Review auth middleware', m: 'sonnet', startAgo: 128, dur: 14, w: 3, tools: [['Read', 'middleware.ts'], ['Grep', 'verifyToken'], ['Read', 'auth.test.ts']] },
    { n: 'Generate OpenAPI client types', m: 'haiku', startAgo: 96, dur: 4, w: 1, tools: [['Bash', 'npm'], ['Write', 'client.d.ts']] },
    { n: 'Fix N+1 query in order history', m: 'sonnet', startAgo: 41, dur: 6, st: 'errored', err: 'Bash:tool_failed', w: 2, tools: [['Read', 'orders.repo.ts'], ['Edit', 'orders.repo.ts'], ['Bash', 'npm']] },
    { n: 'Write migration for orders table', m: 'sonnet', startAgo: 17, st: 'running', w: 3, tool: ['Edit', '0042_orders.sql'], tools: [['Read', 'schema.sql'], ['Write', '0042_orders.sql'], ['Bash', 'psql']] },
    { n: 'Add rate limiting to checkout endpoint', m: 'sonnet', startAgo: 11, st: 'running', w: 4, tool: ['Edit', 'checkout.ts'], tools: [['Grep', 'rateLimit'], ['Read', 'checkout.ts'], ['Edit', 'limiter.ts']] },
  ] },
  { name: 'web-storefront', hex: 'c21e', agents: [
    { n: 'Claude Code', m: 'sonnet', startAgo: 172, st: 'idle', w: 7 },
    { n: 'Plan checkout redesign', m: 'opus', startAgo: 160, dur: 12, w: 5, tools: [['Read', 'Checkout.tsx'], ['Glob', 'components'], ['Read', 'tokens.css']] },
    { n: 'Rename CSS tokens', m: 'haiku', startAgo: 120, dur: 3, w: 1, tools: [['Grep', 'color-'], ['Edit', 'tokens.css']] },
    { n: 'Refactor image pipeline', m: 'sonnet', startAgo: 104, dur: 25, w: 4, tools: [['Read', 'resize.ts'], ['Edit', 'resize.ts'], ['Bash', 'npm']] },
    { n: 'Write product page tests', m: 'sonnet', startAgo: 70, dur: 8, w: 3, tools: [['Write', 'product.test.tsx'], ['Bash', 'npm']] },
    { n: 'Audit bundle size', m: 'sonnet', startAgo: 33, st: 'stalled', stuckS: 540, w: 2, tools: [['Bash', 'npx'], ['Read', 'webpack.config.js']] },
    { n: 'Fix flaky cart tests', m: 'sonnet', startAgo: 14, st: 'running', w: 4, tool: ['Bash', 'npm'], tools: [['Read', 'cart.test.ts'], ['Edit', 'cart.ts'], ['Bash', 'npm']] },
    { n: 'Update cart totals logic', m: 'sonnet', startAgo: 9, st: 'running', w: 3, tool: ['Edit', 'cart.ts'], tools: [['Read', 'totals.ts'], ['Edit', 'cart.ts']], idleNow: true },
  ] },
  { name: 'mobile-app', hex: '5d90', agents: [
    { n: 'Claude Code', m: 'sonnet', startAgo: 168, st: 'idle', w: 5 },
    { n: 'Plan push notification service', m: 'opus', startAgo: 140, dur: 11, w: 4, tools: [['Read', 'notify.ts'], ['Grep', 'FCM']] },
    { n: 'Fix keyboard overlap on login', m: 'sonnet', startAgo: 60, dur: 7, w: 2, tools: [['Read', 'LoginScreen.tsx'], ['Edit', 'LoginScreen.tsx']] },
    { n: 'Update onboarding copy', m: 'haiku', startAgo: 25, dur: 3, w: 1, tools: [['Read', 'strings.json'], ['Edit', 'strings.json']] },
  ] },
];
const HEX = ['a3f1', 'b72c', '0e9d', '4c18', 'd5a6', '91b0', 'e24f', '3a7c', 'f68e', '1d05', '8b39', '62ea', 'c0d4', '57fb', 'a98e', '24c7', '7e10', 'bd63', '39a2'];

const NEW_TOTALS = { // by-model targets (about 4.2M new tokens, about 120M cache reads)
  opus: { input: 380, output: 5200, cache_write: 980e3, cache_read: 31.4e6 },
  sonnet: { input: 1150, output: 214e3, cache_write: 2.58e6, cache_read: 79.6e6 },
  haiku: { input: 190, output: 13e3, cache_write: 410e3, cache_read: 9.2e6 },
};

function scene(now, at) {
  const T = at == null ? now : at;
  const agents = [];
  let hi = 0;
  const wsum = {};
  for (const p of PROJECTS) for (const a of p.agents) wsum[a.m] = (wsum[a.m] || 0) + a.w;
  for (const p of PROJECTS) {
    p.agents.forEach((a, j) => {
      const main = j === 0;
      const id = a.n + '·' + (main ? p.hex : HEX[hi++ % HEX.length]);
      const start = now - a.startAgo * MIN;
      if (start > T) return; // not spawned yet at replay time
      const liveNow = a.st === 'running' || a.st === 'stalled';
      const dur = a.dur != null ? a.dur * MIN : null;
      const end = dur != null ? start + dur : null;
      const finished = end != null && end <= T;
      let status;
      if (at != null) status = main ? 'idle' : finished ? (a.st === 'errored' ? 'errored' : 'idle') : 'running';
      else status = main ? 'idle' : (a.st === 'errored' ? 'errored' : liveNow ? a.st : 'idle');
      const elapsed = Math.max(30, Math.round(((finished ? end : T) - start) / 1000));
      const ranS = main ? elapsed : (dur != null ? Math.round(Math.max(30e3, Math.min(dur, 25 * MIN)) / 1000) : elapsed);
      const frac = at == null ? 1 : Math.min(1, elapsed / Math.max(1, ((end ?? now) - start) / 1000));
      const share = a.w / wsum[a.m];
      const t = NEW_TOTALS[a.m];
      const usage = {
        input: Math.round(t.input * share * frac), output: Math.round(t.output * share * frac),
        cache_read: Math.round(t.cache_read * share * frac), cache_write: Math.round(t.cache_write * share * frac), usd_est: null,
      };
      const lastEv = status === 'running' ? T - 4e3 : status === 'stalled' ? T - a.stuckS * 1000 : finished ? end : T - (main ? 90e3 : 5 * MIN);
      const running = status === 'running';
      const tools = (a.tools || []).map((tl, k, arr) => ({ ts: iso(lastEv - (arr.length - k) * 21e3), name: tl[0], summary: tl[1], ms: [420, 1800, 9300, 140, 2600][(k + hi) % 5] }));
      const o = {
        id, role: main ? 'orchestrator: Claude Code session in ' + p.name : 'general-purpose', capabilities: main ? ['claude-code'] : [], can_delegate: main,
        status, error_kind: status === 'errored' ? a.err : null, recent_failures: status === 'errored' ? 1 : 0, current_task: null,
        last_event_at: iso(lastEv),
        current_tool: running && a.tool ? { name: a.tool[0], summary: a.tool[1], ts: iso(T - 3e3) } : null,
        recent_tools: tools, model: MODELS[a.m].id, model_label: MODELS[a.m].label, usage, files: [],
        stuck: status === 'stalled', project: p.name, project_id: p.name,
        started_at: iso(start), ended_at: running || main || end == null ? null : iso(end), ran_s: ranS,
        tok_per_min: ranS ? Math.round((usage.input + usage.output + usage.cache_write) / (ranS / 60)) : null,
      };
      if (status === 'stalled') o.stuck_for_s = a.stuckS;
      if (main) o.tok_per_min = Math.round((usage.input + usage.output + usage.cache_write) / (ranS / 60));
      o._p = p.name; o._def = a; o._start = start; o._end = end;
      agents.push(o);
    });
  }
  return agents;
}

export function buildDemoState(variant = 'main', opts = {}) {
  const now = opts.now ?? Date.now();
  const at = opts.at ?? null;
  const T = at == null ? now : at;
  let agents = scene(now, at);
  if (variant === 'quiet') {
    for (const a of agents) {
      a.status = 'idle'; a.error_kind = null; a.recent_failures = 0; a.stuck = false; delete a.stuck_for_s; a.current_tool = null;
      if (a.id.startsWith('Claude Code') === false && !a.ended_at) a.ended_at = iso(now - 4 * MIN);
    }
  }
  const named = agents.map((a) => ({ id: a.id, p: a._p, def: a._def, start: a._start, end: a._end }));
  const clean = agents.map(({ _p, _def, _start, _end, ...r }) => r);

  const tasks = [];
  const nameOf = {};
  for (const a of clean) {
    if (a.can_delegate) continue;
    const st = a.status === 'running' ? 'running' : a.status === 'errored' ? 'failed' : a.status === 'stalled' ? 'stalled' : 'done';
    tasks.push({ id: 't-' + a.id, goal_id: 'live-goal', title: 'general-purpose', assignee: a.id, status: st, depends_on: [], attempts: 1, max_attempts: 1,
      inputs: {}, output_contract: 'n/a (observed)', acceptance: ['Observed'], artifacts: [], created_at: a.started_at, updated_at: a.last_event_at });
    if (st === 'running' || st === 'stalled') { const cur = clean.find((x) => x.id === a.id); cur.current_task = 't-' + a.id; }
    nameOf[a.id] = a;
  }

  const projects = PROJECTS.map((p) => {
    const ag = clean.filter((a) => a.project_id === p.name);
    return { id: p.name, name: p.name, agents: ag.map((a) => a.id), total: ag.length,
      running: ag.filter((a) => a.status === 'running').length, stalled: ag.filter((a) => a.status === 'stalled').length,
      errored: ag.filter((a) => a.status === 'errored').length,
      last_event_at: ag.reduce((m, a) => (a.last_event_at > m ? a.last_event_at : m), ''), ran_s_total: ag.reduce((t, a) => t + a.ran_s, 0) };
  }).filter((p) => p.total);

  // file conflict on cart.ts between two agents (only while both are active)
  const c1 = clean.find((a) => a.id.startsWith('Fix flaky cart tests'));
  const c2 = clean.find((a) => a.id.startsWith('Update cart totals logic'));
  const collisions = variant === 'main' && c1 && c2 && c1.status === 'running' && c2.status === 'running'
    ? [{ file: '/work/web-storefront/src/cart.ts', name: 'cart.ts', agents: [c1.id, c2.id], ts: iso(T - 70e3) }] : [];
  if (collisions.length) { c1.files = ['cart.ts']; c2.files = ['cart.ts']; }

  // events (about 60), newest last, deterministic from the scene
  const events = [];
  let seq = 0;
  const push = (ms, type, actor, task_id, data) => { if (ms <= T) events.push({ ts: iso(ms), seq: 0, type, actor, goal_id: 'live-goal', task_id, data }); };
  const mainOf = (pn) => clean.find((a) => a.project_id === pn && a.can_delegate);
  for (const n of named) {
    const a = clean.find((x) => x.id === n.id);
    if (a.can_delegate) { push(n.start, 'human.note', 'human', null, { text: 'prompt submitted', session: a.id }); continue; }
    const mid = mainOf(n.p).id;
    push(n.start - 4e3, 'human.note', 'human', null, { text: 'prompt submitted', session: mid });
    push(n.start, 'agent.spawned', mid, 't-' + a.id, { agent: a.id, role: 'general-purpose', parent: mid });
    push(n.start, 'task.started', a.id, 't-' + a.id, { title: 'general-purpose' });
    if (n.end != null && n.end <= T) push(n.end, a.status === 'errored' ? 'task.failed' : 'task.completed', a.id, 't-' + a.id, { agent: a.id });
    if (a.status === 'stalled') push(now - a.stuck_for_s * 1000 + 480e3, 'alert', a.id, null, { kind: 'stuck', text: a.id + ' had no activity for ' + a.stuck_for_s + 's' });
  }
  if (at == null) {
    push(now - 21 * MIN, 'alert', mainOf('atlas-api').id, null, { kind: 'needs_input', text: mainOf('atlas-api').id + ' needs input (permission_request)' });
    push(now - 6 * MIN, 'alert', mainOf('mobile-app').id, null, { kind: 'agent_done', text: 'Update onboarding copy finished' });
  }
  for (let k = 1; k <= 8; k++) push(now - (k * 9.3) * MIN, 'human.note', 'human', null, { text: 'prompt submitted', session: mainOf(PROJECTS[k % 3].name).id });
  events.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  events.forEach((e) => { e.seq = ++seq; });

  const alerts = [];
  const AB = opts.alertBase ?? now; // stable alert timestamps (the UI toasts any alert it has not seen)
  if (at == null && variant === 'main') {
    const st = clean.find((a) => a.status === 'stalled');
    alerts.push({ ts: iso(AB - 21 * MIN), kind: 'needs_input', agent: mainOf('atlas-api').id, text: 'Claude Code needs input (permission_request)', project: 'atlas-api' });
    if (st) alerts.push({ ts: iso(AB - 7 * MIN), kind: 'stuck', agent: st.id, text: st.id.split('·')[0] + ' had no activity for ' + st.stuck_for_s + 's', project: st.project });
    alerts.push({ ts: iso(AB - 6 * MIN), kind: 'agent_done', agent: 'Update onboarding copy·' + (clean.find((a) => a.id.startsWith('Update onboarding')) || { id: '·x' }).id.split('·')[1], text: 'Update onboarding copy finished', project: 'mobile-app' });
    if (opts.freshAlert) alerts.push({ ts: iso(opts.freshAlert), kind: 'needs_input', agent: mainOf('web-storefront').id, text: 'Claude Code needs input (permission_prompt)', project: 'web-storefront' });
  }

  // cost: sum of the agents' usage, so every number is consistent
  const by = {};
  for (const m of Object.values(MODELS)) by[m.id] = { input: 0, output: 0, cache_read: 0, cache_write: 0, usd_est: null };
  for (const a of clean) for (const k of ['input', 'output', 'cache_read', 'cache_write']) by[a.model][k] += a.usage[k];
  const tokens_total = Object.values(by).reduce((t, u) => t + u.input + u.output + u.cache_read + u.cache_write, 0);

  const state = {
    goal: { id: 'live-goal', title: 'Live Claude Code activity', description: 'Read-only view of Claude Code hook events.', status: 'active',
      success_criteria: [{ id: 'c1', text: 'Observing', met: false }], budget: { max_ticks: 1000000 }, created_at: iso(now - WINDOW_MIN * MIN), updated_at: iso(T) },
    tasks, agents: clean, projects,
    heartbeat: { seq: 2822, ts: iso(T), interval_s: 30, status: 'running', liveness: 'alive', age_s: 0.4, last_tick_ms: 0, consecutive_errors: 0 },
    events, server_time: iso(T), mode: 'live',
    cost: { total_usd_est: null, tokens_total, by_model: by }, collisions, alerts,
  };
  if (at != null) state.replay = true;
  return state;
}

export function buildDemoHistory(opts = {}) {
  const now = opts.now ?? Date.now();
  const first = now - WINDOW_MIN * MIN;
  const markers = [];
  for (const n of scene(now, null)) {
    markers.push({ ts: iso(n._start), type: n.can_delegate ? 'session.start' : 'agent.spawned' });
    if (!n.can_delegate) markers.push({ ts: iso(n._start), type: 'task.started' });
    if (n._end != null) markers.push({ ts: iso(n._end), type: 'task.completed' });
  }
  markers.push({ ts: iso(now - 70e3), type: 'collision' }, { ts: iso(now - 7 * MIN), type: 'stuck' });
  markers.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  return { first_ts: iso(first), last_ts: iso(now), count: 2400, markers };
}

export const DEMO_WINDOW_MS = WINDOW_MIN * MIN;
