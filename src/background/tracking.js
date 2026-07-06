// Suivi du temps actif pour les quotas : seul compte le temps passé sur
// l'onglet actif d'une fenêtre au premier plan, utilisateur non inactif.
//
// Le segment en cours ({ startedAt, ruleIds }) vit dans chrome.storage.session :
// le service worker peut s'endormir, le prochain événement (ou l'alarme de tick,
// 1/min pendant qu'on suit un site à quota) referme le segment avec le temps réel
// écoulé. À chaque fermeture de segment on vérifie l'épuisement des quotas.

import { SEVERITY, BLOCK_ACTION } from '../common/constants.js';
import { matchingTarget } from '../common/matching.js';
import { isRuleActiveNow } from '../common/schedule.js';
import { getRules, addUsage, getUsageToday, isQuotaExhausted, recordStat } from '../common/storage.js';
import { initI18n, t, ruleDisplayName } from '../common/i18n.js';

export const TICK_ALARM = 'quota-tick';
const WARN_REMAINING_MIN = 5;

// Seuil d'inactivité (secondes). Surchargable via settings.idleSeconds —
// sert aussi au banc E2E : en headless il n'y a jamais d'input utilisateur,
// donc l'état passerait à 'idle' 60 s après le lancement.
async function idleSeconds() {
  const { settings } = await chrome.storage.local.get('settings');
  return Math.max(15, settings?.idleSeconds ?? 60);
}

// Prévenir l'épuisement déclenche une recompilation DNR : injecté par le
// service worker pour éviter un import circulaire.
let onExhaustedSync = async () => {};

export function initTracking(syncEngineFn) {
  onExhaustedSync = syncEngineFn;
  chrome.tabs.onActivated.addListener(() => reevaluate());
  chrome.tabs.onUpdated.addListener((_tabId, info) => {
    if (info.url || info.status === 'complete') reevaluate();
  });
  chrome.tabs.onRemoved.addListener(() => reevaluate());
  chrome.windows.onFocusChanged.addListener(() => reevaluate());
  chrome.idle.setDetectionInterval(60);
  chrome.idle.onStateChanged.addListener(() => reevaluate());
}

// Sérialisé : deux réévaluations concurrentes fermeraient le même segment deux fois.
let queue = Promise.resolve();
export function reevaluate() {
  queue = queue.then(doReevaluate).catch((e) => console.error('tracking', e));
  return queue;
}

async function doReevaluate() {
  const now = Date.now();
  const { segment = null } = await chrome.storage.session.get('segment');

  // 1. Fermer le segment en cours
  const flushedIds = segment?.ruleIds ?? [];
  if (segment) {
    const seconds = Math.min(Math.max(0, (now - segment.startedAt) / 1000), 6 * 3600);
    for (const ruleId of flushedIds) await addUsage(ruleId, seconds);
  }

  // 2. Ouvrir le suivant si les conditions sont réunies
  const next = await currentQuotaContext();
  await chrome.storage.session.set({
    segment: next ? { startedAt: now, ruleIds: next.ruleIds } : null,
  });
  if (next) {
    chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  } else {
    chrome.alarms.clear(TICK_ALARM);
  }

  // 3. Épuisement / avertissement sur les règles concernées
  const ruleIds = new Set([...flushedIds, ...(next?.ruleIds ?? [])]);
  if (ruleIds.size) await checkQuotas(ruleIds);
}

/** Règles à quota qui matchent l'onglet actif d'une fenêtre au premier plan. */
async function currentQuotaContext() {
  const win = await chrome.windows.getLastFocused().catch(() => null);
  if (!win?.focused) return null;
  if ((await chrome.idle.queryState(await idleSeconds())) !== 'active') return null;
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  if (!tab?.url) return null;

  const rules = await getRules();
  const usage = await getUsageToday();
  const now = new Date();
  const ruleIds = rules
    .filter((r) => r.severity === SEVERITY.QUOTA && isRuleActiveNow(r, now) &&
      !isQuotaExhausted(r, usage) && matchingTarget(tab.url, r))
    .map((r) => r.id);
  return ruleIds.length ? { ruleIds } : null;
}

async function checkQuotas(ruleIds) {
  const rules = await getRules();
  const usage = await getUsageToday();
  for (const rule of rules) {
    if (!ruleIds.has(rule.id) || rule.severity !== SEVERITY.QUOTA || !rule.quotaMinutes) continue;
    if (isQuotaExhausted(rule, usage)) {
      await enforceExhausted(rule);
    } else {
      await maybeWarn(rule, usage);
    }
  }
}

/** Quota atteint : recompiler le DNR puis balayer les onglets déjà ouverts. */
async function enforceExhausted(rule) {
  await onExhaustedSync();
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url || !matchingTarget(tab.url, rule)) continue;
    if (rule.blockAction === BLOCK_ACTION.CLOSE_TAB) {
      recordStat(rule.id, 'blocked');
      chrome.tabs.remove(tab.id).catch(() => {});
    } else {
      const dest = chrome.runtime.getURL('src/pages/interstitial.html') +
        `?rid=${rule.id}&mode=quota&u=` + encodeURIComponent(tab.url);
      chrome.tabs.update(tab.id, { url: dest }).catch(() => {});
    }
  }
}

/** Avertissement discret, une fois par jour et par règle, ~5 min avant la fin. */
async function maybeWarn(rule, usage) {
  const remainingMin = rule.quotaMinutes - (usage[rule.id] ?? 0) / 60;
  if (remainingMin > WARN_REMAINING_MIN || rule.quotaMinutes <= WARN_REMAINING_MIN) return;
  const { warned = {} } = await chrome.storage.session.get('warned');
  const key = `${new Date().toDateString()}|${rule.id}`;
  if (warned[key]) return;
  warned[key] = true;
  await chrome.storage.session.set({ warned });
  await initI18n();
  chrome.notifications.create({
    type: 'basic',
    iconUrl: '/icons/icon128.png',
    title: 'Décroche',
    message: t('notif_quota_warning', {
      min: Math.max(1, Math.round(remainingMin)),
      name: ruleDisplayName(rule),
    }),
    silent: true,
  });
}
