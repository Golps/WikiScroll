import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = file => fs.readFileSync(new URL('../public/' + file, import.meta.url), 'utf8');
const app = read('app.js'), atlas = read('atlas.js'), css = read('styles.css'), html = read('index.html');
const slice = (source, start, end) => { const from = source.indexOf(start); return source.slice(from, source.indexOf(end, from + start.length)); };

test('a full storage quota gives up the feed reserve instead of losing saves', () => {
  const store = new Map([['ws_feed_reserves', 'x'.repeat(900)]]);
  const size = () => [...store.values()].reduce((sum, value) => sum + value.length, 0);
  const localStorage = {
    setItem(key, value) { const previous = store.get(key) || ''; if (size() - previous.length + value.length > 1000) throw Error('QuotaExceededError'); store.set(key, value); },
    removeItem(key) { store.delete(key); },
  };
  const c = vm.createContext({localStorage, JSON});
  vm.runInContext(slice(app, 'function lsSet(', 'function loadPersistedState('), c);
  vm.runInContext('lsSet("ws_liked", [{id: "w1", title: "' + 'A'.repeat(200) + '"}])', c);
  assert.ok(store.has('ws_liked'), 'the save is kept');
  assert.equal(store.has('ws_feed_reserves'), false, 'the disposable reserve made room');
  store.set('ws_feed_reserves', 'y');
  vm.runInContext('lsSet("ws_feed_reserves", "' + 'z'.repeat(2000) + '")', c);
  assert.ok(store.has('ws_liked'), 'writing the reserve never evicts anything else');
});

test('a stored depth outside 1 to 5 falls back to Balanced', () => {
  for (const [stored, expected] of [[9, 3], ['2', 3], [0, 3], [5, 5], [1, 1]]) {
    const values = {ws_settings: {depth: stored}};
    const c = vm.createContext({
      lsGet: k => values[k] ?? null, lsSet() {}, liked: new Map(), updateBadge() {}, IDB: {getAll: async () => []},
      TOPIC_MAP: {}, curTopics: new Set(), syncTopicUI() {}, LANGS: [{c: 'en'}], window: {location: {search: ''}}, applyLangUI() {},
      localStorage: {}, applyTheme() {}, syncAllToggles() {}, curLang: 'en', URLSearchParams, saveTopics() {}, saveSettings() {},
    });
    vm.runInContext(slice(app, 'const HELP_MODES', '\n') + slice(app, 'function loadPersistedState(', 'function saveHistory('), c);
    vm.runInContext('loadPersistedState()', c);
    assert.equal(c.depthLevel, expected, String(stored));
  }
});

test('article text keeps its own direction inside right-to-left interfaces', () => {
  assert.doesNotMatch(css, /\.rtl-ui \.panel>\.art-(title|body)/, 'no rule forces article text to right-to-left');
  assert.match(css, /\.rtl-ui \.art-title, \.rtl-ui \.art-body \{\s*text-align: start;/);
  assert.match(app, /<h2 class="art-title" dir="auto">/);
  assert.match(app, /<p class="art-body" dir="auto">/);
  for (const cls of ['hi-ttl', 'li-ttl', 'li-body']) assert.match(app, new RegExp(`class="${cls}" dir="auto"`), cls);
  assert.match(html, /id="mapTitle" dir="auto"/);
});

test('collection tabs count only articles that are still saved', () => {
  const tabs = {innerHTML: ''};
  const c = vm.createContext({
    document: {getElementById: () => tabs}, activeCollection: null, liked: new Map([['w1', {}], ['w2', {}]]),
    collections: [{name: 'Sea life', ids: ['w1', 'w2', 'w3']}], esc: s => String(s),
  });
  vm.runInContext(slice(app, 'function renderCollTabs(', 'function createCollection('), c);
  vm.runInContext('renderCollTabs()', c);
  assert.match(tabs.innerHTML, /Sea life \(2\)/);
});

test('creating a collection that already exists explains why nothing happened', () => {
  const toasts = [];
  const c = vm.createContext({collections: [{name: 'Sea life', ids: []}], toast: m => toasts.push(m), saveCollections() {}, renderLikedList() {}});
  vm.runInContext(slice(app, 'function createCollection(', 'function addToCollection('), c);
  vm.runInContext('createCollection("  sea LIFE ")', c);
  assert.equal(c.collections.length, 1);
  assert.deepEqual(toasts, ['A collection with this name already exists']);
  vm.runInContext('createCollection("Mountains")', c);
  assert.equal(c.collections.length, 2);
});

test('external article pages open without access back to WikiScroll', () => {
  const opens = [...app.matchAll(/window\.open\(([^)]*)\)/g)].map(m => m[1]);
  assert.ok(opens.length >= 4);
  for (const args of opens) assert.match(args, /'_blank',\s*'noopener'/, args);
});

test('only the card on screen is in the keyboard Tab order', () => {
  const control = () => ({tabIndex: 0, removed: false, removeAttribute(name) { if (name === 'tabindex') { this.removed = true; this.tabIndex = 0; } }});
  const cards = [0, 1, 2].map(() => { const controls = [control(), control(), control()]; return {controls, querySelectorAll: () => controls}; });
  const feed = {querySelectorAll: () => cards};
  const c = vm.createContext({document: {getElementById: () => feed}, getCurrentFeedCard: () => cards[1]});
  vm.runInContext(slice(atlas, 'function syncCardFocus(', '\n{'), c);
  vm.runInContext('syncCardFocus()', c);
  assert.ok(cards[1].controls.every(x => x.removed));
  assert.ok([cards[0], cards[2]].every(card => card.controls.every(x => x.tabIndex === -1)));
});

