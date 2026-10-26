/* done subagents: hidden by default; "Done: Shown" (button or D) puts back those that ended within the last GRACE_MS.
   One finished longer ago never comes back, and the monitor already drops a done subagent once its session leaves
   the view. History stays in Timeline and Replay. */
(function () {
  var KEY = 'aos.done', GRACE_MS = 10 * 60 * 1000, on = false, btn = null;
  try { on = localStorage.getItem(KEY) === 'show'; } catch (e) { /* ignore */ }
  function refMs(s) { var t = Date.parse(s && s.server_time); return isFinite(t) ? t : Date.now(); }
  function hidden(a, ref) {
    if (!a || a.status !== 'done') return false;
    if (!on) return true;
    var end = Date.parse(a.ended_at); return isFinite(end) && ref - end > GRACE_MS;
  }
  function filter(s) {
    if (!s || !Array.isArray(s.agents)) return s;
    var ref = refMs(s), gone = {}, n = 0;
    var keep = s.agents.filter(function (a) { if (hidden(a, ref)) { gone[a.id] = true; n++; return false; } return true; });
    if (!n) return s;
    var o = {}, k; for (k in s) o[k] = s[k];
    o.agents = keep;
    if (Array.isArray(s.projects)) o.projects = s.projects.map(function (p) {
      if (!p || !Array.isArray(p.agents)) return p;
      var q = {}, j; for (j in p) q[j] = p[j];
      q.agents = p.agents.filter(function (id) { return !gone[id]; });
      if (typeof p.total === 'number') q.total = Math.max(0, p.total - (p.agents.length - q.agents.length));
      return q;
    });
    o.done_hidden = n;
    return o;
  }
  function paint() {
    if (!btn) btn = document.getElementById('done-btn');
    if (!btn) return;
    btn.setAttribute('data-state', on ? 'on' : 'off');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    var l = btn.querySelector && btn.querySelector('.theme-l'); if (l) l.textContent = on ? 'Done: Shown' : 'Done: Hidden';
    var what = on ? 'shown for 10 minutes after they finish' : 'hidden', next = on ? 'hide them' : 'show the last 10 minutes';
    btn.setAttribute('aria-label', 'Done subagents: ' + what + '. ' + next.charAt(0).toUpperCase() + next.slice(1));
    btn.title = 'Done subagents: ' + what + '. Click or press D to ' + next;
  }
  function set(v) {
    on = !!v;
    try { if (on) localStorage.setItem(KEY, 'show'); else localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    paint(); if (window.AosApp && AosApp.refresh) AosApp.refresh();
  }
  function toggle() { set(!on); }
  function wire() { paint(); if (btn && btn.addEventListener) btn.addEventListener('click', toggle); }
  if (document.readyState === 'loading' && document.addEventListener) document.addEventListener('DOMContentLoaded', wire); else wire();
  if (document.addEventListener) document.addEventListener('keydown', function (e) {
    if ((e.key !== 'd' && e.key !== 'D') || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    var el = e.target, tag = el && el.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (el && el.isContentEditable)) return;
    toggle();
  });
  window.AosDone = { filter: filter, get: function () { return on; }, set: set, toggle: toggle, GRACE_MS: GRACE_MS };
})();
