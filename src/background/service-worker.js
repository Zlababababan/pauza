// Service worker : câble le moteur DNR, le suivi de navigation, les allowances,
// le suivi du temps actif (quotas) et les messages des pages de l'extension.

import { MSG, ALARM_STRICT } from '../common/constants.js';
import { getRules, getRule, recordStat, saveRules, setStrict } from '../common/storage.js';
import { matchingTarget, parseTarget } from '../common/matching.js';
import { nextEngineBoundary } from '../common/schedule.js';
import { rebuildDnrRules } from './dnr.js';
import { grantAllowance, handleAllowanceAlarm, clearExpiredAllowances, pruneAllowances } from './allowances.js';
import { initNavigation } from './navigation.js';
import { initTracking, reevaluate, TICK_ALARM } from './tracking.js';
import { checkRulesChange, checkStrictChange, applyDueStrictActions, nextStrictDeadline, reseedShadow } from './strict.js';

const ENGINE_SYNC_ALARM = 'engine-sync';

/**
 * Met le moteur en phase avec l'état courant (règles, horaires, quotas, mode
 * strict) et programme les prochains points de bascule.
 */
async function syncEngine() {
  await applyDueStrictActions();
  const rules = await getRules();
  await rebuildDnrRules(rules);
  await clearExpiredAllowances();
  await pruneAllowances(rules);
  chrome.alarms.create(ENGINE_SYNC_ALARM, { when: nextEngineBoundary(rules) });
  const strictDeadline = await nextStrictDeadline();
  if (strictDeadline) chrome.alarms.create(ALARM_STRICT, { when: strictDeadline });
  else chrome.alarms.clear(ALARM_STRICT);
}

chrome.runtime.onInstalled.addListener(() => { syncEngine(); reevaluate(); });
chrome.runtime.onStartup.addListener(() => { syncEngine(); reevaluate(); });

// Garde du mode strict : annule les assouplissements interdits, puis (re)met
// le moteur en phase. La correction re-déclenche onChanged ; au second passage
// la garde ne trouve plus rien à corriger.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  try {
    if (changes.strict) {
      const fixed = checkStrictChange(changes.strict.oldValue, changes.strict.newValue);
      if (fixed) {
        await setStrict(fixed);
        return;
      }
      // Armement : l'état courant des règles devient la référence de la garde.
      if (changes.strict.newValue?.armed && !changes.strict.oldValue?.armed) {
        await reseedShadow();
      }
    }
    if (changes.rules) {
      const fixed = await checkRulesChange(changes.rules.newValue ?? []);
      if (fixed) {
        await saveRules(fixed);
        return;
      }
    }
    if (changes.rules || changes.strict) {
      await syncEngine();
      reevaluate();
    }
  } catch (e) {
    console.error('storage.onChanged', e);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ENGINE_SYNC_ALARM || alarm.name === ALARM_STRICT) {
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
