// Accès à chrome.storage.local : règles et statistiques.

/** @returns {Promise<Array>} */
export async function getRules() {
  const { rules = [] } = await chrome.storage.local.get('rules');
  return rules;
}

export async function saveRules(rules) {
  await chrome.storage.local.set({ rules });
}

export async function getRule(ruleId) {
  const rules = await getRules();
  return rules.find((r) => r.id === ruleId) ?? null;
}

/** Clé de date locale au format YYYY-MM-DD. */
export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function getStats() {
  const { stats = {} } = await chrome.storage.local.get('stats');
  return stats;
}

// Sérialise les écritures de stats pour éviter les pertes en lecture-modification-écriture.
let statsQueue = Promise.resolve();

/**
 * Incrémente un compteur du jour pour une règle.
 * @param {string} ruleId
 * @param {'observed'|'frictionShown'|'continued'|'blocked'} field
 */
export function recordStat(ruleId, field, n = 1) {
  statsQueue = statsQueue.then(async () => {
    const stats = await getStats();
    const day = (stats[todayKey()] ??= {});
    const entry = (day[ruleId] ??= { observed: 0, frictionShown: 0, continued: 0, blocked: 0 });
    entry[field] = (entry[field] ?? 0) + n;
    await chrome.storage.local.set({ stats });
  }).catch((e) => console.error('recordStat', e));
  return statsQueue;
}
