// Builds the English card library: millions of prebuilt cards for the feed,
// read from Wikimedia's weekly search-index dump instead of the live API.
// Cards keep the feed's {id, src, title, body, img, url, desc} shape and are
// grouped by depth, shuffled across the whole set and packed into small
// gzipped shards that the browser draws from at random.
// Run by .github/workflows/card-library.yml; it never runs during a deploy.
//
//   <cirrus enwiki_content NDJSON on stdin> | node scripts/build-library.mjs \
//     --page-props enwiki-page_props.sql.gz --out library --build 20261025
//
// Inputs:
// - stdin: the decompressed enwiki_content CirrusSearch dump (bulk format: an
//   {"index":{"_id":…}} line, then the page document).
// - --page-props: the gzipped page_props SQL dump, for each page's lead image,
//   short description and disambiguation flag.
// - Two small live lookups: the vital-article lists (Popular, Known) and
//   English Wikipedia's average daily pageviews, which turns each page's
//   popularity share into daily views for the Worker's depth bands.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import readline from 'node:readline';
import {once} from 'node:events';
import {toCard, validCard, randomDepths} from './build-starter.mjs';
import {vitalTitles} from '../worker/vital.js';
import {isDisambiguation} from '../worker/travel.js';

export const SETS = ['wiki-en-1', 'wiki-en-2', 'wiki-en-3', 'wiki-en-4', 'wiki-en-5'];
export const SHARD_SIZE = 100, BUCKETS = 64;
// A set below this many cards fails the build, so a bad week keeps last week's library.
export const MINIMUM = {'wiki-en-1': 500, 'wiki-en-2': 3000, 'wiki-en-3': 50000, 'wiki-en-4': 50000, 'wiki-en-5': 50000};
// R2's free tier allows 1M writes and 10 GB a month. Five weekly builds must
// fit the writes, and one build plus the next one during the swap must fit
// the storage, so a build over either limit is refused before any upload.
export const MAX_FILES = 190_000, MAX_BYTES = 4.5e9;
const UA = 'WikiScroll-card-library/1.0 (https://wikiscroll.com; contact@wikiscroll.com)';
const IMAGE = /\.(jpe?g|png|gif|svg|webp)$/i;
const shuffle = values => { const a = [...values]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// The page_props table names a lead image, not its URL. Thumbnails live under
// an MD5 path of the file name; SVGs are served as PNG. Free images are almost
// always on Commons, non-free ones are always local to English Wikipedia.
export function thumbURL(file, repo = 'commons', width = 960) {
  const name = String(file || '').replace(/ /g, '_');
  if (!name || name.includes('/') || !IMAGE.test(name)) return '';
  const hash = crypto.createHash('md5').update(name).digest('hex'), enc = encodeURIComponent(name);
  return `https://upload.wikimedia.org/wikipedia/${repo === 'commons' ? 'commons' : 'en'}/thumb/${hash[0]}/${hash.slice(0, 2)}/${enc}/${width}px-${enc}${/\.svg$/i.test(name) ? '.png' : ''}`;
}

// Rows of one `INSERT INTO … VALUES (…),(…);` line of a MySQL dump.
export function* sqlRows(line) {
  let i = line.indexOf(' VALUES ');
  if (!line.startsWith('INSERT INTO') || i < 0) return;
  i += 8;
  const n = line.length;
  while (i < n) {
    if (line[i] !== '(') { i++; continue; }
    i++;
    const row = [];
    for (;;) {
      if (line[i] === "'") {
        let text = '', start = ++i;
        for (;;) {
          const quote = line.indexOf("'", i), slash = line.indexOf('\\', i);
          if (quote < 0) return;
          if (slash >= 0 && slash < quote) {
            const c = line[slash + 1];
            text += line.slice(start, slash) + (c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c === '0' ? '\0' : c);
            i = start = slash + 2;
          } else { text += line.slice(start, quote); i = quote + 1; break; }
        }
        row.push(text);
      } else {
        let j = i;
        while (j < n && line[j] !== ',' && line[j] !== ')') j++;
        const raw = line.slice(i, j);
        row.push(raw === 'NULL' ? null : Number(raw));
        i = j;
      }
      if (line[i] === ',') { i++; continue; }
      i++;
      break;
    }
    yield row;
  }
}

// Only four of page_props' many properties matter for a card.
export async function readPageProps(lines) {
  const props = {free: new Map(), any: new Map(), desc: new Map(), disambiguation: new Set()};
  for await (const line of lines) {
    for (const [page, name, value] of sqlRows(line)) {
      if (name === 'page_image_free') props.free.set(page, value);
      else if (name === 'page_image') props.any.set(page, value);
      else if (name === 'wikibase-shortdesc') props.desc.set(page, value);
      else if (name === 'disambiguation') props.disambiguation.add(page);
    }
  }
  return props;
}

// Bulk format pairs an action line carrying the page ID with the document.
export function cirrusReader() {
  let id = null;
  return line => {
    if (!line) return null;
    const value = JSON.parse(line), action = value.index || value.create;
    if (action) { id = Number(action._id); return null; }
    const pageid = Number(value.page_id ?? id);
    id = null;
    return {pageid, doc: value};
  };
}

export function libraryCard(pageid, doc, props) {
  if (doc.namespace !== 0 || !Number.isSafeInteger(pageid) || pageid < 1 || typeof doc.title !== 'string') return null;
  const free = props.free.get(pageid), file = free ?? props.any.get(pageid);
  const page = {pageid, title: doc.title, extract: typeof doc.opening_text === 'string' ? doc.opening_text : '', description: props.desc.get(pageid) || '',
    thumbnail: {source: thumbURL(file, free ? 'commons' : 'en')}, pageprops: props.disambiguation.has(pageid) ? {disambiguation: ''} : {}};
  if (isDisambiguation(page)) return null;
  const card = toCard(page, 'wiki');
  return validCard(card, 'wiki') ? card : null;
}

// popularity_score is the page's share of the wiki's weekly views; unknown
// readership stays unknown and never qualifies as Obscure.
export const dailyViews = (doc, dailyTotal) => typeof doc.popularity_score === 'number' && Number.isFinite(doc.popularity_score) && doc.popularity_score >= 0 ? doc.popularity_score * dailyTotal : null;

export function vitalLevels(level3, level4) {
  const levels = new Map();
  for (const title of level4 || []) levels.set(title, 2);
  for (const title of level3 || []) levels.set(title, 1);
  return levels;
}
export function cardSets(doc, views, levels) {
  const sets = [];
  let level = levels.get(doc.title);
  for (const redirect of Array.isArray(doc.redirect) ? doc.redirect : []) {
    const found = redirect?.namespace === 0 ? levels.get(redirect.title) : undefined;
    if (found && (!level || found < level)) level = found;
  }
  if (level) sets.push('wiki-en-' + level);
  for (const depth of randomDepths(views)) sets.push('wiki-en-' + depth);
  return sets;
}

// An external shuffle: every card goes to a random gzipped bucket file, then
// each bucket is shuffled in memory. Millions of cards never sit in memory at once.
export function createBuckets(dir) {
  const streams = new Map(), counts = Object.fromEntries(SETS.map(set => [set, 0]));
  const open = (set, bucket) => {
    const key = set + '/' + bucket;
    if (!streams.has(key)) {
      fs.mkdirSync(path.join(dir, set), {recursive: true});
      const gzip = zlib.createGzip({level: 1}), file = fs.createWriteStream(path.join(dir, set, bucket + '.ndjson.gz'));
      gzip.pipe(file);
      streams.set(key, {gzip, file});
    }
    return streams.get(key).gzip;
  };
  return {
    counts,
    async add(set, card) {
      counts[set]++;
      const stream = open(set, Math.floor(Math.random() * BUCKETS));
      if (!stream.write(JSON.stringify(card) + '\n')) await once(stream, 'drain');
    },
    async close() {
      await Promise.all([...streams.values()].map(({gzip, file}) => { gzip.end(); return once(file, 'close'); }));
    }
  };
}

async function readBucket(file) {
  if (!fs.existsSync(file)) return [];
  const cards = [];
  const lines = readline.createInterface({input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity});
  for await (const line of lines) if (line) cards.push(JSON.parse(line));
  return cards;
}

// Shards hold SHARD_SIZE cards; leftovers carry into the next bucket and a
// partial last shard is dropped unless it is the only one.
export async function packSet(bucketDir, set, outDir, shardSize = SHARD_SIZE) {
  let carry = [], count = 0, bytes = 0;
  await fsp.mkdir(path.join(outDir, set), {recursive: true});
  const write = async cards => {
    const body = zlib.gzipSync(JSON.stringify(cards) + '\n', {level: 9});
    await fsp.writeFile(path.join(outDir, set, count + '.json'), body);
    count++; bytes += body.length;
  };
  for (let bucket = 0; bucket < BUCKETS; bucket++) {
    const mixed = shuffle([...carry, ...await readBucket(path.join(bucketDir, set, bucket + '.ndjson.gz'))]);
    let i = 0;
    for (; i + shardSize <= mixed.length; i += shardSize) await write(mixed.slice(i, i + shardSize));
    carry = mixed.slice(i);
  }
  if (!count && carry.length) await write(carry);
  return {count, bytes};
}

export async function buildLibrary({lines, props, dailyTotal, levels, outDir, tmpDir, build, source = {}}) {
  const buckets = createBuckets(tmpDir), read = cirrusReader();
  let pages = 0, cards = 0, unknown = 0;
  for await (const line of lines) {
    const entry = read(line);
    if (!entry) continue;
    pages++;
    const card = libraryCard(entry.pageid, entry.doc, props);
    if (!card) continue;
    const views = dailyViews(entry.doc, dailyTotal);
    if (views === null) unknown++;
    const sets = cardSets(entry.doc, views, levels);
    if (sets.length) cards++;
    for (const set of sets) await buckets.add(set, card);
  }
  await buckets.close();
  const short = SETS.filter(set => buckets.counts[set] < MINIMUM[set]).map(set => `${set}: ${buckets.counts[set]}`);
  if (short.length) throw Error('Too few cards, keeping the current library. ' + short.join(', '));
  const sets = {}, root = path.join(outDir, build);
  let files = 0, bytes = 0;
  for (const set of SETS) {
    const packed = await packSet(tmpDir, set, root);
    sets[set] = packed.count; files += packed.count; bytes += packed.bytes;
  }
  if (files > MAX_FILES || bytes > MAX_BYTES) throw Error(`Build too large for the free tier (${files} files, ${(bytes / 1e9).toFixed(2)} GB), keeping the current library.`);
  const manifest = {v: 1, build, builtAt: new Date().toISOString(), base: build + '/', shardSize: SHARD_SIZE, source, sets};
  await fsp.writeFile(path.join(outDir, 'current.json'), zlib.gzipSync(JSON.stringify(manifest) + '\n'));
  return {manifest, pages, cards, unknown, files, bytes, counts: buckets.counts};
}

async function request(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, {headers: {'User-Agent': UA}, signal: AbortSignal.timeout(30000)});
      if (response.status === 429 || response.status >= 500) { await new Promise(r => setTimeout(r, Math.min(60, Number(response.headers.get('Retry-After')) || 2 ** attempt * 2) * 1000)); continue; }
      return response.ok ? await response.json() : null;
    } catch { await new Promise(r => setTimeout(r, 2 ** attempt * 1000)); }
  }
  return null;
}
const day = date => date.toISOString().slice(0, 10).replace(/-/g, '');
export async function averageDailyViews(fetchJSON = request, now = Date.now()) {
  const end = new Date(now - 2 * 86400000), start = new Date(end - 6 * 86400000);
  const data = await fetchJSON(`https://wikimedia.org/api/rest_v1/metrics/pageviews/aggregate/en.wikipedia/all-access/user/daily/${day(start)}00/${day(end)}00`);
  const views = (data?.items || []).map(item => item.views).filter(v => Number.isFinite(v) && v > 0);
  return views.length >= 5 ? views.reduce((a, b) => a + b, 0) / views.length : null;
}
// Polite, one request at a time: these lists are a dozen requests a week.
async function vitalLists() {
  let queue = Promise.resolve();
  const upstream = url => { const next = queue.then(() => request(url + '&maxlag=5')); queue = next.catch(() => {}); return next; };
  const options = {cache: null, deadline: Date.now() + 3600000};
  return [await vitalTitles(3, upstream, {}, options), await vitalTitles(4, upstream, {}, options)];
}

