export const SEVERITY = {
  OBSERVE: 'observe',
  FRICTION: 'friction',
  QUOTA: 'quota', // M2
  BLOCK: 'block',
};

export const BLOCK_ACTION = {
  INTERSTITIAL: 'interstitial',
  CLOSE_TAB: 'closeTab',
};

export const DEFAULTS = {
  frictionDelaySec: 10,
  allowDurationMin: 5,
};

export const MSG = {
  INTERSTITIAL_SHOWN: 'interstitialShown', // { ruleId, mode }
  REQUEST_ACCESS: 'requestAccess',         // { ruleId, url } -> { ok }
  BLOCKED_CLOSE: 'blockedClose',           // { ruleId }
};

// Espace d'IDs DNR : session (allowances) en dessous, dynamiques au-dessus.
// Priorités : friction < allowance < blocage — une allowance accordée après une
// friction outrepasse la friction, mais jamais un blocage sur la même cible.
export const DNR = {
  DYNAMIC_RULE_BASE: 1000,
  SESSION_RULE_MAX: 999,
  PRIORITY_FRICTION: 1,
  PRIORITY_ALLOW: 100,
  PRIORITY_BLOCK: 200,
  PRIORITY_PANIC: 300, // le bouton panique outrepasse tout, allowances comprises
};

export const ALARM_ALLOWANCE_PREFIX = 'allowance:';

// Liens de soutien. Tant qu'une entrée vaut null, elle n'apparaît pas dans
// l'interface. L'extension reste gratuite : ces liens sont le seul mécanisme
// de monétisation embarqué.
// kofi : page Ko-fi (ex. 'https://ko-fi.com/pauza')
// paypal : lien PayPal.me (ex. 'https://paypal.me/pseudo')
export const SUPPORT_LINKS = {
  kofi: 'https://ko-fi.com/zlababababan',
  paypal: null, // volontairement désactivé pour l'instant
};

// Mode strict : délai imposé aux demandes de suppression/désarmement.
export const STRICT_DELAY_MS = 24 * 3600 * 1000;
export const ALARM_STRICT = 'strict-sync';

// Bouton panique : blocage de toutes les cibles suivies, non annulable,
// expiration automatique.
export const PANIC_DURATION_MS = 3600 * 1000;
export const ALARM_PANIC = 'panic-end';
