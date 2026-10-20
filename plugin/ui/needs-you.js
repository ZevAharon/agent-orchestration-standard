/* Pure, read-only aggregation of what is waiting on the human across goals (from the /api/state goal summaries).
   Loaded as a plain script (window.AOSNeeds) and by node (module.exports) for tests. */
(function (root) {
  'use strict';
  var TERMINAL = { achieved: 1, failed: 1, cancelled: 1 };
  function cnt(x) { x = Number(x); return isFinite(x) && x > 0 ? Math.floor(x) : 0; }
  /* -> { total, items: [{ id, title, kind: approval|plan|blocked|limit, n, text }] }; one item per (goal, reason), terminal goals skipped */
  function compute(goals) {
    var items = [], total = 0;
    (Array.isArray(goals) ? goals : []).forEach(function (g) {
      if (!g || typeof g !== 'object' || !g.id || TERMINAL[g.status]) return;
      var title = String(g.title || g.id);
      function add(kind, n, text) { items.push({ id: String(g.id), title: title, kind: kind, n: n, text: text }); total += n; }
      var a = cnt(g.approvals_pending);
      if (a) add('approval', a, a + (a === 1 ? ' approval' : ' approvals') + ' pending');
      if (g.plan_state === 'awaiting_approval' && g.status === 'draft') add('plan', 1, 'plan awaiting approval');
      if (g.status === 'blocked') add('blocked', 1, 'blocked' + (g.blocked_reason ? ': ' + String(g.blocked_reason).slice(0, 80) : ''));
      if (g.limit_paused && !g.resume_at) add('limit', 1, 'paused by plan limit, resume manually');
    });
    return { total: total, items: items };
  }
  var api = { compute: compute };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AOSNeeds = api;
})(typeof window !== 'undefined' ? window : globalThis);
