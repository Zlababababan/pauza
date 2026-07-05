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

// Captures d'écran : hors du dépôt (surchargable via E2E_OUT).
const OUT_DIR = process.env.E2E_OUT ?? path.join(os.tmpdir(), 'decroche-e2e-out');
fs.mkdirSync(OUT_DIR, { recursive: true });

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
    await popup.screenshot({ path: path.join(OUT_DIR, 'popup.png') });

    // Screenshot de l'interstitiel friction pour le rapport
    const shot = await browser.newPage();
    await shot.goto('http://blocked.test/exemple', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await pollUrl(shot, (u) => u.includes('interstitial.html'));
    await sleep(400);
    await shot.setViewport({ width: 800, height: 600 });
    await shot.screenshot({ path: path.join(OUT_DIR, 'interstitial-block.png') });

    const shot2 = await browser.newPage();
    await shot2.setViewport({ width: 800, height: 600 });
    await shot2.goto(`http://127.0.0.1:${PORT}/spa/feed`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    // allowance encore active -> forcer une friction : nouvelle cible
    await shot2.goto(`chrome-extension://${extId}/src/pages/interstitial.html?rid=spa-friction&mode=friction&u=http://127.0.0.1:${PORT}/spa/feed`);
    await sleep(600);
    await shot2.screenshot({ path: path.join(OUT_DIR, 'interstitial-friction.png') });
    await shot.close().catch(() => {});
    await shot2.close().catch(() => {});

    // --- Phase 2 : préséance du blocage ---
    const mkRule = (id, targets, severity, extra = {}) => ({
      id, name: id, targets, severity, blockAction: 'interstitial',
      frictionDelaySec: 2, allowDurationMin: 1, schedule: null,
      quotaMinutes: null, locked: false, enabled: true, createdAt: Date.now(), ...extra,
    });

    // Friction ET blocage sur la même cible -> le blocage doit gagner (voie DNR)
    await worker.evaluate(async (rules) => {
      const cur = (await chrome.storage.local.get('rules')).rules ?? [];
      await chrome.storage.local.set({ rules: [...cur, ...rules] });
    }, [mkRule('both-friction', ['both.test'], 'friction'), mkRule('both-block', ['both.test'], 'block')]);
    await sleep(600);
    const pageB = await browser.newPage();
    await pageB.goto('http://both.test/', { waitUntil: 'domcontentloaded' }).catch(() => {});
    url = await pollUrl(pageB, (u) => u.includes('interstitial.html'));
    step(url.includes('mode=block') && url.includes('rid=both-block'),
      'Préséance : blocage > friction sur la même cible (DNR)', url);
    await pageB.close().catch(() => {});

    // Allowance en cours puis règle durcie en blocage -> blocage immédiat
    await worker.evaluate(async (rule) => {
      const cur = (await chrome.storage.local.get('rules')).rules ?? [];
      await chrome.storage.local.set({ rules: [...cur, rule] });
    }, mkRule('harden', ['127.0.0.1/spa2'], 'friction'));
    await sleep(600);
    const pageH = await browser.newPage();
    await pageH.goto(`http://127.0.0.1:${PORT}/spa2/page`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await pollUrl(pageH, (u) => u.includes('interstitial.html'));
    await sleep(2600); // délai de friction
    await pageH.click('#btn-continue');
    url = await pollUrl(pageH, (u) => u.includes('/spa2/page') && !u.includes('interstitial'));
    step(url === `http://127.0.0.1:${PORT}/spa2/page`,
      'Préséance : allowance accordée sur la règle friction', url);
    // Durcissement : friction -> blocage
    await worker.evaluate(async () => {
      const { rules = [] } = await chrome.storage.local.get('rules');
      rules.find((r) => r.id === 'harden').severity = 'block';
      await chrome.storage.local.set({ rules });
    });
    await sleep(600);
    const pruned = await worker.evaluate(async () =>
      Object.keys((await chrome.storage.session.get('allowances')).allowances ?? {}));
    await pageH.goto(`http://127.0.0.1:${PORT}/spa2/page`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    url = await pollUrl(pageH, (u) => u.includes('interstitial.html'));
    step(url.includes('mode=block') && !pruned.some((k) => k.startsWith('harden|')),
      'Préséance : durcir en blocage révoque l\'allowance et bloque immédiatement',
      `url=${url} allowances=${JSON.stringify(pruned)}`);
    await pageH.close().catch(() => {});

    // --- Phase 3 (M2) : horaires et quotas ---
    const today = new Date().getDay();
    await worker.evaluate(async (rules) => {
      const cur = (await chrome.storage.local.get('rules')).rules ?? [];
      await chrome.storage.local.set({ rules: [...cur, ...rules] });
    }, [
      mkRule('sched-on', ['sched-on.test'], 'block',
        { schedule: { days: [today], ranges: [{ from: '00:00', to: '23:59' }] } }),
      mkRule('sched-off', ['sched-off.test'], 'block',
        { schedule: { days: [(today + 3) % 7], ranges: [{ from: '00:00', to: '23:59' }] } }),
      mkRule('quota-rule', ['127.0.0.1/quota'], 'quota', { quotaMinutes: 0.05 }), // 3 s
    ]);
    await sleep(600);

    // Horaires : règle dans sa plage -> bloque ; hors plage -> laisse passer
    const pageS = await browser.newPage();
    await pageS.goto('http://sched-on.test/', { waitUntil: 'domcontentloaded' }).catch(() => {});
    url = await pollUrl(pageS, (u) => u.includes('interstitial.html'));
    step(url.includes('mode=block') && url.includes('rid=sched-on'),
      'Horaires : règle dans sa plage -> blocage appliqué', url);
    await pageS.close().catch(() => {});
    // Page fraîche : après un goto en échec DNS, page.url() garde l'URL précédente.
    const pageOff = await browser.newPage();
    const offResult = await pageOff.goto('http://sched-off.test/', { waitUntil: 'domcontentloaded' })
      .then(() => 'loaded').catch((e) => e.message.split(' at ')[0]);
    await sleep(500);
    step(!pageOff.url().includes('interstitial'),
      'Horaires : règle hors plage -> aucune interception', `${offResult} url=${pageOff.url()}`);
    await pageOff.close().catch(() => {});

    const syncAlarm = await worker.evaluate(() => chrome.alarms.get('engine-sync'));
    step(!!syncAlarm, 'Horaires : alarme de borne programmée',
      syncAlarm ? new Date(syncAlarm.scheduledTime).toISOString() : 'absente');

    // Quota : accès libre, temps actif consommé, épuisement -> blocage + balayage
    const pageQ = await browser.newPage();
    await pageQ.goto(`http://127.0.0.1:${PORT}/quota/a`, { waitUntil: 'domcontentloaded' });
    await pageQ.bringToFront();
    step((await pageQ.title()) === 'LOCAL OK',
      'Quota : accès libre tant que le quota n\'est pas épuisé', pageQ.url());
    await sleep(4500); // consomme > 3 s de temps actif

    // Un événement d'onglet referme le segment -> épuisement détecté
    const trigger = await browser.newPage();
    await sleep(1200);
    url = await pollUrl(pageQ, (u) => u.includes('interstitial.html'));
    step(url.includes('mode=quota') && url.includes('rid=quota-rule'),
      'Quota : épuisement -> onglet ouvert balayé vers l\'interstitiel quota', url);

    // Et le DNR bloque les nouvelles navigations
    await pageQ.goto(`http://127.0.0.1:${PORT}/quota/b`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    url = await pollUrl(pageQ, (u) => u.includes('interstitial.html'));
    step(url.includes('mode=quota'),
      'Quota : nouvelle navigation bloquée par le DNR après épuisement', url);

    const usage = await worker.evaluate(async () => {
      const { usage = {} } = await chrome.storage.local.get('usage');
      return Object.values(usage)[0] ?? {};
    });
    step((usage['quota-rule'] ?? 0) >= 3,
      'Quota : temps actif réellement comptabilisé', `${(usage['quota-rule'] ?? 0).toFixed(1)} s`);

    await pageQ.screenshot({ path: path.join(OUT_DIR, 'interstitial-quota.png') })
      .catch(() => {});
    await pageQ.close().catch(() => {});
    await trigger.close().catch(() => {});

    // --- Phase 4 : rejeu des deux bugs remontés après le test M2 ---

    // Bug 1a : quota + plage = fenêtre de disponibilité. Hors plage -> fermé.
    await worker.evaluate(async (rule) => {
      const cur = (await chrome.storage.local.get('rules')).rules ?? [];
      await chrome.storage.local.set({ rules: [...cur, rule] });
    }, mkRule('quota-window', ['qwindow.test'], 'quota', {
      quotaMinutes: 30,
      schedule: { days: [(today + 3) % 7], ranges: [{ from: '09:00', to: '09:30' }] },
    }));
    await sleep(600);
    const pageW = await browser.newPage();
    await pageW.goto('http://qwindow.test/', { waitUntil: 'domcontentloaded' }).catch(() => {});
    url = await pollUrl(pageW, (u) => u.includes('interstitial.html'));
    const offhoursUi = await pageW.evaluate(() => ({
      title: document.getElementById('title')?.textContent,
      subtitle: document.getElementById('subtitle')?.textContent,
    })).catch(() => ({}));
    step(url.includes('mode=offhours') && url.includes('rid=quota-window'),
      'Bug 1a : quota hors plage de disponibilité -> fermé (offhours)',
      `${url.slice(0, 100)}… « ${offhoursUi.title} » ${offhoursUi.subtitle?.slice(-60)}`);
    await pageW.close().catch(() => {});

    // Bug 1b : « Reprendre où j'en étais » quand l'historique ramène sur une
    // page elle-même bloquée -> repli onglet vierge au lieu du rebond infini.
    const pageL = await browser.newPage();
    await pageL.goto('http://blocked.test/premier', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await pollUrl(pageL, (u) => u.includes('interstitial.html'));
    await pageL.goto('http://blocked.test/second', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await pollUrl(pageL, (u) => u.includes('interstitial.html'));
    await pageL.click('#btn-leave'); // back -> interstitiel 1 -> rebond détecté -> vierge
    await sleep(1500);
    const leaveUrl = pageL.isClosed() ? '(onglet fermé)' : pageL.url();
    step(pageL.isClosed() || !leaveUrl.includes('interstitial.html'),
      'Bug 1b : reprendre avec historique bloqué -> repli onglet vierge, pas de rebond', leaveUrl);
    await pageL.close().catch(() => {});

    // Et sans historique du tout : le bouton mène aussi à un onglet vierge.
    const pageL2 = await browser.newPage();
    await pageL2.goto('http://blocked.test/direct', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await pollUrl(pageL2, (u) => u.includes('interstitial.html'));
    await pageL2.click('#btn-leave');
    await sleep(1200);
    const leave2 = pageL2.isClosed() ? '(onglet fermé)' : pageL2.url();
    step(pageL2.isClosed() || !leave2.includes('interstitial.html'),
      'Bug 1b : reprendre sans historique -> onglet vierge', leave2);
    await pageL2.close().catch(() => {});
  } finally {
    await browser.close();
    server.close();
  }

  const fails = results.filter((r) => !r.ok);
  console.log(`\nCaptures : ${OUT_DIR}`);
  console.log(`=== ${results.length - fails.length}/${results.length} OK ===`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
