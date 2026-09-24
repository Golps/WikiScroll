import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const slice = (from, to) => app.slice(app.indexOf(from), app.indexOf(to, app.indexOf(from)));
const topics = new Proxy({}, {get: (_, id) => typeof id === 'string' ? {id} : undefined});

test('category labels follow the head noun of the short description', () => {
  const c = vm.createContext({TOPIC_MAP: topics});
  vm.runInContext(slice('// ── CATEGORY LABELS', '// ── READING ACTIVITY'), c);
  const label = a => c.detectCategory(a)?.id ?? null;
  for (const [desc, expected] of [
    ['American politician', 'people'], ['Catholic prelate', 'people'], ['American film director', 'people'],
    ['1996 single by Peter Andre', 'music'], ['2006 Norwegian family film', 'arts'], ['Species of beetle', 'biology'],
    ['Scottish footballer', 'sports'], ['Irish hurler', 'sports'], ['Village in Worcestershire, England', 'geo'],
    ['Historic house in New York, United States', 'architecture'], ['Unit of the United States Air Force', 'history'],
    ['Railway station in West Yorkshire, England', 'tech'], ['Chemical compound', 'science'], ['Space telescope', 'space'],
    ['Swiss underwear manufacturer', null], ['2024 general election in India', null], ['Topics referred to by the same term', null],
  ]) assert.equal(label({desc}), expected, desc);
  // Without a description, the opening sentence's "is a ..." phrase is used.
  assert.equal(label({body: 'Anthony Thornton (1814 – 1904) was an American attorney who served in the Illinois Senate.'}), 'people');
  assert.equal(label({body: 'Gierczyn is a village where the poet X was born.'}), 'geo');
  assert.equal(label({body: 'Cream of crab soup is a soup prepared with cream and crab meat.'}), 'food');
});

function deepLink(search, pages) {
  const requests = [], toasts = [];
  const c = vm.createContext({
    URLSearchParams, AbortSignal, console,
    LANGS: [{c: 'en'}, {c: 'fr'}, {c: 'de'}], curLang: 'de',
    window: {location: {search, pathname: '/'}, history: {replaceState() {}}},
    stripHtml: s => String(s || '').replace(/<[^>]+>/g, ''), toast: m => toasts.push(m),
    fetch: async url => { requests.push(new URL(url)); return Response.json({query: {pages}}); },
  });
  vm.runInContext(slice('async function resolveDeepLink()', 'async function boot()'), c);
  return {run: () => c.resolveDeepLink(), requests};
}
test('shared links without a language resolve on English Wikipedia, not the reader language', async () => {
  const h = deepLink('?a=w12288061', {12288061: {pageid: 12288061, ns: 0, title: 'Adalrich, Duke of Alsace', extract: 'Adalrich was the Duke of Alsace and founder of the Etichonids.', description: 'Frankish duke'}});
  const article = await h.run();
  assert.equal(h.requests[0].hostname, 'en.wikipedia.org');
  assert.equal(article.title, 'Adalrich, Duke of Alsace'); assert.equal(article.desc, 'Frankish duke');
  const fr = deepLink('?a=w5&lang=fr', {5: {pageid: 5, ns: 0, title: 'Atlas', extract: 'Un atlas est un recueil de cartes géographiques.'}});
  await fr.run(); assert.equal(fr.requests[0].hostname, 'fr.wikipedia.org');
});
test('shared links never open talk, user or project pages', async () => {
  const h = deepLink('?a=w7', {7: {pageid: 7, ns: 3, title: 'Discussion utilisateur:Someone', extract: 'A user talk page that must not appear as an article.'}});
  assert.equal(await h.run(), null);
  assert.equal(await deepLink('?a=x7', {}).run(), null);
});

function geocoder(responses) {
  const requests = [];
  const c = vm.createContext({URL, AbortSignal, console, encodeURIComponent,
    fetch: async url => { requests.push(new URL(url)); return Response.json(responses(new URL(url))); }});
  vm.runInContext(slice('async function geocodePlace(', 'let mapLibraryPromise'), c);
  return {geocodePlace: a => c.geocodePlace(a), requests};
}
test('the map pins Wikivoyage coordinates and keeps disambiguation in the fallback search', async () => {
  const g = geocoder(url => url.hostname.endsWith('wikivoyage.org') ? {query: {pages: {77: {coordinates: [{lat: 33.66, lon: -95.55}]}}}} : []);
  const geo = await g.geocodePlace({id: 'v77', title: 'Paris (Texas)', url: 'https://en.wikivoyage.org/wiki/Paris_(Texas)'});
  assert.deepEqual([geo.lat, geo.lng], [33.66, -95.55]);
  assert.equal(g.requests.length, 1);
  const fallback = geocoder(url => url.hostname.endsWith('wikivoyage.org') ? {query: {pages: {77: {}}}} : [{lat: '33.6', lon: '-95.5', display_name: 'Paris, Lamar County, Texas'}]);
  await fallback.geocodePlace({id: 'v77', title: 'Paris (Texas)', url: 'https://en.wikivoyage.org/wiki/Paris_(Texas)'});
  assert.equal(fallback.requests[1].searchParams.get('q'), 'Paris, Texas');
});

