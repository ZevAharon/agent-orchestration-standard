// node ui/timeline.test.mjs : waterfall timeline core (zoom/fit/windowing/ticks/hit-testing) + wiring checks.
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm'; import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url)); let fails = 0;
const ok = (n, c, i) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n + (i !== undefined ? ' ' + JSON.stringify(i) : '')); };
const win = {}; vm.runInContext(fs.readFileSync(path.join(dir, 'timeline.js'), 'utf8'), vm.createContext({ window: win, Date, Math, JSON, Object, Array, Number, String }));
const c = win.AosTimeline.core, near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
// fit: the whole span lands inside the plot with a margin
const f = c.fit(1000000, 1000000 + 600e3, 800);
ok('fit puts both ends inside the plot', (1000000 - f.t0) * f.pxMs >= 0 && (1000000 + 600e3 - f.t0) * f.pxMs <= 800, f);
ok('fit never scales beyond the clamp', c.fit(0, 1, 800).pxMs <= 0.5 && c.fit(0, 1e12, 800).pxMs >= 1 / 600000);
// zoom keeps the time under the cursor fixed
const z = c.zoomAbout(f, 2, 300), tBefore = f.t0 + 300 / f.pxMs, tAfter = z.t0 + 300 / z.pxMs;
ok('zoomAbout keeps the anchor time', near(tBefore, tAfter, 1e-3) && near(z.pxMs, f.pxMs * 2, 1e-12));
ok('zoom is clamped', c.zoomAbout(f, 1e9, 0).pxMs === 0.5 && c.zoomAbout(f, 1e-9, 0).pxMs === 1 / 600000);
// windowing: 100000 rows, 400 px tall -> only ~19 rows are visited
const w = c.visibleRows(100000, 22 * 5000, 400);
ok('visibleRows windows to the viewport', w[0] === 5000 && w[1] - w[0] <= Math.ceil(400 / c.ROW_H) + 1, w);
ok('visibleRows empty / clamped', c.visibleRows(0, 0, 400).length === 0 && c.visibleRows(3, 0, 400)[1] === 2);
// axis step grows as you zoom out, labels never closer than ~80px
const s1 = c.niceStep(1000 / 1, 80), s2 = c.niceStep(100, 80), s3 = c.niceStep(1e7, 80);
ok('niceStep is monotone and respects min spacing', s2 <= s1 && s1 <= s3 && s1 / 1000 >= 80 && s3 === 86400e3, [s2, s1, s3]);
// bars
const v = { t0: 0, pxMs: 0.001 }, r1 = c.barRect({ start: new Date(10000).toISOString(), end: new Date(20000).toISOString() }, v, 99000), r2 = c.barRect({ start: new Date(10000).toISOString(), end: null }, v, 99000);
ok('barRect closed/open', near(r1.x0, 10) && near(r1.x1, 20) && !r1.open && near(r2.x1, 99) && r2.open);
ok('barRect has a minimum visible width', c.barRect({ start: new Date(5000).toISOString(), end: new Date(5000).toISOString() }, v, 9e4).x1 - 5 >= 2 - 1e-9);
// ticks: at most one per pixel column, only inside the window
const ticks = []; for (let i = 0; i < 5000; i++) ticks.push(i * 10);
const vt = c.visibleTicks(ticks, { t0: 0, pxMs: 0.01 }, 0, 100);
ok('visibleTicks dedupes per pixel and clips', vt.length <= 101 && vt.every((x) => x >= 0 && x <= 100) && new Set(vt).size === vt.length, vt.length);
// hit testing
ok('hitRow maps y to rows below the axis', c.hitRow(c.AXIS_H + 1, 0, 3) === 0 && c.hitRow(c.AXIS_H + c.ROW_H * 2 + 1, 0, 3) === 2 && c.hitRow(c.AXIS_H + c.ROW_H * 3 + 1, 0, 3) === -1 && c.hitRow(3, 0, 3) === -1 && c.hitRow(c.AXIS_H + 1, c.ROW_H, 3) === 1);
// wiring
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
ok('index.html loads timeline.js and timeline.css', /timeline\.js\?v=\d+/.test(html) && /timeline\.css\?v=\d+/.test(html));
const css = fs.readFileSync(path.join(dir, 'timeline.css'), 'utf8');
ok('timeline.css uses theme tokens only (no hard-coded colours except shadow)', !/#[0-9a-f]{3,6}\b/i.test(css) && /var\(--glass-strong\)/.test(css));
const src = fs.readFileSync(path.join(dir, 'timeline.js'), 'utf8');
ok('colours come from CSS variables and refresh on theme change', /--running-rgb/.test(src) && /aos-theme/.test(src) && /prefers-color-scheme/.test(src));
console.log(fails ? fails + ' FAILED' : 'timeline: all ok'); process.exit(fails ? 1 : 0);
