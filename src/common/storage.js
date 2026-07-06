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

// Sérialise les écritures pour éviter les pertes en lecture-modification-écriture.
let writeQueue = Promise.resolve();
function enqueue(fn) {
  writeQueue = writeQueue.then(fn).catch((e) => console.error('storage write', e));
  return writeQueue;
}

// Historique conservé pour le tableau de bord et les streaks.
const RETENTION_DAYS = 90;

function pruneOldDays(byDay) {
  const cutoff = todayKey(new Date(Date.now() - RETENTION_DAYS * 86_400_000));
  for (const key of Object.keys(byDay)) {
    if (key < cutoff) delete byDay[key];
  }
}

/**
 * Incrémente un compteur du jour pour une règle.
 * @param {string} ruleId
 * @param {'observed'|'frictionShown'|'continued'|'blocked'} field
 */
export function recordStat(ruleId, field, n = 1) {
  return enqueue(async () => {
    const stats = await getStats();
    const day = (stats[todayKey()] ??= {});
    const entry = (day[ruleId] ??= { observed: 0, frictionShown: 0, continued: 0, blocked: 0 });
    entry[field] = (entry[field] ?? 0) + n;
    pruneOldDays(stats);
    await chrome.storage.local.set({ stats });
  });
}

// --- Temps actif consommé (quotas) : { "YYYY-MM-DD": { ruleId: secondes } } ---

export async function getUsageToday() {
  const { usage = {} } = await chrome.storage.local.get('usage');
  return usage[todayKey()] ?? {};
}

export async function getUsage() {
  const { usage = {} } = await chrome.storage.local.get('usage');
  return usage;
}

/** Ajoute du temps actif (secondes) au compteur du jour d'une règle. */
export function addUsage(ruleId, seconds) {
  return enqueue(async () => {
    const { usage = {} } = await chrome.storage.local.get('usage');
    const day = (usage[todayKey()] ??= {});
    day[ruleId] = (day[ruleId] ?? 0) + seconds;
    pruneOldDays(usage);
    await chrome.storage.local.set({ usage });
  });
}

// --- Réglages divers ({ idleSeconds?, discreet?, pinHash? }) ---

export async function getSettings() {
  const { settings = {} } = await chrome.storage.local.get('settings');
  return settings;
}

export function patchSettings(patch) {
  return enqueue(async () => {
    const { settings = {} } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, ...patch } });
  });
}

/** Le quota du jour de cette règle est-il épuisé ? */
export function isQuotaExhausted(rule, usageToday) {
  if (rule.severity !== 'quota' || !rule.quotaMinutes) return false;
  return (usageToday[rule.id] ?? 0) >= rule.quotaMinutes * 60;
}

// --- Mode panique : { until: ts | null } ---
// `until` n'est pas nettoyé à l'expiration (personne n'est forcément réveillé
// pile à ce moment) : c'est isPanicActive qui fait foi, partout.

export async function getPanic() {
  const { panic } = await chrome.storage.local.get('panic');
  return panic ?? { until: null };
}

export function isPanicActive(panic, now = Date.now()) {
  return Boolean(panic?.until) && panic.until > now;
}

export async function setPanic(panic) {
  await chrome.storage.local.set({ panic });
}

// --- Mode strict ---
// { armed, until (ts|null = permanent), pendingDisarmAt (ts|null) }

export async function getStrict() {
  const { strict } = await chrome.storage.local.get('strict');
  return strict ?? { armed: false, until: null, pendingDisarmAt: null };
}

export async function setStrict(strict) {
  await chrome.storage.local.set({ strict });
}