test('menu buttons announce whether their panel is open', () => {
  for (const [button, panel] of [['langBtn', 'langDd'], ['burgerBtn', 'burgerMenu'], ['settingsBtn', 'settingsPanel'], ['likesBtn', 'lp'], ['topicsBtn', 'topicSheet']])
    assert.ok(atlas.includes(`['${button}','${panel}']`), button);
  assert.match(atlas, /setAttribute\('aria-expanded'/);
  assert.match(html, /id="feed" role="main"/, 'the feed is the page\'s main landmark');
});

test('light theme secondary text and destructive actions meet 4.5:1 contrast', () => {
  const luminance = hex => { const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i + 1, i + 3), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const light = css.match(/body\.light, body\.light\.how \{([^}]+)\}/)[1];
  const token = name => light.match(new RegExp(`--${name}: (#[0-9a-f]{6})`))[1];
  assert.ok(ratio(token('muted'), token('surface-alt')) >= 4.5);
  assert.ok(ratio(token('muted'), '#ffffff') >= 4.5);
  const red = css.match(/body\.light #likedList \.li-btn\[data-unlike\]\{border-color:(#[0-9a-f]{6});color:(#[0-9a-f]{6})\}/);
  assert.ok(red && ratio(red[2], '#ffffff') >= 4.5);
  assert.doesNotMatch(app, /id="deleteCollBtn" style=/, 'the delete button colour comes from the theme');
});

test('no rule names a web font that the site never loads', () => {
  assert.doesNotMatch(css, /Syne/);
  assert.doesNotMatch(css, /@font-face/);
});

test('an open drawer takes keyboard focus, keeps it out of the feed, and gives it back', () => {
  const observers = [], listeners = {};
  const el = (name, parent = null) => ({name, parent, isConnected: true, focus() { doc.activeElement = this; }, closest(sel) { return sel.includes('.hdr') && name.startsWith('header') ? this : sel === '[inert]' ? null : null; }});
  const drawer = name => {
    const d = {name, open: false, children: [], classList: {contains: c => c === 'open' && d.open}};
    d.contains = node => node === d || d.children.includes(node);
    d.querySelector = () => d.children[0];
    return d;
  };
  const settings = drawer('settings'), saved = drawer('saved');
  settings.children.push(el('settings-close')); saved.children.push(el('saved-close'));
  const headerButton = el('header-settings'), feed = el('feed');
  const doc = {activeElement: headerButton, body: el('body'), querySelectorAll: () => [settings, saved], addEventListener: (type, fn) => { listeners[type] = fn; }};
  const c = vm.createContext({document: doc, MutationObserver: class { constructor(fn) { observers.push(fn); } observe() {} }});
  vm.runInContext(slice(atlas, '// An open drawer receives keyboard focus', '// Menu buttons tell'), c);
  const notify = () => observers[0]();
  settings.open = true; notify();
  assert.equal(doc.activeElement.name, 'settings-close', 'focus moves into the drawer');
  listeners.focusin({target: feed});
  assert.equal(doc.activeElement.name, 'settings-close', 'focus cannot land on the feed behind the drawer');
  listeners.focusin({target: headerButton});
  assert.equal(doc.activeElement.name, 'settings-close', 'focus changes within the header are not fought');
  doc.activeElement = settings.children[0]; settings.open = false; saved.open = true; notify();
  assert.equal(doc.activeElement.name, 'saved-close', 'moving to another drawer moves focus with it');
  doc.activeElement = doc.body; saved.open = false; notify();
  assert.equal(doc.activeElement.name, 'header-settings', 'closing returns focus to the control that opened the first drawer');
  settings.open = true; notify(); doc.activeElement = feed; settings.open = false; notify();
  assert.equal(doc.activeElement.name, 'feed', 'a deliberate move to the feed (Escape) is kept');
});

test('a shared Wikivoyage guide opens in Wikivoyage mode without loading the feed twice', () => {
  let resets = 0;
  const node = () => ({className: '', classList: {toggle() {}, remove() {}}});
  const els = {};
  const c = vm.createContext({
    curMode: 'wiki', curLang: 'en', VOYAGE_LANGS: new Set(['en']), VOYAGE_NOTE: '', toast() {}, closeTopicSheet() {}, syncLangOptions() {}, syncActivityDisplay() {},
    resetFeed: () => { resets++; }, document: {getElementById: id => (els[id] ||= node()), body: node()},
  });
  vm.runInContext(slice(app, 'function setMode(', "document.getElementById('wBtn').addEventListener"), c);
  vm.runInContext("setMode('how', false)", c);
  assert.equal(c.curMode, 'how'); assert.equal(els.hBtn.className, 'tbtn hon on'); assert.equal(resets, 0);
  vm.runInContext("setMode('wiki')", c);
  assert.equal(resets, 1, 'a normal mode change still reloads the feed');
  assert.match(app, /if \(\/\^v\[1-9\]\\d\{0,11\}\$\/\.test\(new URLSearchParams\(location\.search\)\.get\('a'\) \|\| ''\)\) setMode\('how', false\);/);
});
