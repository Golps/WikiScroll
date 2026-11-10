import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const features = fs.readFileSync(new URL('../public/features.js', import.meta.url), 'utf8');
const section = (source, from, to) => {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `Missing source section: ${from}`);
  return source.slice(start, end);
};
const copy = value => JSON.parse(JSON.stringify(value));
const error = 'Could not save collection changes. Device storage is full or unavailable. Try again.';
const article = {id: 'w12', lang: 'en', title: 'Example', body: 'Verified example', img: ''};

function harness(initial = [{name: 'First', ids: ['w1']}]) {
  const stored = new Map([
    ['ws_collections', JSON.stringify(initial)],
    ['ws_liked', JSON.stringify([{id: 'w1', title: 'Already saved'}])],
    ['ws_feed_reserves', 'cache'],
  ]);
  const messages = [], writes = [], removed = [], offline = [], nodes = new Map();
  let reject = () => false, renders = 0, badges = 0;
  const node = () => ({value: '', listeners: {}, children: [], hidden: false, style: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    append(child) { this.children.push(child); },
    querySelector(selector) { return this.nodes[selector] ||= node(); }, nodes: {},
    setCustomValidity() {}, reportValidity() {}, focus() {}, remove() {},
    showModal() { this.open = true; }, close() { this.open = false; this.closed = (this.closed || 0) + 1; },
  });
  const dialog = node();
  const context = vm.createContext({
    localStorage: {
      getItem: key => stored.get(key) ?? null,
      setItem: (key, value) => { writes.push(key); if (reject(key, value)) throw Error('QuotaExceededError'); stored.set(key, value); },
      removeItem: key => { removed.push(key); stored.delete(key); },
    },
    collections: copy(initial), liked: new Map([['w1', {id: 'w1', title: 'Already saved'}]]), activeCollection: 0,
    toast: message => messages.push(message), renderLikedList: () => renders++, updateBadge: () => badges++,
    setTimeout: () => 1, clearTimeout() {}, IDB: {put: value => offline.push(copy(value))},
    cloneUiTemplate: () => dialog, window: {},
    document: {activeElement: null, body: node(), createElement: node,
      querySelector: () => dialog.open ? dialog.querySelector('.collection-save-error') : null,
      getElementById: id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); }},
  });
  const run = code => vm.runInContext(code, context);
  run(section(app, 'function lsGet(', '// Page IDs repeat'));
  run(section(app, 'function saveCollections(', '\n'));
  run(section(app, 'function collectionSaveFailed(', '// ── DEPTH ENGINE'));
  run(section(features, 'function saveImportedCollection(', 'const importCode='));
  return {context, run, stored, messages, writes, removed, offline, nodes, dialog,
    read: key => JSON.parse(stored.get(key)), fail: fn => { reject = fn; },
    get renders() { return renders; }, get badges() { return badges; },
  };
}

function unchanged(h, action) {
  const before = copy(h.context.collections), stored = h.stored.get('ws_collections');
  h.fail(key => key === 'ws_collections');
  h.run(action);
  assert.deepEqual(copy(h.context.collections), before);
  assert.equal(h.stored.get('ws_collections'), stored);
  assert.deepEqual(h.messages, [error]);
  assert.equal(h.renders, 0);
}

test('storage reports success only after a write, recovering cache space once', () => {
  const h = harness();
  let attempts = 0;
  h.fail(key => key === 'ws_collections' && ++attempts === 1);
  assert.equal(h.run('saveCollections()'), true);
  assert.equal(attempts, 2);
  assert.deepEqual(h.removed, ['ws_feed_reserves']);
  h.fail(() => true);
  assert.equal(h.run('saveCollections()'), false);
  const removed = h.removed.length;
  assert.equal(h.run('lsSet("ws_feed_reserves", [])'), false);
  assert.equal(h.removed.length, removed, 'cache writes do not discard themselves to retry');
});

test('failed creation leaves no phantom collection; retry persists all initial members once', () => {
  const h = harness();
  unchanged(h, 'createCollection("Trip", ["w12"])');
  h.fail(() => false);
  assert.equal(h.run('createCollection("Trip", ["w12"])'), true);
  assert.deepEqual(h.read('ws_collections'), [{name: 'First', ids: ['w1']}, {name: 'Trip', ids: ['w12']}]);
  assert.deepEqual(copy(h.context.collections), h.read('ws_collections'));
  assert.equal(h.run('createCollection("trip")'), false);
  assert.equal(h.context.collections.length, 2);
});

test('failed add leaves existing membership unchanged, and retry adds only once', () => {
  const h = harness();
  unchanged(h, 'addToCollection(0, "w12")');
  h.fail(() => false);
  assert.equal(h.run('addToCollection(0, "w12")'), true);
  const writes = h.writes.length;
  assert.equal(h.run('addToCollection(0, "w12")'), true);
  assert.equal(h.writes.length, writes);
  assert.deepEqual(h.read('ws_collections')[0].ids, ['w1', 'w12']);
});

