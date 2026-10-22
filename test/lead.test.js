import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {leadFromText, completeLeadFallback, FALLBACK_MAX, guideReadable} from '../worker/extracts.js';

// Spanish Wikivoyage "Japón" as TextExtracts returns it: no introduction, the
// text starts under "== Regiones ==", then a list of cities.
const JAPON = '\n== Regiones ==\nJapón está formado por cuatro islas principales y muchas islas menores, siendo la más notable Okinawa. Honshu, con mucho la isla más poblada y de mayor tamaño, se divide típicamente en cinco (o más) regiones. Las otras islas no se dividen en subregiones en esta sección, por lo que cada una de ellas constituirá una región. Por tanto, en total, las regiones que se usan con más frecuencia son:\n\n\n== Ciudades ==\nJapón tiene miles de ciudades; estas son nueve de las más importantes para el viajero.\n\nTokio - la moderna capital de Japón y la ciudad más densamente poblada de todas.\nHiroshima - una gran ciudad portuaria.\nKioto - una…';
const KYOTO = '京都市（きょうとし）は日本の京都府の市であり、同府の府庁所在地です。\n\n\n== 地区 ==\n京都市は11の区からなる。これらを5つの地域に分けて説明します。なお、所属する区はおおよそであり、厳密には多少異なる場合もあるので注意してください。\n\n== 知る ==\n人口は…';

test('a guide without an introduction gets its opening prose, never headings, lists or a lead-in to a list', () => {
  const lead = leadFromText(JAPON);
  assert.match(lead, /^Japón está formado por cuatro islas principales/);
  assert.doesNotMatch(lead, /==|Regiones|Tokio -|son:$/);
  assert.match(lead, /región\.$/, 'ends on a whole sentence');
  assert.match(leadFromText(KYOTO), /^京都市（きょうとし）は日本の京都府の市であり、同府の府庁所在地です。/);
  assert.equal(leadFromText('== Ciudades ==\nKioto - una ciudad\nOsaka - otra ciudad'), '', 'a page that is only a list has no usable text');
  assert.equal(leadFromText(''), '');
  assert.equal(leadFromText(undefined), '');
});

test('the fallback fills empty introductions, stays within its cap, and never lets a missing page look complete', async () => {
  const text = id => ({query: {pages: {[id]: {extract: 'Heading free text about place number ' + id + ' that is long enough to read as a real introduction.'}}}});
  const pages = Array.from({length: FALLBACK_MAX + 3}, (_, i) => ({pageid: i + 1, extract: ''}));
  pages.push({pageid: 99, extract: 'Already has an introduction that is long enough.'}, {pageid: 98, extract: '', extractMissing: true});
  const asked = [];
  await completeLeadFallback(pages, async id => { asked.push(id); return id === 2 ? null : text(id); });
  assert.equal(asked.length, FALLBACK_MAX, 'one request per page, at most the cap');
  assert.ok(!asked.includes(99) && !asked.includes(98), 'pages with text, or whose introduction request failed, are not re-read');
  assert.match(pages[0].extract, /place number 1/); assert.equal(pages[0].extractMissing, undefined);
  assert.equal(pages[1].extractMissing, true, 'a failed request stays missing');
  assert.ok(pages.slice(FALLBACK_MAX, FALLBACK_MAX + 3).every(p => p.extractMissing), 'pages over the cap are missing, not empty');
  // While a request is still pending (the answer budget may end first), the page counts as missing.
  const slow = [{pageid: 7, extract: ''}];
  const job = completeLeadFallback(slow, () => new Promise(() => {}));
  await new Promise(r => setImmediate(r));
  assert.equal(slow[0].extractMissing, true);
  void job;
});

test('shared Wikivoyage links use the same opening-text rules as the Worker', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const code = app.slice(app.indexOf('const LEAD_HEADING ='), app.indexOf('async function resolveDeepLink'));
  const c = vm.createContext({});
  vm.runInContext(code + ';globalThis.leadFromText=leadFromText;', c);
  for (const sample of [JAPON, KYOTO, '== A ==\nKyoto - a city', 'Plain introduction that ends here. And one more sentence!', '']) assert.equal(c.leadFromText(sample), leadFromText(sample));
});

test('short Chinese, Japanese and Korean guide introductions still make a card', () => {
  assert.equal(guideReadable('京都市（きょうとし）は日本の京都府の市であり、同府の府庁所在地です。'), true);
  assert.equal(guideReadable('서울은 대한민국의 수도이며 가장 큰 도시입니다.'), true);
  assert.equal(guideReadable('Kyoto is a city.'), false, 'Latin text keeps the 40-character minimum');
  assert.equal(guideReadable('短い。'), false);
});

test('texts already read are reused and do not count toward the cap', async () => {
  const pages = Array.from({length: 12}, (_, i) => ({pageid: i + 1, extract: ''}));
  const known = new Map(Array.from({length: 6}, (_, i) => [i + 1, 'Stored opening text for guide ' + (i + 1) + ', long enough to be a card.']));
  const saved = [], asked = [];
  await completeLeadFallback(pages, async id => { asked.push(id); return {query: {pages: {[id]: {extract: 'Fresh text for guide ' + id + ' that reads like a proper introduction.'}}}}; }, FALLBACK_MAX,
    {lookup: async ids => new Map(ids.filter(id => known.has(id)).map(id => [id, known.get(id)])), save: (id, text) => saved.push(id)});
  assert.deepEqual(asked, [7, 8, 9, 10, 11, 12], 'stored guides are not requested again; the others are, within the cap');
  assert.deepEqual(saved, asked, 'newly read texts are stored');
  assert.ok(pages.every(p => !p.extractMissing && p.extract));
});
