import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync, mkdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatNotification, sanitize, notify } from './aos-notify.mjs';
import { appPath, build } from './build-notifier.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;
let pass = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('ok  ', name); } catch (e) { console.error('FAIL', name, '\n', e.message); process.exitCode = 1; } };

await t('format: stuck', () => {
  const r = formatNotification({ kind: 'stuck', agent: 'Opus: project graph physics layout', text: 'AOS: stuck 3 min' });
  assert.deepEqual(r, { title: 'Agent stuck', subtitle: 'Opus: project graph physics layout', message: 'No activity for 3 min. It may be thinking, or stuck.', sound: '' });
});
await t('format: needs_input has Glass sound', () => {
  const r = formatNotification({ kind: 'needs_input', agent: 'Sonnet: api' });
  assert.equal(r.title, 'Needs your input'); assert.equal(r.sound, 'Glass'); assert.match(r.message, /permission/);
});
await t('format: error / session_end / finished are silent', () => {
  assert.equal(formatNotification({ kind: 'error', agent: 'a' }).message, 'A tool call failed.');
  assert.equal(formatNotification({ kind: 'session_end' }).title, 'Session finished');
  assert.equal(formatNotification({ kind: 'finished', agent: 'a' }).title, 'Agent finished');
  for (const k of ['error', 'session_end', 'finished']) assert.equal(formatNotification({ kind: k }).sound, '');
});
await t('format: raw ids stripped, subtitle <= 40', () => {
  const r = formatNotification({ kind: 'error', agent: 'Opus 3f2a9c1e-1111-2222-3333-444455556666 ' + 'x'.repeat(80) });
  assert.ok(r.subtitle.length <= 40); assert.ok(!/3f2a9c1e/.test(r.subtitle));
});
await t('sanitize strips control chars and caps', () => {
  assert.equal(sanitize('a\u0000b\nc\u001b[31md e', 50), 'a b c [31md e');
  assert.equal(sanitize('x'.repeat(300), 200).length, 200);
});

const tmp = mkdtempSync(join(tmpdir(), 'aos-notify-'));
await t('request file written atomically, 0600, 4 lines', async () => {
  const fake = join(tmp, 'AOS Notifier.app'); mkdirSync(fake);
  const env = { ...process.env, AOS_NOTIFY_APP: fake, AOS_NOTIFY_NO_LAUNCH: '1', AOS_NOTIFY_DRY: '' };
  const r = spawnSync(NODE, ['-e', `import('${HERE}/aos-notify.mjs').then(m=>m.notify({title:'T\\n;rm -rf /',subtitle:'S',message:'M '.repeat(200),sound:'Glass'}))`], { env });
  assert.equal(r.status, 0, String(r.stderr));
  const f = join(tmp, 'notify-request.txt');
  assert.equal(statSync(f).mode & 0o777, 0o600);
  const lines = readFileSync(f, 'utf8').split('\n');
  assert.equal(lines[0], 'T ;rm -rf /'); assert.equal(lines[1], 'S'); assert.ok(lines[2].length <= 200); assert.equal(lines[3], 'Glass');
});
await t('dry-run prints JSON, sends nothing', () => {
  const out = execFileSync(NODE, [join(HERE, 'aos-notify.mjs'), '--kind', 'error', '--agent', 'Opus: x'], { env: { ...process.env, AOS_NOTIFY_DRY: '1' } }).toString();
  const j = JSON.parse(out); assert.equal(j.title, 'Agent errored'); assert.equal(j.subtitle, 'Opus: x');
});
await t('fallback to osascript when app missing', () => {
  const out = execFileSync(NODE, [join(HERE, 'aos-notify.mjs'), '--title', 'x', '--message', 'y'], { env: { ...process.env, AOS_NOTIFY_DRY: '1', AOS_NOTIFY_APP: join(tmp, 'nope', 'AOS Notifier.app') } }).toString();
  assert.equal(JSON.parse(out).via, 'osascript');
});
await t('icon assets are valid PNG / ICNS', () => {
  const png = readFileSync(join(HERE, 'assets', 'icon-1024.png'));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a'); assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(readFileSync(join(HERE, 'assets', 'AppIcon.icns')).subarray(0, 4).toString(), 'icns');
});
await t('built app: Info.plist keys, icon, codesign', () => {
  build();
  const app = appPath();
  const p = execFileSync('plutil', ['-p', join(app, 'Contents', 'Info.plist')]).toString();
  assert.match(p, /"CFBundleIdentifier" => "dev\.aos\.notifier"/); assert.match(p, /"CFBundleName" => "AOS"/);
  assert.match(p, /"LSUIElement" => true/); assert.match(p, /"CFBundleIconFile" => "applet"/);
  assert.equal(readFileSync(join(app, 'Contents', 'Resources', 'applet.icns')).subarray(0, 4).toString(), 'icns');
  execFileSync('codesign', ['--verify', '--deep', '--strict', app]);
  assert.equal(build().rebuilt, false);
});

if (process.argv.includes('--live')) {
  const r = await notify({ title: 'AOS · test', subtitle: 'Notifier installed', message: 'This is what alerts will look like.' });
  console.log('live send:', JSON.stringify(r));
}
console.log(`${pass} passed`);
