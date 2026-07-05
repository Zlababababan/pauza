// Mode strict : garde anti-assouplissement et suppressions différées.
//
// C'est un « soft lock » assumé : une extension ne peut pas empêcher sa propre
// désinstallation, et un utilisateur déterminé peut toujours contourner. Le but
// est de résister aux impulsions, pas aux experts. La garde s'appuie sur
// storage.onChanged (oldValue/newValue) : toute modification d'une règle
// verrouillée pendant que le mode strict est armé est annulée, à une exception
// près — la gestion de la demande de suppression (création clampée à 24 h,
// annulation libre). Le désarmement anticipé passe lui aussi par 24 h.

import { SEVERITY, STRICT_DELAY_MS } from '../common/constants.js';
import { getRules, saveRules, getStrict, setStrict } from '../common/storage.js';

const SEVERITY_RANK = {
  [SEVERITY.OBSERVE]: 0,
  [SEVERITY.FRICTION]: 1,
  [SEVERITY.QUOTA]: 2,
  [SEVERITY.BLOCK]: 3,
};

/** Champs d'une règle dont le gel est garanti par la garde. */
function frozen(rule) {
  const { pendingDeleteAt, ...rest } = rule;
  return JSON.stringify(rest);
}

function pendingDeleteChangeAllowed(oldRule, newRule, now) {
  if (oldRule.pendingDeleteAt === newRule.pendingDeleteAt) return true;
  if (newRule.pendingDeleteAt == null) return true; // annulation : toujours ok
  if (oldRule.pendingDeleteAt != null) return false; // pas de raccourcissement
  // Création : au moins ~24 h (petite tolérance d'horloge)
  return newRule.pendingDeleteAt >= now + STRICT_DELAY_MS - 60_000;
}

/**
 * Vérifie un changement de règles sous mode strict armé. Retourne la liste
 * corrigée si une violation a été annulée, sinon null (rien à corriger).
 */
export async function checkRulesChange(oldRules, newRules) {
  const strict = await getStrict();
  if (!strict.armed || !oldRules) return null;
  const now = Date.now();
  const result = [...newRules];
  let changed = false;

  for (const oldRule of oldRules) {
    if (!oldRule.locked) continue;
    const idx = result.findIndex((r) => r.id === oldRule.id);
    if (idx === -1) {
      // Suppression directe : refusée sauf si la demande différée est échue.
      if (oldRule.pendingDeleteAt && oldRule.pendingDeleteAt <= now) continue;
      result.push(oldRule);
      changed = true;
    } else if (frozen(result[idx]) !== frozen(oldRule) ||
               !pendingDeleteChangeAllowed(oldRule, result[idx], now)) {
      result[idx] = oldRule;
      changed = true;
    }
  }
  return changed ? result : null;
}

/**
 * Vérifie un changement d'état du mode strict. Un désarmement n'est légitime
 * que si l'échéance (until) ou la demande de désarmement (pendingDisarmAt) est
 * échue. Retourne l'état corrigé si violation, sinon null.
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
