// Page d'options : gestion des règles. Écrit dans chrome.storage.local ;
// le service worker recompile les règles DNR via storage.onChanged.

import { SEVERITY, BLOCK_ACTION, DEFAULTS, SUPPORT_URL } from '../common/constants.js';
import { getRules, saveRules } from '../common/storage.js';
import { parseTarget } from '../common/matching.js';

const $ = (id) => document.getElementById(id);

const SEVERITY_LABELS = {
  [SEVERITY.OBSERVE]: 'Observer',
  [SEVERITY.FRICTION]: 'Friction',
  [SEVERITY.QUOTA]: 'Quota',
  [SEVERITY.BLOCK]: 'Blocage',
};

// --- Formulaire d'ajout ---

function selectedSeverity() {
  return document.querySelector('input[name="severity"]:checked').value;
}

function refreshSubOptions() {
  const sev = selectedSeverity();
  $('friction-options').hidden = sev !== SEVERITY.FRICTION;
  $('quota-options').hidden = sev !== SEVERITY.QUOTA;
  // Le choix d'action vaut pour le blocage ET le quota épuisé.
  $('block-options').hidden = sev !== SEVERITY.BLOCK && sev !== SEVERITY.QUOTA;
  $('schedule-options').hidden = false;
}

document.querySelectorAll('input[name="severity"]').forEach((r) =>
  r.addEventListener('change', refreshSubOptions)
);
refreshSubOptions();

// --- Horaires ---

const DAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']; // index = getDay()

for (const day of [1, 2, 3, 4, 5, 6, 0]) { // semaine d'abord, dimanche à la fin
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.value = String(day);
  input.defaultChecked = day >= 1 && day <= 5; // L-V par défaut (survit au reset)
  input.checked = input.defaultChecked;
  label.append(input, DAY_LABELS[day]);
  label.title = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][day];
  $('schedule-days').append(label);
}

$('schedule-enabled').addEventListener('change', () => {
  $('schedule-fields').hidden = !$('schedule-enabled').checked;
});

function readSchedule() {
  if (!$('schedule-enabled').checked) return null;
  const days = [...$('schedule-days').querySelectorAll('input:checked')].map((i) => Number(i.value));
  const from = $('schedule-from').value;
  const to = $('schedule-to').value;
  if (!from || !to || from === to) return null;
  return { days, ranges: [{ from, to }] };
}

function scheduleSummary(schedule) {
  if (!schedule?.ranges?.length) return null;
  const days = schedule.days?.length
    ? [1, 2, 3, 4, 5, 6, 0].filter((d) => schedule.days.includes(d)).map((d) => DAY_LABELS[d]).join('·')
    : 'tous les jours';
  const r = schedule.ranges[0];
  return `${days} ${r.from}–${r.to}`;
}

$('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = $('targets-error');
  errorEl.hidden = true;

  const lines = $('targets').value.split('\n').map((l) => l.trim()).filter(Boolean);
  const invalid = lines.filter((l) => !parseTarget(l));
  if (!lines.length || invalid.length) {
    errorEl.textContent = invalid.length
      ? `Cibles non reconnues : ${invalid.join(', ')}`
      : 'Indique au moins un site.';
    errorEl.hidden = false;
    return;
  }

  const severity = selectedSeverity();
  const rule = {
    id: crypto.randomUUID(),
    name: $('name').value.trim() || null,
    targets: lines,
    severity,
    blockAction: severity === SEVERITY.BLOCK || severity === SEVERITY.QUOTA
      ? document.querySelector('input[name="blockAction"]:checked').value
      : BLOCK_ACTION.INTERSTITIAL,
    frictionDelaySec: clampInt($('friction-delay').value, 3, 120, DEFAULTS.frictionDelaySec),
    allowDurationMin: clampInt($('allow-duration').value, 1, 120, DEFAULTS.allowDurationMin),
    schedule: readSchedule(),
    quotaMinutes: severity === SEVERITY.QUOTA
      ? clampInt($('quota-minutes').value, 1, 600, 30)
      : null,
    locked: false,
    enabled: true,
    createdAt: Date.now(),
  };

  const rules = await getRules();
  rules.push(rule);
  await saveRules(rules);
  e.target.reset();
  $('schedule-fields').hidden = true;
  refreshSubOptions();
  render();
});

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// --- Liste des règles ---

function ruleCard(rule) {
  const card = document.createElement('div');
  card.className = 'rule-card' + (rule.enabled === false ? ' off' : '');

  const main = document.createElement('div');
  main.className = 'rule-main';

  const title = document.createElement('p');
  title.className = 'rule-title';
  title.textContent = rule.name || rule.targets[0];
  const badge = document.createElement('span');
  badge.className = `sev-badge ${rule.severity}`;
  badge.textContent = SEVERITY_LABELS[rule.severity] ?? rule.severity;
  title.append(badge);

  const targets = document.createElement('p');
  targets.className = 'rule-targets';
  targets.textContent = rule.targets.join(' · ');

  main.append(title, targets);

  const meta = [];
  if (rule.severity === SEVERITY.FRICTION) {
    meta.push(`délai ${rule.frictionDelaySec} s`, `accès ${rule.allowDurationMin} min`);
  }
  if (rule.severity === SEVERITY.QUOTA) {
    meta.push(`${rule.quotaMinutes} min/jour`);
  }
  if (rule.severity === SEVERITY.BLOCK || rule.severity === SEVERITY.QUOTA) {
    meta.push(rule.blockAction === BLOCK_ACTION.CLOSE_TAB
      ? 'fermeture de l\'onglet'
      : 'page de pause');
  }
  const sched = scheduleSummary(rule.schedule);
  if (sched) meta.push(sched);
  if (meta.length) {
    const metaEl = document.createElement('p');
    metaEl.className = 'rule-meta';
    metaEl.textContent = meta.join(' · ');
    main.append(metaEl);
  }

  const actions = document.createElement('div');
  actions.className = 'rule-actions';

  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = rule.enabled === false ? 'Réactiver' : 'Suspendre';
  toggleBtn.addEventListener('click', () => updateRule(rule.id, (r) => {
    r.enabled = r.enabled === false;
  }));

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'danger';
  deleteBtn.textContent = 'Supprimer';
  deleteBtn.addEventListener('click', async () => {
    const rules = (await getRules()).filter((r) => r.id !== rule.id);
    await saveRules(rules);
    render();
  });

  actions.append(toggleBtn, deleteBtn);
  card.append(main, actions);
  return card;
}

async function updateRule(ruleId, mutate) {
  const rules = await getRules();
  const rule = rules.find((r) => r.id === ruleId);
  if (rule) {
    mutate(rule);
    await saveRules(rules);
  }
  render();
}

async function render() {
  const rules = await getRules();
  const list = $('rules-list');
  list.replaceChildren(...rules.map(ruleCard));
  $('rules-empty').hidden = rules.length > 0;
}

if (SUPPORT_URL) {
  $('support-link').href = SUPPORT_URL;
  $('support').hidden = false;
}

render();
