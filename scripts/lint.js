// Lint: syntax-check every JS file and flag server secrets referenced from browser code.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', 'vendor', '.git', 'supabase', '.agents']);
const BROWSER_DIRS = ['js', 'sw.js', 'index.html'];
const SECRET_NAMES = /SERVICE_ROLE|VAPID_PRIVATE|MONGODB_URI/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(c|m)?js$/.test(entry.name)) out.push(p);
  }
  return out;
}

let failed = 0;
for (const file of walk(ROOT)) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (e) {
    failed += 1;
    console.error(`✗ ${path.relative(ROOT, file)}\n${e.stderr.toString()}`);
  }
}

for (const rel of BROWSER_DIRS) {
  const abs = path.join(ROOT, rel);
  const files = fs.statSync(abs).isDirectory() ? walk(abs) : [abs];
  for (const file of files) {
    if (SECRET_NAMES.test(fs.readFileSync(file, 'utf8'))) {
      failed += 1;
      console.error(`✗ ${path.relative(ROOT, file)} references a server-only secret`);
    }
  }
}

if (failed) {
  console.error(`\n${failed} problem(s)`);
  process.exit(1);
}
console.log('lint: all JavaScript parses; no server secrets referenced from browser code');
