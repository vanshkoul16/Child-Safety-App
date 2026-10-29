// Vercel build step: copy ONLY the browser-facing files into ./public and serve that folder.
// Same allowlist as local-server.js, so server/, supabase/, tests/, docs/, .env etc. are never
// published as static files. (Serverless functions in /api are deployed separately by Vercel.)
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'public');

const files = ['index.html', 'manifest.json', 'sw.js', 'LICENSE'];
const dirs = ['css', 'js', 'vendor', 'assets'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const f of files) {
  if (!fs.existsSync(path.join(root, f))) throw new Error(`Missing required file: ${f}`);
  fs.copyFileSync(path.join(root, f), path.join(out, f));
}
for (const d of dirs) {
  if (!fs.existsSync(path.join(root, d))) throw new Error(`Missing required folder: ${d}`);
  fs.cpSync(path.join(root, d), path.join(out, d), { recursive: true });
}
console.log(`SafeHaven: copied ${files.length} files and ${dirs.length} folders to public/`);
