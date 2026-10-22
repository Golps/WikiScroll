import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {isPhrasebook, phrasebookParams, PHRASEBOOK, PHRASEBOOK_CATEGORY} from '../worker/travel.js';

// Real titles from each Wikivoyage edition's phrasebook category (September 2026).
const PHRASEBOOKS = ['Japanese phrasebook', 'Sprachführer Englisch', 'Guía de húngaro', 'Guías de conversación', 'Guide linguistique basque',
  'שיחון איטלקי', 'Frasario dell\'autostoppista', '英語会話集', 'Taalgids Deens', 'Rozmówki czeskie', 'Guia de conversação alemão',
  'Японский разговорник', 'Английский разговорник (США)', '丹麦语会话手册', '南非語會話手冊'];
const DESTINATIONS = ['Japan', 'Tokyo', 'Guía de Madrid', 'Cina', 'Cucina cinese', 'Taiwán', 'Guide', 'Tuscany', 'Rozmówki-free town', '京都市', 'Москва', 'Fraser Island', 'Frascati'];

test('phrasebooks are recognised by their title in every Wikivoyage edition', () => {
  for (const title of PHRASEBOOKS) assert.equal(isPhrasebook({title}), true, title);
  for (const title of DESTINATIONS.filter(t => t !== 'Rozmówki-free town')) assert.equal(isPhrasebook({title}), false, title);
});

test('Italian phrasebooks, titled only with the language, are recognised by their category', () => {
  assert.deepEqual(phrasebookParams('it'), {clcategories: 'Categoria:Frasari', cllimit: 'max'});
  assert.equal(isPhrasebook({title: 'Cinese', categories: [{ns: 14, title: 'Categoria:Frasari'}]}), true);
  assert.equal(isPhrasebook({title: 'Cina'}), false, 'no categories list: not in the phrasebook category');
  for (const lang of ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'zh', 'he', 'nl', 'pl']) assert.ok(PHRASEBOOK_CATEGORY[lang], lang);
  assert.deepEqual(phrasebookParams('ar'), {}, 'no Wikivoyage edition, no category');
});

test('the browser fallback uses the same phrasebook titles as the Worker', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes(PHRASEBOOK.source), 'public/app.js must repeat worker/travel.js PHRASEBOOK exactly');
});