// Report only: how many sampled image links load. Builds never fail on it.
async function checkImages(dir, manifest, sample = 100) {
  const set = 'wiki-en-3', shard = Math.floor(Math.random() * manifest.sets[set]);
  const cards = JSON.parse(zlib.gunzipSync(await fsp.readFile(path.join(dir, manifest.base, set, shard + '.json'))));
  let ok = 0;
  for (const card of cards.slice(0, sample)) {
    try { if ((await fetch(card.img, {method: 'HEAD', headers: {'User-Agent': UA}, signal: AbortSignal.timeout(15000)})).ok) ok++; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  return {ok, checked: Math.min(sample, cards.length)};
}

const option = name => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : undefined; };
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  try {
    const outDir = option('out') || 'library', build = option('build'), propsFile = option('page-props');
    if (!/^\d{8}$/.test(build || '') || !propsFile) throw Error('Use --build YYYYMMDD --page-props FILE [--out DIR].');
    const dailyTotal = await averageDailyViews();
    if (!dailyTotal) throw Error('English Wikipedia pageview totals are unavailable, keeping the current library.');
    const [level3, level4] = await vitalLists();
    if (!level3 || !level4) throw Error('Vital-article lists are unavailable, keeping the current library.');
    const props = await readPageProps(readline.createInterface({input: fs.createReadStream(propsFile).pipe(zlib.createGunzip()), crlfDelay: Infinity}));
    const tmpDir = await fsp.mkdtemp(path.join(option('tmp') || outDir, '.buckets-'));
    const result = await buildLibrary({lines: readline.createInterface({input: process.stdin, crlfDelay: Infinity}), props, dailyTotal, levels: vitalLevels(level3, level4),
      outDir, tmpDir, build, source: {cirrus: build, pageProps: option('page-props-date') || null}});
    await fsp.rm(tmpDir, {recursive: true, force: true});
    const images = await checkImages(outDir, result.manifest);
    console.log(`Card library ${build}: ${result.pages} pages read, ${result.cards} cards (${result.unknown} without readership), ${result.files} shards, ${(result.bytes / 1e9).toFixed(2)} GB.`);
    console.log('Shards per set: ' + SETS.map(set => `${set} ${result.manifest.sets[set]}`).join(', ') + `. Average daily views used: ${Math.round(dailyTotal)}.`);
    console.log(`Image check: ${images.ok} of ${images.checked} sampled images loaded.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
