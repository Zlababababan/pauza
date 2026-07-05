// Cible de la redirection DNR pour l'action "fermeture d'onglet" :
// enregistre le blocage puis ferme l'onglet — le site bloqué n'apparaît jamais.

import { MSG } from '../common/constants.js';

const params = new URLSearchParams(location.search);
const ruleId = params.get('rid');

(async () => {
  try {
    await chrome.runtime.sendMessage({ type: MSG.BLOCKED_CLOSE, ruleId });
  } finally {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id != null) chrome.tabs.remove(tab.id);
  }
})();