test('browser depth fallback uses complete views and ignores publication lag', () => {
  const c = vm.createContext({Math});
  vm.runInContext(slice('function shuffled(', '// ── CATEGORY LABELS') + slice('const VIEW_SCALE', 'const DEPTH_LABELS') + slice('function viewLag(', '// Browser fallback when the Worker') + slice('function selectDepthPages(', 'async function fetchWikiRandom'), c);
  const page = (pageid, views) => ({pageid, pageviews: views});
  // Day "d3" is null for every page (not yet published); d2 null means zero views.
  const pages = [page(1, {d1: 20, d2: 20, d3: null}), page(2, {d1: 3, d2: null, d3: null}), page(3, {d1: 1, d2: 1, d3: null}), page(4, {})];
  assert.equal(c.avgDailyViews(pages[0], c.viewLag(pages)), 20);
  assert.equal(c.avgDailyViews(pages[1], c.viewLag(pages)), 1.5);
  assert.equal(c.avgDailyViews(pages[3], c.viewLag(pages)), null);
  const obscure = c.selectDepthPages(pages, 5).map(p => p.pageid);
  assert.ok(obscure.includes(2) && obscure.includes(3) && !obscure.includes(4));
});

test('browser copies of Worker language tables stay identical', async () => {
  const worker = await import('../worker/pageviews.js');
  const {VOYAGE_LANGS} = await import('../worker/index.js');
  const c = vm.createContext({});
  vm.runInContext(slice('const VIEW_SCALE', 'const DEPTH_LABELS') + ';globalThis.VIEW_SCALE=VIEW_SCALE;', c);
  assert.deepEqual({...c.VIEW_SCALE}, worker.VIEW_SCALE);
  const v = vm.createContext({curLang: 'en'});
  vm.runInContext(slice('const VOYAGE_LANGS', 'const BAD_TITLE_RE') + ';globalThis.VOYAGE_LANGS=VOYAGE_LANGS;', v);
  assert.deepEqual([...v.VOYAGE_LANGS].sort(), [...VOYAGE_LANGS].sort());
});

test('Wikivoyage mode lists only languages with a Wikivoyage edition', () => {
  const options = ['en', 'ar', 'ko', 'hi', 'he', 'ja'].map(c => ({dataset: {c}, hidden: false}));
  const c = vm.createContext({curMode: 'how', curLang: 'en', document: {querySelectorAll: () => options}});
  vm.runInContext(slice('const VOYAGE_LANGS', 'const BAD_TITLE_RE') + slice('function syncLangOptions(', 'function setLang('), c);
  c.syncLangOptions();
  assert.deepEqual(options.filter(o => o.hidden).map(o => o.dataset.c), ['ar', 'ko', 'hi']);
  vm.runInContext("curMode='wiki';syncLangOptions();", c);
  assert.ok(options.every(o => !o.hidden));
  assert.equal(vm.runInContext("curLang='ko';voyageLang()", c), 'en');
});

test('Help Wikipedia languages match the Worker, and one setting drives tags and hiding', async () => {
  const {HELP_LANGS} = await import('../worker/needs.js');
  const buttons = ['off', 'tags', 'only'].map(choice => ({dataset: {helpChoice: choice}, attrs: {}, tabIndex: 0, classList: {on: false, toggle(n, on) { this.on = on; }}, setAttribute(k, v) { this.attrs[k] = v; }}));
  const c = vm.createContext({curLang: 'en', helpMode: 'off', document: {querySelectorAll: sel => sel === '[data-help-choice]' ? buttons : [], body: {dataset: {}, classList: {state: {}, toggle(n, on) { this.state[n] = on; }}}}});
  vm.runInContext(slice('const HELP_LANGS', '\n') + slice('function helpAvailable(', '\n') + slice('function syncHelpUI(', 'function syncTopicUI(') + ';globalThis.HELP_LANGS=HELP_LANGS;', c);
  assert.deepEqual([...c.HELP_LANGS].sort(), [...HELP_LANGS].sort());
  const state = () => c.document.body.classList.state;
  c.syncHelpUI(); assert.equal(state()['show-needs'], false); assert.equal(state()['help-unavailable'], false);
  assert.deepEqual(buttons.map(b => b.attrs['aria-checked']), ['true', 'false', 'false']);
  for (const mode of ['tags', 'only']) {
    vm.runInContext(`helpMode='${mode}';syncHelpUI()`, c);
    assert.equal(state()['show-needs'], true); assert.equal(c.document.body.dataset.helpMode, mode);
    assert.deepEqual(buttons.map(b => b.tabIndex), ['off', 'tags', 'only'].map(m => m === mode ? 0 : -1));
  }
  vm.runInContext("curLang='ja';syncHelpUI()", c);
  assert.equal(state()['show-needs'], false); assert.equal(state()['help-unavailable'], true);
});

