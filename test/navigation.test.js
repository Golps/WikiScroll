import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const geometry = source.slice(source.indexOf('// ── FEED GEOMETRY'), source.indexOf('// ── BOOT'));
const navigationStart = source.indexOf('(function() {', source.indexOf('// rAF-driven swipe engine'));
const navigation = source.slice(navigationStart, source.indexOf('// ── KEYBOARD BAR', navigationStart));

function harness(count, height = 700) {
  const handlers = {document: new Map(), window: new Map(), feed: new Map()};
  const listen = scope => (type, callback) => {
    const list = handlers[scope].get(type) || [];
    list.push(callback); handlers[scope].set(type, list);
  };
  const classList = () => {
    const names = new Set();
    return {add: name => names.add(name), remove: name => names.delete(name), contains: name => names.has(name)};
  };
  const element = () => ({style: {}, classList: classList(), offsetWidth: 1});
  let cards = [], now = 0, nextRaf = 1, ensureCalls = 0, supply = 0;
  const raf = new Map(), likes = [];
  const feed = {
    style: {}, scrollTop: 0, clientHeight: height, offsetTop: 30, offsetParent: null,
    querySelectorAll: () => cards,
    addEventListener: listen('feed'),
    contains: card => cards.includes(card),
    scrollTo({top}) { this.scrollTop = top; },
  };
  function addCard(id) {
    const card = {
      ...element(), dataset: {id: 'w' + id}, offsetParent: feed,
      get offsetTop() { return cards.indexOf(this) * height; },
      get isConnected() { return cards.includes(this); },
      querySelector: () => null,
      appendChild() {},
      remove() { cards = cards.filter(c => c !== this); },
    };
    cards.push(card); return card;
  }
  for (let i = 0; i < count; i++) addCard(i + 1);
  const overlays = new Map();
  const namedElement = id => {
    if (!overlays.has(id)) overlays.set(id, element());
    return overlays.get(id);
  };
  const doc = {
    getElementById: id => id === 'feed' ? feed : namedElement(id),
    querySelector: selector => selector.split(',').map(part => part.trim()).map(part => {
      if (part === 'dialog[open]') return [...overlays.values()].find(el => el.dialog && el.open);
      const match = part.match(/^#([\w-]+)\.open$/);
      const el = match && overlays.get(match[1]);
      return el?.classList.contains('open') ? el : null;
    }).find(Boolean) || null,
    addEventListener: listen('document'), removeEventListener() {},
    createElement: element, body: {classList: classList()},
  };
  const context = vm.createContext({
    console, document: doc,
    window: {innerWidth: 1000, innerHeight: 800, addEventListener: listen('window')},
    navigator: {maxTouchPoints: 0},
    performance: {now: () => now},
    requestAnimationFrame: callback => { const id = nextRaf++; raf.set(id, callback); return id; },
    cancelAnimationFrame: id => raf.delete(id),
    setTimeout: () => 1, clearTimeout() {},
    ensureFeedAhead() {
      ensureCalls++;
      while (supply > 0) {
        const card = addCard(cards.length + 1);
        context.articles.push({id: card.dataset.id});
        supply--;
      }
    },
    attachSentinel() {}, toggleLike(id) { likes.push(id); },
    openAmbient() { namedElement('ambientOverlay').classList.add('open'); },
    closeAmbient() { namedElement('ambientOverlay').classList.remove('open'); },
    articles: cards.map(card => ({id: card.dataset.id, extract: 'An article payload'})),
    liked: new Map(), feedSeen: new Set(cards.map(card => card.dataset.id)),
    fillGeneration: 0, swipeEnabled: true,
  });
  vm.runInContext(geometry + navigation, context);
  function dispatch(scope, type, event = {}) {
    const ev = {target: {closest: () => null}, cancelable: true, prevented: false, preventDefault() { this.prevented = true; }, ...event};
    for (const handler of handlers[scope].get(type) || []) handler(ev);
    return ev;
  }
  function step(time = 1000) {
    now += time;
    const pending = [...raf.values()]; raf.clear();
    for (const callback of pending) callback(now);
  }
  return {
    context, feed, likes, get cards() { return cards; }, get ensureCalls() { return ensureCalls; },
    get pendingFrames() { return raf.size; }, step, dispatch,
    overlay(id, open = true, dialog = false) {
      const el = namedElement(id); el.dialog = dialog; el.open = open;
      el.classList[open ? 'add' : 'remove']('open');
      return el;
    },
    key: key => dispatch('document', 'keydown', {key}),
    supply(count) { supply = count; },
    current: () => vm.runInContext('getCurrentFeedCard()?.dataset.id', context),
    reset() { context.fillGeneration++; dispatch('window', 'feed-reset'); cards = []; addCard(1000); feed.scrollTop = 0; },
  };
}

test('a swipe at an empty tail retains the current card and asks for supply', () => {
  const h = harness(1);
  h.key('ArrowLeft');
  assert.equal(h.ensureCalls, 1);
  assert.equal(h.pendingFrames, 0);
  assert.equal(h.feed.scrollTop, 0);
  assert.notEqual(h.cards[0].style.visibility, 'hidden');
  assert.equal(vm.runInContext('feedMotionLocked', h.context), false);
});

test('a prepared next card is appended before a swipe and history remains visible', () => {
  const h = harness(1); h.supply(1);
  h.key('ArrowLeft'); h.step(); h.step();
  assert.equal(h.current(), 'w2');
  assert.equal(h.cards[0].style.opacity, '');
  assert.equal(h.cards[0].style.visibility, '');
  assert.equal(h.cards[0].style.scrollSnapAlign, '');
  assert.equal(vm.runInContext('feedMotionLocked', h.context), false);
});

test('rapid duplicate gestures cannot overlap, move backward, or hide the final card', () => {
  const h = harness(40);
  for (let i = 1; i < 40; i++) {
    h.key('ArrowLeft');
    for (let repeat = 0; repeat < 20; repeat++) h.key(repeat % 2 ? 'ArrowLeft' : 'ArrowUp');
    h.step(); h.step();
    assert.equal(h.current(), 'w' + (i + 1));
  }
  h.key('ArrowLeft'); h.step();
  assert.equal(h.current(), 'w40');
  assert.ok(h.cards.every(card => card.style.visibility !== 'hidden'));
});

test('pruning retains the visible article and its precise position', () => {
  const h = harness(40);
  h.feed.scrollTop = 29 * 700 + 47;
  const current = h.current();
  vm.runInContext('pruneOldCards()', h.context);
  assert.equal(h.cards.length, 23);
  assert.equal(h.current(), current);
  assert.equal(h.feed.scrollTop, 12 * 700 + 47);
});

test('pruning cannot change flight geometry', () => {
  const h = harness(40); h.feed.scrollTop = 29 * 700;
  h.key('ArrowLeft');
  vm.runInContext('pruneOldCards()', h.context);
  assert.equal(h.cards.length, 40);
  h.step(); h.step();
  assert.equal(h.current(), 'w31');
});

test('a reset cancels old animation frames before they can move a new feed', () => {
  const h = harness(3);
  h.key('ArrowLeft'); h.step(100);
  h.reset(); h.step(); h.step();
  assert.equal(h.current(), 'w1000');
  assert.equal(h.feed.scrollTop, 0);
  assert.equal(h.pendingFrames, 0);
  assert.equal(vm.runInContext('feedMotionLocked', h.context), false);
});

test('wheel and vertical keyboard input cannot fight a swipe animation', () => {
  const h = harness(3); h.key('ArrowLeft');
  assert.equal(h.dispatch('feed', 'wheel').prevented, true);
  assert.equal(h.key('ArrowDown').prevented, true);
  assert.equal(h.feed.style.overflowY, 'hidden');
  assert.equal(h.feed.scrollTop, 0);
  h.step(); h.step();
  assert.equal(h.feed.style.overflowY, '');
  assert.equal(h.current(), 'w2');
});

test('navigation uses actual card geometry when mobile viewport height differs', () => {
  const h = harness(30, 640); h.feed.scrollTop = 20 * 640;
  assert.equal(h.current(), 'w21');
  h.key('ArrowDown');
  assert.equal(h.feed.scrollTop, 21 * 640);
  assert.equal(h.current(), 'w22');
});


test('rightward natural trackpad swipe likes once despite a long momentum tail',()=>{
 const h=harness(5);
 for(let i=0;i<40;i++) {h.dispatch('feed','wheel',{deltaX:-12,deltaY:1});h.step(40);}
 assert.equal(h.current(),'w2');assert.deepEqual(h.likes,['w1']);
 h.step(300);h.dispatch('feed','wheel',{deltaX:100,deltaY:0});h.step();h.step();
 assert.equal(h.current(),'w3');assert.deepEqual(h.likes,['w1']);
});
test('vertical scrolling, pinch zoom, small gestures and disabled swiping do not act',()=>{
 for(const event of [{deltaX:2,deltaY:100},{deltaX:120,ctrlKey:true},{deltaX:20,deltaY:0}]){
 const h=harness(3);const e=h.dispatch('feed','wheel',event);h.step();
 assert.equal(h.current(),'w1');assert.equal(h.likes.length,0);
 if(event.ctrlKey||event.deltaY===100)assert.equal(e.prevented,false);
 }
 const h=harness(3);h.context.swipeEnabled=false;h.dispatch('feed','wheel',{deltaX:-120});h.step();assert.equal(h.current(),'w1');
});
test('trackpad input at an empty tail retains content without saving or skipping',()=>{
 const h=harness(1);h.dispatch('feed','wheel',{deltaX:-120});h.step();assert.equal(h.current(),'w1');assert.deepEqual(h.likes,[]);
});
test('feed reset discards a partially accumulated trackpad gesture',()=>{
 const h=harness(3);h.dispatch('feed','wheel',{deltaX:-60});h.reset();h.supply(2);
 h.dispatch('feed','wheel',{deltaX:-40});h.step();assert.equal(h.current(),'w1000');assert.deepEqual(h.likes,[]);
});


test('pruning retires old payloads while preserving saves and duplicate protection', () => {
  const h = harness(200);
  const saved = h.context.articles[0];
  h.context.liked.set(saved.id, saved);
  h.feed.scrollTop = 180 * 700 + 23;
  vm.runInContext('pruneOldCards()', h.context);
  assert.equal(h.current(), 'w181');
  assert.equal(h.feed.scrollTop, 12 * 700 + 23);
  assert.equal(h.cards.length, 32);
  assert.deepEqual(Array.from(h.context.articles, article => article.id), h.cards.map(card => card.dataset.id));
  assert.equal(h.context.liked.get('w1'), saved);
  assert.equal(h.context.feedSeen.size, 200);
  assert.ok(h.context.feedSeen.has('w1'));
});

test('settings, panels and dialogs isolate keyboard and trackpad feed actions', () => {
  for (const id of ['spBackdrop', 'burgerMenu', 'topicSheet', 'mapOverlay', 'ambientOverlay', 'langDd', 'aboutDialog']) {
    const h = harness(3);
    h.overlay(id, true, id === 'aboutDialog');
    for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'l', 'r', 's']) h.key(key);
    h.dispatch('feed', 'wheel', {deltaX: -120});
    h.step(); h.step();
    assert.equal(h.current(), 'w1', id);
    assert.equal(h.pendingFrames, 0, id);
    assert.deepEqual(h.likes, [], id);
    h.overlay(id, false, id === 'aboutDialog');
    h.key('ArrowRight'); h.step(); h.step();
    assert.equal(h.current(), 'w2', id);
  }
});

