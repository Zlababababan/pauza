// Service worker : câble le moteur DNR, le suivi de navigation, les allowances,
// le suivi du temps actif (quotas) et les messages des pages de l'extension.

import { MSG } from '../common/constants.js';
import { getRules, getRule, recordStat } from '../common/storage.js';
import { matchingTarget, parseTarget } from '../common/matching.js';
import { nextEngineBoundary } from '../common/schedule.js';
import { rebuildDnrRules } from './dnr.js';
import { grantAllowance, handleAllowanceAlarm, clearExpiredAllowances, pruneAllowances } from './allowances.js';
import { initNavigation } from './navigation.js';
import { initTracking, reevaluate, TICK_ALARM } from './tracking.js';

const ENGINE_SYNC_ALARM = 'engine-sync';

/**
 * Met le moteur en phase avec l'état courant (règles, horaires, quotas) et
 * programme le prochain point de bascule (borne horaire ou minuit).
 */
async function syncEngine() {
  const rules = await getRules();
  await rebuildDnrRules(rules);
  await clearExpiredAllowances();
  await pruneAllowances(rules);
  chrome.alarms.create(ENGINE_SYNC_ALARM, { when: nextEngineBoundary(rules) });
}

chrome.runtime.onInstalled.addListener(() => { syncEngine(); reevaluate(); });
chrome.runtime.onStartup.addListener(() => { syncEngine(); reevaluate(); });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.rules) {
    syncEngine().catch((e) => console.error('syncEngine', e));
    reevaluate();
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ENGINE_SYNC_ALARM) {
    syncEngine().catch((e) => console.error('syncEngine', e));
    reevaluate();
  } else if (alarm.name === TICK_ALARM) {
    reevaluate();
  } else {
    handleAllowanceAlarm(alarm.name).catch((e) => console.error('allowance alarm', e));
  }
});

initNavigation();
initTracking(syncEngine);

/**
 * Friction "continuer quand même" : accorde une allowance pour la cible de la
 * règle qui matche l'URL, puis la page interstitielle navigue vers l'URL.
 */
async function handleRequestAccess({ ruleId, url }) {
  const rule = await getRule(ruleId);
  if (!rule) return { ok: false, error: 'Règle introuvable' };
  // Cible de la règle qui a déclenché la friction ; à défaut (règle modifiée
  // entre-temps), on retombe sur le domaine de l'URL.
  let target = matchingTarget(url, rule);
  if (!target) {
    try {
      target = parseTarget(new URL(url).hostname);
    } catch { /* ignore */ }
  }
  if (!target) return { ok: false, error: 'URL invalide' };
  await grantAllowance(ruleId, target, rule.allowDurationMin ?? 5);
  recordStat(ruleId, 'continued');
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg?.type) {
    case MSG.INTERSTITIAL_SHOWN:
      recordStat(msg.ruleId, msg.mode === 'friction' ? 'frictionShown' : 'blocked');
      sendResponse({ ok: true });
      return false;
    case MSG.BLOCKED_CLOSE:
      recordStat(msg.ruleId, 'blocked');
      sendResponse({ ok: true });
      return false;
    case MSG.REQUEST_ACCESS:
      handleRequestAccess(msg)
        .then(sendResponse)
        .catch((e) => sendResponse({ ok: false, error: String(e) }));
      return true; // réponse asynchrone
  }
  return false;
});