test('only "Only these articles" changes the feed; tags just relabel cards', () => {
  let resets = 0, saves = 0;
  const c = vm.createContext({helpMode: 'off', curMode: 'wiki', curLang: 'en', saveSettings() { saves++; }, syncHelpUI() {}, resetFeed() { resets++; }});
  vm.runInContext(slice('const HELP_LANGS', '\n') + slice('function helpAvailable(', '\n') + slice('const HELP_MODES', '\n') + slice('function setHelpMode(', '\nfunction setTheme('), c);
  vm.runInContext("setHelpMode('tags')", c); assert.equal(resets, 0);
  vm.runInContext("setHelpMode('only')", c); assert.equal(resets, 1);
  vm.runInContext("setHelpMode('off')", c); assert.equal(resets, 2);
  vm.runInContext("setHelpMode('bogus');setHelpMode('off')", c); assert.equal(saves, 3); assert.equal(c.helpMode, 'off');
  vm.runInContext("curLang='ja';setHelpMode('only')", c); assert.equal(resets, 2, 'unsupported languages keep their normal feed');
});

test('earlier Help Wikipedia choices migrate to the three-choice setting', () => {
  const run = (topics, settings) => {
    const store = {ws_topics: topics, ws_settings: settings};
    const c = vm.createContext({
      lsGet: k => store[k] ?? null, lsSet: (k, v) => { store[k] = v; }, liked: new Map(), updateBadge() {}, IDB: {getAll: async () => []},
      TOPIC_MAP: {science: {}}, curTopics: new Set(), syncTopicUI() {}, LANGS: [{c: 'en'}], window: {location: {search: ''}}, applyLangUI() {},
      localStorage: {}, applyTheme() {}, syncAllToggles() {}, curLang: 'en', URLSearchParams,
    });
    vm.runInContext(slice('const HELP_MODES', '\n') + slice('function loadPersistedState(', 'function saveHistory('), c);
    vm.runInContext('loadPersistedState()', c);
    return {mode: c.helpMode, topics: store.ws_topics, saved: store.ws_settings};
  };
  let r = run(['science', 'help'], {help: false});
  assert.equal(r.mode, 'only'); assert.deepEqual([...r.topics], ['science']); assert.equal(r.saved.helpMode, 'only'); assert.equal('help' in r.saved, false);
  r = run(null, {help: true}); assert.equal(r.mode, 'tags'); assert.equal(r.saved.helpMode, 'tags');
  r = run(['science'], {}); assert.equal(r.mode, 'off');
  r = run(null, {helpMode: 'only'}); assert.equal(r.mode, 'only');
});

test('cards show one maintenance tag, the most actionable need, linking to the article', () => {
  const c = vm.createContext({});
  vm.runInContext(slice('const NEED_LABELS', '\n') + ';globalThis.NEED_LABELS=NEED_LABELS;', c);
  const render = app.slice(app.indexOf('  const need    ='), app.indexOf('  const card    ='));
  const ctx = vm.createContext({NEED_LABELS: c.NEED_LABELS, esc: s => String(s), isHow: false, a: {needs: ['citations', 'stub'], url: 'https://en.wikipedia.org/wiki/X'}});
  vm.runInContext(render.replace(/const /g, 'globalThis.'), ctx);
  assert.match(ctx.needHtml, /class="need-tag" href="https:\/\/en\.wikipedia\.org\/wiki\/X" target="_blank" rel="noopener"/);
  assert.match(ctx.needHtml, /📝 Needs citations<\/a>$/);
  const voyage = vm.createContext({NEED_LABELS: c.NEED_LABELS, esc: String, isHow: true, a: {needs: ['citations'], url: 'x'}});
  vm.runInContext(render.replace(/const /g, 'globalThis.'), voyage);
  assert.equal(voyage.needHtml, '');
});
