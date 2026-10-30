import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {tripStyles, fetchPlaceFacts, placeFacts, readFactsFile, writeFactsFile, FACTS_MAX_AGE, CLASSES} from '../scripts/trip-styles.mjs';
import {TRAVEL_STYLES, LEGACY_STYLES, travelStyle, travelTerms, TRAVEL_TERMS} from '../worker/travel.js';

const guide = (title, extra = {}) => ({title, category: [], heading: [], coordinates: [{}], ...extra});

test('states, provinces and countries are never a city, a town or a beach', () => {
  const state = {kinds: ['firstLevel', 'state'], population: 3_600_000, water: ['ocean']};
  assert.deepEqual(tripStyles(guide('Connecticut', {heading: ['Beaches']}), state), []);
  assert.deepEqual(tripStyles(guide('South Carolina', {category: ['Region articles'], heading: ['Beaches']}), {}), [], 'the edition calls it a region');
  assert.deepEqual(tripStyles(guide('Caribbean', {category: ['Region articles']}), undefined), []);
  assert.deepEqual(tripStyles(guide('Japan'), {kinds: ['country', 'island']}), [], 'an island country is a country');
});

test('cities, towns, islands and beaches come from what the place is', () => {
  assert.deepEqual(tripStyles(guide('Paris', {category: ['City articles']}), {kinds: ['city', 'settlement'], population: 2_100_000, heritage: 1}), ['city', 'heritage']);
  assert.deepEqual(tripStyles(guide('Kyiv/Podil'), {kinds: ['settlement'], population: 20000}), [], 'a district is not a small town');
  assert.deepEqual(tripStyles(guide('Killarney', {category: ['City articles']}), {kinds: ['town'], population: 14000}), ['town']);
  assert.deepEqual(tripStyles(guide('Boracay'), {kinds: ['island']}), ['island']);
  assert.deepEqual(tripStyles(guide('Chubu Centrair International Airport'), {kinds: ['airport', 'island']}), []);
  assert.deepEqual(tripStyles(guide('Patong', {heading: ['Beaches']}), {kinds: ['settlement'], population: 20000}), ['town', 'beach']);
  assert.deepEqual(tripStyles(guide('Tallinn', {heading: ['Beaches']}), {kinds: ['city'], population: 450000}), [], 'a city with a beach section is not a beach trip');
  assert.deepEqual(tripStyles(guide('Nha Trang'), {kinds: ['city'], population: 120000, water: ['sea']}), ['beach'], 'a town on the sea');
});

test('mountains, parks, hiking, diving and heritage', () => {
  assert.deepEqual(tripStyles(guide('Manali'), {kinds: ['town'], population: 8000, elevation: 2050}), ['town', 'mountain']);
  assert.deepEqual(tripStyles(guide('Denver'), {kinds: ['city'], population: 715000, elevation: 1600}), [], 'a high city is not a mountain town');
  assert.deepEqual(tripStyles(guide('Yosemite National Park', {category: ['Park articles'], heading: ['Hiking']}), {kinds: ['nationalPark', 'protected']}), ['park', 'hiking']);
  assert.deepEqual(tripStyles(guide('Hiking in the Nordic countries', {heading: ['Hiking'], coordinates: []}), undefined), [], 'a travel topic is about no place');
  assert.deepEqual(tripStyles(guide('Diving in Thailand', {category: ['Dive guide articles'], coordinates: []}), undefined), ['diving']);
  assert.deepEqual(tripStyles(guide('Chichen Itza'), {kinds: ['archaeological']}), ['heritage']);
});

test('each edition reads its own headings and categories', () => {
  assert.deepEqual(tripStyles(guide('Ort', {heading: ['Strände', 'Tauchen']}), {kinds: ['village'], population: 900}, 'de'), ['town', 'beach', 'diving']);
  assert.deepEqual(tripStyles(guide('Bretagne', {category: ['Région'], heading: ['Plages']}), undefined, 'fr'), []);
  assert.deepEqual(tripStyles(guide('Kraków', {category: ['Obiekty z listy światowego dziedzictwa UNESCO']}), undefined, 'pl'), ['heritage']);
  assert.deepEqual(tripStyles(guide('Ort', {heading: ['Beaches']}), {kinds: ['village'], population: 900}, 'de'), ['town'], 'another edition’s heading means nothing');
});

test('old saved styles map to the closest new style, and every edition has live words for every style', () => {
  assert.deepEqual(Object.keys(LEGACY_STYLES).map(travelStyle), ['park', 'beach', 'heritage']);
  assert.equal(travelStyle('city'), 'city'); assert.equal(travelStyle('nope'), '');
  for (const [lang, terms] of Object.entries(TRAVEL_TERMS)) assert.equal(terms.length, TRAVEL_STYLES.length, lang);
  assert.match(travelTerms('ja', 'island'), /島/); assert.match(travelTerms('en', 'coast'), /beach/);
});

