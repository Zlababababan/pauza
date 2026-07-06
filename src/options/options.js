// Page d'options : gestion des règles, mode strict, langue. Écrit dans
// chrome.storage.local ; le service worker recompile le DNR via storage.onChanged
// et fait respecter le mode strict (garde anti-assouplissement).

import { SEVERITY, BLOCK_ACTION, DEFAULTS, SUPPORT_LINKS, STRICT_DELAY_MS } from '../common/constants.js';
import { getRules, saveRules, getStrict, setStrict } from '../common/storage.js';
import { parseTarget } from '../common/matching.js';
import { initI18n, t, applyI18n, bindLangSwitcher, dateLocale } from '../common/i18n.js';

const $ = (id) => document.getElementById(id);

const fmtWhen = (ts) => new Date(ts).toLocaleString(dateLocale(), {
  weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
});

// --- Formulaire d'ajout ---

function selectedSeverity() {
  return document.querySelector('input[name="severity"]:checked').value;
}

function refreshSubOptions() {
  const sev = selectedSeverity();
  $('friction-options').hidden = sev !== SEVERITY.FRICTION;
  $('quota-options').hidden = sev !== SEVERITY.QUOTA;
  // Le choix d'action vaut pour le blocage, le quota épuisé et le hors-plage.
  $('block-options').hidden = sev !== SEVERITY.BLOCK && sev !== SEVERITY.QUOTA;
}

document.querySelectorAll('input[name="severity"]').forEach((r) =>
  r.addEventListener('change', refreshSubOptions)
);

// --- Horaires ---

