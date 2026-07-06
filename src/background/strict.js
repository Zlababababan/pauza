// Mode strict : garde anti-assouplissement et suppressions différées.
//
// C'est un « soft lock » assumé : une extension ne peut pas empêcher sa propre
// désinstallation, et un utilisateur déterminé peut toujours contourner. Le but
// est de résister aux impulsions, pas aux experts.
//
// La garde compare chaque changement de règles à un MIROIR des règles
// verrouillées (chrome.storage.session), établi à l'armement et mis à jour aux
// seules transitions légitimes. Ne PAS utiliser oldValue de storage.onChanged
// comme référence : après une correction de la garde, l'« ancienne » valeur est
// la valeur sabotée, et la garde oscillerait en restaurant le sabotage.

import { SEVERITY, STRICT_DELAY_MS } from '../common/constants.js';
import { getRules, saveRules, getStrict, setStrict } from '../common/storage.js';

/** Champs d'une règle dont le gel est garanti par la garde. */
function frozen(rule) {
  const { pendingDeleteAt, ...rest } = rule;
  const sorted = {};
  for (const key of Object.keys(rest).sort()) sorted[key] = rest[key];
  return JSON.stringify(sorted);
}

function pendingDeleteChangeAllowed(refRule, newRule, now) {
  if (refRule.pendingDeleteAt === newRule.pendingDeleteAt) return true;
  if (newRule.pendingDeleteAt == null) return true; // annulation : toujours ok
  if (refRule.pendingDeleteAt != null) return false; // pas de raccourcissement
  // Création : au moins ~24 h (petite tolérance d'horloge)
  return newRule.pendingDeleteAt >= now + STRICT_DELAY_MS - 60_000;
}

async function getShadow() {
  const { lockedShadow } = await chrome.storage.session.get('lockedShadow');
  return lockedShadow ?? null;
}

async function setShadowFrom(rules) {
  const lockedShadow = Object.fromEntries(
    rules.filter((r) => r.locked).map((r) => [r.id, r])
  );
  await chrome.storage.session.set({ lockedShadow });
}

/** (Re)prend les règles courantes comme référence — à l'armement et au réveil. */
export async function reseedShadow() {
  await setShadowFrom(await getRules());
}

// Sérialisé : deux événements rapprochés partageant le miroir se corrompraient.
let queue = Promise.resolve();

/**
 * Vérifie un changement de règles. Retourne la liste corrigée si une violation
 * a été annulée, sinon null. Hors armement, se contente de suivre l'état.
 */
export function checkRulesChange(newRules) {
  const run = queue.then(() => doCheck(newRules));
  queue = run.catch(() => {});
  return run;
}

async function doCheck(newRules) {
  const strict = await getStrict();
  if (!strict.armed) {
    await setShadowFrom(newRules);
    return null;
  }
  let shadow = await getShadow();
  if (shadow == null) {
    // Réveil sans miroir (redémarrage) : l'état courant devient la référence.
    await setShadowFrom(newRules);
    return null;
  }

  const now = Date.now();
  const result = [...newRules];
  const nextShadow = { ...shadow };
  let changed = false;

  for (const [id, ref] of Object.entries(shadow)) {
    const idx = result.findIndex((r) => r.id === id);
    if (idx === -1) {
      // Suppression : légitime seulement si la demande différée est échue.
      if (ref.pendingDeleteAt && ref.pendingDeleteAt <= now) {
        delete nextShadow[id];
        continue;
      }
      result.push(ref);
      changed = true;
    } else if (frozen(result[idx]) !== frozen(ref) ||
               !pendingDeleteChangeAllowed(ref, result[idx], now)) {
      result[idx] = ref;
      changed = true;
    } else if (result[idx].pendingDeleteAt !== ref.pendingDeleteAt) {
      nextShadow[id] = result[idx]; // transition légitime : le miroir suit
    }
  }
  // Verrouiller davantage est toujours permis : les règles nouvellement
  // verrouillées entrent au miroir avec leur état courant comme référence.
  for (const r of result) {
    if (r.locked && !nextShadow[r.id]) nextShadow[r.id] = r;
  }

  await chrome.storage.session.set({ lockedShadow: nextShadow });
  return changed ? result : null;
}

/**
 * Vérifie un changement d'état du mode strict. Un désarmement n'est légitime
 * que si l'échéance (until) ou la demande de désarmement (pendingDisarmAt) est
 * échue. Retourne l'état corrigé si violation, sinon null. (Pas d'oscillation
 * possible ici : la correction est un réarmement, jamais re-signalé.)
 */
export function checkStrictChange(oldStrict, newStrict) {
  if (!oldStrict?.armed || newStrict?.armed) return null;
  const now = Date.now();
  if (oldStrict.until && oldStrict.until <= now) return null;
  if (oldStrict.pendingDisarmAt && oldStrict.pendingDisarmAt <= now) return null;
  return oldStrict;
}

/**
 * Applique les échéances : désarmement programmé, suppressions différées.
 * Appelé par syncEngine (donc aux bornes d'alarme et à chaque changement).
 */
export async function applyDueStrictActions() {
  const now = Date.now();

  const strict = await getStrict();
  if (strict.armed &&
      ((strict.until && strict.until <= now) ||
       (strict.pendingDisarmAt && strict.pendingDisarmAt <= now))) {
    await setStrict({ armed: false, until: null, pendingDisarmAt: null });
  }

  const rules = await getRules();
  const kept = rules.filter((r) => !(r.pendingDeleteAt && r.pendingDeleteAt <= now));
  if (kept.length !== rules.length) await saveRules(kept);
}

/** Prochaine échéance du mode strict (pour programmer une alarme), ou null. */
export async function nextStrictDeadline() {
  const strict = await getStrict();
  const rules = await getRules();
  const candidates = [
    strict.until,
    strict.pendingDisarmAt,
    ...rules.map((r) => r.pendingDeleteAt),
  ].filter((ts) => ts && ts > Date.now());
  return candidates.length ? Math.min(...candidates) : null;
}
