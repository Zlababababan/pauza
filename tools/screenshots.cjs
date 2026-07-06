// Captures d'écran pour la fiche Chrome Web Store (1280×800) : options,
// tableau de bord, interstitiel de friction et popup (mis en scène), avec des
// données de démonstration réalistes, en FR et EN.
// Usage : node tools/screenshots.cjs   ->  dist/screenshots/<langue>/*.png
// Mêmes prérequis que tools/e2e.cjs (Chrome for Testing dans .chrome/).
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LANGS = ['fr', 'en'];
const VIEWPORT = { width: 1280, height: 800 };

function findChrome() {
  if (process.env.CHROME_FOR_TESTING) return process.env.CHROME_FOR_TESTING;
  const root = path.join(ROOT, '.chrome', 'chrome');
  for (const dir of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const exe = path.join(root, dir, 'chrome-win64', 'chrome.exe');
    if (fs.existsSync(exe)) return exe;
  }
  throw new Error('Chrome for Testing introuvable — voir tools/e2e.cjs.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dayKey = (offset) => {
  const d = new Date(Date.now() + offset * 86400000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Données de démo : un quotidien plausible sur 14 jours, avec une amélioration
// récente (les streaks du tableau de bord racontent une histoire).
function demoData(lang) {
  const names = lang === 'fr'
    ? { tiktok: 'TikTok', yt: 'YouTube' }
    : { tiktok: 'TikTok', yt: 'YouTube' };
  const mk = (id, name, targets, severity, extra = {}) => ({
    id, name, targets, severity, blockAction: 'interstitial',
    frictionDelaySec: 10, allowDurationMin: 5, schedule: null,
    quotaMinutes: null, locked: false, pendingDeleteAt: null,
    enabled: true, createdAt: Date.now() - 30 * 86400000, ...extra,
  });
  const rules = [
    mk('demo-tiktok', names.tiktok, ['tiktok.com'], 'friction'),
    mk('demo-yt', names.yt, ['youtube.com'], 'quota', { quotaMinutes: 45 }),
    mk('demo-social', null, ['@social'], 'observe'),
    mk('demo-gambling', null, ['@gambling'], 'block', { locked: true }),
  ];
  const shown = [5, 4, 6, 3, 5, 4, 2, 4, 3, 2, 3, 2, 3, 2];
  const cont = [4, 3, 4, 2, 3, 2, 1, 2, 1, 1, 1, 0, 0, 0];
  const visits = [11, 9, 12, 8, 10, 7, 9, 6, 8, 5, 6, 7, 4, 5];
  const minutes = [52, 48, 45, 40, 46, 38, 35, 44, 30, 28, 33, 25, 27, 22];
  const stats = {};
  const usage = {};
  for (let i = 0; i < 14; i++) {
    const key = dayKey(i - 13);
    stats[key] = {
      'demo-tiktok': { frictionShown: shown[i], continued: cont[i], observed: 0, blocked: 0 },
      'demo-social': { observed: visits[i], frictionShown: 0, continued: 0, blocked: 0 },
      'demo-gambling': { blocked: i === 2 ? 1 : 0, observed: 0, frictionShown: 0, continued: 0 },
    };
    usage[key] = { 'demo-yt': minutes[i] * 60 };
  }
  return { rules, stats, usage };
}

(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pauza-shots-'));
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
    userDataDir,
    args: [
      `--disable-extensions-except=${ROOT}`,
      `--load-extension=${ROOT}`,
      '--no-first-run',
      '--force-device-scale-factor=1',
    ],
  });
  try {
    const swTarget = await browser.waitForTarget(
      (t) => t.type() === 'service_worker' && t.url().includes('service-worker.js'),
      { timeout: 15000 }
    );
    const extId = new URL(swTarget.url()).host;
    const worker = await swTarget.worker();

    for (const lang of LANGS) {
      const outDir = path.join(ROOT, 'dist', 'screenshots', lang);
      fs.mkdirSync(outDir, { recursive: true });
      await worker.evaluate((data) => chrome.storage.local.set(data),
        { ...demoData(lang), lang, settings: {}, strict: { armed: false, until: null, pendingDisarmAt: null } });
      await sleep(600);

      const page = await browser.newPage();
      await page.setViewport(VIEWPORT);
      const shot = (name) => page.screenshot({ path: path.join(outDir, name) });

      await page.goto(`chrome-extension://${extId}/src/options/options.html`);
      await sleep(700);
      await shot('1-options.png');

      await page.goto(`chrome-extension://${extId}/src/dashboard/dashboard.html`);
      await sleep(700);
      await shot('2-dashboard.png');

      // Popup mis en scène : cadré au centre sur un fond aux couleurs du thème.
      await page.goto(`chrome-extension://${extId}/src/popup/popup.html`);
      await sleep(600);
      await page.addStyleTag({ content: `
        html { background: linear-gradient(135deg, #2e5647 0%, #4a8770 100%); min-height: 100vh; }
        body { margin: 70px auto; border-radius: 18px; overflow: hidden;
               box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45); }
      ` });
      await sleep(200);
      await shot('3-popup.png');

      const u = encodeURIComponent('https://www.tiktok.com/foryou');
      await page.goto(`chrome-extension://${extId}/src/pages/interstitial.html?rid=demo-tiktok&mode=friction&u=${u}`);
      await sleep(700);
      await shot('4-interstitial.png');

      await page.close();
      console.log(`dist/screenshots/${lang}/ — 4 captures`);
    }
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
