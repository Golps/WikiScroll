import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Page IDs repeat across editions: saving Spanish w123 must not replace or
// remove English w123, in saved articles, collections, history or offline copies.
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const features = fs.readFileSync(new URL('../public/features.js', import.meta.url), 'utf8');
const slice = (from, to) => app.slice(app.indexOf(from), app.indexOf(to, app.indexOf(from)));
const en = {id: 'w123', src: 'wiki', title: 'English page', body: 'x'.repeat(40), url: 'https://en.wikipedia.org/wiki/English_page'};
const es = {id: 'w123', src: 'wiki', title: 'Página española', body: 'y'.repeat(40), url: 'https://es.wikipedia.org/wiki/P%C3%A1gina'};

function harness(stored = {}, idb = []) {
  const values = {...stored}, db = new Map(idb.map(a => [a.id, a])), buttons = new Map();
  const c = vm.createContext({
    lsGet: k => values[k] ?? null, lsSet: (k, v) => { values[k] = JSON.parse(JSON.stringify(v)); }, liked: new Map(), updateBadge() {},
    IDB: {getAll: async () => [...db.values()], put: a => db.set(a.id, a), delete: id => db.delete(id)},
    TOPIC_MAP: {}, curTopics: new Set(), syncTopicUI() {}, LANGS: [{c: 'en'}, {c: 'es'}], window: {location: {search: ''}}, applyLangUI() {},
    localStorage: {}, applyTheme() {}, syncAllToggles() {}, curLang: 'en', URLSearchParams, URL, saveTopics() {}, saveSettings() {},
    renderLikedList() {}, atlasIcon: {bookmark: ''}, requestAnimationFrame: fn => fn(), history: [], collections: [], articles: [],
    document: {getElementById: id => { if (!buttons.has(id)) buttons.set(id, {className: 'act', innerHTML: ''}); return buttons.get(id); }},
  });
  vm.runInContext('var history=[],collections=[],articles=[];' + slice('const HELP_MODES', '\n') + slice('// Page IDs repeat across editions', '\n// ── INDEXEDDB')
    + slice('function trackHistory(', 'function renderHistory(') + slice('function toggleLike(', 'function updateBadge(') + slice('function removeFromCollection(', '\n}\n') + '\n}\n', c);
  return {c, values, db, buttons, run: code => vm.runInContext(code, c)};
}

test('the same page ID in two languages is saved, collected and removed separately', () => {
  const h = harness();
  h.c.articles.push(en); h.run('toggleLike("w123")');
  h.c.articles.length = 0; h.c.articles.push(es); h.run('toggleLike("w123")');
  assert.deepEqual([...h.c.liked.keys()], ['w123', 'es:w123'], 'both saved');
  assert.deepEqual([...h.db.keys()], ['w123', 'es:w123'], 'both kept offline');
  assert.equal(h.c.liked.get('es:w123').title, 'Página española');
  // Unsaving the Spanish card from the Spanish feed leaves the English save.
  h.run('toggleLike("w123")');
  assert.deepEqual([...h.c.liked.keys()], ['w123']);
  assert.equal(h.c.liked.get('w123').title, 'English page');
  // Removing the English save from Saved Articles does not touch the Spanish card's button.
  h.run('toggleLike("w123"); removeLike("w123")');
  assert.deepEqual([...h.c.liked.keys()], ['es:w123']);
  assert.match(h.buttons.get('lb-w123').innerHTML, /Saved/, 'the Spanish card on screen is still saved');
});

test('history keeps the same page ID in two languages as two entries', () => {
  const h = harness();
  h.run('trackHistory(' + JSON.stringify(en) + '); trackHistory(' + JSON.stringify(es) + '); trackHistory(' + JSON.stringify(en) + ')');
  assert.deepEqual([...h.c.history.map(x => x.title)], ['English page', 'Página española']);
  assert.ok(h.c.history.every(x => x.id === 'w123'), 'history keeps the plain page ID');
});

test('saves from before language-aware keys are re-keyed, with their collections and offline copies', async () => {
  const oldEs = {...es, id: 'w777'};
  const h = harness({ws_liked: [en, oldEs], ws_collections: [{name: 'Trip', ids: ['w777', 'w123', 'w5']}]}, [en, oldEs]);
  h.run('loadPersistedState()');
  assert.deepEqual([...h.c.liked.keys()], ['w123', 'es:w777']);
  assert.deepEqual(h.values.ws_liked.map(a => a.id), ['w123', 'es:w777']);
  assert.deepEqual(h.values.ws_collections[0].ids, ['es:w777', 'w123', 'w5'], 'unsaved members are kept');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual([...h.db.keys()].sort(), ['es:w777', 'w123'], 'offline copy moved to the new key');
  // Running again changes nothing.
  const again = harness({ws_liked: h.values.ws_liked, ws_collections: h.values.ws_collections}, [...h.db.values()]);
  again.run('loadPersistedState()');
  assert.deepEqual([...again.c.liked.keys()], ['w123', 'es:w777']);
  assert.equal(again.values.ws_collections, h.values.ws_collections, 'nothing rewritten');
});

test('shared links, collection snapshots and the map use the plain page ID', () => {
  assert.match(app, /\?a=\$\{encodeURIComponent\(wireId\(a\.id\)\)\}/);
  assert.match(app, /const id = wireId\(article\?\.id\), host/);
  assert.match(features, /return \{id:wireId\(a\.id\),lang,/);
  assert.match(features, /const key=a\.lang==='en'\?a\.id:a\.lang\+':'\+a\.id;ids\.push\(key\)/);
});
