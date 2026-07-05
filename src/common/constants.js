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
};

export const ALARM_ALLOWANCE_PREFIX = 'allowance:';

// Lien de soutien (Ko-fi, GitHub Sponsors, Liberapay…). Tant qu'il vaut null,
// aucun élément de don n'apparaît dans l'interface. L'extension reste gratuite :
// ce lien est le seul mécanisme de monétisation embarqué.
export const SUPPORT_URL = null;
