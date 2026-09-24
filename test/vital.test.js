import test from 'node:test';
import assert from 'node:assert/strict';

let moduleId = 0;
const fresh = () => import('../worker/vital.js?case=' + moduleId++);
const toArticle = (p, lang) => ({id: 'w' + p.pageid, title: p.title, lang});
const level3 = Array.from({length: 600}, (_, i) => 'Essential ' + i);
const level4 = [...level3.slice(0, 300), ...Array.from({length: 3200}, (_, i) => 'Known ' + i)];

function wiki({level4Ready = true, languages = {}} = {}) {
  const requests = [];
  const upstream = async address => {
    const url = new URL(address), p = url.searchParams;
    requests.push(url);
    if (p.get('prop') === 'links') {
      assert.equal(p.get('redirects'), '1');
      const title = p.get('titles');
      const all = title.endsWith('Level 3') ? level3 : level4Ready ? (title.endsWith('People') ? level4.slice(0, 1800) : level4.slice(1800)) : [];
      const start = Number(p.get('plcontinue') || 0), slice = all.slice(start, start + 500);
      return {query: {pages: {1: {links: slice.map(t => ({ns: 0, title: t}))}}}, ...(start + 500 < all.length ? {continue: {plcontinue: String(start + 500)}} : {})};
    }
    if (p.get('prop') === 'langlinks') return {query: {pages: Object.fromEntries(p.get('titles').split('|').map((t, i) => [i, {title: t, langlinks: languages[t] ? [{'*': languages[t]}] : undefined}]))}};
    if (p.get('prop') === 'extracts') return {query: {pages: Object.fromEntries(p.get('pageids').split('|').map(id => [id, {pageid: Number(id), extract: 'An essential subject that every curious reader eventually meets. '.repeat(2)}]))}};
    // Article details for the chosen titles.
    return {query: {pages: Object.fromEntries(p.get('titles').split('|').map((t, i) => [i + 1, {pageid: 1000 + i, ns: 0, title: t, thumbnail: {source: 'https://thumb.wikimedia.org/x.jpg'}}]))}};
  };
  return {upstream, requests};
}
const ctx = () => { const jobs = []; return {waitUntil: p => jobs.push(p), done: () => Promise.all(jobs)}; };

test('Popular samples the Level 3 vital articles', async () => {
  const {vitalArticles} = await fresh(), w = wiki(), c = ctx();
  const result = await vitalArticles('en', 1, w.upstream, c, toArticle);
  assert.equal(result.length, 20);
  assert.ok(result.every(a => a.title.startsWith('Essential ')));
});

test('Known samples Level 4 without the Level 3 essentials', async () => {
  const {vitalArticles, vitalTitles} = await fresh(), w = wiki(), c = ctx();
  await vitalTitles(4, w.upstream, c);
  const result = await vitalArticles('en', 2, w.upstream, c, toArticle);
  assert.equal(result.length, 20);
  assert.ok(result.every(a => a.title.startsWith('Known ')));
});

test('Known answers from Level 3 while Level 4 is still being assembled', async () => {
  const {vitalArticles} = await fresh(), w = wiki(), c = ctx();
  const info = {};
  const result = await vitalArticles('en', 2, w.upstream, c, toArticle, info);
  assert.ok(result.length > 0 && result.every(a => a.title.startsWith('Essential ')));
  assert.equal(info.borrowed, true, 'borrowed answers are flagged so they are not cached');
  await c.done();
  const laterInfo = {};
  const later = await vitalArticles('en', 2, w.upstream, c, toArticle, laterInfo);
  assert.ok(later.every(a => a.title.startsWith('Known ')));
  assert.equal(laterInfo.borrowed, undefined);
});

test('other languages follow the English lists through interlanguage links', async () => {
  const languages = Object.fromEntries(level3.map(t => [t, 'Essentiel ' + t.split(' ')[1]]));
  const {vitalArticles} = await fresh(), w = wiki({languages}), c = ctx();
  const result = await vitalArticles('fr', 1, w.upstream, c, toArticle);
  assert.ok(result.length > 0 && result.every(a => a.title.startsWith('Essentiel ') && a.lang === 'fr'));
  assert.ok(w.requests.some(u => u.hostname === 'fr.wikipedia.org'));
});

test('an incomplete list is never cached as the vital articles', async () => {
  const {vitalTitles} = await fresh(), w = wiki({level4Ready: false}), c = ctx();
  assert.equal(await vitalTitles(4, w.upstream, c), null);
});

test('only the eleven Level 4 topic lists are read, never Removed or Article alerts pages', async () => {
  const {vitalTitles} = await fresh(), w = wiki(), c = ctx();
  await vitalTitles(4, w.upstream, c);
  const read = new Set(w.requests.filter(u => u.searchParams.get('prop') === 'links').map(u => u.searchParams.get('titles')));
  assert.equal(read.size, 11);
  assert.ok([...read].every(t => t.startsWith('Wikipedia:Vital articles/Level 4/') && !/Removed|alerts/.test(t)));
});

test('a Popular request warms the Known list in the background', async () => {
  const {vitalArticles} = await fresh(), w = wiki(), c = ctx();
  await vitalArticles('en', 1, w.upstream, c, toArticle);
  await c.done();
  assert.ok(w.requests.some(u => (u.searchParams.get('titles') || '').startsWith('Wikipedia:Vital articles/Level 4/')));
  const known = await vitalArticles('en', 2, w.upstream, c, toArticle);
  assert.ok(known.length && known.every(a => a.title.startsWith('Known ')));
});
