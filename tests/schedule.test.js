import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHM, isScheduleActive, isRuleActiveNow, nextEngineBoundary, nextActiveTime } from '../src/common/schedule.js';

// mercredi 8 juillet 2026 (getDay() = 3)
const at = (h, m = 0, dayOffset = 0) => new Date(2026, 6, 8 + dayOffset, h, m);

test('parseHM', () => {
  assert.equal(parseHM('09:30'), 570);
  assert.equal(parseHM('0:05'), 5);
  assert.equal(parseHM('24:00'), null);
  assert.equal(parseHM('9h30'), null);
  assert.equal(parseHM(''), null);
});

test('schedule null ou vide : toujours actif', () => {
  assert.ok(isScheduleActive(null, at(3)));
  assert.ok(isScheduleActive({ days: [], ranges: [] }, at(3)));
});

test('plage simple 9h-18h en semaine', () => {
  const s = { days: [1, 2, 3, 4, 5], ranges: [{ from: '09:00', to: '18:00' }] };
  assert.ok(isScheduleActive(s, at(9, 0)));        // borne incluse
  assert.ok(isScheduleActive(s, at(12, 30)));
  assert.ok(!isScheduleActive(s, at(18, 0)));      // borne de fin exclue
  assert.ok(!isScheduleActive(s, at(8, 59)));
  assert.ok(!isScheduleActive(s, at(12, 0, 3)));   // samedi
  assert.ok(!isScheduleActive(s, at(12, 0, 4)));   // dimanche
});

test('jours absents = tous les jours', () => {
  const s = { ranges: [{ from: '09:00', to: '18:00' }] };
  assert.ok(isScheduleActive(s, at(12, 0, 3)));    // samedi aussi
});

test('plage nocturne 22h-6h : soir du jour actif et matin suivant', () => {
  const s = { days: [3], ranges: [{ from: '22:00', to: '06:00' }] }; // mercredi soir
  assert.ok(isScheduleActive(s, at(23, 0)));       // mercredi 23h
  assert.ok(isScheduleActive(s, at(2, 0, 1)));     // jeudi 2h (nuit de mercredi)
  assert.ok(!isScheduleActive(s, at(12, 0)));      // mercredi midi
  assert.ok(!isScheduleActive(s, at(23, 0, 1)));   // jeudi 23h
  assert.ok(!isScheduleActive(s, at(2, 0)));       // mercredi 2h (nuit de mardi)
});

test('plusieurs plages', () => {
  const s = { ranges: [{ from: '09:00', to: '12:00' }, { from: '14:00', to: '18:00' }] };
  assert.ok(isScheduleActive(s, at(10)));
  assert.ok(!isScheduleActive(s, at(13)));
  assert.ok(isScheduleActive(s, at(15)));
});

test('isRuleActiveNow : enabled et horaires combinés', () => {
  const rule = { enabled: true, schedule: { ranges: [{ from: '09:00', to: '18:00' }] } };
  assert.ok(isRuleActiveNow(rule, at(10)));
  assert.ok(!isRuleActiveNow(rule, at(20)));
  assert.ok(!isRuleActiveNow({ ...rule, enabled: false }, at(10)));
  assert.ok(isRuleActiveNow({ enabled: true, schedule: null }, at(20)));
});

test('nextActiveTime : prochaine réouverture d\'une fenêtre', () => {
  const s = { days: [1, 2, 3, 4, 5], ranges: [{ from: '09:00', to: '18:00' }] };
  // mercredi 20h -> jeudi 9h
  assert.equal(nextActiveTime(s, at(20)).getTime(), at(9, 0, 1).getTime());
  // vendredi 20h (offset +2) -> lundi 9h (offset +5)
  assert.equal(nextActiveTime(s, at(20, 0, 2)).getTime(), at(9, 0, 5).getTime());
  // déjà dans la fenêtre -> null
  assert.equal(nextActiveTime(s, at(10)), null);
  // schedule sans jours cochés du tout... days vide = tous les jours -> demain 9h
  assert.equal(nextActiveTime({ ranges: [{ from: '09:00', to: '18:00' }] }, at(20)).getTime(),
    at(9, 0, 1).getTime());
});

test('nextEngineBoundary : prochaine borne ou minuit', () => {
  const rules = [{ schedule: { ranges: [{ from: '09:00', to: '18:00' }] } }];
  // à 10h -> prochaine borne : 18h aujourd'hui
  assert.equal(nextEngineBoundary(rules, at(10)), at(18).getTime());
  // à 19h -> prochaine borne : minuit (avant le 9h de demain)
  assert.equal(nextEngineBoundary(rules, at(19)), at(24).getTime());
  // sans règles horaires -> minuit
  assert.equal(nextEngineBoundary([{}], at(10)), at(24).getTime());
  // toujours strictement dans le futur
  assert.ok(nextEngineBoundary(rules, at(18)) > at(18).getTime());
});
