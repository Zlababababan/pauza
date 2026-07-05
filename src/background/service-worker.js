// Service worker : câble le moteur DNR, le suivi de navigation, les allowances
// et les messages des pages de l'extension.

import { MSG } from '../common/constants.js';
import { getRules, getRule, recordStat } from '../common/storage.js';
import { matchingTarget, parseTarget } from '../common/matching.js';
import { rebuildDnrRules } from './dnr.js';
import { grantAllowance, handleAllowanceAlarm, clearExpiredAllowances, pruneAllowances } from './allowances.js';
import { initNavigation } from './navigation.js';

async function syncEngine() {
  const rules = await getRules();
  await rebuildDnrRules(rules);
  await clearExpiredAllowances();
  await pruneAllowances(rules);
}

chrome.runtime.onInstalled.addListener(syncEngine);
chrome.runtime.onStartup.addListener(syncEngine);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.rules) {
    const rules = changes.rules.newValue ?? [];
    rebuildDnrRules(rules).catch((e) => console.error('rebuildDnrRules', e));
    pruneAllowances(rules).catch((e) => console.error('pruneAllowances', e));
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  handleAllowanceAlarm(alarm.name).catch((e) => console.error('allowance alarm', e));
});

initNavigation();

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
      recordStat(msg.ruleId, msg.mode === 'block' ? 'blocked' : 'frictionShown');
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
