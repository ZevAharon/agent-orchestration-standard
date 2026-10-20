// Guards the "watching, not managing" positioning: the dashboard is a read-only monitor, orchestration is a separate opt-in repo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness.mjs';
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('README opens with read-only + never steers + separate experimental orchestrator, and a 3-row table', () => {
  const r = read('README.md'), top = r.split('\n').slice(0, 12).join('\n');
  assert.match(top, /read-only live monitor for Claude Code/i);
  assert.match(top, /never starts, stops or steers agents/i);
  assert.match(top, /github\.com\/tomtomsatnav\/aos-orchestrator/); assert.match(top, /experimental/i);
  const rows = r.split('\n').filter((l) => /^\| .*\| .*\|/.test(l) && !/^\|[- |]+\|$/.test(l));
  const t = rows.slice(0, 4); assert.match(t[0], /Which piece do I want/); assert.equal(t.length - 1, 3);
});
test('manifests, skill and UI do not call the dashboard orchestration', () => {
  for (const f of ['plugin/.claude-plugin/plugin.json', 'ui/index.html']) assert.doesNotMatch(read(f).replace(/aria-label="Goal[^"]*"/g, ''), /agent orchestration|orchestration framework|<title>[^<]*orchestrat/i, f);
  assert.doesNotMatch(read('plugin/skills/dashboard/SKILL.md').split('\n')[2], /orchestration/i);
  assert.match(read('ui/index.html'), /<title>AOS Dashboard<\/title>/);
});
