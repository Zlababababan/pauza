// Compilation des règles utilisateur en règles declarativeNetRequest dynamiques.
// Recompilation complète à chaque changement : simple et sans dérive d'état.

import { SEVERITY, BLOCK_ACTION, DNR } from '../common/constants.js';
import { parsedTargets, targetToRegexFilter } from '../common/matching.js';

/**
 * URL de redirection pour une règle (sans le paramètre u, ajouté par le DNR).
 * L'URL bloquée est passée brute en dernier paramètre via \0 (match complet) —
 * le DNR n'encode pas, les pages la parsent donc positionnellement.
 */
function redirectPrefix(rule) {
  if (rule.severity === SEVERITY.BLOCK && rule.blockAction === BLOCK_ACTION.CLOSE_TAB) {
    return chrome.runtime.getURL('src/pages/closer.html') + `?rid=${rule.id}&u=`;
  }
  const mode = rule.severity === SEVERITY.BLOCK ? 'block' : 'friction';
  return chrome.runtime.getURL('src/pages/interstitial.html') + `?rid=${rule.id}&mode=${mode}&u=`;
}

function isIntercepting(rule) {
  return rule.enabled !== false &&
    (rule.severity === SEVERITY.FRICTION || rule.severity === SEVERITY.BLOCK);
}

/**
 * Remplace toutes les règles DNR dynamiques par la compilation des règles données.
 */
export async function rebuildDnrRules(rules) {
  const addRules = [];
  let id = DNR.DYNAMIC_RULE_BASE;
  for (const rule of rules) {
    if (!isIntercepting(rule)) continue;
    const prefix = redirectPrefix(rule);
    for (const target of parsedTargets(rule)) {
      addRules.push({
        id: id++,
        priority: DNR.PRIORITY_REDIRECT,
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
