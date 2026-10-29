// Builds the bundled outage/offline card pool in public/data/starter/.
// Cards keep the feed's {id, src, title, body, img, url, desc} shape and are
// grouped by source, language and depth, then shuffled and packed into small
// shards so each visitor loads one random slice instead of one fixed list.
// Cards come from this week's card library on cards.wikiscroll.com (built
// from the Wikimedia dumps a few hours earlier); the live API is the fallback
// when the library can't be read.
// Run by .github/workflows/starter-pool.yml; it never runs during a deploy.
//   node scripts/build-starter.mjs [output directory]
import fs from 'node:fs/promises';
import path from 'node:path';
import {averageViews,lagDays,completePageviews,DEPTH_BANDS} from '../worker/pageviews.js';
import {vitalTitles} from '../worker/vital.js';
import {imageURL} from '../worker/supply.js';
import {guideReadable} from '../worker/extracts.js';
import {isMature} from '../worker/mature.js';
import {isPhrasebook,isDisambiguation,phrasebookParams} from '../worker/travel.js';

export const SHARD_SIZE = 60, SHARDS_PER_SET = 5, TARGET = SHARD_SIZE * SHARDS_PER_SET;
// A set below this many cards fails the build, so a bad week keeps last week's pool.
export const MINIMUM = 120;
export const SETS = ['wiki-en-1','wiki-en-2','wiki-en-3','wiki-en-4','wiki-en-5','how-en'];
const BODY_CHARS = 600;
const BAD_TITLE = /^(list of|lists of|index of|outline of|timeline of|glossary of|wikipedia:|template:|category:|portal:|draft:|module:|file:|help:|special:)/i;
const strip = s => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const shuffle = values => { const a = [...values]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Trims at a sentence end where possible; cards fit excerpts to the screen.
export function shorten(text, max = BODY_CHARS) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max), end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end >= 200 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…';
}
export function toCard(page, src) {
  const host = src === 'how' ? 'en.wikivoyage.org' : 'en.wikipedia.org';
  const desc = typeof page.description === 'string' ? strip(page.description).slice(0, 160) : '';
  return {id: (src === 'how' ? 'v' : 'w') + page.pageid, src, title: page.title, body: shorten(strip(page.extract)), img: imageURL(page.thumbnail?.source),
    url: page.fullurl || `https://${host}/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`, ...(desc ? {desc} : {}),
    ...(src === 'wiki' && isMature({title: page.title, description: desc}) ? {mature: 1} : {})};
}
export function validCard(card, src) {
  return !!card && new RegExp(`^${src === 'how' ? 'v' : 'w'}[1-9]\\d{0,11}$`).test(card.id) && card.src === src && typeof card.title === 'string' && card.title.length > 0 && !BAD_TITLE.test(card.title)
    && typeof card.body === 'string' && card.body.length >= (src === 'how' ? 40 : 80) && /^https:\/\/en\.wiki(pedia|voyage)\.org\/wiki\//.test(card.url)
    && (src === 'how' ? !card.img || /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(card.img) : /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(card.img));
}
// Random-sample depths only; Popular and Known come from the vital lists.
export function randomDepths(views) {
  if (views === null) return [];
  return [3, 4, 5].filter(depth => views >= DEPTH_BANDS[depth][0] && views <= DEPTH_BANDS[depth][1]);
}
// Packs each set into shards of SHARD_SIZE; a partial last shard is dropped
// unless it is the only one, so every shard a visitor may draw is full.
export function pack(sets) {
  const files = {}, index = {};
  for (const [set, cards] of Object.entries(sets)) {
    const unique = [...new Map(cards.map(card => [card.id, card])).values()];
    const mixed = shuffle(unique).slice(0, TARGET), count = Math.max(1, Math.floor(mixed.length / SHARD_SIZE));
    if (!mixed.length) { index[set] = 0; continue; }
    for (let i = 0; i < count; i++) files[`${set}-${String(i).padStart(3, '0')}.json`] = count === 1 ? mixed : mixed.slice(i * SHARD_SIZE, (i + 1) * SHARD_SIZE);
    index[set] = count;
  }
  return {files, index};
}

