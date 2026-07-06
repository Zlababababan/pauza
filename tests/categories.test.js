import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, categoryId } from '../src/common/categories.js';
import { parsedTargets, isValidTargetLine, matchingTarget, parseTarget } from '../src/common/matching.js';

test('categoryId : jetons reconnus et tolérance de saisie', () => {
  assert.equal(categoryId('@social'), 'social');
  assert.equal(categoryId('  @Social '), 'social');
  assert.equal(categoryId('@ADULT'), 'adult');
  assert.equal(categoryId('@inconnu'), null);
  assert.equal(categoryId('social'), null); // pas de @ : cible ordinaire
  assert.equal(categoryId('@'), null);
  assert.equal(categoryId(null), null);
});

test('toutes les entrées de catégories sont des cibles parsables', () => {
  for (const [id, domains] of Object.entries(CATEGORIES)) {
    assert.ok(domains.length > 0, `catégorie vide : ${id}`);
    for (const d of domains) {
      assert.ok(parseTarget(d), `cible invalide dans ${id} : ${d}`);
    }
  }
});

test('parsedTargets : expansion des catégories', () => {
  const rule = { targets: ['@social'] };
  const targets = parsedTargets(rule);
  assert.equal(targets.length, CATEGORIES.social.length);
  assert.ok(targets.some((t) => t.domain === 'tiktok.com'));
});

test('parsedTargets : mélange catégorie + cibles, doublons retirés', () => {
  const rule = { targets: ['@social', 'tiktok.com', 'example.org'] };
  const targets = parsedTargets(rule);
  // tiktok.com est déjà dans @social : pas de doublon
  assert.equal(targets.filter((t) => t.domain === 'tiktok.com').length, 1);
  assert.ok(targets.some((t) => t.domain === 'example.org'));
  assert.equal(targets.length, CATEGORIES.social.length + 1);
});

test('parsedTargets : jeton inconnu ignoré comme une cible invalide', () => {
  assert.equal(parsedTargets({ targets: ['@nimportequoi'] }).length, 0);
});

test('matchingTarget : matche à travers une catégorie', () => {
  const rule = { targets: ['@gambling'] };
  assert.equal(matchingTarget('https://www.winamax.fr/paris-sportifs', rule)?.domain, 'winamax.fr');
  assert.equal(matchingTarget('https://example.com/', rule), null);
});

test('isValidTargetLine : catégories et cibles ordinaires', () => {
  assert.ok(isValidTargetLine('@social'));
  assert.ok(isValidTargetLine('tiktok.com'));
  assert.ok(!isValidTargetLine('@inconnu'));
  assert.ok(!isValidTargetLine('pas un domaine'));
});
