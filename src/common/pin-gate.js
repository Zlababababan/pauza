// Portail PIN partagé (options, statistiques). La page garde son <main hidden>
// tant que le portail n'a pas validé — ou immédiatement démasqué si aucun PIN.
// Rappel : confidentialité vis-à-vis de l'entourage, pas sécurité.
// Prérequis : initI18n() déjà appelé. Styles : src/common/gate.css.

import { getSettings } from './storage.js';
import { t } from './i18n.js';

export async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function installPinGate() {
  const { pinHash } = await getSettings();
  const main = document.querySelector('main');
  if (!pinHash) {
    main.hidden = false;
    return;
  }

  const gate = document.createElement('div');
  gate.id = 'pin-gate';

  const card = document.createElement('div');
  card.className = 'gate-card';
  const h1 = document.createElement('h1');
  h1.textContent = 'Pauza';
  const prompt = document.createElement('p');
  prompt.textContent = t('pin_gate_prompt');
  const form = document.createElement('form');
  form.id = 'gate-form';
  const input = document.createElement('input');
  input.id = 'gate-pin';
  input.type = 'password';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  const btn = document.createElement('button');
  btn.type = 'submit';
  btn.className = 'primary';
  btn.textContent = t('pin_unlock');
  form.append(input, btn);
  const error = document.createElement('p');
  error.className = 'error';
  error.id = 'gate-error';
  error.textContent = t('pin_wrong');
  error.hidden = true;

  card.append(h1, prompt, form, error);
  gate.append(card);
  document.body.prepend(gate);
  input.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await sha256Hex(input.value) === pinHash) {
      gate.remove();
      main.hidden = false;
    } else {
      error.hidden = false;
      input.select();
    }
  });
}
