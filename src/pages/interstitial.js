// Page intermédiaire : friction (délai + intention + continuer), blocage,
// quota épuisé ou hors plage de disponibilité.
// Paramètres : ?rid=<ruleId>&mode=friction|block|quota|offhours&u=<url bloquée>
// `u` est toujours le dernier paramètre : le DNR y injecte l'URL brute (non
// encodée), le suivi SPA l'encode — on parse donc positionnellement.

import { MSG, DEFAULTS } from '../common/constants.js';
import { getRule } from '../common/storage.js';
import { nextActiveTime } from '../common/schedule.js';
import { initI18n, t, applyI18n, fillWithHost, dateLocale } from '../common/i18n.js';

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
    return t('this_site');
  }
}

const { ruleId, mode, url } = parseParams();
const $ = (id) => document.getElementById(id);

async function closeTab() {
  const tab = await chrome.tabs.getCurrent();
  if (tab?.id != null) chrome.tabs.remove(tab.id);
}

// « Reprendre où j'en étais » : le retour arrière peut ramener sur une page
// elle-même bloquée (rebond immédiat vers un nouvel interstitiel) ou ne mener
// nulle part. Dans les deux cas : repli vers un onglet vierge.
const LEAVE_FLAG = 'decroche-leaving';

async function goNeutral() {
  const tab = await chrome.tabs.getCurrent();
  if (tab?.id == null) return;
  try {
    await chrome.tabs.update(tab.id, { url: 'chrome://newtab/' });
  } catch {
    await chrome.tabs.update(tab.id, { url: 'about:blank' });
  }
}

function leave() {
  sessionStorage.setItem(LEAVE_FLAG, String(Date.now()));
  if (history.length > 1) {
    history.back();
    // Toujours là après 500 ms (retour inefficace) -> onglet vierge.
    setTimeout(goNeutral, 500);
  } else {
    goNeutral();
  }
}

/** Rebond détecté : on sortait d'un interstitiel et en voilà déjà un autre. */
function detectBounce() {
  const at = Number(sessionStorage.getItem(LEAVE_FLAG) ?? 0);
  sessionStorage.removeItem(LEAVE_FLAG);
  return at && Date.now() - at < 3000;
}

async function init() {
  if (detectBounce()) {
    goNeutral();
    return;
  }
  await initI18n();
  applyI18n();
  const rule = await getRule(ruleId);
  const host = displayHost(url);
  const ruleSuffix = rule?.name ? t('rule_suffix', { name: rule.name }) : '';

  chrome.runtime.sendMessage({ type: MSG.INTERSTITIAL_SHOWN, ruleId, mode });

  const isBlocking = mode === 'block' || mode === 'quota' || mode === 'offhours';
  $('badge').textContent = t(`badge_${isBlocking ? mode : 'friction'}`);
  document.title = t(isBlocking ? `${mode}_title` : 'friction_title');

  if (mode === 'offhours') {
    $('title').textContent = t('offhours_title');
    fillWithHost($('subtitle'), 'offhours_sub', host, { rule: ruleSuffix });
    const reopen = nextActiveTime(rule?.schedule ?? null);
    if (reopen) {
      $('subtitle').append(t('offhours_reopen', {
        when: reopen.toLocaleString(dateLocale(), { weekday: 'long', hour: '2-digit', minute: '2-digit' }),
      }));
    }
    $('note').textContent = t('note_offhours');
  } else if (mode === 'quota') {
    $('title').textContent = t('quota_title');
    fillWithHost($('subtitle'), rule?.quotaMinutes ? 'quota_sub' : 'quota_sub_nomin', host,
      { min: rule?.quotaMinutes, rule: ruleSuffix });
    $('note').textContent = t('note_quota');
  } else if (mode === 'block') {
    $('title').textContent = t('block_title');
    fillWithHost($('subtitle'), 'block_sub', host, { rule: ruleSuffix });
    $('note').textContent = t('note_block');
  } else {
    $('title').textContent = t('friction_title');
    fillWithHost($('subtitle'), 'friction_sub', host, { rule: ruleSuffix });
    $('friction-section').hidden = false;

    const delay = rule?.frictionDelaySec ?? DEFAULTS.frictionDelaySec;
    const allowMin = rule?.allowDurationMin ?? DEFAULTS.allowDurationMin;
    const btn = $('btn-continue');
    btn.hidden = false;

    let remaining = delay;
    const tick = () => {
      if (remaining > 0) {
        btn.textContent = t('btn_continue_wait', { s: remaining });
        remaining--;
        setTimeout(tick, 1000);
      } else {
        btn.textContent = t('btn_continue', { min: allowMin });
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
        btn.textContent = t('btn_continue_error');
        btn.disabled = false;
      }
    });
  }

  if (isBlocking) {
    $('btn-leave').textContent = t('btn_resume');
    $('btn-close').hidden = false;
  } else {
    $('btn-leave').textContent = t('btn_dont_go');
  }

  $('btn-leave').addEventListener('click', leave);
  $('btn-close').addEventListener('click', closeTab);
  document.querySelector('.card').hidden = false;
}

init();
