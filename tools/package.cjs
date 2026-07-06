// Construit l'archive à soumettre au Chrome Web Store : uniquement ce dont
// l'extension a besoin à l'exécution (manifest, icônes, sources, _locales),
// rien de l'outillage du dépôt.
// Usage : node tools/package.cjs   ->  dist/pauza-<version>.zip
//
// Zip via tar (bsdtar, livré avec Windows 10+/macOS/Linux) : produit des
// entrées à séparateurs « / » standards — Compress-Archive de PowerShell
// génère des archives que certains outils rejettent.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const INCLUDE = ['manifest.json', 'icons', 'src', '_locales'];
const FORBIDDEN = /(^|\/)(tools|tests|docs|node_modules|\.chrome|\.claude|\.git)(\/|$)/;

function fail(msg) {
  console.error('ERREUR :', msg);
  process.exit(1);
}

// --- Sanity checks avant d'emballer ---
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) fail(`version manifest invalide : ${manifest.version}`);
for (const icon of Object.values(manifest.icons ?? {})) {
  if (!fs.existsSync(path.join(ROOT, icon))) fail(`icône manquante : ${icon}`);
}
if (manifest.default_locale) {
  const p = path.join(ROOT, '_locales', manifest.default_locale, 'messages.json');
  if (!fs.existsSync(p)) fail(`_locales/${manifest.default_locale}/messages.json manquant (default_locale)`);
}
for (const entry of INCLUDE) {
  if (!fs.existsSync(path.join(ROOT, entry))) fail(`entrée manquante : ${entry}`);
}

// --- Staging propre puis zip ---
const stage = path.join(DIST, 'stage');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
for (const entry of INCLUDE) {
  fs.cpSync(path.join(ROOT, entry), path.join(stage, entry), { recursive: true });
}

const zipName = `pauza-${manifest.version}.zip`;
const zipPath = path.join(DIST, zipName);
fs.rmSync(zipPath, { force: true });
// Chemins relatifs + cwd : un chemin absolu Windows (« D:\… ») serait
// interprété par bsdtar comme un hôte distant.
const r = spawnSync('tar', ['-a', '-cf', zipName, '-C', 'stage', ...INCLUDE],
  { stdio: 'inherit', cwd: DIST });
if (r.status !== 0) fail('tar a échoué — bsdtar (Windows 10+) requis');

// --- Vérification du contenu ---
const list = spawnSync('tar', ['-tf', zipName], { encoding: 'utf8', cwd: DIST });
const entries = list.stdout.split('\n').filter(Boolean);
const bad = entries.filter((e) => FORBIDDEN.test(e) || e.includes('\\'));
if (bad.length) fail(`entrées interdites dans l'archive :\n${bad.join('\n')}`);
if (!entries.includes('manifest.json')) fail('manifest.json absent de l\'archive');

fs.rmSync(stage, { recursive: true, force: true });
const kb = (fs.statSync(zipPath).size / 1024).toFixed(0);
console.log(`${path.relative(ROOT, zipPath)} — ${entries.length} entrées, ${kb} Ko`);
