// E2E : charge l'extension dans Chrome headless et déroule les flux M1.
//
// Prérequis (une fois) :
//   npm i --no-save puppeteer-core
//   npx -y @puppeteer/browsers install chrome@stable --path .chrome
// (Chrome stable ≥ 137 a retiré --load-extension : il faut Chrome for Testing.)
//
// Lancement :  node tools/e2e.cjs
// Le chemin du binaire peut être forcé via CHROME_FOR_TESTING.
const puppeteer = require('puppeteer-core');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const EXT_PATH = path.resolve(__dirname, '..');

function findChrome() {
  if (process.env.CHROME_FOR_TESTING) return process.env.CHROME_FOR_TESTING;
  const root = path.join(EXT_PATH, '.chrome', 'chrome');
  for (const dir of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const exe = path.join(root, dir, 'chrome-win64', 'chrome.exe');
    if (fs.existsSync(exe)) return exe;
  }
  throw new Error('Chrome for Testing introuvable — voir l\'en-tête du script.');
}
const CHROME = findChrome();
const PORT = 8123;

const results = [];
function step(ok, label, detail = '') {
  results.push({ ok, label, detail });
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollUrl(page, pred, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (pred(page.url())) return page.url(); } catch {}
    await sleep(150);
  }
  return page.url();
}