function client() {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let calls = 0, queue = Promise.resolve();
  async function request(url) {
      for (let attempt = 0; attempt < 5; attempt++) {
        calls++;
        try {
          const response = await fetch(url + '&maxlag=5', {headers: {'User-Agent': 'WikiScroll-starter-pool/1.0 (https://wikiscroll.com; contact@wikiscroll.com)'}, signal: AbortSignal.timeout(20000)});
          if (response.status === 429 || response.status >= 500) { await sleep(Math.min(60000, (Number(response.headers.get('Retry-After')) || 2 ** attempt * 2) * 1000)); continue; }
          if (!response.ok) return null;
          const data = await response.json();
          if (data?.error?.code === 'maxlag') { await sleep(5000); continue; }
          await sleep(150);
          return data?.error ? null : data;
        } catch { await sleep(2 ** attempt * 1000); }
      }
      return null;
  }
  return {
    get calls() { return calls; },
    // Sequential and polite: one request at a time, maxlag, and Retry-After.
    json(url) { const next = queue.then(() => request(url)); queue = next.catch(() => {}); return next; }
  };
}
const api = (host, params) => `https://${host}/w/api.php?` + new URLSearchParams({action: 'query', format: 'json', ...params});
const detail = {prop: 'pageimages|info|description|extracts', piprop: 'thumbnail', pilicense: 'any', pithumbsize: '960', pilimit: 'max', inprop: 'url', exintro: '1', explaintext: '1', exchars: '1000', exlimit: 'max'};

async function wikiPages(http, ids) {
  const pages = [];
  for (let i = 0; i < ids.length; i += 20) {
    const data = await http.json(api('en.wikipedia.org', {...detail, pageids: ids.slice(i, i + 20).join('|')}));
    pages.push(...Object.values(data?.query?.pages || {}));
  }
  return pages;
}
async function vitalCards(http, depth, upstream, taken) {
  const options = {cache: null, deadline: Date.now() + 3600000};
  const level3 = await vitalTitles(3, upstream, {}, options);
  let pool = level3 || [];
  if (depth === 2) { const level4 = await vitalTitles(4, upstream, {}, options); const essential = new Set(pool); pool = (level4 || []).filter(t => !essential.has(t)); }
  const cards = [];
  for (const titles of chunks(shuffle(pool).slice(0, TARGET * 2), 20)) {
    if (cards.length >= TARGET) break;
    const data = await http.json(api('en.wikipedia.org', {...detail, titles: titles.join('|'), redirects: '1'}));
    for (const page of Object.values(data?.query?.pages || {})) {
      const card = page.ns === 0 && page.thumbnail?.source ? toCard(page, 'wiki') : null;
      if (validCard(card, 'wiki') && !taken.has(card.id)) { taken.add(card.id); cards.push(card); }
    }
  }
  return cards;
}
const chunks = (values, size) => Array.from({length: Math.ceil(values.length / size)}, (_, i) => values.slice(i * size, (i + 1) * size));

// `taken` holds ids already in a set: the random generator repeats pages across
// rounds, a page can fit two overlapping bands, and redirects can map a Known
// title onto a Popular article, so every card belongs to exactly one set.
async function randomCards(http, taken, maxRounds = 160) {
  const sets = {3: [], 4: [], 5: []};
  for (let round = 0; round < maxRounds && Object.values(sets).some(cards => cards.length < TARGET); round++) {
    const data = await http.json(api('en.wikipedia.org', {generator: 'random', grnnamespace: '0', grnlimit: '50', prop: 'pageimages|pageprops|description', ppprop: 'disambiguation', piprop: 'thumbnail', pilicense: 'any', pithumbsize: '960', pilimit: 'max'}));
    const candidates = Object.values(data?.query?.pages || {}).filter(p => Number.isSafeInteger(p.pageid) && p.pageid > 0 && p.thumbnail?.source && !BAD_TITLE.test(p.title || '') && !isDisambiguation(p) && !taken.has('w' + p.pageid));
    await completePageviews(candidates, ids => http.json(api('en.wikipedia.org', {prop: 'pageviews', pvipdays: '14', pageids: ids})));
    const lag = lagDays(candidates), wanted = [];
    for (const page of candidates) {
      const open = randomDepths(averageViews(page, lag)).filter(depth => sets[depth].length < TARGET);
      if (open.length) wanted.push({page, depth: open.sort((a, b) => sets[a].length - sets[b].length)[0]});
    }
    const detailed = new Map((await wikiPages(http, wanted.map(w => w.page.pageid))).map(p => [p.pageid, p]));
    for (const {page, depth} of wanted) {
      const card = detailed.has(page.pageid) ? toCard(detailed.get(page.pageid), 'wiki') : null;
      if (validCard(card, 'wiki') && !taken.has(card.id)) { taken.add(card.id); sets[depth].push(card); }
    }
  }
  return sets;
}
async function voyageCards(http, taken, maxRounds = 60) {
  const cards = [];
  for (let round = 0; round < maxRounds && cards.length < TARGET; round++) {
    const data = await http.json(api('en.wikivoyage.org', {generator: 'random', grnnamespace: '0', grnlimit: '20', ...detail, prop: detail.prop + '|pageprops|categories', ppprop: 'disambiguation', ...phrasebookParams('en')}));
    for (const page of Object.values(data?.query?.pages || {})) {
      if (isPhrasebook(page) || isDisambiguation(page) || /^(?:travel topics?|itineraries)(?:[ :/]|$)/i.test(page.title || '')) continue;
      const card = toCard(page, 'how');
      if (guideReadable(card.body) && validCard(card, 'how') && !taken.has(card.id)) { taken.add(card.id); cards.push(card); }
    }
  }
  return cards;
}

