// node ui/done.test.mjs : done-subagent filter (hidden by default, 10 min window when shown, projects pruned) + the D / button toggle, with a minimal fake DOM.
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm'; import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url)); let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n); };
const label = { textContent: '' };
const btn = { attrs: {}, listeners: {}, title: '', setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(e, f) { this.listeners[e] = f; }, querySelector: () => label };
const docListeners = {}; let refreshed = 0; const store = {};
const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const win = { AosApp: { refresh() { refreshed++; } }, localStorage: ls };
const doc = { readyState: 'complete', getElementById: (id) => (id === 'done-btn' ? btn : null), addEventListener(e, f) { docListeners[e] = f; } };
const ctx = vm.createContext({ window: win, localStorage: ls, document: doc, console, Date, isFinite });
ctx.AosApp = win.AosApp; vm.runInContext(fs.readFileSync(path.join(dir, 'done.js'), 'utf8'), ctx);
const D = win.AosDone, now = Date.parse('2026-10-26T16:30:00Z'), ago = (m) => new Date(now - m * 60e3).toISOString();
const st = {
  server_time: new Date(now).toISOString(),
  agents: [
    { id: 'Claude Code·aa11', status: 'idle' },
    { id: 'wf·old1', status: 'done', ended_at: ago(25) },
    { id: 'wf·new1', status: 'done', ended_at: ago(3) },
    { id: 'wf·run1', status: 'running', ended_at: null },
    { id: 'wf·err1', status: 'errored', ended_at: ago(40) },
    { id: 'wf·odd1', status: 'done' },
  ],
  projects: [{ id: 'p', agents: ['Claude Code·aa11', 'wf·old1', 'wf·new1', 'wf·run1', 'wf·err1', 'wf·odd1'], total: 6, running: 1 }],
};
const idsOf = (s) => s.agents.map((a) => a.id);
ok('off by default: button says Hidden, not pressed', D.get() === false && btn.attrs['data-state'] === 'off' && btn.attrs['aria-pressed'] === 'false' && label.textContent === 'Done: Hidden');
let f = D.filter(st), ids = idsOf(f);
ok('off: every done subagent is hidden, recent or not', !ids.includes('wf·old1') && !ids.includes('wf·new1') && !ids.includes('wf·odd1'));
ok('running, errored and sessions are never hidden', ids.includes('wf·run1') && ids.includes('wf·err1') && ids.includes('Claude Code·aa11'));
ok('project list and total pruned with it', f.projects[0].agents.length === 3 && f.projects[0].total === 3 && f.projects[0].running === 1);
ok('input state not mutated; hidden count reported', st.agents.length === 6 && st.projects[0].agents.length === 6 && f.done_hidden === 3);
ok('nothing to hide returns the same object', D.filter({ server_time: st.server_time, agents: [st.agents[0], st.agents[3]] }).agents.length === 2);
btn.listeners.click();
ok('click: on, saved, refreshed, label Shown', D.get() === true && store['aos.done'] === 'show' && refreshed === 1 && btn.attrs['aria-pressed'] === 'true' && label.textContent === 'Done: Shown');
f = D.filter(st); ids = idsOf(f);
ok('on: done within the 10 min window is shown', ids.includes('wf·new1'));
ok('on: done past the window stays hidden', !ids.includes('wf·old1') && f.done_hidden === 1 && f.projects[0].total === 5);
ok('on: done with no end time is kept, not guessed', ids.includes('wf·odd1'));
docListeners.keydown({ key: 'd', target: { tagName: 'DIV' } });
ok('D toggles back off and clears the saved choice', D.get() === false && !('aos.done' in store) && refreshed === 2);
docListeners.keydown({ key: 'd', target: { tagName: 'INPUT' } });
ok('D in a text field is ignored', D.get() === false && refreshed === 2);
docListeners.keydown({ key: 'd', metaKey: true, target: { tagName: 'DIV' } });
ok('Cmd/Ctrl+D is left to the browser', D.get() === false);
process.exit(fails ? 1 : 0);
