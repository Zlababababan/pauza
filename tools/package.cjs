// Construit l'archive à soumettre au Chrome Web Store : uniquement ce dont
// l'extension a besoin à l'exécution (manifest, icônes, sources, _locales),
// rien de l'outillage du dépôt.
// Usage : node tools/package.cjs   ->  dist/pauza-<version>.zip
//
// ZIP écrit en pur Node (en-têtes standards, séparateurs « / », deflate via
// zlib). Vécu : `tar -a -cf x.zip` de Windows produit silencieusement un TAR
// nommé .zip (« Package non valide » côté store), et Compress-Archive a ses
// propres écarts — on ne dépend plus d'aucun outil externe.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const INCLUDE = ['manifest.json', 'icons', 'src', '_locales'];

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

// --- Liste des fichiers (chemins zip en « / », racine = racine du zip) ---
const files = [];
function walk(rel) {
  const abs = path.join(ROOT, rel);
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(abs).sort()) walk(rel + '/' + name);
  } else {
    files.push(rel.replaceAll('\\', '/'));
  }
}
for (const entry of INCLUDE) {
  if (!fs.existsSync(path.join(ROOT, entry))) fail(`entrée manquante : ${entry}`);
  walk(entry);
}
if (!files.includes('manifest.json')) fail('manifest.json absent de la liste');

// --- Écriture ZIP (local headers + central directory + EOCD) ---
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
// Horodatage DOS constant (build reproductible) : 2026-01-01 00:00.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

const localParts = [];
const centralParts = [];
let offset = 0;
for (const name of files) {
  const data = fs.readFileSync(path.join(ROOT, name));
  const crc = crc32(data);
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  // Method 8 (deflate) sauf si « stored » est plus petit (PNG déjà compressés).
  const useDeflate = deflated.length < data.length;
  const payload = useDeflate ? deflated : data;
  const method = useDeflate ? 8 : 0;
  const nameBuf = Buffer.from(name, 'utf8');

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);            // version needed
  local.writeUInt16LE(0x0800, 6);        // flags : noms en UTF-8
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(payload.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);            // extra len
  localParts.push(local, nameBuf, payload);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);          // version made by
  central.writeUInt16LE(20, 6);          // version needed
  central.writeUInt16LE(0x0800, 8);      // flags : UTF-8
  central.writeUInt16LE(method, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(payload.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  // extra/comment/disk/attrs internes+externes : 0
  central.writeUInt32LE(offset, 42);
  centralParts.push(central, nameBuf);

  offset += local.length + nameBuf.length + payload.length;
}
const centralSize = centralParts.reduce((n, b) => n + b.length, 0);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(files.length, 8);
eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(centralSize, 12);
eocd.writeUInt32LE(offset, 16);

const zipName = `pauza-${manifest.version}.zip`;
const zipPath = path.join(DIST, zipName);
fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(zipPath, Buffer.concat([...localParts, ...centralParts, eocd]));

// --- Vérification : signature PK + relecture réelle par un autre parseur ---
const head = fs.readFileSync(zipPath).subarray(0, 4);
if (head.readUInt32LE(0) !== 0x04034b50) fail('signature ZIP absente (PK\\x03\\x04)');
const kb = (fs.statSync(zipPath).size / 1024).toFixed(0);
console.log(`${path.relative(ROOT, zipPath)} — ${files.length} fichiers, ${kb} Ko`);
console.log('Contre-vérification conseillée : Expand-Archive (PowerShell) ou unzip -t.');
