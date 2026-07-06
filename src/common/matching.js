// Matching d'URL pur (sans API Chrome) : partagé entre le moteur DNR,
// le suivi de navigation SPA et les tests Node.

import { CATEGORIES, categoryId } from './categories.js';

/**
 * Parse une cible saisie par l'utilisateur en { domain, path }.
 * Formes acceptées : "tiktok.com", "*.tiktok.com", "https://www.tiktok.com/",
 * "youtube.com/shorts". Retourne null si la cible est invalide.
 *
 * Sémantique : le domaine couvre toujours ses sous-domaines ("tiktok.com"
 * matche "m.tiktok.com") ; "*." et "www." sont donc simplement retirés.
 * Un path est un préfixe de chemin ("/shorts" matche "/shorts/abc").
 */
export function parseTarget(raw) {
  let t = String(raw ?? '').trim().toLowerCase();
  if (!t) return null;
  t = t.replace(/^https?:\/\//, '').replace(/^\*\./, '').replace(/^www\./, '');
  // Coupe query/fragment éventuels
  t = t.replace(/[?#].*$/, '');
  const slash = t.indexOf('/');
  let domain = slash === -1 ? t : t.slice(0, slash);
  let path = slash === -1 ? '' : t.slice(slash).replace(/\/+$/, '');
  domain = domain.replace(/:\d*$/, '');
  // Un domaine plausible : au moins un point, caractères de nom d'hôte
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return null;
  return { domain, path: path || null };
}

/** Clé stable identifiant une cible parsée. */
export function targetKey(target) {
  return target.domain + (target.path ?? '');
}

/**
 * Teste si une URL (string ou URL) matche une cible parsée.
 * Même sémantique que le regexFilter DNR généré par targetToRegexFilter.
 */
export function urlMatchesTarget(url, target) {
  let u;
  try {
    u = typeof url === 'string' ? new URL(url) : url;
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (host !== target.domain && !host.endsWith('.' + target.domain)) return false;
  if (target.path) {
    const p = u.pathname.toLowerCase().replace(/\/+$/, '') || '/';
    return p === target.path || p.startsWith(target.path + '/');
  }
  return true;
}

const RE_ESCAPE = /[.*+?^${}()|[\]\\]/g;
const esc = (s) => s.replace(RE_ESCAPE, '\\$&');

/**
 * Compile une cible parsée en regexFilter DNR (syntaxe RE2).
 * Couvre http/https, sous-domaines, port optionnel, et préfixe de chemin.
 */
export function targetToRegexFilter(target) {
  let re = '^https?://([^/:]+\\.)?' + esc(target.domain) + '(:\\d+)?';
  if (target.path) {
    re += esc(target.path) + '([/?#].*)?$';
  } else {
    re += '(/.*)?$';
  }
  return re;
}

/** Une ligne de cibles est valide si c'est un jeton de catégorie ou une cible parsable. */
export function isValidTargetLine(raw) {
  return Boolean(categoryId(raw) || parseTarget(raw));
}

// Les listes de catégories sont constantes : on les parse une fois.
const CATEGORY_TARGETS = Object.fromEntries(
  Object.entries(CATEGORIES).map(([id, domains]) =>
    [id, domains.map(parseTarget).filter(Boolean)])
);

/**
 * Parse les cibles d'une règle et retourne celles qui sont valides,
 * jetons de catégorie ("@social") expansés, doublons retirés.
 */
export function parsedTargets(rule) {
  const out = [];
  const seen = new Set();
  const push = (target) => {
    const key = targetKey(target);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(target);
    }
  };
  for (const raw of rule.targets ?? []) {
    const cat = categoryId(raw);
    if (cat) {
      CATEGORY_TARGETS[cat].forEach(push);
    } else {
      const target = parseTarget(raw);
      if (target) push(target);
    }
  }
  return out;
}

/**
 * Première cible d'une règle qui matche l'URL, ou null.
 */
export function matchingTarget(url, rule) {
  for (const target of parsedTargets(rule)) {
    if (urlMatchesTarget(url, target)) return target;
  }
  return null;
}
