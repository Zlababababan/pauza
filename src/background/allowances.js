// Allowances : accès temporaires accordés après une friction ("continuer quand même").
// Une allowance = une règle DNR de session `allow` (prioritaire sur les redirects)
// + une entrée dans chrome.storage.session + une alarme d'expiration.
// Les règles de session disparaissent au redémarrage du navigateur — c'est voulu.

import { DNR, ALARM_ALLOWANCE_PREFIX } from '../common/constants.js';
import { targetToRegexFilter, targetKey, urlMatchesTarget } from '../common/matching.js';

async function getAllowances() {
  const { allowances = {} } = await chrome.storage.session.get('allowances');
  return allowances;
}

/**
 * Accorde un accès temporaire à une cible pour `minutes` minutes.
 */
export async function grantAllowance(ruleId, target, minutes) {
  const key = `${ruleId}|${targetKey(target)}`;
  const expiresAt = Date.now() + minutes * 60_000;

  const allowances = await getAllowances();
  const existing = allowances[key];

  let dnrRuleId = existing?.dnrRuleId;
  if (!dnrRuleId) {
    const sessionRules = await chrome.declarativeNetRequest.getSessionRules();
    dnrRuleId = Math.max(0, ...sessionRules.map((r) => r.id)) + 1;
    if (dnrRuleId > DNR.SESSION_RULE_MAX) throw new Error('Trop d\'allowances actives');
    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: [{
        id: dnrRuleId,
        priority: DNR.PRIORITY_ALLOW,
        action: { type: 'allow' },
        condition: {
          regexFilter: targetToRegexFilter(target),
          isUrlFilterCaseSensitive: false,
          resourceTypes: ['main_frame'],
        },
      }],
    });
  }

  allowances[key] = { dnrRuleId, expiresAt, domain: target.domain, path: target.path };
  await chrome.storage.session.set({ allowances });
  chrome.alarms.create(ALARM_ALLOWANCE_PREFIX + key, { when: expiresAt });
}

/**
 * Une URL est-elle couverte par une allowance non expirée ?
 */
export async function isAllowed(url) {
  const allowances = await getAllowances();
  const now = Date.now();
  return Object.values(allowances).some(
    (a) => a.expiresAt > now && urlMatchesTarget(url, { domain: a.domain, path: a.path })
  );
}

async function revoke(keys) {
  if (!keys.length) return;
  const allowances = await getAllowances();
  const removeRuleIds = [];
  for (const key of keys) {
    const a = allowances[key];
    if (!a) continue;
    removeRuleIds.push(a.dnrRuleId);
    delete allowances[key];
    chrome.alarms.clear(ALARM_ALLOWANCE_PREFIX + key);
  }
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds });
  await chrome.storage.session.set({ allowances });
}

/** Gestionnaire d'alarme d'expiration. Retourne true si l'alarme était une allowance. */
export async function handleAllowanceAlarm(alarmName) {
  if (!alarmName.startsWith(ALARM_ALLOWANCE_PREFIX)) return false;
  await revoke([alarmName.slice(ALARM_ALLOWANCE_PREFIX.length)]);
  return true;
}

/** Purge les allowances expirées (filet au réveil du service worker). */
export async function clearExpiredAllowances() {
  const allowances = await getAllowances();
  const now = Date.now();
  const expired = Object.keys(allowances).filter((k) => allowances[k].expiresAt <= now);
  await revoke(expired);
}
