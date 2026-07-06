// Génère les icônes de l'extension (définitives M5) en screenshotant un rendu
// HTML/SVG dans Chrome for Testing.
// Usage : node tools/gen-icons.cjs  (mêmes prérequis que tools/e2e.cjs)
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function findChrome() {
  if (process.env.CHROME_FOR_TESTING) return process.env.CHROME_FOR_TESTING;
  const root = path.join(ROOT, '.chrome', 'chrome');
  for (const dir of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const exe = path.join(root, dir, 'chrome-win64', 'chrome.exe');
    if (fs.existsSync(exe)) return exe;
  }
  throw new Error('Chrome for Testing introuvable — voir tools/e2e.cjs.');
}

// Motif « décrocher » : un anneau qui s'ouvre vers le haut-droit, et le
// fragment manquant qui s'échappe dans l'axe de l'ouverture — lâcher prise,
// pas un spinner. Dégradé de verts du thème, anneau blanc cassé.
// Tout est dessiné en unités du viewBox 128 puis mis à l'échelle : le rendu
// est identique à toutes les tailles. À 16 px, le fragment est grossi et
// l'ouverture élargie pour rester lisibles.
const svg = (size) => {
  const small = size <= 16;
  const C = 64;                       // centre
  const R = 33;                       // rayon de l'anneau
  const W = small ? 15 : 11.5;        // épaisseur du trait
  const GAP_DEG = small ? 88 : 62;    // ouverture, centrée sur le haut-droit
  const circ = 2 * Math.PI * R;
  const gapLen = (GAP_DEG / 360) * circ;
  // Le dash démarre à 3 h et l'ouverture finit le tour, donc son centre est
  // à -GAP/2 ; on tourne pour l'amener sur le haut-droit (-45°).
  const rot = -45 + GAP_DEG / 2;
  // Fragment échappé : dans l'axe de l'ouverture, au-delà de l'anneau.
  const fragDist = R + (small ? 21 : 16.5);
  const fx = C + fragDist * Math.cos(-Math.PI / 4);
  const fy = C + fragDist * Math.sin(-Math.PI / 4);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4a8770"/>
      <stop offset="1" stop-color="#2e5647"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#bg)"/>
  <circle cx="${C}" cy="${C}" r="${R}"
    fill="none" stroke="#f2f7f4" stroke-width="${W}" stroke-linecap="round"
    stroke-dasharray="${(circ - gapLen).toFixed(2)} ${gapLen.toFixed(2)}"
    transform="rotate(${rot.toFixed(2)} ${C} ${C})"/>
  <circle cx="${fx.toFixed(2)}" cy="${fy.toFixed(2)}" r="${(W / 2 + 1.5).toFixed(2)}" fill="#f2f7f4"/>
</svg>`;
};

const html = (size) => `<!doctype html><style>
  body { margin: 0; background: transparent; }
  .icon { width: ${size}px; height: ${size}px; }
  svg { display: block; }
</style><div class="icon">${svg(size)}</div>`;

(async () => {
  const iconsDir = path.join(ROOT, 'icons');
  fs.mkdirSync(iconsDir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
  });
  try {
    const page = await browser.newPage();
    for (const size of [16, 32, 48, 128]) {
      await page.setViewport({ width: size, height: size });
      await page.setContent(html(size));
      const el = await page.$('.icon');
      await el.screenshot({
        path: path.join(iconsDir, `icon${size}.png`),
        omitBackground: true,
      });
      console.log(`icons/icon${size}.png`);
    }
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
