// Builds the English card library: millions of prebuilt cards for every feed
// the site offers (depths, topics, Help Wikipedia, Wikivoyage), read from
// Wikimedia's weekly dumps instead of the live API. Cards keep the Worker's
// own answer shapes and are grouped into sets, shuffled across each whole set
// and packed into small gzipped shards that the browser draws from at random.
// Run by .github/workflows/card-library.yml; it never runs during a deploy.
//
//   <cirrus enwiki_content NDJSON on stdin> | node scripts/build-library.mjs \
//     --build 20261025 --page-props enwiki-page_props.sql.gz \
//     --page enwiki-page.sql.gz --categorylinks enwiki-categorylinks.sql.gz \
//     [--linktarget enwiki-linktarget.sql.gz] \
//     [--voyage enwikivoyage_content.ndjson --voyage-props enwikivoyage-page_props.sql.gz] \
//     --out library
//
// Inputs:
// - stdin: the decompressed enwiki_content CirrusSearch dump (bulk format: an
//   {"index":{"_id":…}} line, then the page document with its categories,
//   hidden maintenance categories included).
// - page_props: each page's lead image, short description and disambiguation flag.
// - page + categorylinks (+ linktarget on the newer schema): the category tree
//   for topics, and talk-page photo requests for Help Wikipedia.
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
import {randomDepths} from './build-starter.mjs';
import {vitalTitles} from '../worker/vital.js';
import {isDisambiguation, isPhrasebook} from '../worker/travel.js';
import {imageURL} from '../worker/supply.js';
import {guideReadable} from '../worker/extracts.js';
import {roots, bands as TOPIC_BANDS} from '../worker/topics.js';
import {NEED_CATEGORIES, TALK_NEED_CATEGORIES, HELP_TYPES, NEED_ORDER, availableHelpTypes} from '../worker/needs.js';

const LANG = 'en';
export const TOPICS = Object.keys(roots), HELP = availableHelpTypes(LANG), DEPTHS = [1, 2, 3, 4, 5];
export const SETS = [
  ...DEPTHS.map(d => `wiki-${LANG}-${d}`),
  ...TOPICS.flatMap(topic => DEPTHS.map(d => `topic-${LANG}-${topic}-${d}`)),
  ...HELP.flatMap(type => DEPTHS.map(d => `help-${LANG}-${type}-${d}`)),
  `how-${LANG}`,
];
export const SHARD_SIZE = 100, BUCKETS = 64;
// Matches the live feeds' introductions (exchars 1000); cards fit them to the screen.
export const BODY_CHARS = 1000;
// The live topic walk goes two category levels below a root, three for Niche and Obscure.
export const topicLevels = depth => depth >= 4 ? 3 : 2;
// Topic and Help sets are slices of the same pool, so each keeps a generous
// random sample instead of every match; the depth sets keep every card.
export const SLICE_CAP = 40_000;
// A set below this many cards fails the build, so a bad week keeps last week's library.
export const MINIMUM = {'wiki-en-1': 500, 'wiki-en-2': 3000, 'wiki-en-3': 50000, 'wiki-en-4': 50000, 'wiki-en-5': 50000, 'how-en': 10000};
// R2's free tier allows 1M writes and 10 GB a month. Five weekly builds must
// fit the writes, and one build plus the next one during the swap must fit
// the storage, so a build over either limit is refused before any upload.
export const MAX_FILES = 190_000, MAX_BYTES = 4.5e9;
const UA = 'WikiScroll-card-library/1.0 (https://wikiscroll.com; contact@wikiscroll.com)';
const IMAGE = /\.(jpe?g|png|gif|svg|webp)$/i;
const BAD_TITLE = /^(list of|lists of|index of|outline of|timeline of|glossary of|comparison of)\b/i;
const strip = s => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const shuffle = values => { const a = [...values]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fromTitle = title => String(title).replace(/_/g, ' ');
const inBand = (views, [low, high]) => views !== null && views >= low && views <= high;

// Trims at a sentence end where possible, like the live introductions.
export function shorten(text, max = BODY_CHARS) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max), end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end >= 200 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…';
}