(async () => {
  // Petit serveur local : cible réelle pour les tests SPA/allowance, sans réseau.
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><title>LOCAL OK</title><h1>page ${req.url}</h1>`);
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decroche-e2e-'));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    userDataDir,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-first-run',
    ],
  });

  try {
    const swTarget = await browser.waitForTarget(
      (t) => t.type() === 'service_worker' && t.url().includes('service-worker.js'),
      { timeout: 15000 }
    );
    const extId = new URL(swTarget.url()).host;
    const worker = await swTarget.worker();
    console.log('Extension chargée, id =', extId);

    // --- Règles : une via la page d'options (E2E UI), le reste via storage ---
    const options = await browser.newPage();
    await options.goto(`chrome-extension://${extId}/src/options/options.html`);

    // Probe : cible invalide -> message d'erreur, pas de règle créée
    await options.type('#targets', 'pas un domaine');
    await options.click('#add-form button.primary');
    await sleep(300);
    const errShown = await options.$eval('#targets-error', (el) => !el.hidden && el.textContent);
    const rulesAfterInvalid = await worker.evaluate(async () =>
      (await chrome.storage.local.get('rules')).rules?.length ?? 0);
    step(!!errShown && rulesAfterInvalid === 0, 'Options : cible invalide refusée', String(errShown));

    // Ajout réel : règle blocage (page de pause) sur blocked.test
    await options.$eval('#targets', (el) => (el.value = ''));
    await options.type('#name', 'Test blocage');
    await options.type('#targets', 'blocked.test');
    await options.click('input[name="severity"][value="block"]');
    await options.click('#add-form button.primary');
    await sleep(400);
    const cardCount = await options.$$eval('.rule-card', (els) => els.length);
    step(cardCount === 1, 'Options : règle blocage créée via le formulaire', `${cardCount} carte(s)`);

    // Règles additionnelles via storage (friction SPA, closeTab, observer)
    await worker.evaluate(async () => {
      const { rules = [] } = await chrome.storage.local.get('rules');
      rules.push(
        {
          id: 'spa-friction', name: 'SPA', targets: ['127.0.0.1/spa'],
          severity: 'friction', blockAction: 'interstitial',
          frictionDelaySec: 2, allowDurationMin: 1,
          schedule: null, quotaMinutes: null, locked: false, enabled: true, createdAt: Date.now(),
        },
        {
          id: 'closetab', name: 'Fermeture', targets: ['closetab.test'],
          severity: 'block', blockAction: 'closeTab',
          frictionDelaySec: 10, allowDurationMin: 5,
          schedule: null, quotaMinutes: null, locked: false, enabled: true, createdAt: Date.now(),
        },
        {
          id: 'observe-local', name: 'Observation', targets: ['127.0.0.1'],
          severity: 'observe', blockAction: 'interstitial',
          frictionDelaySec: 10, allowDurationMin: 5,
          schedule: null, quotaMinutes: null, locked: false, enabled: true, createdAt: Date.now(),
        },
      );
      await chrome.storage.local.set({ rules });
    });
    await sleep(600); // recompilation DNR via storage.onChanged
    const dnrRules = await worker.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
    step(dnrRules.length === 3, 'DNR : 3 règles dynamiques compilées (observer exclu)',
      dnrRules.map((r) => r.condition.regexFilter).join(' | '));

    // --- T1 : page non ciblée du serveur local -> passe ---
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/accueil`, { waitUntil: 'domcontentloaded' });
    step((await page.title()) === 'LOCAL OK', 'Navigation libre hors cible', page.url());

    // --- T2 : pushState vers la section bloquée -> interstitiel (voie SPA) ---
    await page.evaluate(() => history.pushState({}, '', '/spa/feed'));
    let url = await pollUrl(page, (u) => u.includes('interstitial.html'));
    step(url.includes('interstitial.html') && url.includes('mode=friction'),
      'SPA : pushState intercepté -> interstitiel friction', url);

    // --- T3 : friction -> délai puis continuer -> allowance -> la page charge ---
    await sleep(400);
    const disabledDuringDelay = await page.$eval('#btn-continue', (b) => b.disabled);
    await sleep(2500);
    const enabledAfterDelay = await page.$eval('#btn-continue', (b) => !b.disabled);
    step(disabledDuringDelay && enabledAfterDelay,
      'Friction : bouton verrouillé pendant le délai puis libéré');
    await page.click('#btn-continue');
    url = await pollUrl(page, (u) => u.includes('/spa/feed') && !u.includes('interstitial'));
    await sleep(300);
    step(url === `http://127.0.0.1:${PORT}/spa/feed` && (await page.title()) === 'LOCAL OK',
      'Continuer : allowance accordée, la page cible charge (DNR outrepassé)', url);

    // --- T4 : pendant l'allowance, accès réseau direct à la section -> passe ---
    await page.goto(`http://127.0.0.1:${PORT}/spa/autre`, { waitUntil: 'domcontentloaded' });
    step(page.url().includes('/spa/autre') && (await page.title()) === 'LOCAL OK',
      'Allowance : navigation réseau directe libre pendant la fenêtre', page.url());

    // --- T5 : blocage avec page de pause ---
    const page2 = await browser.newPage();
    await page2.goto('http://blocked.test/x', { waitUntil: 'domcontentloaded' }).catch(() => {});
    url = await pollUrl(page2, (u) => u.includes('interstitial.html'));
    const blockUi = await page2.evaluate(() => ({
      mode: location.href.includes('mode=block'),
      continueHidden: document.getElementById('btn-continue').hidden,
      closeVisible: !document.getElementById('btn-close').hidden,
      title: document.getElementById('title').textContent,
    }));
    step(blockUi.mode && blockUi.continueHidden && blockUi.closeVisible,
      'Blocage : interstitiel sans échappatoire, bouton fermer visible', blockUi.title);

    // "Fermer l'onglet" ferme bien l'onglet
    await page2.click('#btn-close');
    await sleep(800);
    step(page2.isClosed(), 'Blocage : « Fermer l\'onglet » ferme l\'onglet');

    // --- T6 : action fermeture d'onglet via DNR ---
    const page3 = await browser.newPage();
    await page3.goto('http://closetab.test/', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(1000);
    step(page3.isClosed(), 'Fermeture d\'onglet : l\'onglet se ferme sans flash du site');

    // --- Probe : domaine voisin non ciblé -> pas de sur-blocage ---
    const page4 = await browser.newPage();
    const resp = await page4.goto('http://xblocked.test/', { waitUntil: 'domcontentloaded' })
      .then(() => 'loaded').catch((e) => e.message.split('\n')[0]);
    step(!page4.url().includes('interstitial'), 'Probe : xblocked.test non intercepté (pas de sur-blocage)', resp);
    await page4.close().catch(() => {});

    // --- Stats ---
    const stats = await worker.evaluate(async () =>
      (await chrome.storage.local.get('stats')).stats ?? {});
    const day = Object.values(stats)[0] ?? {};
    const spa = day['spa-friction'] ?? {};
    const observed = day['observe-local']?.observed ?? 0;
    const blockedRule = Object.entries(day).find(([id]) => !['spa-friction', 'closetab', 'observe-local'].includes(id))?.[1] ?? {};
    step(spa.frictionShown >= 1 && spa.continued >= 1,
      'Stats : friction comptée (montrée + poursuivie)', JSON.stringify(spa));
    step((blockedRule.blocked ?? 0) >= 1 && (day['closetab']?.blocked ?? 0) >= 1,
      'Stats : blocages comptés (pause + fermeture)',
      JSON.stringify({ block: blockedRule, closetab: day['closetab'] }));
    step(observed === 1,
      'Stats : observer compte l\'entrée sur le site une seule fois', `observed=${observed}`);

    // --- Popup ---
    const popup = await browser.newPage();
    await popup.goto(`chrome-extension://${extId}/src/popup/popup.html`);
    await sleep(300);
    const rows = await popup.$$eval('.rule-row', (els) => els.map((e) => e.textContent.trim()));
    step(rows.length === 4, 'Popup : une ligne d\'état par règle active', rows.join(' || '));
    await popup.screenshot({ path: path.join(__dirname, 'popup.png') });

    // Screenshot de l'interstitiel friction pour le rapport
    const shot = await browser.newPage();
    await shot.goto('http://blocked.test/exemple', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await pollUrl(shot, (u) => u.includes('interstitial.html'));
    await sleep(400);
    await shot.setViewport({ width: 800, height: 600 });
    await shot.screenshot({ path: path.join(__dirname, 'interstitial-block.png') });

    const shot2 = await browser.newPage();
    await shot2.setViewport({ width: 800, height: 600 });
    await shot2.goto(`http://127.0.0.1:${PORT}/spa/feed`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    // allowance encore active -> forcer une friction : nouvelle cible
    await shot2.goto(`chrome-extension://${extId}/src/pages/interstitial.html?rid=spa-friction&mode=friction&u=http://127.0.0.1:${PORT}/spa/feed`);
    await sleep(600);
    await shot2.screenshot({ path: path.join(__dirname, 'interstitial-friction.png') });
  } finally {
    await browser.close();
    server.close();
  }

  const fails = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - fails.length}/${results.length} OK ===`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
