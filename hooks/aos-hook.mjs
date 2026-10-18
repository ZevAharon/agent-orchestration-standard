#!/usr/bin/env node
// AOS-1 live monitor hook: appends one compact, sanitized line per Claude Code hook event.
// Never stores prompts, command lines (only a Bash command's first word), file contents, tool output, error messages or env values.
// Never throws; always exits 0.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 5 * 1024 * 1024;
const STOP_ERRORS = new Set(['rate_limit', 'overloaded', 'authentication_failed', 'oauth_org_not_allowed', 'account_on_hold', 'billing_error', 'invalid_request', 'model_not_found', 'server_error', 'max_output_tokens', 'cloud_credential_error', 'unknown']);
const clean = (v, n = 80) => String(v ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]+/g, ' ').trim().slice(0, n); // C0/C1 controls, bidi overrides
const redact = (s) => s.replace(/\b(sk|pk|ghp|gho|xox[a-z]|AKIA|eyJ)[A-Za-z0-9_\-]{8,}/g, '[redacted]')
  .replace(/\b[A-Za-z0-9+\/_\-]{32,}\b/g, '[redacted]');

// full working directory: absolute only, control chars stripped, normalized, no trailing slash; over 300 chars is dropped (never truncated)
function cwdPath(v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, '').normalize('NFC');
  if (!path.posix.isAbsolute(s)) return null;
  const n = path.posix.normalize(s).replace(/\/+$/, '') || '/';
  return n.length <= 300 ? n : null;
}

function summarize(p) {
  const t = p.tool_name, i = (p.tool_input && typeof p.tool_input === 'object') ? p.tool_input : {};
  if (!t) return '';
  if (t === 'Bash') {
    const tok = String(i.command ?? '').trim().split(/\s+/)[0] || '';
    if (!tok || tok.includes('=') || /^['"$`(]/.test(tok)) return '';   // env assignment / quoting: could hold secrets
    return clean(path.basename(tok), 40);
  }
  if (t === 'Task' || t === 'Agent') return redact(clean(i.description));
  const f = i.file_path ?? i.notebook_path ?? i.path;
  if (typeof f === 'string' && f) return clean(path.basename(f), 60);
  return '';
}

function main() {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch { return; }
  let p; try { p = JSON.parse(raw); } catch { return; }
  if (!p || typeof p !== 'object' || Array.isArray(p)) return;
  const rec = { ts: new Date().toISOString(), ev: clean(p.hook_event_name, 40) || 'unknown' };
  if (p.session_id) rec.sid = clean(p.session_id, 8);
  if (p.cwd) rec.cwd = clean(path.basename(String(p.cwd)), 40);
  const cwdp = cwdPath(p.cwd); if (cwdp) rec.cwdp = cwdp; // full cwd, used only locally to group sessions by project root
  if (p.tool_name) rec.tool = clean(p.tool_name, 40);
  if (p.agent_id) rec.agent_id = clean(p.agent_id, 40);
  if (p.agent_type) rec.agent_type = clean(p.agent_type, 40);
  const s = summarize(p); if (s) rec.sum = s;
  // file path (path only, no contents) for edit-type tools -> collision detection
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(p.tool_name) && p.tool_input && typeof p.tool_input === 'object') {
    const f = p.tool_input.file_path ?? p.tool_input.notebook_path;
    if (typeof f === 'string' && f) rec.f = clean(path.resolve(typeof p.cwd === 'string' && p.cwd ? p.cwd : '/', f), 400);
  }
  // transcript path (path only) so the monitor can count tokens; never the content
  if (['SessionStart', 'Stop', 'SubagentStop'].includes(rec.ev)) {
    const tp = rec.ev === 'SubagentStop' && typeof p.agent_transcript_path === 'string' && p.agent_transcript_path ? p.agent_transcript_path : p.transcript_path;
    if (typeof tp === 'string' && tp) rec.tp = clean(tp, 400);
  }
  if (rec.ev === 'SessionStart' && typeof p.model === 'string') rec.m = clean(p.model, 60);
  // error CATEGORY only (fixed vocabulary from documented enums / flags); never the error message text
  if (rec.ev === 'PostToolUseFailure') rec.err = p.is_interrupt === true ? 'interrupted' : 'tool_failed';
  if (rec.ev === 'StopFailure') rec.err = STOP_ERRORS.has(p.error) ? p.error : 'unknown';
  // Claude Code task list events: opaque id only, never subject/description
  if ((rec.ev === 'TaskCreated' || rec.ev === 'TaskCompleted') && typeof p.task_id === 'string' && /^[A-Za-z0-9_\-]{1,40}$/.test(p.task_id)) rec.task = p.task_id;
  // model switch: new model id only (to_model); validated charset
  if ((rec.ev === 'PreModelSwitch' || rec.ev === 'PostModelSwitch') && typeof p.to_model === 'string' && /^[A-Za-z0-9._\-\[\]]{1,60}$/.test(p.to_model)) rec.m = p.to_model;
  if (rec.ev === 'Notification') { const nt = clean(p.notification_type, 40); if (/^[a-z_]+$/.test(nt)) rec.nt = nt; } // type only, never the message

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dir = process.env.AOS_LIVE_DIR || path.join(root, 'live');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'hook-events.ndjson');
  try { if (fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, path.join(dir, 'hook-events.1.ndjson')); } catch {}
  fs.appendFileSync(file, JSON.stringify(rec) + '\n', { mode: 0o600 }); // owner-only when created
}
try { main(); } catch {}
process.exit(0);
