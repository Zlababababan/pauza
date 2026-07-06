import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCleanDay, computeStreaks, listDayKeys } from '../src/common/streaks.js';

const day = (offset) => new Date(2026, 6, 6 + offset); // 6 juillet 2026 + offset
const key = (offset) => {
  const d = day(offset);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

test('isCleanDay par sévérité', () => {
  assert.ok(isCleanDay({ severity: 'observe' }, undefined));
  assert.ok(!isCleanDay({ severity: 'observe' }, { observed: 2 }));
  assert.ok(isCleanDay({ severity: 'friction' }, { frictionShown: 5, continued: 0 }));
  assert.ok(!isCleanDay({ severity: 'friction' }, { frictionShown: 5, continued: 1 }));
  assert.ok(isCleanDay({ severity: 'quota', quotaMinutes: 30 }, {}, 29 * 60));
  assert.ok(!isCleanDay({ severity: 'quota', quotaMinutes: 30 }, {}, 30 * 60));
  assert.ok(isCleanDay({ severity: 'block' }, {}));
  assert.ok(!isCleanDay({ severity: 'block' }, { blocked: 1 }));
});

test('listDayKeys : bornes incluses', () => {
  const keys = listDayKeys(day(-2), day(0));
  assert.deepEqual(keys, [key(-2), key(-1), key(0)]);
});

test('computeStreaks : série courante et record', () => {
  const rule = { id: 'r', severity: 'friction', createdAt: day(-9).getTime() };
  const stats = {
    // poursuites aux jours -7 et -3 ; propre ailleurs
    [key(-7)]: { r: { continued: 2 } },
    [key(-3)]: { r: { continued: 1 } },
  };
  const { current, best } = computeStreaks(rule, stats, {}, day(0));
  assert.equal(current, 3); // -2, -1, 0
  assert.equal(best, 3);    // -6..-4 fait aussi 3
});

test('computeStreaks : règle créée aujourd\'hui, jour propre', () => {
  const rule = { id: 'r', severity: 'block', createdAt: day(0).getTime() };
  assert.deepEqual(computeStreaks(rule, {}, {}, day(0)), { current: 1, best: 1 });
});

test('computeStreaks : quota via usage', () => {
  const rule = { id: 'q', severity: 'quota', quotaMinutes: 10, createdAt: day(-2).getTime() };
  const usage = { [key(-1)]: { q: 15 * 60 } }; // dépassé hier
  const { current, best } = computeStreaks(rule, {}, usage, day(0));
  assert.equal(current, 1);
  assert.equal(best, 1);
});
