// Compilation des règles utilisateur en règles declarativeNetRequest dynamiques.
// Recompilation complète à chaque changement : simple et sans dérive d'état.
// Le DNR étant statique, la sensibilité au temps (horaires, quota épuisé) est
// réglée par recompilation aux bornes : changement de règles, alarme de borne
// horaire/minuit, épuisement d'un quota.

import { SEVERITY, BLOCK_ACTION, DNR } from '../common/constants.js';
import { parsedTargets, targetToRegexFilter } from '../common/matching.js';
import { isScheduleActive } from '../common/schedule.js';
import { getUsageToday, isQuotaExhausted } from '../common/storage.js';

/**
 * Comportement effectif d'une règle à cet instant : 'friction', 'block',
 * 'quota' (= bloquant, quota épuisé), 'offhours' (= bloquant, hors fenêtre de
 * disponibilité d'une règle quota) ou null (rien à intercepter).
 *
 * Sémantique des horaires selon la sévérité :
 * - friction/blocage : la plage est une fenêtre d'APPLICATION — la contrainte
 *   ne s'exerce que dedans, en dehors le site est libre.
 * - quota : la plage est une fenêtre de DISPONIBILITÉ — le site est fermé en
 *   dehors, et le quota se décompte dedans.
 */
export function effectiveMode(rule, usageToday, now = new Date()) {
  if (rule.enabled === false) return null;
  const inWindow = isScheduleActive(rule.schedule ?? null, now);
  switch (rule.severity) {
    case SEVERITY.FRICTION: return inWindow ? 'friction' : null;
    case SEVERITY.BLOCK: return inWindow ? 'block' : null;
    case SEVERITY.QUOTA:
      if (!inWindow) return 'offhours';
      return isQuotaExhausted(rule, usageToday) ? 'quota' : null;
    default: return null; // observe
  }
}

function redirectPrefix(rule, mode) {
  const closing = mode !== 'friction' && rule.blockAction === BLOCK_ACTION.CLOSE_TAB;
  if (closing) {
    return chrome.runtime.getURL('src/pages/closer.html') + `?rid=${rule.id}&u=`;
  }
  return chrome.runtime.getURL('src/pages/interstitial.html') + `?rid=${rule.id}&mode=${mode}&u=`;
}

/**
 * Remplace toutes les règles DNR dynamiques par la compilation des règles données.
 */
export async function rebuildDnrRules(rules) {
  const usageToday = await getUsageToday();
  const now = new Date();
  const addRules = [];
  let id = DNR.DYNAMIC_RULE_BASE;
  for (const rule of rules) {
    const mode = effectiveMode(rule, usageToday, now);
    if (!mode) continue;
    const prefix = redirectPrefix(rule, mode);
    const priority = mode === 'friction' ? DNR.PRIORITY_FRICTION : DNR.PRIORITY_BLOCK;
    for (const target of parsedTargets(rule)) {
      addRules.push({
        id: id++,
        priority,
        action: {
          type: 'redirect',
          redirect: { regexSubstitution: prefix + '\\0' },
        },
        condition: {
          regexFilter: targetToRegexFilter(target),
          isUrlFilterCaseSensitive: false,
          resourceTypes: ['main_frame'],
        },
      });
    }
  }
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules,
  });
}
