// Page intermédiaire : friction (délai + intention + continuer) ou blocage.
// Paramètres : ?rid=<ruleId>&mode=friction|block&u=<url bloquée>
// `u` est toujours le dernier paramètre : le DNR y injecte l'URL brute (non
// encodée), le suivi SPA l'encode — on parse donc positionnellement.

import { MSG, DEFAULTS } from '../common/constants.js';
import { getRule } from '../common/storage.js';

function parseParams() {
  const href = location.href;
  const uIndex = href.indexOf('&u=');
  const end = uIndex === -1 ? href.length : uIndex;
  const before = new URLSearchParams(href.slice(href.indexOf('?') + 1, end));
  let raw = uIndex === -1 ? '' : href.slice(uIndex + 3);
  // URL encodée (navigation SPA) ou brute (redirect DNR) ?
  if (!raw.includes('://')) {
    try { raw = decodeURIComponent(raw); } catch { /* on garde la version brute */ }
  }
  return { ruleId: before.get('rid'), mode: before.get('mode'), url: raw };
}

function displayHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'ce site';
  }
}

const { ruleId, mode, url } = parseParams();
const $ = (id) => document.getElementById(id);

async function closeTab() {
  const tab = await chrome.tabs.getCurrent();
  if (tab?.id != null) chrome.tabs.remove(tab.id);
}

function leave() {
  if (history.length > 1) history.back();
  else closeTab();
}

async function init() {
  const rule = await getRule(ruleId);
  const host = displayHost(url);
  const ruleName = rule?.name ? ` (règle « ${rule.name} »)` : '';

  chrome.runtime.sendMessage({ type: MSG.INTERSTITIAL_SHOWN, ruleId, mode });

  $('badge').textContent =
    mode === 'block' ? 'Site en pause'
    : mode === 'quota' ? 'Quota du jour atteint'
    : 'Moment de friction';

  if (mode === 'quota') {
    $('title').textContent = 'C\'est tout pour aujourd\'hui.';
    const p = $('subtitle');
    const quota = rule?.quotaMinutes;
    p.append(quota ? `Tu as utilisé tes ${quota} minutes sur ` : 'Tu as utilisé ton temps du jour sur ');
    const b = document.createElement('strong');
    b.textContent = host;
    p.append(b, `${ruleName}. Le compteur repart à zéro demain — c'était le cadre que tu t'étais fixé.`);
    $('btn-leave').textContent = 'Reprendre où j\'en étais';
    $('btn-close').hidden = false;
    $('note').textContent = 'Le quota se règle dans les options, à tête reposée.';
  } else if (mode === 'block') {
    $('title').textContent = 'Ce site est en pause.';
    $('subtitle').innerHTML = '';
    const p = $('subtitle');
    p.append('Tu as choisi de bloquer ');
    const b = document.createElement('strong');
    b.textContent = host;
    p.append(b, `${ruleName}. Ce n'est pas un échec d'avoir atterri ici — le détour est déjà fait.`);
    $('btn-leave').textContent = 'Reprendre où j\'en étais';
    $('btn-close').hidden = false;
    $('note').textContent = 'Tu peux ajuster cette règle dans les options, à tête reposée.';
  } else {
    $('title').textContent = 'Un instant.';
    const p = $('subtitle');
    p.append('Tu t\'apprêtes à ouvrir ');
    const b = document.createElement('strong');
    b.textContent = host;
    p.append(b, `${ruleName}.`);
    $('friction-section').hidden = false;

    const delay = rule?.frictionDelaySec ?? DEFAULTS.frictionDelaySec;
    const allowMin = rule?.allowDurationMin ?? DEFAULTS.allowDurationMin;
    const btn = $('btn-continue');
    btn.hidden = false;

    let remaining = delay;
    const tick = () => {
      if (remaining > 0) {
        btn.textContent = `Continuer quand même (${remaining} s)`;
        remaining--;
        setTimeout(tick, 1000);
      } else {
        btn.textContent = `Continuer quand même (${allowMin} min)`;
        btn.disabled = false;
      }
    };
    tick();

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const res = await chrome.runtime.sendMessage({ type: MSG.REQUEST_ACCESS, ruleId, url });
      if (res?.ok) {
        location.replace(url);
      } else {
        btn.textContent = 'Impossible d\'ouvrir — réessaie';
        btn.disabled = false;
      }
    });
  }

  $('btn-leave').addEventListener('click', leave);
  $('btn-close').addEventListener('click', closeTab);
  document.querySelector('.card').hidden = false;
}

init();