const sparqlAnswer = bindings => ({ok: true, status: 200, headers: new Headers(), json: async () => ({results: {bindings}})});
const uri = id => ({value: 'http://www.wikidata.org/entity/' + id});
test('Wikidata facts are read in batches and resolved to the classes the styles use', async () => {
  const queries = [];
  const fetchImpl = async (url, {body}) => {
    const query = body.get('query'); queries.push(query);
    if (query.includes('wdt:P279*')) return sparqlAnswer([{c: uri('Q1549591'), t: uri(CLASSES.city)}, {c: uri('Q1549591'), t: uri(CLASSES.settlement)}, {c: uri('Q5107'), t: uri(CLASSES.sea)}]);
    return sparqlAnswer([
      {item: uri('Q90'), p: {value: 'http://www.wikidata.org/prop/direct/P31'}, v: uri('Q1549591')},
      {item: uri('Q90'), p: {value: 'http://www.wikidata.org/prop/direct/P1082'}, v: {value: '2103778'}},
      {item: uri('Q90'), p: {value: 'http://www.wikidata.org/prop/direct/P2044'}, v: {value: '120'}},
      {item: uri('Q90'), p: {value: 'http://www.wikidata.org/prop/direct/P2044'}, v: {value: '28'}},
      {item: uri('Q90'), p: {value: 'http://www.wikidata.org/prop/direct/P206'}, v: uri('Q5107')},
      {item: uri('Q90'), p: {value: 'http://www.wikidata.org/prop/direct/P1435'}, v: uri('Q9259')}
    ]);
  };
  const {facts, classes} = await fetchPlaceFacts(['Q90', 'Q90', 'not an item'], {userAgent: 'test', fetchImpl, sleep: async () => {}});
  assert.deepEqual(facts.get('Q90'), {kinds: ['city', 'settlement'], water: ['sea'], population: 2103778, elevation: 28, heritage: 1});
  assert.equal(queries.length, 2);
  assert.match(queries[0], /VALUES \?item \{ wd:Q90 \}/);
  // Next week the classes are known, so only the items are asked about.
  queries.length = 0;
  const again = await fetchPlaceFacts(['Q90'], {userAgent: 'test', fetchImpl, sleep: async () => {}, known: classes});
  assert.deepEqual(again.facts.get('Q90').kinds, ['city', 'settlement']); assert.equal(queries.length, 1);
});

test('a query too heavy for the service is split, and a single unanswerable entry is skipped', async () => {
  const sizes = [];
  const fetchImpl = async (url, {body}) => {
    const query = body.get('query'), count = (query.match(/wd:Q\d+/g) || []).length;
    if (query.includes('wdt:P279*')) return sparqlAnswer([]);
    sizes.push(count);
    if (count > 2 || query.includes('wd:Q5 ')) return {ok: false, status: 500, headers: new Headers()};
    return sparqlAnswer([]);
  };
  const ids = Array.from({length: 120}, (_, i) => 'Q' + (i + 1));
  const result = await fetchPlaceFacts(ids, {userAgent: 'test', fetchImpl, sleep: async () => {}});
  assert.ok(result, 'one skipped item of 120 is tolerated');
  assert.ok(sizes.includes(1) && sizes[0] === 120);
});

test('when Wikidata does not answer, the last saved facts stand in, and old ones are refused', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'facts-')), file = path.join(dir, 'facts.json.gz');
  let calls = 0;
  const down = async () => { calls++; return {ok: false, status: 503, headers: new Headers()}; };
  const items = Array.from({length: 1000}, (_, i) => 'Q' + (i + 1));
  const run = () => placeFacts(items, {cacheFile: file, userAgent: 'test', fetchImpl: down, sleep: async () => {}});
  assert.equal((await run()).source, 'none');
  assert.ok(calls <= 24, 'a service that is down is given up on quickly, not split to single items: ' + calls);
  writeFactsFile(file, {facts: new Map([['Q1', {kinds: ['island']}]])});
  const saved = await run();
  assert.equal(saved.source, 'saved'); assert.deepEqual(saved.facts.get('Q1'), {kinds: ['island']});
  writeFactsFile(file, {facts: new Map([['Q1', {kinds: ['island']}]])}, new Date(Date.now() - FACTS_MAX_AGE - 86400000).toISOString());
  assert.equal(readFactsFile(file), null);
});