// Random whole shards of each library set until the set is full. Every card
// still passes validCard, and `taken` keeps each card in one set.
export const LIBRARY = 'https://cards.wikiscroll.com/v1/en/';
async function libraryJSON(url) {
  try {
    const response = await fetch(url, {headers: {'User-Agent': 'WikiScroll-starter-pool/1.0 (https://wikiscroll.com; contact@wikiscroll.com)'}, signal: AbortSignal.timeout(20000)});
    return response.ok ? await response.json() : null;
  } catch { return null; }
}
export async function libraryPool(fetchJSON = libraryJSON, base = LIBRARY) {
  const manifest = await fetchJSON(base + 'current.json');
  if (manifest?.v !== 1 || typeof manifest.base !== 'string' || !manifest.sets) return null;
  const taken = new Set(), sets = {};
  for (const set of SETS) {
    const src = set.startsWith('how') ? 'how' : 'wiki', cards = [];
    for (const shard of shuffle([...Array(Math.max(0, manifest.sets[set] | 0)).keys()])) {
      if (cards.length >= TARGET) break;
      const batch = await fetchJSON(`${base}${manifest.base}${set}/${shard}.json`);
      for (const card of Array.isArray(batch) ? batch : []) if (validCard(card, src) && !taken.has(card.id)) { taken.add(card.id); cards.push(card); }
    }
    sets[set] = cards.slice(0, TARGET);
  }
  return {sets, build: manifest.build};
}

export async function buildPool(http = client()) {
  const upstream = url => http.json(url);
  const taken = new Set();
  const popular = await vitalCards(http, 1, upstream, taken), known = await vitalCards(http, 2, upstream, taken), random = await randomCards(http, taken);
  const sets = {'wiki-en-1': popular, 'wiki-en-2': known, 'wiki-en-3': random[3], 'wiki-en-4': random[4], 'wiki-en-5': random[5], 'how-en': await voyageCards(http, taken)};
  const short = Object.entries(sets).filter(([, cards]) => cards.length < MINIMUM).map(([set, cards]) => `${set}: ${cards.length}`);
  if (short.length) throw Error('Too few cards, keeping the current pool. ' + short.join(', '));
  return {sets, calls: http.calls};
}

export async function writePool(dir, sets, fetchedAt = new Date().toISOString()) {
  const {files, index} = pack(sets);
  await fs.mkdir(dir, {recursive: true});
  for (const name of await fs.readdir(dir)) if (/^(wiki|how)-en-.*\.json$/.test(name) && !files[name]) await fs.rm(path.join(dir, name));
  for (const [name, cards] of Object.entries(files)) await fs.writeFile(path.join(dir, name), JSON.stringify(cards) + '\n');
  await fs.writeFile(path.join(dir, 'index.json'), JSON.stringify({v: 1, fetchedAt, sets: index}, null, 1) + '\n');
  return index;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  try {
    const dir = process.argv[2] || new URL('../public/data/starter/', import.meta.url).pathname;
    const library = await libraryPool();
    const short = library ? Object.entries(library.sets).filter(([, cards]) => cards.length < MINIMUM).map(([set, cards]) => `${set}: ${cards.length}`) : ['unreadable'];
    if (short.length) console.error(`Card library unusable (${short.join(', ')}); using the live API.`);
    const {sets, calls} = short.length ? await buildPool() : {sets: library.sets, calls: 0};
    const index = await writePool(dir, sets);
    console.log(`Starter pool from ${short.length ? 'the live API' : 'library ' + library.build}: ${Object.entries(index).map(([set, n]) => `${set} ${n} shard(s)`).join(', ')}; ${calls} API requests.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