function buildDayChips() {
  const letters = t('days_letters').split(',');
  const full = t('days_full').split(',');
  $('schedule-days').replaceChildren();
  for (const day of [1, 2, 3, 4, 5, 6, 0]) { // semaine d'abord, dimanche à la fin
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = String(day);
    input.defaultChecked = day >= 1 && day <= 5; // L-V par défaut (survit au reset)
    input.checked = input.defaultChecked;
    label.append(input, letters[day]);
    label.title = full[day];
    $('schedule-days').append(label);
  }
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
  const letters = t('days_letters').split(',');
  const days = schedule.days?.length
    ? [1, 2, 3, 4, 5, 6, 0].filter((d) => schedule.days.includes(d)).map((d) => letters[d]).join('·')
    : t('every_day');
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
      ? t('options_error_invalid', { targets: invalid.join(', ') })
      : t('options_error_empty');
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
    pendingDeleteAt: null,
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

function ruleCard(rule, strict) {
  const card = document.createElement('div');
  card.className = 'rule-card' + (rule.enabled === false ? ' off' : '');
  const guarded = strict.armed && rule.locked;

  const main = document.createElement('div');
  main.className = 'rule-main';

  const title = document.createElement('p');
  title.className = 'rule-title';
  title.textContent = rule.name || rule.targets[0];
  const badge = document.createElement('span');
  badge.className = `sev-badge ${rule.severity}`;
  badge.textContent = t('sev_' + rule.severity);
  title.append(badge);
  if (rule.locked) {
    const lockBadge = document.createElement('span');
    lockBadge.className = 'sev-badge';
    lockBadge.textContent = t('locked_badge');
    title.append(lockBadge);
  }

  const targets = document.createElement('p');
  targets.className = 'rule-targets';
  targets.textContent = rule.targets.join(' · ');

  main.append(title, targets);

  const meta = [];
  if (rule.severity === SEVERITY.FRICTION) {
    meta.push(t('meta_delay', { s: rule.frictionDelaySec }), t('meta_allow', { min: rule.allowDurationMin }));
  }
  if (rule.severity === SEVERITY.QUOTA) {
    meta.push(t('meta_quota', { q: rule.quotaMinutes }));
  }
  if (rule.severity === SEVERITY.BLOCK || rule.severity === SEVERITY.QUOTA) {
    meta.push(rule.blockAction === BLOCK_ACTION.CLOSE_TAB ? t('meta_closetab') : t('meta_interstitial'));
  }
  const sched = scheduleSummary(rule.schedule);
  if (sched) meta.push(sched);
  if (rule.pendingDeleteAt) meta.push(t('pending_delete_at', { when: fmtWhen(rule.pendingDeleteAt) }));
  if (meta.length) {
    const metaEl = document.createElement('p');
    metaEl.className = 'rule-meta';
    metaEl.textContent = meta.join(' · ');
    main.append(metaEl);
  }

  const actions = document.createElement('div');
  actions.className = 'rule-actions';

  const lockBtn = document.createElement('button');
  lockBtn.textContent = rule.locked ? t('btn_unlock') : t('btn_lock');
  // Déverrouiller une règle sous mode strict armé = assouplir : refusé.
  lockBtn.disabled = guarded;
  lockBtn.addEventListener('click', () => updateRule(rule.id, (r) => {
    r.locked = !r.locked;
  }));

  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = rule.enabled === false ? t('btn_enable') : t('btn_suspend');
  toggleBtn.disabled = guarded;
  toggleBtn.addEventListener('click', () => updateRule(rule.id, (r) => {
    r.enabled = r.enabled === false;
  }));

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'danger';
  if (!strict.armed) {
    deleteBtn.textContent = t('btn_delete');
    deleteBtn.addEventListener('click', async () => {
      const rules = (await getRules()).filter((r) => r.id !== rule.id);
      await saveRules(rules);
      render();
    });
  } else if (!rule.pendingDeleteAt) {
    // Mode strict armé : toute suppression passe par un délai de 24 h.
    deleteBtn.textContent = t('btn_request_delete');
    deleteBtn.addEventListener('click', () => updateRule(rule.id, (r) => {
      r.pendingDeleteAt = Date.now() + STRICT_DELAY_MS;
    }));
  } else {
    deleteBtn.textContent = t('btn_cancel_delete');
    deleteBtn.addEventListener('click', () => updateRule(rule.id, (r) => {
      r.pendingDeleteAt = null;
    }));
  }

  actions.append(lockBtn, toggleBtn, deleteBtn);
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

// --- Mode strict ---

async function renderStrict() {
  const strict = await getStrict();
  const now = Date.now();
  const status = $('strict-status');
  const actions = $('strict-actions');
  actions.replaceChildren();

  if (!strict.armed) {
    status.textContent = t('strict_status_off');
    const mk = (label, until) => {
      const b = document.createElement('button');
      b.textContent = t(label);
      b.addEventListener('click', async () => {
        await setStrict({ armed: true, until, pendingDisarmAt: null });
        render();
      });
      return b;
    };
    actions.append(
      mk('strict_arm_24h', now + 24 * 3600 * 1000),
      mk('strict_arm_7d', now + 7 * 24 * 3600 * 1000),
      mk('strict_arm_permanent', null),
    );
  } else {
    status.textContent = strict.pendingDisarmAt
      ? t('strict_status_pending_disarm', { when: fmtWhen(strict.pendingDisarmAt) })
      : strict.until
        ? t('strict_status_on_until', { when: fmtWhen(strict.until) })
        : t('strict_status_on_permanent');

    const b = document.createElement('button');
    if (!strict.pendingDisarmAt) {
      // Désarmer plus tôt que prévu = assouplir : délai de 24 h.
      b.textContent = t('strict_request_disarm');
      b.addEventListener('click', async () => {
        await setStrict({ ...strict, pendingDisarmAt: now + STRICT_DELAY_MS });
        render();
      });
    } else {
      b.textContent = t('strict_cancel_disarm');
      b.addEventListener('click', async () => {
        await setStrict({ ...strict, pendingDisarmAt: null });
        render();
      });
    }
    actions.append(b);
  }

  // Trou béant du mode strict : la navigation privée. On guide l'activation.
  const allowed = await chrome.extension.isAllowedIncognitoAccess();
  const inc = $('incognito-status');
  inc.textContent = allowed ? t('strict_incognito_ok') : t('strict_incognito_warn');
  inc.classList.toggle('warn', !allowed);
  $('incognito-open').hidden = allowed;
}

$('incognito-open').addEventListener('click', () => {
  chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
});

// --- Rendu ---

async function render() {
  const [rules, strict] = await Promise.all([getRules(), getStrict()]);
  const list = $('rules-list');
  list.replaceChildren(...rules.map((r) => ruleCard(r, strict)));
  $('rules-empty').hidden = rules.length > 0;
  await renderStrict();
}

function renderSupport() {
  let any = false;
  if (SUPPORT_LINKS.kofi) {
    $('support-kofi').href = SUPPORT_LINKS.kofi;
    $('support-kofi').textContent = t('support_kofi');
    $('support-kofi').hidden = false;
    any = true;
  }
  if (SUPPORT_LINKS.paypal) {
    $('support-paypal').href = SUPPORT_LINKS.paypal;
    $('support-paypal').textContent = t('support_paypal');
    $('support-paypal').hidden = false;
    $('support-sep').hidden = !SUPPORT_LINKS.kofi;
    any = true;
  }
  $('support').hidden = !any;
}

// Le service worker peut corriger les règles (garde du mode strict) ou exécuter
// une suppression différée : on re-rend quand le storage bouge sous nos pieds.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.rules || changes.strict)) render();
});

initI18n().then(() => {
  applyI18n();
  bindLangSwitcher($('lang-switcher'));
  buildDayChips();
  refreshSubOptions();
  renderSupport();
  render();
});
