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
