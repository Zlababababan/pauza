// Popup : état du jour par règle, indicateur de mode strict. (Streaks : M4.)

import { SEVERITY, SUPPORT_LINKS, PANIC_DURATION_MS } from '../common/constants.js';
import { getRules, getStats, todayKey, getUsage, getSettings, getStrict, getPanic, setPanic, isPanicActive } from '../common/storage.js';
import { computeStreaks } from '../common/streaks.js';
import { initI18n, t, tn, applyI18n, bindLangSwitcher, dateLocale, ruleDisplayName } from '../common/i18n.js';

function statsLine(rule, s, usedSeconds) {
  const parts = [];
  if (rule.severity === SEVERITY.OBSERVE) {
    parts.push(tn('stat_visits', s.observed));
  }
  if (rule.severity === SEVERITY.QUOTA) {
    const used = Math.round(usedSeconds / 60);
    parts.push(used >= rule.quotaMinutes
      ? t('stat_quota_reached', { q: rule.quotaMinutes })
      : t('stat_quota_used', { used, q: rule.quotaMinutes }));
  }
  if (rule.severity === SEVERITY.FRICTION) {
    parts.push(tn('stat_pauses', s.frictionShown));
    parts.push(tn('stat_continued', s.continued));
    const resisted = s.frictionShown - s.continued;
    if (resisted > 0) parts.push(tn('stat_avoided', resisted));
  }
  if (rule.severity === SEVERITY.BLOCK) {
    parts.push(s.blocked > 0 ? tn('stat_blocks', s.blocked) : t('stat_nothing_good'));
  }
  return parts.join(' · ') || t('stat_nothing');
}

async function render() {
  const [rules, stats, usage, strict, settings] = await Promise.all([
    getRules(), getStats(), getUsage(), getStrict(), getSettings(),
  ]);
  const today = stats[todayKey()] ?? {};
  const usageToday = usage[todayKey()] ?? {};
  const active = rules.filter((r) => r.enabled !== false);

  document.getElementById('date').textContent =
    new Date().toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' });

  if (strict.armed) {
    const banner = document.getElementById('strict-banner');
    banner.textContent = strict.until
      ? t('strict_armed_until', {
          when: new Date(strict.until).toLocaleString(dateLocale(),
            { weekday: 'long', hour: '2-digit', minute: '2-digit' }),
        })
      : t('strict_armed_permanent');
    banner.hidden = false;
  }

  const container = document.getElementById('today');
  for (const rule of active) {
    const s = { observed: 0, frictionShown: 0, continued: 0, blocked: 0, ...(today[rule.id] ?? {}) };
    const row = document.createElement('div');
    row.className = 'rule-row';
    const name = document.createElement('p');
    name.className = 'rule-name';
    const site = document.createElement('span');
    site.className = 'site-name' + (settings.discreet === true ? ' blurred' : '');
    site.textContent = ruleDisplayName(rule);
    if (settings.discreet === true) {
      site.addEventListener('click', () => site.classList.toggle('revealed'));
    }
    name.append(site, ` — ${t('sev_' + rule.severity)}`);
    const line = document.createElement('p');
    line.className = 'rule-stats';
    const parts = [statsLine(rule, s, usageToday[rule.id] ?? 0)];
    const { current } = computeStreaks(rule, stats, usage);
    if (current > 0) parts.push(t('streak_badge', { n: current }));
    line.textContent = parts.join(' · ');
    row.append(name, line);
    container.append(row);
  }
  document.getElementById('empty').hidden = active.length > 0;
  await renderPanic(rules);
}

// --- Bouton panique : tout bloquer 1 h, avec confirmation, sans annulation ---

const $ = (id) => document.getElementById(id);

async function renderPanic(rules) {
  const panic = await getPanic();
  const active = isPanicActive(panic);
  $('panic').hidden = rules.length === 0;
  $('panic-btn').hidden = active;
  $('panic-confirm').hidden = true;
  $('panic-banner').hidden = !active;
  if (active) {
    $('panic-banner').textContent = t('panic_active_until', {
      when: new Date(panic.until).toLocaleTimeString(dateLocale(),
        { hour: '2-digit', minute: '2-digit' }),
    });
  }
}

$('panic-btn').addEventListener('click', () => {
  $('panic-btn').hidden = true;
  $('panic-confirm').hidden = false;
});

$('panic-no').addEventListener('click', () => {
  $('panic-confirm').hidden = true;
  $('panic-btn').hidden = false;
});

$('panic-yes').addEventListener('click', async () => {
  // Le service worker réagit au changement de storage : recompilation DNR
  // prioritaire + balayage des onglets déjà ouverts.
  await setPanic({ until: Date.now() + PANIC_DURATION_MS });
  renderPanic(await getRules());
});

function renderSupport() {
  const wrap = document.getElementById('support-links');
  const links = [];
  if (SUPPORT_LINKS.kofi) links.push([SUPPORT_LINKS.kofi, t('popup_support')]);
  if (SUPPORT_LINKS.paypal) links.push([SUPPORT_LINKS.paypal, t('support_paypal')]);
  if (!links.length) return;
  links.forEach(([href, label], i) => {
    if (i > 0) wrap.append(' · ');
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = label;
    wrap.append(a);
  });
  wrap.hidden = false;
}

document.getElementById('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('open-dashboard').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') });
});

initI18n().then(() => {
  applyI18n();
  bindLangSwitcher(document.getElementById('lang-switcher'));
  renderSupport();
  render();
});
