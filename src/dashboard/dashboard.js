// Tableau de bord : une carte par règle active — streaks, colonnes des
// 14 derniers jours (métrique selon la sévérité), totaux, vue tableau.
// Mode discret : noms floutés, clic pour révéler un instant.

import { SEVERITY } from '../common/constants.js';
import { getRules, getStats, getUsage, getSettings } from '../common/storage.js';
import { computeStreaks, listDayKeys } from '../common/streaks.js';
import { initI18n, t, applyI18n, dateLocale, ruleDisplayName } from '../common/i18n.js';
import { installPinGate } from '../common/pin-gate.js';

const DAYS_SHOWN = 14;

// Métrique affichée selon la sévérité : { clé i18n, valeur du jour }
function metricFor(rule, stats, usage) {
  const stat = (key, field) => stats[key]?.[rule.id]?.[field] ?? 0;
  switch (rule.severity) {
    case SEVERITY.OBSERVE:
      return { label: 'metric_observed', value: (key) => stat(key, 'observed') };
    case SEVERITY.FRICTION:
      return { label: 'metric_continued', value: (key) => stat(key, 'continued') };
    case SEVERITY.QUOTA:
      return {
        label: 'metric_minutes',
        value: (key) => Math.round(((usage[key]?.[rule.id] ?? 0) / 60) * 10) / 10,
      };
    default:
      return { label: 'metric_blocked', value: (key) => stat(key, 'blocked') };
  }
}

function fmtDay(key, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(dateLocale(), opts);
}

const tooltip = () => document.getElementById('tooltip');

function attachTooltip(col, text) {
  col.addEventListener('mouseenter', () => {
    const tip = tooltip();
    tip.textContent = text;
    tip.hidden = false;
  });
  col.addEventListener('mousemove', (e) => {
    const tip = tooltip();
    tip.style.left = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8) + 'px';
    tip.style.top = (e.clientY - 34) + 'px';
  });
  col.addEventListener('mouseleave', () => { tooltip().hidden = true; });
}

function ruleCard(rule, stats, usage, dayKeys, discreet) {
  const card = document.createElement('section');
  card.className = 'card';

  const title = document.createElement('p');
  title.className = 'rule-title';
  const name = document.createElement('span');
  name.className = 'site-name' + (discreet ? ' blurred' : '');
  name.textContent = ruleDisplayName(rule);
  if (discreet) {
    name.title = t('discreet_blur_hint');
    name.addEventListener('click', () => name.classList.toggle('revealed'));
  }
  const badge = document.createElement('span');
  badge.className = 'sev-badge';
  badge.textContent = t('sev_' + rule.severity);
  title.append(name, badge);

  const { current, best } = computeStreaks(rule, stats, usage);
  const streak = document.createElement('p');
  streak.className = 'streak';
  streak.textContent = t('streak_line', { n: current, best });

  const metric = metricFor(rule, stats, usage);
  const values = dayKeys.map((key) => metric.value(key));
  const quota = rule.severity === SEVERITY.QUOTA ? rule.quotaMinutes : null;
  const max = Math.max(...values, quota ?? 0, 1);

  const chart = document.createElement('div');
  chart.className = 'chart';
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label',
    `${ruleDisplayName(rule)} — ${t(metric.label)}, ${t('dashboard_subtitle')}`);

  dayKeys.forEach((key, i) => {
    const col = document.createElement('div');
    col.className = 'col' + (values[i] === 0 ? ' zero' : '');
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = values[i] === 0 ? '2px' : `${Math.max(4, (values[i] / max) * 100)}%`;
    col.append(bar);
    let text = `${fmtDay(key)} — ${values[i]} ${t(metric.label)}`;
    if (quota && values[i] >= quota) text += ` (${t('quota_exceeded_note')})`;
    attachTooltip(col, text);
    chart.append(col);
  });

  const maxLabel = document.createElement('span');
  maxLabel.className = 'max-label';
  maxLabel.textContent = String(max);
  chart.append(maxLabel);

  if (quota) {
    const line = document.createElement('div');
    line.className = 'quota-line';
    line.style.bottom = `${(quota / max) * 100}%`;
    const lbl = document.createElement('span');
    lbl.textContent = `${quota} min`;
    line.append(lbl);
    chart.append(line);
  }

  const dayLabels = document.createElement('div');
  dayLabels.className = 'day-labels';
  const first = document.createElement('span');
  first.textContent = fmtDay(dayKeys[0], { day: 'numeric', month: 'short' });
  const last = document.createElement('span');
  last.textContent = fmtDay(dayKeys.at(-1), { day: 'numeric', month: 'short' });
  dayLabels.append(first, last);

  const sum = (n) => {
    const v = values.slice(-n).reduce((a, b) => a + b, 0);
    return Math.round(v * 10) / 10;
  };
  // Totaux : 7 jours depuis les valeurs affichées, 30 jours depuis l'historique
  const keys30 = listDayKeys(new Date(Date.now() - 29 * 86_400_000), new Date());
  const metric30 = keys30.reduce((a, key) => a + metric.value(key), 0);
  const totals = document.createElement('p');
  totals.className = 'totals';
  totals.textContent = t('totals_line', {
    a: `${sum(7)} ${t(metric.label)}`,
    b: `${Math.round(metric30 * 10) / 10} ${t(metric.label)}`,
  });

  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = t('dashboard_table');
  const table = document.createElement('table');
  const thead = document.createElement('tr');
  thead.innerHTML = `<th>${t('col_day')}</th><th class="num">${t(metric.label)}</th>`;
  table.append(thead);
  dayKeys.forEach((key, i) => {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    td1.textContent = fmtDay(key);
    const td2 = document.createElement('td');
    td2.className = 'num';
    td2.textContent = String(values[i]);
    tr.append(td1, td2);
    table.append(tr);
  });
  details.append(summary, table);

  card.append(title, streak, chart, dayLabels, totals, details);
  return card;
}

async function render() {
  const [rules, stats, usage, settings] = await Promise.all([
    getRules(), getStats(), getUsage(), getSettings(),
  ]);
  const active = rules.filter((r) => r.enabled !== false);
  const today = new Date();
  const dayKeys = listDayKeys(new Date(today.getTime() - (DAYS_SHOWN - 1) * 86_400_000), today);

  const cards = document.getElementById('cards');
  cards.replaceChildren(...active.map((r) =>
    ruleCard(r, stats, usage, dayKeys, settings.discreet === true)));
  document.getElementById('empty').hidden = active.length > 0;
}

initI18n().then(() => {
  applyI18n();
  document.title = `Pauza — ${t('dashboard_title')}`;
  render();
  installPinGate();
});