test('native controls and browser shortcuts keep their keyboard behavior', () => {
  for (const options of [
    {ctrlKey: true}, {metaKey: true}, {altKey: true}, {shiftKey: true},
    {isComposing: true}, {defaultPrevented: true},
    {target: {closest: () => ({tagName: 'BUTTON'})}},
  ]) {
    const h = harness(3);
    const ev = h.dispatch('document', 'keydown', {key: 'ArrowRight', ...options});
    h.step();
    assert.equal(ev.prevented, false);
    assert.equal(h.current(), 'w1');
    assert.deepEqual(h.likes, []);
  }
});

test('space dismisses ambient mode without moving or saving the underlying card', () => {
  const h = harness(3);
  const ambient = h.overlay('ambientOverlay');
  assert.equal(h.key(' ').prevented, true);
  assert.equal(ambient.classList.contains('open'), false);
  assert.equal(h.current(), 'w1');
  assert.deepEqual(h.likes, []);
});

test('blocked trackpad input discards its partial gesture before the panel closes', () => {
  const h = harness(3);
  h.dispatch('feed', 'wheel', {deltaX: -60});
  h.overlay('spBackdrop');
  h.dispatch('feed', 'wheel', {deltaX: -120});
  h.overlay('spBackdrop', false);
  h.dispatch('feed', 'wheel', {deltaX: -40});
  h.step();
  assert.equal(h.current(), 'w1');
  assert.deepEqual(h.likes, []);
});

test('swiping right on an already saved article never removes it',()=>{
  const h=harness(3);h.context.liked.set('w1',{id:'w1'});
  h.key('ArrowRight');h.step();h.step();
  assert.equal(h.current(),'w2');assert.deepEqual(h.likes,[]);
  h.key('ArrowRight');h.step();h.step();
  assert.deepEqual(h.likes,['w2']);
});
