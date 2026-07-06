// Streaks : séries de « jours propres », par règle. Logique pure (testable en
// Node). Le ton reste bienveillant : un jour raté remet la série à zéro sans
// autre conséquence, et le record reste acquis.
//
// Jour propre selon la sévérité :
// - observer : aucune visite
// - friction : aucune poursuite après une pause (les pauses évitées comptent)
// - quota    : quota du jour non épuisé
// - blocage  : aucune tentative d'accès

import { SEVERITY } from './constants.js';

export function isCleanDay(rule, dayStats, daySeconds) {
  const s = dayStats ?? {};
  switch (rule.severity) {
    case SEVERITY.OBSERVE: return (s.observed ?? 0) === 0;
    case SEVERITY.FRICTION: return (s.continued ?? 0) === 0;
    case SEVERITY.QUOTA:
      return !rule.quotaMinutes || (daySeconds ?? 0) < rule.quotaMinutes * 60;
    case SEVERITY.BLOCK: return (s.blocked ?? 0) === 0;
    default: return true;
  }
}

const dayKey = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Clés de jours de `from` à `to` inclus (borné à ~400 jours). */
export function listDayKeys(from, to) {
  const keys = [];
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = dayKey(to);
  for (let i = 0; i < 400; i++) {
    const key = dayKey(d);
    keys.push(key);
    if (key === end) break;
    d.setDate(d.getDate() + 1);
  }
  return keys;
}

/**
 * Série courante et record d'une règle, du jour de sa création à aujourd'hui.
 * Le jour courant compte s'il est propre jusqu'ici (optimisme assumé).
 * @param {object} stats  { "YYYY-MM-DD": { ruleId: {...} } }
 * @param {object} usage  { "YYYY-MM-DD": { ruleId: seconds } }
 */
export function computeStreaks(rule, stats, usage, today = new Date()) {
  const created = rule.createdAt ? new Date(rule.createdAt) : today;
  const start = created > today ? today : created;
  let run = 0;
  let best = 0;
  for (const key of listDayKeys(start, today)) {
    const clean = isCleanDay(rule, stats[key]?.[rule.id], usage[key]?.[rule.id]);
    run = clean ? run + 1 : 0;
    if (run > best) best = run;
  }
  return { current: run, best };
}
