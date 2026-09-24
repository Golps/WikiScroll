import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseToday, todayResponse} from '../worker/today.js';

const page = (pageid, extra = {}) => ({pageid, type: 'standard', namespace: {id: 0}, title: 'Page_' + pageid, titles: {normalized: 'Page ' + pageid},
  extract: 'A subject with a long enough introduction to make a real discovery card for the reader. '.repeat(2),
  thumbnail: {source: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/P${pageid}.jpg/320px-P${pageid}.jpg`}, originalimage: {source: `https://upload.wikimedia.org/wikipedia/commons/a/ab/P${pageid}.jpg`, width: 3000},
  content_urls: {desktop: {page: 'https://en.wikipedia.org/wiki/Page_' + pageid}}, ...extra});
const feed = {
  births: [{year: 1889, pages: [page(1), page(900)]}],
  deaths: [{year: 1939, pages: [page(2)]}],
  events: [{year: 1969, pages: [page(3), page(901)]}, {year: 1970, pages: [page(4, {type: 'disambiguation'})]}],
  selected: [{year: 1846, pages: [page(5, {thumbnail: undefined})]}],
  holidays: [{pages: [page(6)]}],
};

test('only each entry\'s subject is matched, with its kind and year', () => {
  const {matches} = parseToday(feed, 'en');
  assert.deepEqual(matches, {w1: {k: 'born', y: 1889}, w2: {k: 'died', y: 1939}, w3: {k: 'event', y: 1969}, w5: {k: 'event', y: 1846}, w6: {k: 'holiday'}});
  assert.equal(matches.w900, undefined, 'pages merely mentioned in an entry are not labelled');
  assert.equal(matches.w4, undefined, 'disambiguation pages are skipped');
});

test('surprise candidates need a photo and an introduction, and never come from deaths', () => {
  const {seeds} = parseToday(feed, 'en');
  assert.deepEqual(seeds.map(a => a.id).sort(), ['w1', 'w3', 'w6']);
  assert.equal(seeds.find(a => a.id === 'w1').img, 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/P1.jpg/800px-P1.jpg', 'card-size photo');
  assert.equal(seeds.find(a => a.id === 'w1').title, 'Page 1');
});

test('a missing or broken feed yields nothing rather than an error', () => {
  for (const value of [null, {}, {births: 'x'}, {events: [{pages: [{pageid: -1}]}]}]) assert.deepEqual(parseToday(value, 'en').matches, {});
});

function cacheStore() { const m = new Map(); return {m, async match(k) { return m.get(k.url)?.clone(); }, async put(k, r) { m.set(k.url, r.clone()); }}; }
const options = (source, calls) => ({langs: new Set(['en', 'ja', 'es']), permit: async () => true, limited: () => new Response('', {status: 429}), env: {},
  feed: async url => { calls.push(url); return source(url); }});

test('the endpoint validates input and caches each language and date', async () => {
  const original = globalThis.caches, cache = cacheStore(); globalThis.caches = {default: cache};
  try {
    const calls = [];
    for (const q of ['lang=xx&md=09-23', 'lang=en&md=13-01', 'lang=en&md=9-23', 'lang=en']) assert.equal((await todayResponse(new URL('https://w.test/api/today?' + q), {}, options(() => feed, calls))).status, 400);
    assert.equal(calls.length, 0);
    const first = await (await todayResponse(new URL('https://w.test/api/today?lang=en&md=09-23'), {}, options(() => feed, calls))).json();
    assert.equal(calls[0], 'https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/09/23');
    assert.equal(Object.keys(first.matches).length, 5);
    const again = await todayResponse(new URL('https://w.test/api/today?lang=en&md=09-23'), {}, options(() => feed, calls));
    assert.equal(calls.length, 1); assert.equal(again.headers.get('X-Cache'), 'HIT');
    const unsupported = await todayResponse(new URL('https://w.test/api/today?lang=ja&md=09-23'), {}, options(() => ({}), calls));
    assert.deepEqual((await unsupported.json()).matches, {});
    assert.match(cache.m.get('https://wikiscroll.com/__today/v3/ja/09-23').headers.get('Cache-Control'), /max-age=21600/, 'editions without the list are settled for the day');
  } finally { globalThis.caches = original; }
});

test('a failed feed is a temporary error, never a cached empty day', async () => {
  const original = globalThis.caches, cache = cacheStore(); globalThis.caches = {default: cache};
  try {
    const calls = [], url = new URL('https://w.test/api/today?lang=es&md=09-23');
    const failed = await todayResponse(url, {}, options(() => null, calls));
    assert.equal(failed.status, 503, 'the browser must not accept a timeout as a day without anniversaries');
    assert.equal(failed.headers.get('Retry-After'), '120');
    assert.equal(failed.headers.get('Cache-Control'), 'no-store', 'browsers never keep the failure');
    assert.match(cache.m.get('https://wikiscroll.com/__today/v3/es/09-23').headers.get('Cache-Control'), /max-age=120/, 'the edge retries after two minutes');
    const during = await todayResponse(url, {}, options(() => feed, calls));
    assert.equal(during.status, 503, 'the short failure marker is served as an error too');
    assert.equal(calls.length, 1, 'no extra upstream request while the marker lasts');
    cache.m.clear();
    const recovered = await todayResponse(url, {}, options(() => feed, calls));
    assert.equal(recovered.status, 200);
    assert.equal(Object.keys((await recovered.json()).matches).length, 5);
    assert.match(recovered.headers.get('Cache-Control'), /max-age=3600/);
  } finally { globalThis.caches = original; }
});

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const todaySection = app.slice(app.indexOf('// ── ON THIS DAY'), app.indexOf('// ── SCROLL-BASED VIEW TRACKING'));
function client({random, topics = [], depth = 3, mode = 'wiki', help = false}) {
  const store = {};
  const c = vm.createContext({curMode: mode, curLang: 'en', depthLevel: depth, curTopics: new Set(topics), helpOnly: () => help,
    articles: [{id: 'w90'}, {id: 'w91'}, {id: 'w92'}], feedSeen: new Set(), shuffled: a => [...a], lsGet: k => store[k] ?? null, lsSet: (k, v) => { store[k] = v; },
    Math: Object.assign(Object.create(Math), {random}), Date, fetch: () => new Promise(() => {}), setTimeout, validReserveArticle: () => true});
  vm.runInContext(todaySection + `;todayInfo={md:monthDay(),lang:'en',matches:{w7:{k:'born',y:1900}},seeds:[{id:'w7',title:'Seed'},{id:'w8',title:'Seed two'}]};`, c);
  const run = n => vm.runInContext(`withTodaySurprises(Array.from({length:${n}},(_,i)=>({id:'w'+(1000+i)})))`, c).map(a => a.id);
  return {c, run, store};
}

test('after a failed load the browser asks again instead of settling on no data', async () => {
  const timers = [], responses = [{ok: false, status: 503}, {ok: true, json: async () => ({matches: {w7: {k: 'born', y: 1900}}, seeds: []})}];
  const c = vm.createContext({curLang: 'en', Date, fetch: async () => responses.shift(), setTimeout: fn => timers.push(fn), validReserveArticle: () => true,
    document: {querySelectorAll: () => []}});
  vm.runInContext(todaySection, c);
  vm.runInContext('loadToday()', c); await new Promise(setImmediate); await new Promise(setImmediate);
  assert.equal(vm.runInContext('todayInfo', c), null, 'a 503 is not stored as today\'s data');
  assert.equal(timers.length, 1, 'a retry is allowed after a minute');
  timers.shift()();
  assert.equal(vm.runInContext('todayData()', c), null, 'the next card asks again');
  await new Promise(setImmediate); await new Promise(setImmediate);
  assert.deepEqual(vm.runInContext('todayData()', c).matches, {w7: {k: 'born', y: 1900}});
});

test('surprises roll per card: never before the minimum gap, never twice in a row', () => {
  const {run} = client({random: () => 0});
  const ids = run(40);
  const positions = ids.map((id, i) => ['w7', 'w8'].includes(id) ? i : -1).filter(i => i >= 0);
  assert.deepEqual([...positions], [9, 20], 'with a guaranteed roll, surprises land exactly at the minimum gap');
});

test('a failed roll inserts nothing, and each surprise appears once per day', () => {
  assert.ok(client({random: () => 0.99}).run(200).every(id => !['w7', 'w8'].includes(id)));
  const {run, store} = client({random: () => 0});
  run(200);
  assert.deepEqual([...store.ws_today_shown.ids].sort(), ['w7', 'w8'], 'only two candidates, so only two surprises');
});

test('surprises stay out of filtered, deep, help-only and travel feeds', () => {
  for (const options of [{topics: ['science']}, {depth: 4}, {depth: 5}, {help: true}, {mode: 'how'}])
    assert.ok(client({random: () => 0, ...options}).run(60).every(id => !['w7', 'w8'].includes(id)), JSON.stringify(options));
});

test('average spacing is about one in forty', () => {
  let seed = 7; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gaps = [];
  for (let trial = 0; trial < 400; trial++) {
    const {c} = client({random});
    vm.runInContext("todayInfo.seeds=Array.from({length:500},(_,i)=>({id:'w'+(5000+i)}))", c);
    const ids = vm.runInContext(`withTodaySurprises(Array.from({length:400},(_,i)=>({id:'w'+(1000+i)})))`, c).map(a => a.id);
    let last = -1; ids.forEach((id, i) => { if (+id.slice(1) >= 5000) { if (last >= 0) gaps.push(i - last); last = i; } });
  }
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  assert.ok(mean > 34 && mean < 46, 'mean gap ' + mean.toFixed(1));
  assert.ok(Math.min(...gaps) >= 10 && Math.max(...gaps) > 100, 'irregular: short and long gaps both occur');
});
