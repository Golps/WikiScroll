import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/webmcp.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const keys = app.slice(app.indexOf('// Page IDs repeat across editions'), app.indexOf('// Saves from before language-aware keys'));
const es = {id: 'w5', src: 'wiki', title: 'Otra página', body: 'b'.repeat(40), url: 'https://es.wikipedia.org/?curid=5'};

function page({api = 'navigator'} = {}) {
  const registered = [], listeners = {}, toggled = [], fetched = [];
  const cards = [{dataset: {id: 'w1'}}, {dataset: {id: 'w2'}}];
  let at = 0;
  const context = {registerTool: (tool, options) => { registered.push({tool, options}); }};
  const c = vm.createContext({
    navigator: api === 'navigator' ? {modelContext: context} : {}, document: api === 'document' ? {modelContext: context, getElementById: () => feed} : {getElementById: () => feed},
    addEventListener: (type, fn) => { listeners[type] = fn; }, AbortController, AbortSignal, URLSearchParams, URL, setTimeout, Promise, JSON, Math, Number, String, Array,
    fetch: async url => { fetched.push(String(url)); return Response.json({articles: [{title: 'Kyoto', body: 'k'.repeat(400), url: 'https://en.wikivoyage.org/wiki/Kyoto'}], next: 30}); },
    articles: [{id: 'w1', src: 'wiki', title: 'Ginkgo', body: 'g'.repeat(700), url: 'https://en.wikipedia.org/?curid=1'}, {id: 'w2', src: 'how', title: 'Lisbon', body: 'l'.repeat(50), url: 'https://en.wikivoyage.org/wiki/Lisbon'}],
    liked: new Map([['es:w5', es]]), toggleLike: id => toggled.push(id), ensureFeedAhead() {}, voyageLang: () => 'en',
    getCurrentFeedCard: () => cards[at], feedCardTop: card => cards.indexOf(card) * 700,
  });
  const feed = {querySelectorAll: () => cards, scrollTo: ({top}) => { at = top / 700; }};
  if (api) vm.runInContext(keys, c);
  vm.runInContext(source, c);
  const tool = name => registered.find(r => r.tool.name === name).tool;
  const call = async (name, input = {}) => JSON.parse((await tool(name).execute(input, {signal: new AbortController().signal})).content[0].text);
  return {registered, listeners, toggled, fetched, tool, call};
}

test('the reader registers its tools with WebMCP, each with a schema and a way to unregister', () => {
  for (const api of ['navigator', 'document']) {
    const p = page({api});
    assert.deepEqual(p.registered.map(r => r.tool.name), ['get_current_article', 'move_to_article', 'save_current_article', 'list_saved_articles', 'find_travel_guides'], api);
    for (const {tool, options} of p.registered) {
      assert.ok(tool.description.length > 40 && /^[a-z_]{1,128}$/.test(tool.name), tool.name);
      assert.equal(tool.inputSchema.type, 'object', tool.name);
      assert.equal(typeof tool.execute, 'function');
      assert.equal(options.signal.aborted, false);
    }
    p.listeners.pagehide();
    assert.ok(p.registered.every(r => r.options.signal.aborted), 'leaving the page unregisters every tool');
  }
});

test('without WebMCP in the browser nothing is registered and nothing breaks', () => {
  assert.doesNotThrow(() => page({api: null}));
});

test('tools read the feed, move through it, save without ever unsaving, and search travel guides', async () => {
  const p = page();
  const now = await p.call('get_current_article');
  assert.equal(now.title, 'Ginkgo'); assert.equal(now.summary.length, 600); assert.equal(now.source, 'Wikipedia'); assert.equal(now.saved, false);
  assert.equal((await p.call('move_to_article', {direction: 'next'})).title, 'Lisbon');
  assert.match((await p.call('move_to_article', {direction: 'next'})).error, /still loading/);
  assert.equal((await p.call('move_to_article', {direction: 'previous'})).title, 'Ginkgo');
  await p.call('save_current_article');
  assert.deepEqual(p.toggled, ['w1']);
  const saved = await p.call('list_saved_articles');
  assert.deepEqual(saved, [{title: 'Otra página', source: 'Wikipedia', url: 'https://es.wikipedia.org/?curid=5'}]);
  const found = await p.call('find_travel_guides', {place: ' Japan ', style: 'culture'});
  assert.equal(found.guides[0].title, 'Kyoto'); assert.equal(found.guides[0].summary.length, 300);
  assert.match(p.fetched[0], /^\/api\/travel\?lang=en&place=Japan&style=culture&offset=0$/);
  assert.match((await p.call('find_travel_guides', {place: ''})).error, /place/);
  assert.ok(p.tool('get_current_article').annotations.readOnlyHint && p.tool('find_travel_guides').annotations.untrustedContentHint);
});

test('the page loads the tools after the reader and caches them for offline use', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const sw = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  const version = html.match(/<script src="\/webmcp\.js\?v=(\d+)"><\/script>/)?.[1];
  assert.ok(version && html.indexOf('/webmcp.js') > html.indexOf('/features.js'));
  assert.ok(sw.includes(`'/webmcp.js?v=${version}'`));
});
