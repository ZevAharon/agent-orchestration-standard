#!/usr/bin/env node
// Claude Code status line: one quiet line from the AOS monitor. Fast (400ms cap), never throws,
// prints nothing if the monitor is down so the status line stays clean.
import http from 'node:http';
const PORT = (() => { const n = Number(process.env.AOS_PORT); return Number.isInteger(n) && n >= 1024 && n < 65536 ? n : 4318; })();
const fmt = (n) => n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);
process.stdin.resume(); process.stdin.on('data', () => {}); // drain the JSON Claude Code sends
const req = http.get({ host: '127.0.0.1', port: PORT, path: '/api/state', timeout: 400 }, (res) => {
  let b = ''; res.setEncoding('utf8'); res.on('data', (d) => { if (b.length < 4e6) b += d; });
  res.on('end', () => {
    try {
      const s = JSON.parse(b), A = s.agents || [];
      const running = A.filter((a) => a.status === 'running').length, errored = A.filter((a) => a.status === 'errored').length;
      const stalled = A.filter((a) => a.status === 'stalled' || a.stuck).length, conflicts = (s.collisions || []).length;
      let fresh = 0; const by = (s.cost && s.cost.by_model) || {};
      for (const k in by) fresh += (+by[k].input || 0) + (+by[k].output || 0) + (+by[k].cache_write || 0);
      const P = Array.isArray(s.projects) ? s.projects.length : 0;
      const parts = ['AOS', ...(P >= 2 ? [`${P} projects`] : []), `${A.length} agents`, `${running} running`];
      if (fresh) parts.push(`${fmt(fresh)} new tok`);
      if (errored) parts.push(`${errored} errored`);
      if (stalled) parts.push(`${stalled} stalled`);
      if (conflicts) parts.push(`${conflicts} file conflict${conflicts > 1 ? 's' : ''}`);
      process.stdout.write(parts.join(' · ') + '\n');
    } catch {}
    process.exit(0);
  });
});
req.on('timeout', () => { req.destroy(); process.exit(0); });
req.on('error', () => process.exit(0));
setTimeout(() => process.exit(0), 900).unref();
