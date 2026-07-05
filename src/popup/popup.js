// Popup : état du jour par règle, indicateur de mode strict. (Streaks : M4.)

import { SEVERITY, SUPPORT_LINKS } from '../common/constants.js';
import { getRules, getStats, todayKey, getUsageToday, getStrict } from '../common/storage.js';
import { initI18n, t, tn, applyI18n, bindLangSwitcher, dateLocale } from '../common/i18n.js';

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
  const [rules, stats, usage, strict] = await Promise.all([
    getRules(), getStats(), getUsageToday(), getStrict(),
  ]);
  const today = stats[todayKey()] ?? {};
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
    name.textContent = `${rule.name || rule.targets[0]} — ${t('sev_' + rule.severity)}`;
    const line = document.createElement('p');
    line.className = 'rule-stats';
    line.textContent = statsLine(rule, s, usage[rule.id] ?? 0);
    row.append(name, line);
    container.append(row);
  }
  document.getElementById('empty').hidden = active.length > 0;
}

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

initI18n().then(() => {
  applyI18n();
  bindLangSwitcher(document.getElementById('lang-switcher'));
  renderSupport();
  render();
});
