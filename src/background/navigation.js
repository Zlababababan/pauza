// Suivi de navigation : couvre ce que le DNR ne voit pas.
// - onHistoryStateUpdated : navigations SPA (ex. youtube.com/shorts sans requête réseau)
// - onCommitted : filet pour le bfcache (retour arrière sans requête) + comptage
//   des visites pour la sévérité "observer" (à l'entrée sur le site uniquement).

import { SEVERITY, BLOCK_ACTION } from '../common/constants.js';
import { parsedTargets, urlMatchesTarget, targetKey } from '../common/matching.js';
import { isRuleActiveNow } from '../common/schedule.js';
import { getRules, recordStat, getUsageToday } from '../common/storage.js';
import { effectiveMode } from './dnr.js';
import { isAllowed } from './allowances.js';

// Préséance quand plusieurs règles matchent : la plus stricte gagne
// (même hiérarchie que les priorités DNR).
const MODE_RANK = { friction: 1, quota: 2, block: 3 };

// État par onglet : cibles actuellement matchées, pour ne compter "observer"
// qu'à l'entrée. En mémoire : perdu si le service worker redémarre, ce qui
// cause au pire un comptage en trop — acceptable.
const tabMatches = new Map();

export function initNavigation() {
  chrome.webNavigation.onCommitted.addListener(handleNavigation);
  chrome.webNavigation.onHistoryStateUpdated.addListener(handleNavigation);
  chrome.tabs.onRemoved.addListener((tabId) => tabMatches.delete(tabId));
}

async function handleNavigation({ tabId, frameId, url }) {
  if (frameId !== 0 || tabId < 0) return;

  let u;
  try {
    u = new URL(url);
  } catch {
    return;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    // Nos propres pages (interstitiel, closer) sont un détour dans la même
    // visite : on préserve l'état pour ne pas recompter l'entrée au retour.
    if (!url.startsWith(chrome.runtime.getURL(''))) tabMatches.set(tabId, new Set());
    return;
  }

  const rules = await getRules();
  const usageToday = await getUsageToday();
  const now = new Date();
  const previous = tabMatches.get(tabId) ?? new Set();
  const current = new Set();
  let enforce = null;
  let enforceMode = null;

  for (const rule of rules) {
    if (rule.enabled === false) continue;
    for (const target of parsedTargets(rule)) {
      if (!urlMatchesTarget(u, target)) continue;
      const key = `${rule.id}|${targetKey(target)}`;
      current.add(key);
      if (rule.severity === SEVERITY.OBSERVE && isRuleActiveNow(rule, now) && !previous.has(key)) {
        recordStat(rule.id, 'observed');
      }
      const mode = effectiveMode(rule, usageToday, now);
      if (mode && (!enforceMode || MODE_RANK[mode] > MODE_RANK[enforceMode])) {
        enforce = rule;
        enforceMode = mode;
      }
    }
  }
  tabMatches.set(tabId, current);

  if (!enforce) return;
  // Une allowance n'outrepasse qu'une friction, jamais un blocage ou un quota épuisé.
  if (enforceMode === 'friction' && (await isAllowed(u))) return;

  // Navigation SPA/bfcache passée sous le radar du DNR : on applique la règle ici.
  if (enforceMode !== 'friction' && enforce.blockAction === BLOCK_ACTION.CLOSE_TAB) {
    recordStat(enforce.id, 'blocked');
    chrome.tabs.remove(tabId).catch(() => {});
    return;
  }
  const dest = chrome.runtime.getURL('src/pages/interstitial.html') +
    `?rid=${enforce.id}&mode=${enforceMode}&u=` + encodeURIComponent(url);
  chrome.tabs.update(tabId, { url: dest }).catch(() => {});
}
