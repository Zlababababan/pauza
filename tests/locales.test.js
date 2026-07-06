import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fr } from '../src/common/locales/fr.js';
import { en } from '../src/common/locales/en.js';
import { es } from '../src/common/locales/es.js';
import { de } from '../src/common/locales/de.js';
import { it } from '../src/common/locales/it.js';
import { pt } from '../src/common/locales/pt.js';
import { pl } from '../src/common/locales/pl.js';

const LOCALES = { en, es, de, it, pt, pl };
const frKeys = Object.keys(fr).sort();

const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

for (const [lang, dict] of Object.entries(LOCALES)) {
  test(`locale ${lang} : mêmes clés que le FR (référence)`, () => {
    assert.deepEqual(Object.keys(dict).sort(), frKeys);
  });

  test(`locale ${lang} : mêmes placeholders {param} que le FR, clé par clé`, () => {
    for (const key of frKeys) {
      assert.deepEqual(placeholders(dict[key]), placeholders(fr[key]),
        `${lang}.${key} : « ${dict[key]} » vs FR « ${fr[key]} »`);
    }
  });

  test(`locale ${lang} : aucune valeur vide`, () => {
    for (const key of frKeys) {
      assert.ok(String(dict[key]).trim().length > 0, `${lang}.${key} vide`);
    }
  });
}

test('jours de la semaine : 7 lettres et 7 noms dans chaque langue', () => {
  for (const [lang, dict] of Object.entries({ fr, ...LOCALES })) {
    assert.equal(dict.days_letters.split(',').length, 7, `${lang}.days_letters`);
    assert.equal(dict.days_full.split(',').length, 7, `${lang}.days_full`);
  }
});
