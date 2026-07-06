// i18n maison : chrome.i18n fige la langue sur celle du navigateur, or on veut
// un changement dynamique. Dictionnaires plats en modules JS, préférence dans
// chrome.storage.local ({ lang }), FR par défaut.

import { fr } from './locales/fr.js';
import { en } from './locales/en.js';
import { categoryId } from './categories.js';

const DICTS = { fr, en };
export const AVAILABLE_LANGS = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
];

let current = 'fr';

/** À appeler avant tout t(). Retourne la langue active. */
export async function initI18n() {
  const { lang } = await chrome.storage.local.get('lang');
  current = DICTS[lang] ? lang : 'fr';
  if (typeof document !== 'undefined') document.documentElement.lang = current;
  return current;
}

export function getLang() {
  return current;
}

export async function setLang(lang) {
  if (!DICTS[lang]) return;
  current = lang;
  await chrome.storage.local.set({ lang });
}

/** Traduit une clé, avec substitution {param}. Repli : FR, puis la clé. */
export function t(key, params = {}) {
  let s = DICTS[current][key] ?? DICTS.fr[key] ?? key;
  for (const [k, v] of Object.entries(params)) {
    s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

/** {n} accordé : cherche key_plural si n > 1. */
export function tn(key, n, params = {}) {
  const k = n > 1 && (DICTS[current][key + '_plural'] ?? DICTS.fr[key + '_plural']) ? key + '_plural' : key;
  return t(k, { n, ...params });
}

/**
 * Applique les traductions au DOM :
 * - data-i18n            -> textContent
 * - data-i18n-html       -> innerHTML (contenu contrôlé, issu de nos dictionnaires)
 * - data-i18n-placeholder / data-i18n-title -> attributs
 */
export function applyI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  }
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
}

/**
 * Remplit un élément depuis une clé contenant {host} : le host est mis en gras,
 * le reste en texte brut (évite d'injecter du HTML avec des données de page).
 */
export function fillWithHost(el, key, host, params = {}) {
  el.textContent = '';
  const parts = t(key, params).split('{host}');
  parts.forEach((part, i) => {
    if (i > 0) {
      const b = document.createElement('strong');
      b.textContent = host;
      el.append(b);
    }
    el.append(part);
  });
}

/**
 * Nom affichable d'une règle : son nom, sinon sa première cible — traduite
 * si c'est un jeton de catégorie ("@social" → « Réseaux sociaux »).
 */
export function ruleDisplayName(rule) {
  if (rule.name) return rule.name;
  const first = rule.targets?.[0] ?? '';
  const cat = categoryId(first);
  return cat ? t('cat_' + cat) : first;
}

/** Locale BCP-47 pour les formats de date/heure. */
export function dateLocale() {
  return current === 'fr' ? 'fr-FR' : 'en-US';
}

/** Branche un <select> de langue : valeur courante + rechargement au changement. */
export function bindLangSwitcher(select) {
  select.innerHTML = '';
  for (const { code, label } of AVAILABLE_LANGS) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = label;
    select.append(opt);
  }
  select.value = current;
  select.addEventListener('change', async () => {
    await setLang(select.value);
    location.reload();
  });
}
