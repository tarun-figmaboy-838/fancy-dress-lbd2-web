/* ============================================================================
 *  tools/build.js — produce the learner build in dist/
 *
 *  There is no bundler and nothing is compiled. All this does is copy the
 *  playable files, drop the God Mode developer layer along with the <script>
 *  and <link> tags that load it, and then refuse to finish if any asset a scene
 *  references is missing. Run it with `npm run build`.
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist');

/* Everything the game needs, and nothing else — plus the QA report, which is a
   standalone page nothing in the game links to. It ships so the report has a
   public URL that can be handed to anyone without a login. */
const COPY = ['index.html', 'favicon.png', 'css', 'js', 'assets', 'qa-report.html'];
const SKIP_DIRS = new Set(['god-mode', 'node_modules', 'dist', 'tools', '.git', '.github']);

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copy(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    if (SKIP_DIRS.has(path.basename(src))) return 0;
    fs.mkdirSync(dst, { recursive: true });
    return fs.readdirSync(src)
      .reduce((n, f) => n + copy(path.join(src, f), path.join(dst, f)), 0);
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return 1;
}

function bytes(dir) {
  let total = 0;
  (function walk(p) {
    for (const f of fs.readdirSync(p)) {
      const q = path.join(p, f), st = fs.statSync(q);
      st.isDirectory() ? walk(q) : (total += st.size);
    }
  })(dir);
  return total;
}

// ---------------------------------------------------------------- build ----
rmrf(OUT);
fs.mkdirSync(OUT, { recursive: true });

let files = 0;
for (const entry of COPY) {
  const src = path.join(ROOT, entry);
  if (!fs.existsSync(src)) { console.error('missing ' + entry); process.exit(1); }
  files += copy(src, path.join(OUT, entry));
}

/* Strip the God Mode tags. They are grouped under one comment in index.html, so
   the whole block goes, and any stray reference is removed line by line. */
const idx = path.join(OUT, 'index.html');
let html = fs.readFileSync(idx, 'utf8');
html = html.replace(/\n?<!--\s*God Mode:[\s\S]*?-->\n?/g, '\n');
html = html.split('\n').filter(l => !/god-mode\//.test(l)).join('\n');
fs.writeFileSync(idx, html);
if (/god-mode/i.test(html)) {
  console.error('God Mode references survived the strip');
  process.exit(1);
}

/* Every sprite and clip a scene names must exist in the output. */
global.window = {};
require(path.join(OUT, 'js/data.js'));
const refs = new Set();
(function scan(o) {
  if (typeof o === 'string') { if (/^assets\//.test(o)) refs.add(o); return; }
  if (Array.isArray(o)) return o.forEach(scan);
  if (o && typeof o === 'object') Object.values(o).forEach(scan);
})([window.SCENES, window.ANIMS, window.TEMPLATES]);

let missing = 0;
for (const r of refs) {
  if (!fs.existsSync(path.join(OUT, r))) { console.error('MISSING ' + r); missing++; }
}
if (missing) { console.error(missing + ' asset(s) missing from dist/'); process.exit(1); }

console.log('dist/ built');
console.log('  ' + files + ' files, ' + (bytes(OUT) / 1024 / 1024).toFixed(2) + ' MB');
console.log('  ' + refs.size + ' asset references, all present');
console.log('  God Mode: excluded');
