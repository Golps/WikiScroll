import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// The same page number means different articles in different languages:
// saves, history and collections must never confuse them.
const read = file => fs.readFileSync(new URL('../public/' + file, import.meta.url), 'utf8');
const app = read('app.js'), features = read('features.js');
const slice = (source, start, end) => { const from = source.indexOf(start); return source.slice(from, source.indexOf(end, from + start.length)); };
const en = {id: 'w123', src: 'wiki', title: 'Dog', body: 'An English introduction.', url: 'https://en.wikipedia.org/wiki/Dog'};
const es = {id: 'w123', src: 'wiki', title: 'Perro', body: 'Una introducción en español.', url: 'https://es.wikipedia.org/wiki/Perro'};

function savesHarness(articles) {
  const idb = new Map(), frames = [];
  const c = vm.createContext({
    URL, document: {getElementById: () => null}, IDB: {put: a => idb.set(a.id, a), delete: id => idb.delete(id)},
    updateBadge() {}, renderLikedList() {}, atlasIcon: {bookmark: ''}, requestAnimationFrame: fn => frames.push(fn), saveLiked() {}, saveHistory() {},
  });
  vm.runInContext(`let articles = ${JSON.stringify(articles)}, liked = new Map(), history = [];` +
    slice(app, 'function articleLang(', '// Earlier versions stored') + slice(app, 'function toggleLike(', 'function updateBadge(') +
    slice(app, 'function trackHistory(', 'function renderHistory('), c);
  return {c, idb, run: code => { const v = vm.runInContext(code, c); return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v; }};
}

test('saving a Spanish article never replaces the English save with the same number', () => {
  const h = savesHarness([en]);
  h.run('toggleLike("w123")');
  h.run(`articles = [${JSON.stringify(es)}]; toggleLike("w123")`);
  assert.deepEqual(h.run('[...liked.keys()]'), ['w123', 'es:w123'], 'English keeps its plain ID; Spanish gets a language key');
  assert.deepEqual([...h.idb.keys()], ['w123', 'es:w123'], 'both offline copies are kept');
  assert.equal(h.run('liked.get("w123").title'), 'Dog');
  assert.equal(h.run('isSaved("w123")'), true, 'the Spanish card shows as saved');
  h.run('toggleLike("w123")');
  assert.deepEqual(h.run('[...liked.keys()]'), ['w123'], 'unsaving the Spanish article leaves the English one');
  assert.deepEqual([...h.idb.keys()], ['w123']);
  h.run('removeLike("w123")');
  assert.equal(h.run('liked.size'), 0);
});

test('history keeps the same page in two languages as two entries', () => {
  const h = savesHarness([]);
  h.run(`trackHistory(${JSON.stringify(en)}); trackHistory(${JSON.stringify(es)}); trackHistory(${JSON.stringify(en)})`);
  assert.deepEqual(h.run('history.map(x => x.id)'), ['w123', 'es:w123'], 'a repeat view moves its own entry only');
});

test('saves from earlier versions move to language keys, with their collections, offline copies and history', async () => {
  const oldEs = {...es, id: 'w5'}, oldEn = {...en, id: 'w6'}, oldVoyage = {id: 'v7', src: 'how', title: 'Kioto', body: 'Guía.', url: 'https://es.wikivoyage.org/wiki/Kioto'};
  const values = {
    ws_liked: [oldEs, oldEn, oldVoyage],
    ws_collections: [{name: 'Viajes', ids: ['w5', 'w6', 'v7']}],
    ws_history: [{id: 'w5', url: oldEs.url, title: 'Perro'}, {id: 'w6', url: oldEn.url, title: 'Dog'}],
  };
  const written = {}, idb = new Map([['w5', {...oldEs}], ['w6', {...oldEn}], ['v7', {...oldVoyage}]]);
  let hydrated;
  const c = vm.createContext({
    URL, lsGet: k => structuredClone(values[k] ?? null), lsSet: (k, v) => { written[k] = structuredClone(v); }, liked: new Map(), updateBadge() {},
    IDB: {getAll: () => (hydrated = Promise.resolve([...idb.values()].map(a => ({...a})))), put: a => idb.set(a.id, a), delete: id => idb.delete(id)},
    TOPIC_MAP: {}, curTopics: new Set(), syncTopicUI() {}, LANGS: [{c: 'en'}], window: {location: {search: ''}}, applyLangUI() {},
    localStorage: {}, applyTheme() {}, syncAllToggles() {}, curLang: 'en', URLSearchParams, saveTopics() {}, saveSettings() {},
  });
  vm.runInContext(slice(app, 'const HELP_MODES', '\n') + slice(app, 'function loadPersistedState(', '// ── INDEXEDDB'), c);
  vm.runInContext('loadPersistedState()', c);
  await hydrated; await new Promise(r => setTimeout(r));
  assert.deepEqual([...c.liked.keys()], ['es:w5', 'w6', 'es:v7'], 'English saves are untouched');
  assert.deepEqual(written.ws_liked.map(a => a.id), ['es:w5', 'w6', 'es:v7']);
  assert.deepEqual(written.ws_collections[0].ids, ['es:w5', 'w6', 'es:v7'], 'collections follow');
  assert.deepEqual(written.ws_history.map(h => h.id), ['es:w5', 'w6'], 'history follows');
  assert.deepEqual([...idb.keys()].sort(), ['es:v7', 'es:w5', 'w6'], 'offline copies move to the new keys');
  // Loading again changes nothing.
  for (const k of Object.keys(written)) values[k] = written[k];
  for (const k of Object.keys(written)) delete written[k];
  c.liked = new Map();
  vm.runInContext('loadPersistedState()', c);
  await hydrated; await new Promise(r => setTimeout(r));
  assert.deepEqual(Object.keys(written), [], 'a second load writes nothing');
});

test('shared links and shared collections still use the plain page number', () => {
  const c = vm.createContext({URL, liked: new Map([['es:w123', {...es, id: 'es:w123'}]]), collections: [{name: 'Perros', ids: ['es:w123']}], activeCollection: 0});
  vm.runInContext(slice(app, 'function articleLang(', '// Earlier versions stored') + slice(features, 'function snapshotItems(', 'function renderCollectionShare('), c);
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('snapshotItems()', c))), [{id: 'w123', lang: 'es', title: 'Perro', body: es.body}]);
  assert.match(app, /data-share-id="\$\{esc\(pageId\(a\.id\)\)\}"/, 'Share builds its link from the plain ID');
  assert.match(features, /saved\.id=saveKey\(saved\);ids\.push\(saved\.id\)/, 'an imported collection is saved under language keys');
});
