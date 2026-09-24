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

test('a deleted collection can be restored for a few seconds, from inside the Saved panel', () => {
  const timers = [];
  const c = vm.createContext({
    collections: [{name: 'Sea life', ids: ['w1']}, {name: 'Mountains', ids: ['w2']}], activeCollection: 0, saveCollections() {},
    renderLikedList() {}, document: {getElementById: () => ({focus() {}})},
    setTimeout: (fn, ms) => { timers.push({fn, ms}); return timers.length; }, clearTimeout() {},
  });
  vm.runInContext(slice(app, 'let deletedCollection', '// ── DEPTH ENGINE') + slice(app, 'function undoNotice(', '\n}') + '\n}', c);
  vm.runInContext('deleteCollection(0)', c);
  assert.deepEqual(c.collections.map(x => x.name), ['Mountains']);
  assert.match(vm.runInContext('undoNotice()', c), /role="status".*Collection deleted.*id="undoDeleteBtn">Undo</);
  assert.equal(timers[0].ms, 8000);
  vm.runInContext('undoDeleteCollection()', c);
  assert.deepEqual(c.collections.map(x => x.name), ['Sea life', 'Mountains'], 'restored in its old place');
  assert.equal(c.activeCollection, 0, 'and shown again');
  assert.equal(vm.runInContext('undoNotice()', c), '');
  // After the notice expires, the deletion is final.
  vm.runInContext('deleteCollection(1)', c); timers.at(-1).fn();
  vm.runInContext('undoDeleteCollection()', c);
  assert.deepEqual(c.collections.map(x => x.name), ['Sea life']);
  assert.match(app, /if \(btn\.id === 'undoDeleteBtn'\) undoDeleteCollection\(\);/);
});

