import test from 'node:test';
import assert from 'node:assert/strict';
import {completeNeeds, sampleNeedyTitles, randomPrefix, weightedCategories, NEED_CATEGORIES} from '../worker/needs.js';
import {topicPages} from '../worker/topics.js';

test('needs come from hidden tracking categories, ordered by what to fix first, 50 pages per request', async () => {
  const requests = [];
  const pages = Array.from({length: 60}, (_, i) => ({pageid: i + 1}));
  await completeNeeds('en', pages, async params => {
    requests.push(params);
    assert.equal(params.prop, 'categories');
    assert.ok(params.clcategories.includes('Category:All articles needing additional references'));
    const ids = params.pageids.split('|');
    return {query: {pages: Object.fromEntries(ids.map(id => [id, {pageid: +id, categories: id === '1' ? [{title: 'Category:All stub articles'}, {title: 'Category:All articles needing additional references'}] : []}]))}};
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(pages[0].needs, ['citations', 'stub']);
  assert.deepEqual(pages[1].needs, []);
});

test('failed lookups show no tag, and unsupported languages are left alone', async () => {
  const pages = [{pageid: 1}];
  await completeNeeds('en', pages, async () => null);
  assert.deepEqual(pages[0].needs, []);
  const ja = [{pageid: 2}];
  await completeNeeds('ja', ja, async () => { throw Error('must not be called'); });
  assert.equal(ja[0].needs, undefined);
});

test('huge maintenance lists are read from random points across the alphabet', async () => {
  const prefixes = new Set(Array.from({length: 200}, () => randomPrefix()[0]));
  assert.ok(prefixes.size >= 15);
  const draws = weightedCategories('de', 400);
  const kinds = new Set(draws.map(d => d.need));
  assert.deepEqual([...kinds].sort(), ['citations', 'incomplete']);
  const seen = [];
  const titles = await sampleNeedyTitles('en', async params => {
    seen.push(params);
    return {query: {categorymembers: [{ns: 0, pageid: seen.length, title: 'T' + seen.length}, {ns: 14, pageid: 99, title: 'Category:X'}]}};
  });
  assert.equal(seen.length, 10);
  assert.ok(seen.every(p => p.cmlimit === '8'));
  assert.ok(seen.every(p => p.cmnamespace === '0' && /^[A-Z][a-z]$/.test(p.cmstartsortkeyprefix) && Object.hasOwn(NEED_CATEGORIES.en, p.cmtitle)));
  assert.equal(titles.length, 10);
});

function wiki({needs = () => false} = {}) {
  return async address => {
    const p = new URL(address).searchParams;
    if (p.get('list') === 'categorymembers') {
      const base = p.get('cmtitle').length * 100;
      return {query: {categorymembers: Array.from({length: 6}, (_, i) => ({ns: 0, pageid: base + i, title: 'Page ' + (base + i)}))}};
    }
    if (p.has('cmtitle')) return {query: {categorymembers: Array.from({length: 4}, (_, i) => ({ns: 0, pageid: p.get('cmtitle').length * 10 + i, title: 'Topic page ' + i}))}};
    if (p.get('prop') === 'categories') return {query: {pages: Object.fromEntries(p.get('pageids').split('|').map(id => [id, {pageid: +id, categories: needs(+id) ? [{title: 'Category:All articles with unsourced statements'}] : []}]))}};
    if (p.get('prop') === 'extracts') return {query: {pages: Object.fromEntries(p.get('pageids').split('|').map(id => [id, {pageid: +id, extract: 'A substantive introduction that makes a readable discovery card. '.repeat(2)}]))}};
    return {query: {pages: Object.fromEntries(p.get('pageids').split('|').map(id => [id, {pageid: +id, title: 'Article ' + id, pageviews: {a: 20, b: 20}, thumbnail: {source: 'https://thumb.wikimedia.org/x.jpg'}}]))}};
  };
}

test('Help Wikipedia alone returns articles that need work, labelled by need, not by topic', async () => {
  const articles = await topicPages('help', 'en', 3, wiki({needs: () => true}));
  assert.ok(articles.length > 0);
  assert.ok(articles.every(a => a.needs?.includes('unsourced') && a.topic === undefined));
});

test('Help Wikipedia with a subject keeps only that subject\'s articles that need work', async () => {
  // Half of the subject's articles need work (even page ids).
  const articles = await topicPages('tech', 'en', 3, wiki({needs: id => id % 2 === 0}), {help: true});
  assert.ok(articles.length > 0);
  assert.ok(articles.every(a => a.topic === 'tech' && a.needs?.length && Number(a.id.slice(1)) % 2 === 0));
});

test('Popular with Help Wikipedia still fills from the most-read articles that need work', async () => {
  const articles = await topicPages('help', 'en', 1, wiki({needs: () => true}));
  assert.ok(articles.length >= 1);
});
