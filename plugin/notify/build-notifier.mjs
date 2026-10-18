#!/usr/bin/env node
// Builds "AOS Notifier.app": a tiny AppleScript applet that posts a banner with its own icon.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ICNS = join(HERE, 'assets', 'AppIcon.icns');

export function dataDir() {
  return process.env.CLAUDE_PLUGIN_DATA || join(homedir(), '.claude', 'plugins', 'data', 'aos-dashboard-aos-local');
}
export function appPath(dir = dataDir()) { return join(dir, 'AOS Notifier.app'); }

// The applet lives in the data dir and reads notify-request.txt from its own parent folder
// (launchd-started apps do not inherit CLAUDE_PLUGIN_DATA, so the location is derived from the app path).
export const APPLESCRIPT = `on run
	set appPath to POSIX path of (path to me)
	set dataDir to do shell script "/usr/bin/dirname " & quoted form of appPath
	set reqFile to dataDir & "/notify-request.txt"
	try
		set raw to read (POSIX file reqFile) as «class utf8»
	on error
		return
	end try
	do shell script "/bin/rm -f " & quoted form of reqFile
	set ls to paragraphs of raw
	set t to "AOS"
	set s to ""
	set m to ""
	set snd to ""
	if (count of ls) ≥ 1 then set t to item 1 of ls
	if (count of ls) ≥ 2 then set s to item 2 of ls
	if (count of ls) ≥ 3 then set m to item 3 of ls
	if (count of ls) ≥ 4 then set snd to item 4 of ls
	if snd is "" then
		display notification m with title t subtitle s
	else
		display notification m with title t subtitle s sound name snd
	end if
	delay 0.4
end run
`;

const plist = (app, args) => execFileSync('/usr/libexec/PlistBuddy', args.concat(join(app, 'Contents', 'Info.plist')), { stdio: 'pipe' });

export function build({ force = false, dir = dataDir() } = {}) {
  const app = appPath(dir);
  const stamp = join(dir, '.notifier-build-stamp');
  if (!existsSync(ICNS)) throw new Error(`missing ${ICNS}; run: python3 make-icon.py`);
  const hash = createHash('sha256').update(APPLESCRIPT).update(readFileSync(ICNS)).update('v1').digest('hex');
  if (!force && existsSync(app) && existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === hash) {
    return { app, rebuilt: false };
  }
  mkdirSync(dir, { recursive: true });
  const src = join(dir, '.notifier-src.applescript');
  writeFileSync(src, APPLESCRIPT);
  rmSync(app, { recursive: true, force: true });
  execFileSync('osacompile', ['-o', app, src], { stdio: 'pipe' });
  rmSync(src, { force: true });
  const set = (k, type, v) => {
    try { plist(app, ['-c', `Set :${k} ${v}`]); } catch { plist(app, ['-c', `Add :${k} ${type} ${v}`]); }
  };
  set('CFBundleIdentifier', 'string', 'dev.aos.notifier');
  set('CFBundleName', 'string', 'AOS');
  set('CFBundleDisplayName', 'string', 'AOS');
  set('LSUIElement', 'bool', 'true');
  set('CFBundleIconFile', 'string', 'applet');
  for (const k of ['CFBundleIconName']) { try { plist(app, ['-c', `Delete :${k}`]); } catch {} }
  copyFileSync(ICNS, join(app, 'Contents', 'Resources', 'applet.icns'));
  rmSync(join(app, 'Contents', 'Resources', 'Assets.car'), { force: true });
  execFileSync('codesign', ['--force', '--deep', '-s', '-', app], { stdio: 'pipe' });
  // nudge Finder/LaunchServices to pick up the icon
  try { execFileSync('touch', [app]); } catch {}
  try { execFileSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', app], { stdio: 'pipe' }); } catch {}
  writeFileSync(stamp, hash + '\n');
  return { app, rebuilt: true };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = build({ force: process.argv.includes('--force') });
  console.log(r.rebuilt ? `built ${r.app}` : `up to date: ${r.app}`);
}
