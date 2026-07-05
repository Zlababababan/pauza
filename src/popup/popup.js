// Popup : état du jour par règle. (Streaks et bouton panique : M4/M5.)

import { SEVERITY, SUPPORT_URL } from '../common/constants.js';
import { getRules, getStats, todayKey } from '../common/storage.js';

const SEVERITY_LABELS = {
  [SEVERITY.OBSERVE]: 'Observer',
  [SEVERITY.FRICTION]: 'Friction',
  [SEVERITY.QUOTA]: 'Quota',
  [SEVERITY.BLOCK]: 'Blocage',
};

function statsLine(rule, s) {
  const parts = [];
  if (rule.severity === SEVERITY.OBSERVE) {
    parts.push(`${s.observed} visite${s.observed > 1 ? 's' : ''}`);
  }
  if (rule.severity === SEVERITY.FRICTION) {
    parts.push(`${s.frictionShown} pause${s.frictionShown > 1 ? 's' : ''}`);
    parts.push(`${s.continued} poursuivie${s.continued > 1 ? 's' : ''}`);
    const resisted = s.frictionShown - s.continued;
    if (resisted > 0) parts.push(`${resisted} évitée${resisted > 1 ? 's' : ''} 🌱`);
  }
  if (rule.severity === SEVERITY.BLOCK) {
    parts.push(s.blocked > 0
      ? `${s.blocked} blocage${s.blocked > 1 ? 's' : ''}`
      : 'rien à signaler 🌱');
  }
  return parts.join(' · ') || 'rien à signaler';
}

async function render() {
  const [rules, stats] = await Promise.all([getRules(), getStats()]);
  const today = stats[todayKey()] ?? {};
  const active = rules.filter((r) => r.enabled !== false);

  document.getElementById('date').textContent =
    new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  const container = document.getElementById('today');
  for (const rule of active) {
    const s = { observed: 0, frictionShown: 0, continued: 0, blocked: 0, ...(today[rule.id] ?? {}) };
    const row = document.createElement('div');
    row.className = 'rule-row';
    const name = document.createElement('p');
    name.className = 'rule-name';
    name.textContent = `${rule.name || rule.targets[0]} — ${SEVERITY_LABELS[rule.severity]}`;
    const line = document.createElement('p');
    line.className = 'rule-stats';
    line.textContent = statsLine(rule, s);
    row.append(name, line);
    container.append(row);
  }
  document.getElementById('empty').hidden = active.length > 0;
}

document.getElementById('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

if (SUPPORT_URL) {
  const link = document.getElementById('support-link');
  link.href = SUPPORT_URL;
  link.hidden = false;
}

render();