test('Remove inside a collection takes the article out of that collection only', () => {
  const c = vm.createContext({collections: [{name: 'Sea life', ids: ['w1', 'w2']}], saveCollections() {}, renderLikedList() {}, setTimeout, clearTimeout, document: {}});
  vm.runInContext(slice(app, 'let deletedCollection', '// ── DEPTH ENGINE'), c);
  vm.runInContext('removeFromCollection(0, "w1")', c);
  assert.deepEqual(c.collections[0].ids, ['w2']);
  // The list renders a collection-only Remove inside a collection, and unsaves in "All".
  assert.match(app, /activeCollection !== null \? `data-uncollect="\$\{esc\(a\.id\)\}" aria-label="Remove from this collection"/);
  assert.match(app, /else if \(btn\.dataset\.uncollect\) removeFromCollection\(activeCollection, btn\.dataset\.uncollect\);/);
});

test('History opens a saved article from its offline copy when there is no connection', () => {
  const handler = slice(app, "document.getElementById('historyList').addEventListener('click', ev => {", '\n});');
  const run = online => {
    const calls = [];
    const c = vm.createContext({navigator: {onLine: online}, liked: new Map([['w1', {id: 'w1', url: 'https://en.wikipedia.org/?curid=1'}]]),
      openAmbient: card => calls.push('ambient ' + card.dataset.id), window: {open: url => calls.push('open ' + url)},
      document: {getElementById: () => ({addEventListener: (type, fn) => fn({target: {closest: () => ({dataset: {url: 'https://en.wikipedia.org/?curid=1'}})}})})}});
    vm.runInContext(handler + '\n});', c);
    return calls;
  };
  assert.deepEqual(run(false), ['ambient w1']);
  assert.deepEqual(run(true), ['open https://en.wikipedia.org/?curid=1']);
});

test('the installable app describes its language and store categories', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.lang, 'en');
  assert.equal(manifest.dir, 'auto');
  assert.deepEqual(manifest.categories, ['education', 'books', 'travel']);
});

test('filtered travel sends the place as typed, skips empty pages and keeps the spelling suggestion', async () => {
  const features = read('features.js');
  const requests = [];
  const pages = [{articles: [], next: 30}, {articles: [], next: 60}, {articles: [{id: 'v1'}, {id: 'v2'}], next: null, suggestion: 'Japan'}];
  const c = vm.createContext({
    fillGeneration: 1, travelFilters: {place: 'Japan, Tuscany', style: 'coast'}, travelOffset: 0, travelExhausted: false, travelSuggestion: '',
    articles: [{id: 'v2'}], queue: [], voyageLang: () => 'en', URLSearchParams, AbortSignal: {timeout: () => undefined},
    fetch: async url => { requests.push(new URL(url, 'https://wikiscroll.com').searchParams); return {ok: true, json: async () => pages.shift()}; },
  });
  vm.runInContext(slice(features, 'async function fetchFilteredTravel(', '// When a travel filter runs out'), c);
  const result = await vm.runInContext('fetchFilteredTravel()', c);
  assert.deepEqual(result.map(a => a.id), ['v1'], 'already shown guides are skipped');
  assert.equal(requests[0].get('place'), 'Japan, Tuscany', 'commas reach the Worker');
  assert.deepEqual(requests.map(p => p.get('offset')), ['0', '30', '60'], 'empty pages are skipped at once');
  assert.equal(c.travelExhausted, true);
  assert.equal(c.travelSuggestion, 'Japan');
});

test('the end of a travel filter offers the closest next step first', () => {
  const features = read('features.js');
  const el = (tag = 'div') => {
    const node = {tag, children: [], dataset: {}, className: '', textContent: '', append(...items) { this.children.push(...items); }, set innerHTML(html) { this._html = html; this.children = []; }, get innerHTML() { return this._html; },
      querySelector(sel) { return (this._parts ||= {})[sel] ||= el(); }};
    return node;
  };
  const run = (filters, found, suggestion) => {
    const feed = el(), created = [];
    feed.querySelector = sel => sel === '.card[data-id]' ? (found ? {} : null) : null;
    feed.appendChild = card => { feed.card = card; };
    const c = vm.createContext({travelFilters: filters, travelSuggestion: suggestion, openTravelFilters() {}, document: {getElementById: () => feed, createElement: tag => { const n = el(tag); created.push(n); return n; }}});
    vm.runInContext(slice(features, 'const TRAVEL_STYLE_LABELS', 'function setTravelFilters('), c);
    vm.runInContext('showTravelEnd()', c);
    return {buttons: created.filter(n => n.tag === 'button').map(b => b.textContent), html: feed.card._html};
  };
  const end = run({place: 'Japan', style: 'coast'}, true, '');
  assert.deepEqual(end.buttons, ['Try any trip style', 'Explore all destinations', 'Change filters']);
  assert.match(end.html, /That's every matching guide/);
  assert.deepEqual(run({place: 'Japn', style: ''}, false, 'Japan').buttons, ['Search for “Japan”', 'Explore all destinations', 'Change filters']);
  assert.match(run({place: 'Japn', style: ''}, false, 'Japan').html, /No matching guides/);
  assert.deepEqual(run({place: '', style: 'city'}, true, '').buttons, ['Explore all destinations', 'Change filters']);
  // The feed shows the end card rather than an error when a filter has no results.
  assert.match(app, /if \(!offline && isHow && travelExhausted && \(travelFilters\.place \|\| travelFilters\.style\)\) \{ showTravelEnd\(\); return; \}/);
});

test('the place field explains, behind an ⓘ button, that places can be separated with commas', () => {
  const features = read('features.js');
  assert.match(features, /class="travel-info" aria-expanded="false" aria-controls="travelHelp-N" aria-label="How place search works"/);
  assert.match(features, /separate them with commas: Japan, Tuscany/);
  assert.match(features, /<label for="travelPlace-N">Country or region<\/label>/, 'the label still names the input');
  assert.match(features, /info\.setAttribute\('aria-expanded',String\(!help\.hidden\)\)/);
});

test('changing travel filters rebuilds the feed before Settings starts closing, so the close animation plays in full', () => {
  const features = read('features.js'), calls = [], frames = [];
  const c = vm.createContext({requestAnimationFrame: fn => frames.push(fn), closeAllPanels: () => calls.push('close panels'), closeBurger: () => calls.push('close menu')});
  vm.runInContext(slice(features, 'function changeFeedThenClose(', 'function installTravelFilters('), c);
  c.changeFeedThenClose(() => calls.push('reset feed'));
  assert.deepEqual(calls, ['reset feed'], 'the drawer is still open while the feed is rebuilt');
  frames.shift()(); assert.equal(calls.length, 1);
  frames.shift()(); assert.deepEqual(calls, ['reset feed', 'close panels', 'close menu']);
  assert.match(features, /travel-clear'\)\.onclick=\(\)=>\{[^\n]*changeFeedThenClose\(resetFeed\)/);
  assert.match(features, /form\.onsubmit=e=>\{[^\n]*changeFeedThenClose\(/);
});

test('the browser follows "resume" at most 3 times per page before moving on, so unfinished guides are not skipped', async () => {
  const features = read('features.js');
  const answers = [{articles: [{id: 'v1'}], next: 30, resume: 0}, {articles: [{id: 'v2'}], next: 30, resume: 0}, {articles: [{id: 'v3'}], next: 30, resume: 0}, {articles: [{id: 'v4'}], next: null, resume: 0}, {articles: [{id: 'v5'}], next: null}];
  const offsets = [];
  const c = vm.createContext({fillGeneration: 1, travelFilters: {place: 'Norway', style: ''}, travelOffset: 0, travelExhausted: false, travelSuggestion: '', travelRetries: {},
    articles: [], queue: [], voyageLang: () => 'en', URLSearchParams, AbortSignal: {timeout: () => undefined},
    fetch: async url => { offsets.push(new URL(url, 'https://x').searchParams.get('offset')); return {ok: true, json: async () => answers.shift()}; }});
  vm.runInContext(slice(features, 'async function fetchFilteredTravel(', '// When a travel filter runs out'), c);
  for (let i = 0; i < 4; i++) await vm.runInContext('fetchFilteredTravel()', c);
  assert.deepEqual(offsets, ['0', '0', '0', '0'], 'the unfinished page is asked for again, 4 answers in all');
  assert.equal(c.travelExhausted, true, 'after three retries the reader moves on');
  assert.equal(c.travelOffset, 0);
  assert.match(features, /travelRetries=\{\};/, 'continuing starts with fresh retries');
});

test('browser tabs show just the name; link previews keep the tagline', () => {
  const about = read('about/index.html');
  assert.match(html, /<title>WikiScroll<\/title>/);
  assert.match(about, /<title>About WikiScroll<\/title>/);
  assert.match(html, /<meta property="og:title" content="WikiScroll: Turn doomscrolling into discovery">/, 'shared links still show the full line');
  assert.match(html, /<meta name="description" content="[^"]*doomscrolling/i, 'the search description is unchanged');
});
