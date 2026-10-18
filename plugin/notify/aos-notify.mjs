#!/usr/bin/env node
// Branded macOS notifications for the AOS monitor. Importable: notify(), formatNotification().
import { execFile } from 'node:child_process';
import { existsSync, renameSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appPath, build, dataDir } from './build-notifier.mjs';

const LIM = { title: 60, subtitle: 90, message: 200 };

export function sanitize(s, max) {
  const t = String(s ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

const ID_RE = /\b(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{12,}|agent-[0-9a-f]{8,})\b/gi;
function shorten(s, n = 40) {
  const t = String(s ?? '').replace(ID_RE, '').replace(/\s+/g, ' ').replace(/[\s:·-]+$/, '').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
}

const KINDS = {
  needs_input: ['Needs your input', 'Waiting for permission to run a tool.', 'Glass'],
  stuck: ['Agent stuck', 'No activity for a while. It may be thinking, or stuck.', ''],
  error: ['Agent errored', 'A tool call failed.', ''],
  session_end: ['Session finished', 'The session has ended.', ''],
  finished: ['Agent finished', 'The agent completed its work.', ''],
};
const ALIAS = { stuck_agent: 'stuck', agent_stuck: 'stuck', errored: 'error', tool_error: 'error', idle: 'stuck',
  permission: 'needs_input', input: 'needs_input', needs_permission: 'needs_input', waiting: 'needs_input',
  session_finished: 'session_end', session_ended: 'session_end', stop: 'finished', done: 'finished', agent_finished: 'finished' };

export function formatNotification({ kind, agent, text, project } = {}) {
  const k = ALIAS[kind] || kind;
  const [title, base, sound] = KINDS[k] || ['AOS', '', ''];
  let message = base;
  const raw = String(text ?? '');
  if (k === 'stuck') {
    const m = raw.match(/(\d+)\s*(?:min|m\b|minutes?)/i);
    message = m ? `No activity for ${m[1]} min. It may be thinking, or stuck.` : base;
  } else if (!KINDS[k]) {
    message = shorten(raw.replace(/^AOS:\s*/i, ''), 200);
  }
  const subtitle = shorten(agent || project || '', 40) || (project ? shorten(project, 40) : '');
  return { title, subtitle, message, sound };
}


function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function run(file, args) {
  return new Promise((resolve) => execFile(file, args, { timeout: 8000 }, (err) => resolve(err || null)));
}

export function clean({ title, subtitle, message, sound }) {
  return {
    title: sanitize(title || 'AOS', LIM.title),
    subtitle: sanitize(subtitle, LIM.subtitle),
    message: sanitize(message, LIM.message),
    sound: /^[A-Za-z0-9 _-]{1,30}$/.test(sound || '') ? sound : '',
  };
}

const asEsc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export async function notify(opts = {}) {
  const f = opts.kind && !opts.title && !opts.message ? { ...formatNotification({ kind: opts.kind, agent: opts.agent, text: opts.text, project: opts.project }) } : {};
  const n = clean({ title: opts.title ?? f.title, subtitle: opts.subtitle ?? f.subtitle, message: opts.message ?? f.message, sound: opts.sound ?? f.sound });
  const app = process.env.AOS_NOTIFY_APP || appPath();
  const pinned = !!process.env.AOS_NOTIFY_APP;           // an explicit app path is never auto-built
  const dir = pinned ? dirname(app) : dataDir();
  const req = join(dir, 'notify-request.txt');
  const dry = process.env.AOS_NOTIFY_DRY === '1';

  if (!existsSync(app) && !pinned && !dry) { try { build({ dir }); } catch {} }
  const via = existsSync(app) ? 'app' : 'osascript';
  if (dry) {
    const out = { via, app, requestFile: req, ...n };
    console.log(JSON.stringify(out, null, 2));
    return { ok: true, dry: true, via };
  }

  if (via === 'app') {
    for (let i = 0; i < 20 && existsSync(req); i++) await sleep(100); // wait up to 2s, then overwrite
    mkdirSync(dir, { recursive: true });
    const tmp = `${req}.${process.pid}.tmp`;
    writeFileSync(tmp, [n.title, n.subtitle, n.message, n.sound].join('\n') + '\n', { mode: 0o600 });
    renameSync(tmp, req);
    if (process.env.AOS_NOTIFY_NO_LAUNCH === '1') return { ok: true, via: 'app', launched: false };
    const err = await run('open', ['-g', '-j', '-a', app]);
    if (!err) return { ok: true, via: 'app' };
    rmSync(req, { force: true });
  }
  const script = `display notification "${asEsc(n.message)}" with title "${asEsc(n.title)}"` +
    (n.subtitle ? ` subtitle "${asEsc(n.subtitle)}"` : '') + (n.sound ? ` sound name "${asEsc(n.sound)}"` : '');
  const err = await run('osascript', ['-e', script]);
  return { ok: !err, via: 'osascript', error: err ? String(err.message) : undefined };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2);
  const opt = {};
  for (let i = 0; i < a.length; i += 2) opt[a[i].replace(/^--/, '')] = a[i + 1];
  if (!Object.keys(opt).length) {
    console.error('usage: aos-notify.mjs [--kind needs_input|stuck|error|session_end|finished] [--agent X] [--text X] [--title X] [--subtitle X] [--message X] [--sound X]');
    process.exit(2);
  }
  const r = await notify(opt);
  if (!r.dry) console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
}
