import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/atlas.js', import.meta.url), 'utf8');
const excerptCode = source.slice(source.indexOf('// Match excerpt length'), source.indexOf('function chooseExcerpt('));

function harness(count = 3) {
  const observed = new Set(), observeCalls = [], unobserveCalls = [];
  const bodies = Array.from({length: count}, (_, id) => ({
    nodeType: 1, isConnected: true, id,
    dataset: {fitted: 'true', fullExcerpt: 'Original complete article excerpt'},
    firstElementChild: {textContent: 'A fitted excerpt…'},
    matches: selector => selector === '.art-body',
    querySelectorAll: () => [],
  }));
  let onMutation;
  vm.runInNewContext(excerptCode, {
    document: {
      querySelectorAll: () => bodies.filter(body => body.isConnected),
      getElementById: () => ({}),
    },
    ResizeObserver: class {
      observe(body) { observed.add(body); observeCalls.push(body); }
      unobserve(body) { observed.delete(body); unobserveCalls.push(body); }
    },
    MutationObserver: class {
      constructor(callback) { onMutation = callback; }
      observe() {}
    },
  });
  return {
    bodies, observed, observeCalls, unobserveCalls,
    mutate(nodes = []) { onMutation([{removedNodes: nodes}]); },
    card(body) { return {nodeType: 1, isConnected: false, querySelectorAll: () => [body], matches: () => false}; },
  };
}

test('discarded feed cards release their excerpt observers', () => {
  const h = harness(40);
  assert.equal(h.observed.size, 40);
  const retired = h.bodies.slice(0, 17);
  retired.forEach(body => { body.isConnected = false; });
  h.mutate(retired.map(h.card));
  assert.equal(h.observed.size, 23);
  assert.ok(retired.every(body => !h.observed.has(body)));
  assert.equal(h.observeCalls.length, 40);
});

test('a feed reset releases all old observed content', () => {
  const h = harness(25);
  h.bodies.forEach(body => { body.isConnected = false; });
  h.mutate(h.bodies);
  assert.equal(h.observed.size, 0);
  assert.equal(h.unobserveCalls.length, 25);
});

test('moving or reinserting an excerpt preserves its original text and observes it once', () => {
  const h = harness(1), body = h.bodies[0];
  const text = body.firstElementChild;
  h.mutate([body]);
  assert.equal(h.unobserveCalls.length, 0);
  assert.equal(h.observeCalls.length, 1);
  body.isConnected = false;
  h.mutate([body]);
  assert.equal(h.observed.size, 0);
  body.isConnected = true;
  h.mutate();
  assert.ok(h.observed.has(body));
  assert.equal(h.observeCalls.length, 2);
  assert.equal(body.firstElementChild, text);
  assert.equal(body.dataset.fullExcerpt, 'Original complete article excerpt');
});

const ambientCode = source.slice(source.indexOf('// Ambient mode shows'), source.indexOf('// Dismiss only genuine backdrop clicks'));
// Simulated layout: the ambient panel holds 200 characters of excerpt.
function ambient() {
  let open = false, onChange;
  const excerpt = {textContent: ''};
  const content = {clientHeight: 400, get scrollHeight() { return 200 + excerpt.textContent.length; }};
  const overlay = {classList: {contains: name => name === 'open' && open}, querySelector: () => content};
  vm.runInNewContext(ambientCode, {
    document: {getElementById: id => id === 'ambientOverlay' ? overlay : excerpt},
    MutationObserver: class { constructor(callback) { onChange = callback; } observe() {} },
    addEventListener() {}, Intl, curLang: 'en',
  });
  return {excerpt, show(text) { excerpt.textContent = text; open = true; onChange(); }, close() { open = false; onChange(); }};
}
const sentence = n => `Sentence number ${n} is about forty-five characters.`;

test('ambient mode keeps whole sentences that fit instead of hiding the rest behind a scroll', () => {
  const view = ambient(), text = Array.from({length: 12}, (_, i) => sentence(i + 1)).join(' ');
  view.show(text);
  assert.ok(view.excerpt.textContent.length <= 200, 'fits the panel');
  assert.ok(text.startsWith(view.excerpt.textContent) && view.excerpt.textContent.endsWith('characters.'), 'ends on a whole sentence');
});

test('ambient mode drops a fragment cut off by the source and refits for the next article', () => {
  const view = ambient();
  view.show(`${sentence(1)} ${sentence(2)} The source stopped in the middle of this...`);
  assert.equal(view.excerpt.textContent, `${sentence(1)} ${sentence(2)}`);
  view.close();
  view.show(sentence(3));
  assert.equal(view.excerpt.textContent, sentence(3), 'a new article starts from its own full text');
});

test('ambient mode shortens an unusually long first sentence at a word boundary', () => {
  const view = ambient();
  view.show('An extraordinarily long opening sentence ' + 'that keeps going '.repeat(30) + 'until it ends.');
  assert.ok(view.excerpt.textContent.length <= 200 && view.excerpt.textContent.endsWith('…'));
  assert.doesNotMatch(view.excerpt.textContent, /\s…$/);
});