// The page_props table names a lead image, not its URL. Thumbnails live under
// an MD5 path of the file name; SVGs are served as PNG. Free images are almost
// always on Commons, non-free ones are always local to the wiki.
export function thumbURL(file, repo = 'commons', width = 960) {
  const name = String(file || '').replace(/ /g, '_');
  if (!name || name.includes('/') || !IMAGE.test(name)) return '';
  const hash = crypto.createHash('md5').update(name).digest('hex'), enc = encodeURIComponent(name);
  return `https://upload.wikimedia.org/${repo === 'commons' ? 'wikipedia/commons' : repo}/thumb/${hash[0]}/${hash.slice(0, 2)}/${enc}/${width}px-${enc}${/\.svg$/i.test(name) ? '.png' : ''}`;
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

// Reads a table dump by column name, so a schema change (categorylinks moved
// from cl_to to cl_target_id) is detected instead of misread.
export async function readTable(lines, onRow) {
  let columns = null, creating = null;
  for await (const line of lines) {
    if (line.startsWith('CREATE TABLE')) { creating = []; continue; }
    if (creating) {
      const column = /^\s+`([^`]+)`/.exec(line);
      if (column) creating.push(column[1]);
      else if (line.startsWith(')')) { columns = Object.fromEntries(creating.map((name, i) => [name, i])); creating = null; }
      continue;
    }
    if (!columns || !line.startsWith('INSERT INTO')) continue;
    for (const row of sqlRows(line)) onRow(row, columns);
  }
  if (!columns) throw Error('Table dump has no CREATE TABLE statement.');
  return columns;
}
const need = (columns, ...names) => { for (const name of names) if (!(name in columns)) throw Error(`Table dump has no ${name} column.`); };

// Only four of page_props' many properties matter for a card.
export async function readPageProps(lines) {
  const props = {free: new Map(), any: new Map(), desc: new Map(), disambiguation: new Set()};
  await readTable(lines, (row, c) => {
    const page = row[c.pp_page], name = row[c.pp_propname], value = row[c.pp_value];
    if (name === 'page_image_free') props.free.set(page, value);
    else if (name === 'page_image') props.any.set(page, value);
    else if (name === 'wikibase-shortdesc') props.desc.set(page, value);
    else if (name === 'disambiguation') props.disambiguation.add(page);
  });
  return props;
}
export const emptyProps = () => ({free: new Map(), any: new Map(), desc: new Map(), disambiguation: new Set()});

// Category tree edges (child category page ID → parent title) and talk pages
// in the photo-request category. Parent titles come from cl_to on the old
// schema, or from linktarget on the new one.
export async function readLinkTargets(lines) {
  const titles = new Map();
  const columns = await readTable(lines, (row, c) => { if (row[c.lt_namespace] === 14) titles.set(row[c.lt_id], row[c.lt_title]); });
  need(columns, 'lt_id', 'lt_namespace', 'lt_title');
  return titles;
}
export async function readCategoryLinks(lines, targets = null) {
  const edges = [], photoTalk = new Set(), photo = Object.keys(TALK_NEED_CATEGORIES[LANG] || {}).map(t => t.replace(/^Category:/, '').replace(/ /g, '_'));
  let schema = null;
  const columns = await readTable(lines, (row, c) => {
    schema ||= 'cl_to' in c ? 'title' : 'target';
    const parent = schema === 'title' ? row[c.cl_to] : targets?.get(row[c.cl_target_id]);
    if (parent === undefined || parent === null) return;
    if (row[c.cl_type] === 'subcat') edges.push(row[c.cl_from], parent);
    else if (row[c.cl_type] === 'page' && photo.includes(parent)) photoTalk.add(row[c.cl_from]);
  });
  need(columns, 'cl_from', 'cl_type');
  if (!('cl_to' in columns)) { need(columns, 'cl_target_id'); if (!targets) throw Error('categorylinks uses cl_target_id: pass --linktarget.'); }
  return {edges, photoTalk};
}
// Category page titles for the edges' children, and article titles for the photo requests.
export async function readPages(lines, {edges, photoTalk}) {
  const wanted = new Set();
  for (let i = 0; i < edges.length; i += 2) wanted.add(edges[i]);
  const categories = new Map(), photoTitles = new Set();
  const columns = await readTable(lines, (row, c) => {
    const id = row[c.page_id], ns = row[c.page_namespace];
    if (ns === 14 && wanted.has(id)) categories.set(id, row[c.page_title]);
    else if (ns === 1 && photoTalk.has(id)) photoTitles.add(fromTitle(row[c.page_title]));
  });
  need(columns, 'page_id', 'page_namespace', 'page_title');
  const children = new Map();
  for (let i = 0; i < edges.length; i += 2) {
    const child = categories.get(edges[i]);
    if (child === undefined) continue;
    const parent = fromTitle(edges[i + 1]), list = children.get(parent);
    if (list) list.push(fromTitle(child)); else children.set(parent, [fromTitle(child)]);
  }
  return {children, photoTitles};
}

// Category title → [[topic, level]]: every category within three levels of a
// topic's roots, at its shortest distance. Cycles in the tree are harmless.
export function topicCategories(children, topicRoots = roots, maxLevel = 3) {
  const reach = new Map();
  for (const [topic, list] of Object.entries(topicRoots)) {
    const level = new Map(list.map(root => [root, 0]));
    let frontier = [...list];
    for (let depth = 1; depth <= maxLevel && frontier.length; depth++) {
      const next = [];
      for (const parent of frontier) for (const child of children.get(parent) || []) if (!level.has(child)) { level.set(child, depth); next.push(child); }
      frontier = next;
    }
    for (const [category, depth] of level) {
      const entry = reach.get(category);
      if (entry) entry.push([topic, depth]); else reach.set(category, [[topic, depth]]);
    }
  }
  return reach;
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

const ARTICLE_NEEDS = Object.fromEntries(Object.entries(NEED_CATEGORIES[LANG] || {}).map(([title, code]) => [title.replace(/^Category:/, ''), code]));
// Maintenance needs in the live order; photo requests come from talk pages.
export function cardNeeds(doc, photoTitles = new Set()) {
  const found = new Set();
  for (const category of Array.isArray(doc.category) ? doc.category : []) if (ARTICLE_NEEDS[category]) found.add(ARTICLE_NEEDS[category]);
  if (photoTitles.has(doc.title)) found.add('images');
  return NEED_ORDER.filter(code => found.has(code));
}

// The Worker's article(): a card with or without an image (only the depth
// sets require one, as the live random feed does).
export function libraryCard(pageid, doc, props, src = 'wiki', host = `${LANG}.wikipedia.org`) {
  if (doc.namespace !== 0 || !Number.isSafeInteger(pageid) || pageid < 1 || typeof doc.title !== 'string' || !doc.title || BAD_TITLE.test(doc.title)) return null;
  const free = props.free.get(pageid), file = free ?? props.any.get(pageid), desc = strip(props.desc.get(pageid) || '').slice(0, 160);
  const page = {title: doc.title, description: desc, pageprops: props.disambiguation.has(pageid) ? {disambiguation: ''} : {}};
  if (isDisambiguation(page)) return null;
  const body = shorten(strip(doc.opening_text));
  if (src === 'how' ? !guideReadable(body) : body.length < 80) return null;
  const img = imageURL(thumbURL(file, free ? 'commons' : (src === 'how' ? 'wikivoyage/' : 'wikipedia/') + LANG));
  return {id: (src === 'how' ? 'v' : 'w') + pageid, src, title: doc.title, body, img, url: `https://${host}/wiki/${encodeURIComponent(doc.title.replace(/ /g, '_'))}`, ...(desc ? {desc} : {})};
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
function vitalLevel(doc, levels) {
  let level = levels.get(doc.title);
  for (const redirect of Array.isArray(doc.redirect) ? doc.redirect : []) {
    const found = redirect?.namespace === 0 ? levels.get(redirect.title) : undefined;
    if (found && (!level || found < level)) level = found;
  }
  return level;
}
// Topic → shortest distance from its roots over the page's categories.
export function pageTopics(doc, reach) {
  const topics = new Map();
  for (const category of Array.isArray(doc.category) ? doc.category : []) {
    for (const [topic, level] of reach.get(category) || []) if (!topics.has(topic) || level < topics.get(topic)) topics.set(topic, level);
  }
  return topics;
}
// Every set a page belongs to, with the card variant each set serves.
export function cardSets(doc, card, views, {levels, reach = new Map(), photoTitles = new Set()}) {
  const sets = [], needs = cardNeeds(doc, photoTitles), tagged = needs.length ? {...card, needs} : card;
  if (card.img) {
    const level = vitalLevel(doc, levels);
    if (level) sets.push([`wiki-${LANG}-${level}`, tagged]);
    for (const depth of randomDepths(views)) sets.push([`wiki-${LANG}-${depth}`, tagged]);
  }
  for (const [topic, level] of pageTopics(doc, reach)) {
    const topical = {...tagged, topic};
    for (const depth of DEPTHS) if (level <= topicLevels(depth) && inBand(views, TOPIC_BANDS[depth])) sets.push([`topic-${LANG}-${topic}-${depth}`, topical]);
  }
  if (needs.length) {
    const help = {...card, needs};
    for (const type of HELP) if (HELP_TYPES[type].some(code => needs.includes(code))) {
      for (const depth of DEPTHS) if (inBand(views, TOPIC_BANDS[depth])) sets.push([`help-${LANG}-${type}-${depth}`, help]);
    }
  }
  return sets;
}
// Wikivoyage guides: no depth, an optional image, no phrasebooks or travel topics.
export function voyageCard(pageid, doc, props) {
  const page = {title: doc.title, categories: (Array.isArray(doc.category) ? doc.category : []).filter(c => c === 'Phrasebooks')};
  if (isPhrasebook(page) || /^(?:travel topics?|itineraries)(?:[ :/]|$)/i.test(doc.title || '')) return null;
  return libraryCard(pageid, doc, props, 'how', `${LANG}.wikivoyage.org`);
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
// partial last shard is dropped unless it is the only one. A cap keeps a
// random sample: buckets are already random, so the first cards are.
export async function packSet(bucketDir, set, outDir, shardSize = SHARD_SIZE, cap = Infinity) {
  let carry = [], count = 0, bytes = 0, cards = 0;
  const write = async list => {
    if (!count) await fsp.mkdir(path.join(outDir, set), {recursive: true});
    const body = zlib.gzipSync(JSON.stringify(list) + '\n', {level: 9});
    await fsp.writeFile(path.join(outDir, set, count + '.json'), body);
    count++; bytes += body.length; cards += list.length;
  };
  for (let bucket = 0; bucket < BUCKETS && cards + shardSize <= cap; bucket++) {
    const mixed = shuffle([...carry, ...await readBucket(path.join(bucketDir, set, bucket + '.ndjson.gz'))]);
    let i = 0;
    for (; i + shardSize <= mixed.length && cards + shardSize <= cap; i += shardSize) await write(mixed.slice(i, i + shardSize));
    carry = mixed.slice(i);
  }
  if (!count && carry.length) await write(carry.slice(0, Math.min(cap, carry.length)));
  return {count, bytes, cards};
}
const capFor = set => set.startsWith('topic-') || set.startsWith('help-') ? SLICE_CAP : Infinity;

export async function buildLibrary({lines, props, dailyTotal, levels, reach = new Map(), photoTitles = new Set(), voyage = null, outDir, tmpDir, build, source = {}}) {
  const buckets = createBuckets(tmpDir), stats = {pages: 0, cards: 0, unknown: 0, guides: 0};
  let read = cirrusReader();
  for await (const line of lines) {
    const entry = read(line);
    if (!entry) continue;
    stats.pages++;
    const card = libraryCard(entry.pageid, entry.doc, props);
    if (!card) continue;
    const views = dailyViews(entry.doc, dailyTotal);
    if (views === null) stats.unknown++;
    const sets = cardSets(entry.doc, card, views, {levels, reach, photoTitles});
    if (sets.length) stats.cards++;
    for (const [set, variant] of sets) await buckets.add(set, variant);
  }
  if (voyage) {
    read = cirrusReader();
    for await (const line of voyage.lines) {
      const entry = read(line);
      const card = entry && voyageCard(entry.pageid, entry.doc, voyage.props);
      if (card) { stats.guides++; await buckets.add(`how-${LANG}`, card); }
    }
  }
  await buckets.close();
  const report = SETS.map(set => `${set}: ${buckets.counts[set]}`).join(', ');
  const short = Object.entries(MINIMUM).filter(([set, min]) => buckets.counts[set] < min).map(([set]) => `${set}: ${buckets.counts[set]}`);
  if (short.length) throw Error('Too few cards, keeping the current library. ' + short.join(', ') + '\nAll sets: ' + report);
  const sets = {}, root = path.join(outDir, build);
  let files = 0, bytes = 0;
  for (const set of SETS) {
    const packed = await packSet(tmpDir, set, root, SHARD_SIZE, capFor(set));
    sets[set] = packed.count; files += packed.count; bytes += packed.bytes;
  }
  if (files > MAX_FILES || bytes > MAX_BYTES) throw Error(`Build too large for the free tier (${files} files, ${(bytes / 1e9).toFixed(2)} GB), keeping the current library.\nAll sets: ${report}`);
  const manifest = {v: 1, build, builtAt: new Date().toISOString(), base: build + '/', shardSize: SHARD_SIZE, source, sets};
  await fsp.writeFile(path.join(outDir, 'current.json'), zlib.gzipSync(JSON.stringify(manifest) + '\n'));
  return {manifest, ...stats, files, bytes, counts: buckets.counts};
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
const sqlLines = file => readline.createInterface({input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity});
const textLines = file => readline.createInterface({input: fs.createReadStream(file), crlfDelay: Infinity});
const log = message => console.error(new Date().toISOString().slice(11, 19) + ' ' + message);
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  try {
    const outDir = option('out') || 'library', build = option('build');
    for (const name of ['page-props', 'page', 'categorylinks']) if (!option(name)) throw Error(`Missing --${name}.`);
    if (!/^\d{8}$/.test(build || '')) throw Error('Use --build YYYYMMDD.');
    const dailyTotal = await averageDailyViews();
    if (!dailyTotal) throw Error('English Wikipedia pageview totals are unavailable, keeping the current library.');
    const [level3, level4] = await vitalLists();
    if (!level3 || !level4) throw Error('Vital-article lists are unavailable, keeping the current library.');
    log('Reading page properties');
    const props = await readPageProps(sqlLines(option('page-props')));
    log('Reading the category tree');
    const targets = option('linktarget') ? await readLinkTargets(sqlLines(option('linktarget'))) : null;
    const links = await readCategoryLinks(sqlLines(option('categorylinks')), targets);
    targets?.clear();
    const {children, photoTitles} = await readPages(sqlLines(option('page')), links);
    links.edges.length = 0;
    const reach = topicCategories(children);
    children.clear();
    log(`Topic categories: ${reach.size}; photo requests: ${photoTitles.size}`);
    const voyage = option('voyage') ? {lines: textLines(option('voyage')), props: option('voyage-props') ? await readPageProps(sqlLines(option('voyage-props'))) : emptyProps()} : null;
    const tmpDir = await fsp.mkdtemp(path.join(option('tmp') || outDir, '.buckets-'));
    log('Reading articles');
    const result = await buildLibrary({lines: readline.createInterface({input: process.stdin, crlfDelay: Infinity}), props, dailyTotal, levels: vitalLevels(level3, level4),
      reach, photoTitles, voyage, outDir, tmpDir, build, source: {cirrus: build}});
    await fsp.rm(tmpDir, {recursive: true, force: true});
    const images = await checkImages(outDir, result.manifest);
    const per = prefix => SETS.filter(s => s.startsWith(prefix)).reduce((sum, s) => sum + result.manifest.sets[s], 0);
    console.log(`Card library ${build}: ${result.pages} pages read, ${result.cards} articles in at least one set (${result.unknown} without readership), ${result.guides} travel guides.`);
    console.log(`${result.files} shards, ${(result.bytes / 1e9).toFixed(2)} GB: depth sets ${per('wiki-')}, topic sets ${per('topic-')}, Help sets ${per('help-')}, travel ${per('how-')} shards.`);
    console.log('Cards per set: ' + SETS.map(set => `${set} ${result.counts[set]}`).join(', ') + `. Average daily views used: ${Math.round(dailyTotal)}.`);
    console.log(`Image check: ${images.ok} of ${images.checked} sampled images loaded.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