test('failed remove does not hide an article from the collection', () => {
  const h = harness();
  unchanged(h, 'removeFromCollection(0, "w1")');
  h.fail(() => false);
  h.run('removeFromCollection(0, "w1")');
  assert.deepEqual(h.read('ws_collections')[0].ids, []);
  assert.equal(h.context.liked.has('w1'), true, 'removing membership never unsaves the article');
});

test('failed delete preserves the collection, active tab and undo state', () => {
  const h = harness();
  unchanged(h, 'deleteCollection(0)');
  assert.equal(h.context.activeCollection, 0);
  assert.equal(h.run('deletedCollection'), null);
});

test('failed undo remains retryable and only restores a collection after storage succeeds', () => {
  const h = harness();
  h.run('deleteCollection(0)');
  assert.deepEqual(h.read('ws_collections'), []);
  h.fail(key => key === 'ws_collections');
  h.run('undoDeleteCollection()');
  assert.deepEqual(copy(h.context.collections), []);
  assert.deepEqual(h.read('ws_collections'), []);
  assert.equal(h.run('deletedCollection.col.name'), 'First');
  assert.deepEqual(h.messages, [error]);
  h.fail(() => false);
  h.run('undoDeleteCollection()');
  assert.deepEqual(h.read('ws_collections'), [{name: 'First', ids: ['w1']}]);
  assert.equal(h.run('deletedCollection'), null);
});

test('new-collection button and Enter retain the typed name on failure', () => {
  for (const event of ['click', 'keydown']) {
    const h = harness();
    h.run(section(app, "document.getElementById('collNewBtn').addEventListener", '// ── SHARE'));
    const input = h.nodes.get('collNewInput'); input.value = 'Trip';
    const submit = event === 'click' ? h.nodes.get('collNewBtn').listeners.click : () => input.listeners.keydown({key: 'Enter', target: input});
    h.fail(key => key === 'ws_collections'); submit();
    assert.equal(input.value, 'Trip');
    assert.deepEqual(h.messages, [error]);
    h.fail(() => false); submit();
    assert.equal(input.value, '');
    assert.equal(h.read('ws_collections')[1].name, 'Trip');
  }
});

test('chooser keeps new name and dialog open after failure, then closes after durable retry', () => {
  const h = harness();
  h.run(app.slice(app.indexOf('function openCollectionChooser(')));
  h.run('openCollectionChooser("w1")');
  const input = h.dialog.querySelector('input'), form = h.dialog.querySelector('form');
  input.value = 'Trip'; h.fail(key => key === 'ws_collections');
  form.onsubmit({preventDefault() {}});
  assert.equal(h.dialog.open, true); assert.equal(input.value, 'Trip');
  assert.equal(h.dialog.querySelector('.collection-save-error').textContent, error);
  assert.deepEqual(h.messages, [], 'modal failures do not use an inert body toast');
  assert.equal(h.context.collections.length, 1);
  h.fail(() => false); form.onsubmit({preventDefault() {}});
  assert.equal(h.dialog.open, false);
  assert.deepEqual(h.read('ws_collections')[1], {name: 'Trip', ids: ['w1']});
});

test('chooser existing-collection button stays open if persistence fails', () => {
  const h = harness([{name: 'First', ids: []}]);
  h.run(app.slice(app.indexOf('function openCollectionChooser(')));
  h.run('openCollectionChooser("w1")');
  const button = h.dialog.querySelector('.collection-options').children[0];
  h.fail(key => key === 'ws_collections'); button.onclick();
  assert.equal(h.dialog.open, true);
  assert.equal(h.dialog.querySelector('.collection-save-error').textContent, error);
  assert.deepEqual(h.messages, []);
  h.fail(() => false); button.onclick();
  assert.equal(h.dialog.open, false); assert.deepEqual(h.read('ws_collections')[0].ids, ['w1']);
});

test('import fails without mutation or success when the article snapshot cannot be stored', () => {
  const h = harness(); h.context.data = {name: 'Shared', items: [article]};
  h.fail(key => key === 'ws_liked');
  assert.equal(h.run('saveImportedCollection(data)'), false);
  assert.deepEqual([...h.context.liked.keys()], ['w1']);
  assert.equal(h.context.collections.length, 1); assert.equal(h.offline.length, 0);
  assert.deepEqual(h.messages, [error]); assert.equal(h.renders, 0);
  assert.deepEqual(h.read('ws_liked'), [{id: 'w1', title: 'Already saved'}]);
});

