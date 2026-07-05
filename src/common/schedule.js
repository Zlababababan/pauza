// Logique horaires pure (sans API navigateur), partagée entre le moteur DNR,
// le suivi de navigation et les tests Node.
//
// schedule = null                      -> règle active en permanence
// schedule = { days, ranges }          -> active seulement dans les créneaux
//   days   : jours actifs, 0 = dimanche … 6 = samedi (getDay). Vide/absent = tous.
//   ranges : [{ from: "HH:MM", to: "HH:MM" }]. from > to = plage nocturne qui
//            chevauche minuit (ex. 22:00 -> 06:00), rattachée au jour du début.

export function parseHM(hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function dayEnabled(schedule, day) {
  return !schedule.days?.length || schedule.days.includes(day);
}

/** La règle est-elle dans un de ses créneaux à l'instant donné ? */
export function isScheduleActive(schedule, date = new Date()) {
  if (!schedule || !schedule.ranges?.length) return true;
  const day = date.getDay();
  const minutes = date.getHours() * 60 + date.getMinutes();
  for (const range of schedule.ranges) {
    const from = parseHM(range.from);
    const to = parseHM(range.to);
    if (from == null || to == null || from === to) continue;
    if (from < to) {
      if (dayEnabled(schedule, day) && minutes >= from && minutes < to) return true;
    } else {
      // Plage nocturne : le soir du jour J, ou le matin suivant un jour J actif.
      if (dayEnabled(schedule, day) && minutes >= from) return true;
      if (dayEnabled(schedule, (day + 6) % 7) && minutes < to) return true;
    }
  }
  return false;
}

/** Une règle est-elle applicable maintenant (activée + dans ses horaires) ? */
export function isRuleActiveNow(rule, date = new Date()) {
  return rule.enabled !== false && isScheduleActive(rule.schedule ?? null, date);
}

/**
 * Prochain instant où le schedule redevient actif (réouverture d'une fenêtre
 * de disponibilité). Balayage minute par minute, borné à 8 jours ; null si
 * aucune réouverture (schedule vide de jours, par exemple).
 */
export function nextActiveTime(schedule, from = new Date()) {
  if (!schedule || isScheduleActive(schedule, from)) return null;
  const d = new Date(from);
  d.setSeconds(0, 0);
  for (let i = 0; i < 8 * 24 * 60; i++) {
    d.setMinutes(d.getMinutes() + 1);
    if (isScheduleActive(schedule, d)) return new Date(d);
  }
  return null;
}

/**
 * Prochain instant où l'état actif/inactif d'une des règles peut basculer :
 * minuit (remise à zéro des quotas) ou une borne d'horaire dans les 7 jours.
 * Retourne un timestamp (ms), toujours > date.
 */
export function nextEngineBoundary(rules, date = new Date()) {
  const candidates = [];
  const midnight = new Date(date);
  midnight.setHours(24, 0, 0, 0);
  candidates.push(midnight.getTime());

  for (const rule of rules) {
    for (const range of rule.schedule?.ranges ?? []) {
      for (const hm of [range.from, range.to]) {
        const m = parseHM(hm);
        if (m == null) continue;
        // Prochaine occurrence de cette borne horaire (les jours inactifs sont
        // sans effet : la borne y est juste un recalcul inutile, pas une erreur).
        const d = new Date(date);
        d.setHours(Math.floor(m / 60), m % 60, 0, 0);
        if (d.getTime() <= date.getTime()) d.setDate(d.getDate() + 1);
        candidates.push(d.getTime());
      }
    }
  }
  return Math.min(...candidates);
}
