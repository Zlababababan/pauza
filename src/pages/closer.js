// Cible de la redirection DNR pour l'action "fermeture d'onglet" :
// enregistre le blocage puis ferme l'onglet — le site bloqué n'apparaît jamais.

import { MSG } from '../common/constants.js';
import { initI18n, applyI18n } from '../common/i18n.js';

const params = new URLSearchParams(location.search);
const ruleId = params.get('rid');

initI18n().then(() => applyI18n());

(async () => {
  try {
    await chrome.runtime.sendMessage({ type: MSG.BLOCKED_CLOSE, ruleId });
  } finally {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id != null) chrome.tabs.remove(tab.id);
  }
})();
