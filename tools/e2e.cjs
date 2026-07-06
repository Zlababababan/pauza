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
const OUT_DIR = process.env.E2E_OUT ?? path.join(os.tmpdir(), 'pauza-e2e-out');
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

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pauza-e2e-'));
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

    // Headless : aucun input utilisateur, l'état idle basculerait à 60 s de
    // fonctionnement. On élève le seuil pour toute la durée du banc.
    await worker.evaluate(() => chrome.storage.local.set({ settings: { idleSeconds: 6000 } }));

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
    await sleep(500); // init asynchrone de la page (i18n, règle)
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

    // --- Phase 5 : i18n dynamique + mode strict (M3) ---

    // i18n : bascule FR -> EN à chaud depuis le popup
    const pop2 = await browser.newPage();
    await pop2.goto(`chrome-extension://${extId}/src/popup/popup.html`);
    await sleep(500);
    const frLabel = await pop2.$eval('#open-options', (el) => el.textContent);
    await pop2.select('#lang-switcher', 'en');
    await sleep(1200); // setLang + location.reload()
    const enLabel = await pop2.$eval('#open-options', (el) => el.textContent);
    step(frLabel === 'Gérer mes règles' && enLabel === 'Manage my rules',
      'i18n : bascule FR -> EN à chaud depuis le popup', `« ${frLabel} » -> « ${enLabel} »`);
    await worker.evaluate(() => chrome.storage.local.set({ lang: 'fr' }));
    await pop2.close().catch(() => {});

    // Mode strict : règle verrouillée + armement via l'UI des options
    await worker.evaluate(async (rule) => {
      const cur = (await chrome.storage.local.get('rules')).rules ?? [];
      await chrome.storage.local.set({ rules: [...cur, rule] });
    }, { ...mkRule('locked-rule', ['locked.test'], 'block'), locked: true, pendingDeleteAt: null });
    await sleep(400);

    const opt2 = await browser.newPage();
    await opt2.goto(`chrome-extension://${extId}/src/options/options.html`);
    await sleep(600);
    await opt2.$$eval('#strict-actions button', (btns) => btns[0].click()); // Armer 24 h
    await sleep(600);
    let strict = await worker.evaluate(async () =>
      (await chrome.storage.local.get('strict')).strict);
    step(strict?.armed === true && strict.until > Date.now(),
      'Strict : armement 24 h via l\'UI des options', JSON.stringify(strict));

    // Sabotage 1 : suppression directe de la règle verrouillée -> restaurée
    await worker.evaluate(async () => {
      const { rules } = await chrome.storage.local.get('rules');
      await chrome.storage.local.set({ rules: rules.filter((r) => r.id !== 'locked-rule') });
    });
    await sleep(800);
    let lockedRule = await worker.evaluate(async () =>
      ((await chrome.storage.local.get('rules')).rules ?? []).find((r) => r.id === 'locked-rule'));
    step(!!lockedRule, 'Strict : suppression directe d\'une règle verrouillée -> restaurée');

    // Sabotage 2 : assouplissement (blocage -> friction) -> annulé
    await worker.evaluate(async () => {
      const { rules } = await chrome.storage.local.get('rules');
      rules.find((r) => r.id === 'locked-rule').severity = 'friction';
      await chrome.storage.local.set({ rules });
    });
    await sleep(800);
    lockedRule = await worker.evaluate(async () =>
      ((await chrome.storage.local.get('rules')).rules ?? []).find((r) => r.id === 'locked-rule'));
    step(lockedRule?.severity === 'block',
      'Strict : assouplissement d\'une règle verrouillée -> annulé', `severity=${lockedRule?.severity}`);

    // Sabotage 3 : demande de suppression raccourcie (échéance dans 1 s) -> annulée
    await worker.evaluate(async () => {
      const { rules } = await chrome.storage.local.get('rules');
      rules.find((r) => r.id === 'locked-rule').pendingDeleteAt = Date.now() + 1000;
      await chrome.storage.local.set({ rules });
    });
    await sleep(800);
    lockedRule = await worker.evaluate(async () =>
      ((await chrome.storage.local.get('rules')).rules ?? []).find((r) => r.id === 'locked-rule'));
    step(lockedRule?.pendingDeleteAt == null,
      'Strict : échéance de suppression raccourcie -> annulée');

    // Demande de suppression légitime via l'UI -> échéance à ~24 h
    await opt2.reload();
    await sleep(600);
    await opt2.$$eval('.rule-card', (cards) => {
      const card = cards.find((c) => c.textContent.includes('locked-rule'));
      card.querySelector('button.danger').click();
    });
    await sleep(600);
    lockedRule = await worker.evaluate(async () =>
      ((await chrome.storage.local.get('rules')).rules ?? []).find((r) => r.id === 'locked-rule'));
    const in24h = Math.abs((lockedRule?.pendingDeleteAt ?? 0) - Date.now() - 24 * 3600 * 1000) < 5 * 60 * 1000;
    step(in24h, 'Strict : demande de suppression via l\'UI -> échéance à ~24 h',
      lockedRule?.pendingDeleteAt ? new Date(lockedRule.pendingDeleteAt).toISOString() : 'absente');

    // Sabotage 4 : désarmement direct -> annulé (l'échéance n'est pas atteinte)
    await worker.evaluate(() =>
      chrome.storage.local.set({ strict: { armed: false, until: null, pendingDisarmAt: null } }));
    await sleep(800);
    strict = await worker.evaluate(async () =>
      (await chrome.storage.local.get('strict')).strict);
    step(strict?.armed === true, 'Strict : désarmement direct -> annulé', JSON.stringify(strict));

    // Armement à échéance courte : l'échéance passée est appliquée au prochain sync
    await worker.evaluate(() =>
      chrome.storage.local.set({ strict: { armed: true, until: Date.now() + 1500, pendingDisarmAt: null } }));
    await sleep(2500);
    // Un changement quelconque déclenche syncEngine -> échéances appliquées
    await worker.evaluate(async (rule) => {
      const cur = (await chrome.storage.local.get('rules')).rules ?? [];
      await chrome.storage.local.set({ rules: [...cur, rule] });
    }, mkRule('dummy-sync', ['dummy-sync.test'], 'observe'));
    await sleep(800);
    strict = await worker.evaluate(async () =>
      (await chrome.storage.local.get('strict')).strict);
    step(strict?.armed === false, 'Strict : échéance d\'armement passée -> désarmé au sync', JSON.stringify(strict));

    // Mode strict désarmé : la suppression différée échue s'exécute
    await worker.evaluate(async () => {
      const { rules } = await chrome.storage.local.get('rules');
      rules.find((r) => r.id === 'locked-rule').pendingDeleteAt = Date.now() - 1000;
      await chrome.storage.local.set({ rules });
    });
    await sleep(800);
    lockedRule = await worker.evaluate(async () =>
      ((await chrome.storage.local.get('rules')).rules ?? []).find((r) => r.id === 'locked-rule'));
    step(!lockedRule, 'Strict : suppression différée échue -> exécutée');

    // Statut incognito affiché dans la section strict (environnement de test : non autorisé)
    await opt2.reload();
    await sleep(600);
    const incog = await opt2.$eval('#incognito-status', (el) => el.textContent);
    await opt2.screenshot({ path: path.join(OUT_DIR, 'options-strict.png'), fullPage: true });
    step(incog.length > 0, 'Strict : statut navigation privée affiché', incog.slice(0, 80));
    await opt2.close().catch(() => {});

    // --- Phase 6 (M4) : tableau de bord, streaks, mode discret ---
    const dkey = (offset) => {
      const d = new Date(Date.now() + offset * 86400000);
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    // Historique : friction créée il y a 9 jours, poursuites à J-7 et J-3
    // -> série courante attendue : 3 (J-2, J-1, J), record : 3 (J-6..J-4)
    await worker.evaluate(async ({ rule, statsPatch }) => {
      const cur = (await chrome.storage.local.get('rules')).rules ?? [];
      const { stats = {} } = await chrome.storage.local.get('stats');
      Object.assign(stats, statsPatch);
      await chrome.storage.local.set({ rules: [...cur, rule], stats });
    }, {
      rule: { ...mkRule('dash-rule', ['dash.test'], 'friction'), createdAt: Date.now() - 9 * 86400000 },
      statsPatch: {
        [dkey(-7)]: { 'dash-rule': { continued: 2, frictionShown: 3 } },
        [dkey(-3)]: { 'dash-rule': { continued: 1, frictionShown: 1 } },
        [dkey(-1)]: { 'dash-rule': { frictionShown: 2, continued: 0 } },
      },
    });
    await sleep(500);

    const dash = await browser.newPage();
    await dash.setViewport({ width: 760, height: 1200 });
    await dash.goto(`chrome-extension://${extId}/src/dashboard/dashboard.html`);
    await sleep(700);
    const dashInfo = await dash.evaluate(() => {
      const card = [...document.querySelectorAll('.card')]
        .find((c) => c.textContent.includes('dash-rule'));
      return card && {
        streak: card.querySelector('.streak').textContent,
        bars: card.querySelectorAll('.col').length,
        tableRows: card.querySelectorAll('table tr').length,
        totals: card.querySelector('.totals').textContent,
      };
    });
    step(dashInfo?.streak.includes('Série en cours : 3 j') && dashInfo.streak.includes('record : 3 j'),
      'Dashboard : streak courante et record calculés', dashInfo?.streak);
    step(dashInfo?.bars === 14 && dashInfo.tableRows === 15,
      'Dashboard : 14 colonnes + vue tableau', `bars=${dashInfo?.bars} rows=${dashInfo?.tableRows}`);

    // Tooltip au survol d'une colonne
    await dash.hover('.card .col:nth-child(8)');
    await sleep(300);
    const tipVisible = await dash.$eval('#tooltip', (el) => !el.hidden && el.textContent.length > 0);
    step(tipVisible, 'Dashboard : tooltip au survol',
      await dash.$eval('#tooltip', (el) => el.textContent));

    // Ligne de quota sur la carte d'une règle quota
    const quotaLine = await dash.evaluate(() => {
      const card = [...document.querySelectorAll('.card')]
        .find((c) => c.textContent.includes('quota-rule'));
      return !!card?.querySelector('.quota-line');
    });
    step(quotaLine, 'Dashboard : ligne de quota affichée sur les règles quota');

    // Popup : streak visible sur la règle
    const pop3 = await browser.newPage();
    await pop3.goto(`chrome-extension://${extId}/src/popup/popup.html`);
    await sleep(500);
    const popRow = await pop3.evaluate(() =>
      [...document.querySelectorAll('.rule-row')]
        .find((r) => r.textContent.includes('dash-rule'))?.textContent);
    step(popRow?.includes('🌱 3'), 'Popup : streak affichée sur la règle', popRow);
    await pop3.close().catch(() => {});

    // Mode discret : flou des noms dans popup et dashboard
    const opt3 = await browser.newPage();
    await opt3.goto(`chrome-extension://${extId}/src/options/options.html`);
    await sleep(600);
    // Régression (bug Yassin) : sans PIN, aucun portail et page visible.
    const noPinState = await opt3.evaluate(() => ({
      gate: !!document.getElementById('pin-gate'),
      mainVisible: !document.querySelector('main').hidden,
    }));
    step(!noPinState.gate && noPinState.mainVisible,
      'PIN : sans PIN, pas de portail et page visible', JSON.stringify(noPinState));
    await opt3.click('#discreet-blur');
    await sleep(500);
    // Flou immédiat sur la gestion des règles (noms + cibles)
    const optBlur = await opt3.evaluate(() => ({
      names: document.querySelectorAll('.rule-card .site-name.blurred').length,
      targets: document.querySelectorAll('.rule-targets.blurred').length,
    }));
    step(optBlur.names > 0 && optBlur.targets > 0,
      'Mode discret : noms et cibles floutés dans la gestion des règles', JSON.stringify(optBlur));
    await sleep(400);
    await dash.reload();
    await sleep(700);
    const blurred = await dash.$$eval('.site-name.blurred', (els) => els.length);
    step(blurred > 0, 'Mode discret : noms floutés dans le tableau de bord', `${blurred} noms`);
    await dash.screenshot({ path: path.join(OUT_DIR, 'dashboard.png') }).catch(() => {});
    await dash.close().catch(() => {});

    // PIN : définition, portail, mauvais PIN refusé, bon PIN débloque
    await opt3.type('#pin-new', '1234');
    await opt3.click('#pin-set');
    await sleep(400);
    const pinStatus = await opt3.$eval('#pin-status', (el) => el.textContent);
    step(pinStatus.includes('PIN actif'), 'PIN : défini via les options', pinStatus);

    await opt3.reload();
    await sleep(600);
    const gated = await opt3.evaluate(() => ({
      gate: !!document.getElementById('pin-gate'),
      main: document.querySelector('main').hidden,
    }));
    step(gated.gate && gated.main, 'PIN : portail affiché au rechargement, page masquée');

    await opt3.type('#gate-pin', '9999');
    await opt3.click('#gate-form button');
    await sleep(400);
    const wrongPin = await opt3.evaluate(() => ({
      error: !document.getElementById('gate-error').hidden,
      main: document.querySelector('main').hidden,
    }));
    step(wrongPin.error && wrongPin.main, 'PIN : mauvais PIN refusé');

    await opt3.$eval('#gate-pin', (el) => (el.value = ''));
    await opt3.type('#gate-pin', '1234');
    await opt3.click('#gate-form button');
    await sleep(400);
    const unlocked = await opt3.evaluate(() => !document.querySelector('main').hidden);
    step(unlocked, 'PIN : bon PIN débloque la page');
    await opt3.close().catch(() => {});

    // La page statistiques est verrouillée par le même PIN
    const dash2 = await browser.newPage();
    await dash2.goto(`chrome-extension://${extId}/src/dashboard/dashboard.html`);
    await sleep(600);
    const dashGated = await dash2.evaluate(() => ({
      gate: !!document.getElementById('pin-gate'),
      main: document.querySelector('main').hidden,
    }));
    step(dashGated.gate && dashGated.main, 'PIN : la page statistiques est verrouillée aussi');
    await dash2.type('#gate-pin', '1234');
    await dash2.click('#gate-form button');
    await sleep(400);
    const dashUnlocked = await dash2.evaluate(() =>
      !document.querySelector('main').hidden && !document.getElementById('pin-gate'));
    step(dashUnlocked, 'PIN : bon PIN débloque les statistiques');
    await dash2.close().catch(() => {});

    // --- Phase 7 (M5) : catégories prédéfinies + bouton panique ---

    // Le PIN est couvert : on le retire pour la suite de la phase.
    await worker.evaluate(async () => {
      const { settings = {} } = await chrome.storage.local.get('settings');
      settings.pinHash = null;
      await chrome.storage.local.set({ settings });
    });

    // Chips : un clic ajoute le jeton @social aux cibles, un second le retire
    const opt4 = await browser.newPage();
    await opt4.goto(`chrome-extension://${extId}/src/options/options.html`);
    await sleep(600);
    const chipCount = await opt4.$$eval('#category-chips .chip', (els) => els.length);
    await opt4.click('#category-chips .chip[data-cat="social"]');
    const afterAdd = await opt4.$eval('#targets', (el) => el.value);
    const chipActive = await opt4.$eval('#category-chips .chip[data-cat="social"]',
      (el) => el.classList.contains('active'));
    await opt4.click('#category-chips .chip[data-cat="social"]');
    const afterRemove = await opt4.$eval('#targets', (el) => el.value);
    step(chipCount === 6 && afterAdd.includes('@social') && chipActive && !afterRemove.includes('@social'),
      'Catégories : chip -> jeton @social ajouté puis retiré des cibles',
      `chips=${chipCount} add=« ${afterAdd} »`);

    // Jeton de catégorie inconnu refusé comme une cible invalide
    await opt4.$eval('#targets', (el) => (el.value = ''));
    await opt4.type('#targets', '@inconnue');
    await opt4.click('#add-form button.primary');
    await sleep(300);
    const catErr = await opt4.$eval('#targets-error', (el) => !el.hidden);
    step(catErr, 'Catégories : jeton inconnu refusé par le formulaire');

    // Règle blocage sur @social via l'UI ; la carte affiche le nom traduit
    await opt4.$eval('#targets', (el) => (el.value = ''));
    await opt4.type('#targets', '@social');
    await opt4.click('input[name="severity"][value="block"]');
    await opt4.click('#add-form button.primary');
    await sleep(700);
    const socialCard = await opt4.evaluate(() =>
      [...document.querySelectorAll('.rule-card')]
        .find((c) => c.textContent.includes('Réseaux sociaux'))
        ?.querySelector('.rule-targets')?.textContent);
    step(!!socialCard, 'Catégories : règle @social créée, nom traduit sur la carte', socialCard ?? '');
    await opt4.screenshot({ path: path.join(OUT_DIR, 'options-categories.png'), fullPage: true });
    await opt4.close().catch(() => {});

    // DNR : les cibles de la catégorie sont compilées, tiktok.com intercepté
    const dnrAfterCat = await worker.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
    const socialCompiled = dnrAfterCat.filter((r) => r.condition.regexFilter.includes('tiktok'));
    const pageT = await browser.newPage();
    await pageT.goto('http://www.tiktok.com/', { waitUntil: 'domcontentloaded' }).catch(() => {});
    url = await pollUrl(pageT, (u) => u.includes('interstitial.html'));
    step(socialCompiled.length === 1 && url.includes('mode=block'),
      'Catégories : cible de @social interceptée (tiktok.com -> blocage)',
      `règles tiktok=${socialCompiled.length} url=${url.slice(0, 90)}`);
    await pageT.close().catch(() => {});

    // Panique — posées avant : une règle suspendue (sa cible doit être couverte
    // aussi) et une friction vierge de toute allowance (pour le test d'expiration).
    await worker.evaluate(async (rules) => {
      const cur = (await chrome.storage.local.get('rules')).rules ?? [];
      await chrome.storage.local.set({ rules: [...cur, ...rules] });
    }, [
      { ...mkRule('suspended', ['suspended.test'], 'block'), enabled: false },
      mkRule('post-panic', ['postpanic.test'], 'friction'),
    ]);
    await sleep(600);

    // Onglet déjà ouvert sur une cible suivie (règle observe sur 127.0.0.1)
    const pageP = await browser.newPage();
    await pageP.goto(`http://127.0.0.1:${PORT}/accueil`, { waitUntil: 'domcontentloaded' });

    // Déclenchement depuis le popup : bouton -> confirmation -> oui
    const pop4 = await browser.newPage();
    await pop4.goto(`chrome-extension://${extId}/src/popup/popup.html`);
    await sleep(500);
    const btnVisible = await pop4.$eval('#panic-btn', (el) => !el.hidden);
    await pop4.click('#panic-btn');
    const confirmShown = await pop4.$eval('#panic-confirm', (el) => !el.hidden);
    await pop4.click('#panic-yes');
    await sleep(800);
    const panicState = await worker.evaluate(async () =>
      (await chrome.storage.local.get('panic')).panic);
    const bannerShown = await pop4.$eval('#panic-banner', (el) => !el.hidden && el.textContent);
    step(btnVisible && confirmShown && (panicState?.until ?? 0) > Date.now() + 55 * 60000 && !!bannerShown,
      'Panique : confirmation puis armement 1 h depuis le popup', String(bannerShown));
    await pop4.screenshot({ path: path.join(OUT_DIR, 'popup-panic.png') });
    await pop4.close().catch(() => {});

    // L'onglet déjà ouvert est balayé vers l'interstitiel panic (fin affichée)
    url = await pollUrl(pageP, (u) => u.includes('mode=panic'));
    await sleep(600);
    const panicUi = await pageP.evaluate(() => ({
      title: document.getElementById('title')?.textContent,
      subtitle: document.getElementById('subtitle')?.textContent,
    })).catch(() => ({}));
    step(url.includes('mode=panic') && /Fin à/.test(panicUi.subtitle ?? ''),
      'Panique : onglet ouvert balayé vers l\'interstitiel, fin affichée',
      `« ${panicUi.title} » …${panicUi.subtitle?.slice(-25)}`);
    await pageP.setViewport({ width: 800, height: 600 });
    await pageP.screenshot({ path: path.join(OUT_DIR, 'interstitial-panic.png') }).catch(() => {});
    await pageP.close().catch(() => {});

    // La panique outrepasse la friction sur une nouvelle navigation (DNR)
    const pageP2 = await browser.newPage();
    await pageP2.goto(`http://127.0.0.1:${PORT}/spa/pendant-panique`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    url = await pollUrl(pageP2, (u) => u.includes('interstitial.html'));
    step(url.includes('mode=panic'),
      'Panique : outrepasse la friction (priorité DNR)', url.slice(0, 100));
    await pageP2.close().catch(() => {});

    // Les cibles d'une règle suspendue sont couvertes pendant la panique
    const pageP3 = await browser.newPage();
    await pageP3.goto('http://suspended.test/', { waitUntil: 'domcontentloaded' }).catch(() => {});
    url = await pollUrl(pageP3, (u) => u.includes('interstitial.html'));
    step(url.includes('mode=panic') && url.includes('rid=suspended'),
      'Panique : règle suspendue quand même couverte', url.slice(0, 100));
    await pageP3.close().catch(() => {});

    // Expiration : échéance passée + sync -> les règles normales reprennent
    await worker.evaluate(() => chrome.storage.local.set({ panic: { until: Date.now() + 1200 } }));
    await sleep(2000);
    await worker.evaluate(async () => { // resync (même mécanique que l'alarme)
      const { rules = [] } = await chrome.storage.local.get('rules');
      await chrome.storage.local.set({ rules: [...rules] });
    });
    await sleep(700);
    const pageP4 = await browser.newPage();
    await pageP4.goto('http://postpanic.test/', { waitUntil: 'domcontentloaded' }).catch(() => {});
    url = await pollUrl(pageP4, (u) => u.includes('interstitial.html'));
    step(url.includes('mode=friction') && url.includes('rid=post-panic'),
      'Panique : expirée -> la friction reprend la main', url.slice(0, 100));
    await pageP4.close().catch(() => {});
  } finally {
    await browser.close();
    server.close();
  }

  const fails = results.filter((r) => !r.ok);
  console.log(`\nCaptures : ${OUT_DIR}`);
  console.log(`=== ${results.length - fails.length}/${results.length} OK ===`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
