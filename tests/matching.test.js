import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTarget,
  urlMatchesTarget,
  targetToRegexFilter,
  matchingTarget,
} from '../src/common/matching.js';

test('parseTarget : formes usuelles', () => {
  assert.deepEqual(parseTarget('tiktok.com'), { domain: 'tiktok.com', path: null });
  assert.deepEqual(parseTarget('*.tiktok.com'), { domain: 'tiktok.com', path: null });
  assert.deepEqual(parseTarget('https://www.tiktok.com/'), { domain: 'tiktok.com', path: null });
  assert.deepEqual(parseTarget('  YouTube.com/Shorts  '), { domain: 'youtube.com', path: '/shorts' });
  assert.deepEqual(parseTarget('example.com:8080/a/b/'), { domain: 'example.com', path: '/a/b' });
  assert.deepEqual(parseTarget('site.com/page?q=1#frag'), { domain: 'site.com', path: '/page' });
});

test('parseTarget : entrées invalides', () => {
  assert.equal(parseTarget(''), null);
  assert.equal(parseTarget('   '), null);
  assert.equal(parseTarget('pas un domaine'), null);
  assert.equal(parseTarget('localhost'), null); // pas de point
  assert.equal(parseTarget(null), null);
});

test('urlMatchesTarget : domaine et sous-domaines', () => {
  const t = parseTarget('tiktok.com');
  assert.ok(urlMatchesTarget('https://tiktok.com/', t));
  assert.ok(urlMatchesTarget('https://www.tiktok.com/foo', t));
  assert.ok(urlMatchesTarget('http://m.tiktok.com/@user?x=1', t));
  assert.ok(!urlMatchesTarget('https://eviltiktok.com/', t));
  assert.ok(!urlMatchesTarget('https://tiktok.com.evil.io/', t));
  assert.ok(!urlMatchesTarget('chrome-extension://abc/page.html', t));
});

test('urlMatchesTarget : préfixe de chemin', () => {
  const t = parseTarget('youtube.com/shorts');
  assert.ok(urlMatchesTarget('https://www.youtube.com/shorts', t));
  assert.ok(urlMatchesTarget('https://www.youtube.com/shorts/', t));
  assert.ok(urlMatchesTarget('https://www.youtube.com/shorts/abc123', t));
  assert.ok(urlMatchesTarget('https://www.youtube.com/Shorts/abc', t));
  assert.ok(!urlMatchesTarget('https://www.youtube.com/shortsy', t));
  assert.ok(!urlMatchesTarget('https://www.youtube.com/watch?v=1', t));
});

test('targetToRegexFilter : même sémantique que urlMatchesTarget', () => {
  const cases = [
    ['tiktok.com', 'https://tiktok.com/', true],
    ['tiktok.com', 'https://m.tiktok.com/x?y=1', true],
    ['tiktok.com', 'https://tiktok.com', true], // sans slash final
    ['tiktok.com', 'https://eviltiktok.com/', false],
    ['tiktok.com', 'https://tiktok.com.evil.io/', false],
    ['youtube.com/shorts', 'https://www.youtube.com/shorts/abc', true],
    ['youtube.com/shorts', 'https://www.youtube.com/shorts?x=1', true],
    ['youtube.com/shorts', 'https://www.youtube.com/watch', false],
    ['example.com', 'https://example.com:8443/page', true],
  ];
  for (const [targetRaw, url, expected] of cases) {
    const target = parseTarget(targetRaw);
    // Le DNR matche insensible à la casse (isUrlFilterCaseSensitive: false) ;
    // on simule avec le flag i.
    const re = new RegExp(targetToRegexFilter(target), 'i');
    assert.equal(re.test(url), expected, `${targetRaw} vs ${url}`);
  }
});

test('matchingTarget : première cible qui matche', () => {
  const rule = { targets: ['tiktok.com', 'youtube.com/shorts'] };
  assert.equal(matchingTarget('https://m.tiktok.com/', rule)?.domain, 'tiktok.com');
  assert.equal(matchingTarget('https://youtube.com/shorts/x', rule)?.path, '/shorts');
  assert.equal(matchingTarget('https://youtube.com/watch', rule), null);
});