test('import rolls back article storage if collection write fails, then retries without duplicates', () => {
  const h = harness(); h.context.data = {name: 'Shared', items: [article]};
  h.fail(key => key === 'ws_collections');
  assert.equal(h.run('saveImportedCollection(data)'), false);
  assert.deepEqual(h.read('ws_liked'), [{id: 'w1', title: 'Already saved'}]);
  assert.deepEqual([...h.context.liked.keys()], ['w1']);
  assert.equal(h.context.collections.length, 1); assert.equal(h.offline.length, 0);
  assert.deepEqual(h.messages, [error]);
  h.fail(() => false);
  assert.equal(h.run('saveImportedCollection(data)'), true);
  assert.deepEqual(h.read('ws_collections')[1], {name: 'Shared', ids: ['w12']});
  assert.deepEqual(h.read('ws_liked').map(a => a.id), ['w1', 'w12']);
  assert.equal(h.offline.length, 1); assert.equal(h.context.activeCollection, 1);
  assert.deepEqual(h.messages, [error, 'Collection saved']);
});

test('if rollback is also refused, imported articles remain visible but no collection success is claimed', () => {
  const h = harness(); h.context.data = {name: 'Shared', items: [article]};
  h.fail((key, value) => key === 'ws_collections' || (key === 'ws_liked' && JSON.parse(value).length === 1));
  assert.equal(h.run('saveImportedCollection(data)'), false);
  assert.deepEqual([...h.context.liked.keys()], ['w1', 'w12']);
  assert.deepEqual(h.read('ws_liked').map(a => a.id), ['w1', 'w12']);
  assert.equal(h.context.collections.length, 1); assert.deepEqual(h.messages, [error]);
  assert.equal(h.renders, 1); assert.equal(h.badges, 1); assert.equal(h.offline.length, 1);
  h.fail(() => false);
  assert.equal(h.run('saveImportedCollection(data)'), true);
  assert.deepEqual(h.read('ws_liked').map(a => a.id), ['w1', 'w12']);
  assert.deepEqual(h.read('ws_collections')[1], {name: 'Shared', ids: ['w12']});
  assert.equal(h.offline.length, 1, 'retained article already has its offline mirror');
  assert.deepEqual(h.messages, [error, 'Collection saved']);
});

test('successful import keeps language-specific keys, old saves, and unique collection names', () => {
  const h = harness(); h.context.data = {name: 'First', items: [article, {...article, lang: 'es'}, {...article, id: 'v15', lang: 'he'}]};
  assert.equal(h.run('saveImportedCollection(data)'), true);
  assert.deepEqual(h.read('ws_collections')[1], {name: 'First (copy)', ids: ['w12', 'es:w12', 'he:v15']});
  assert.deepEqual(h.read('ws_liked').map(a => a.id), ['w1', 'w12', 'es:w12', 'he:v15']);
  assert.equal(h.context.liked.get('he:v15').url, 'https://he.wikivoyage.org/?curid=15');
  assert.equal(h.context.liked.get('es:w12').url, 'https://es.wikipedia.org/?curid=12');
  assert.equal(h.offline.length, 3); assert.deepEqual(h.messages, ['Collection saved']);
});

test('import dialog closes only after saveImportedCollection reports success', () => {
  const handler = features.match(/save\.onclick=\(\)=>\{if\(saveImportedCollection\(data\)\)dlg\.close\(\);\};/);
  assert.ok(handler);
  for (const succeeds of [false, true]) {
    let closed = false;
    const context = vm.createContext({save: {}, data: {}, dlg: {close: () => { closed = true; }}, saveImportedCollection: () => succeeds});
    vm.runInContext(handler[0] + 'save.onclick()', context);
    assert.equal(closed, succeeds);
  }
});


test('both collection dialogs keep an alert region inside the modal for persistence errors', () => {
  const templates = fs.readFileSync(new URL('../src/components/collections/CollectionDialogs.astro', import.meta.url), 'utf8');
  const dialogs = [...templates.matchAll(/<dialog\b[^>]*>([\s\S]*?)<\/dialog>/g)];
  assert.equal(dialogs.length, 2);
  for (const [, content] of dialogs) assert.match(content, /<div class="collection-save-error" role="alert" aria-atomic="true"><\/div>/);
  const h = harness(); h.dialog.open = true;
  h.context.window.WSI18n = {translate: message => 'Translated: ' + message};
  assert.equal(h.run('collectionSaveFailed()'), false);
  assert.equal(h.dialog.querySelector('.collection-save-error').textContent, 'Translated: ' + error);
  assert.deepEqual(h.messages, []);
});

test('the storage failure explanation is translated in every supported non-English language', () => {
  const context = vm.createContext({window: {}});
  const directory = new URL('../public/translations/', import.meta.url);
  for (const file of fs.readdirSync(directory)) vm.runInContext(fs.readFileSync(new URL(file, directory), 'utf8'), context);
  const dictionaries = Object.entries(context.window.WS_TRANSLATIONS);
  assert.equal(dictionaries.length, 14);
  for (const [lang, dictionary] of dictionaries) assert.ok(dictionary[error] && dictionary[error] !== error, lang);
});
