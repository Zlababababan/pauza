// Génère les icônes de l'extension (placeholder M2, définitives en M5) en
// screenshotant un rendu HTML dans Chrome for Testing.
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

// Anneau brisé : un cercle qui se « décroche », sur le vert du thème.
const html = (size) => `<!doctype html><style>
  body { margin: 0; background: transparent; }
  .icon {
    width: ${size}px; height: ${size}px;
    background: #3d6b5c;
    border-radius: ${Math.round(size * 0.22)}px;
    display: grid; place-items: center;
  }
  .ring {
    width: ${size * 0.52}px; height: ${size * 0.52}px;
    border: ${Math.max(2, Math.round(size * 0.09))}px solid #eaf3ef;
    border-radius: 50%;
    border-bottom-color: transparent;
    transform: rotate(-45deg) translate(0, ${-size * 0.02}px);
  }
</style><div class="icon"><div class="ring"></div></div>`;

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
