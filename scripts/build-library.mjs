// Builds one language's card library (English by default, --lang de etc.): millions of prebuilt cards for every feed
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
//     [--lang en] --out library
//
// Inputs:
// - stdin: the decompressed enwiki_content CirrusSearch dump (bulk format: an
//   {"index":{"_id":…}} line, then the page document with its categories,
//   hidden maintenance categories included).
// - page_props: each page's lead image, short description and disambiguation flag.
// - image (optional): files uploaded to this wiki itself, so image links pick
//   the right upload folder (File: pages are the fallback).
// - page + categorylinks (+ linktarget on the newer schema): the category tree
//   for topics, and talk-page photo requests for Help Wikipedia.
// - A few small live lookups: the vital-article lists (Popular, Known) and,
//   for other languages, their titles and topic root categories there via
//   English Wikipedia's interlanguage links; and the wiki's average daily
//   pageviews, which turns each page's popularity share into daily views.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import readline from 'node:readline';
import {once} from 'node:events';
import {randomDepths} from './build-starter.mjs';
import {vitalTitles} from '../worker/vital.js';
import {isDisambiguation, isPhrasebook, PHRASEBOOK_CATEGORY} from '../worker/travel.js';
import {imageURL} from '../worker/supply.js';
import {guideReadable} from '../worker/extracts.js';
import {roots, bands as TOPIC_BANDS} from '../worker/topics.js';
import {isMature} from '../worker/mature.js';
import {VIEW_SCALE} from '../worker/pageviews.js';
import {NEED_CATEGORIES, TALK_NEED_CATEGORIES, HELP_TYPES, NEED_ORDER, availableHelpTypes} from '../worker/needs.js';

// The language comes from --lang, so the exported set names match the build.
export const LANG = (() => { const i = process.argv.indexOf('--lang'), lang = i > 0 ? process.argv[i + 1] : 'en'; if (!/^[a-z]{2,3}$/.test(lang)) throw Error('Use --lang with a wiki language code.'); return lang; })();
export const TOPICS = Object.keys(roots), HELP = availableHelpTypes(LANG), DEPTHS = [1, 2, 3, 4, 5];
export const SETS = [
  ...DEPTHS.map(d => `wiki-${LANG}-${d}`),
  ...TOPICS.flatMap(topic => DEPTHS.map(d => `topic-${LANG}-${topic}-${d}`)),
  ...HELP.flatMap(type => DEPTHS.map(d => `help-${LANG}-${type}-${d}`)),
  // A topic feed filtered to one Help type, so the browser never sifts topic cards.
  ...TOPICS.flatMap(topic => HELP.flatMap(type => DEPTHS.map(d => `topic-${LANG}-${topic}-help-${type}-${d}`))),
  `how-${LANG}`,
];
export const SHARD_SIZE = 100, BUCKETS = 64;
// Matches the live feeds' introductions (exchars 1000); cards fit them to the screen.
export const BODY_CHARS = 1000;
// The live topic walk goes two category levels below a root, three for Niche and Obscure.
export const topicLevels = depth => depth >= 4 ? 3 : 2;
// Topic and Help sets are slices of the same pool, so each keeps a generous
// random sample instead of every match; the depth sets keep every card.
export const SLICE_CAP = 40_000, COMBO_CAP = 10_000;
// A set below this many cards fails the build, so a bad week keeps last week's library.
// English minima. Popular and Known follow the English lists through
// interlanguage links, so most of them carry over; the random depths and
// travel guides scale with each wiki's size.
const EN_MINIMUM = {1: 500, 2: 3000, 3: 50000, 4: 50000, 5: 50000};
export const MINIMUM_SCALE = {en: 1, de: 0.4, fr: 0.4, es: 0.3}, GUIDE_MINIMUM = {en: 10000, de: 5000, fr: 1500, es: 500};
export const MINIMUM = Object.fromEntries([...DEPTHS.map(d => [`wiki-${LANG}-${d}`, Math.round(EN_MINIMUM[d] * (d <= 2 ? (LANG === 'en' ? 1 : 0.8) : MINIMUM_SCALE[LANG] ?? 0.1))]), [`how-${LANG}`, GUIDE_MINIMUM[LANG] ?? 100]]);
// R2's free tier allows 1M writes and 10 GB a month. Two builds a week (English
// and one other language) for five weeks must fit the writes, and one build
// plus the next one during the swap must fit the storage, so a build over
// either limit is refused before any upload. The workflow also checks the
// whole bucket against its storage limit before each upload.
export const MAX_FILES = 95_000, MAX_BYTES = 4.5e9;
// The category walk reaches hundreds of thousands of categories; far fewer
// means the tree was misread, so the build stops before reading articles.
export const MIN_TOPIC_CATEGORIES = 5000;
// Share of answered image links that may fail in the sample before a build is refused.
export const MAX_BROKEN_IMAGES = 0.05;
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

// Rows of one line of a MySQL dump: an `INSERT INTO … VALUES (…),(…);` line,
// or, in dumps that put each row on its own line after `INSERT INTO … VALUES`,
// a `(…),` line (`continued`).
export function* sqlRows(line, continued = false) {
  let i;
  if (line.startsWith('INSERT INTO')) { i = line.indexOf(' VALUES'); if (i < 0) return; i += 7; }
  else if (continued) i = 0;
  else return;
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
        // A copy, not a slice: a slice keeps its whole multi-megabyte INSERT line alive.
        row.push(text.length > 12 ? (' ' + text).slice(1) : text);
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
  let columns = null, creating = null, inserting = false;
  for await (const line of lines) {
    if (line.startsWith('CREATE TABLE')) { creating = []; continue; }
    if (creating) {
      const column = /^\s+`([^`]+)`/.exec(line);
      if (column) creating.push(column[1]);
      else if (line.startsWith(')')) { columns = Object.fromEntries(creating.map((name, i) => [name, i])); creating = null; }
      continue;
    }
    if (!columns) continue;
    const start = line.startsWith('INSERT INTO');
    if (!start && !inserting) continue;
    for (const row of sqlRows(line, !start)) onRow(row, columns);
    inserting = !line.trimEnd().endsWith(';');
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
// in the photo-request category. Parent titles come from linktarget when the
// dump has cl_target_id, or from cl_to on the old schema (a dump can carry an
// emptied cl_to column next to cl_target_id).
export async function readLinkTargets(lines) {
  const titles = new Map();
  let rows = 0, sample = null;
  const columns = await readTable(lines, (row, c) => { rows++; sample ??= row; if (row[c.lt_namespace] === 14) titles.set(row[c.lt_id], row[c.lt_title]); });
  need(columns, 'lt_id', 'lt_namespace', 'lt_title');
  if (rows && !titles.size) throw Error(`linktarget has ${rows} rows but no categories (columns ${Object.keys(columns).join(',')}; first row ${JSON.stringify(sample).slice(0, 200)}).`);
  return titles;
}
export async function readCategoryLinks(lines, targets = null) {
  const edges = [], photoTalk = new Set(), photo = Object.keys(TALK_NEED_CATEGORIES[LANG] || {}).map(t => bare(t).replace(/ /g, '_'));
  const columns = await readTable(lines, (row, c) => {
    const parent = (targets && 'cl_target_id' in c ? targets.get(row[c.cl_target_id]) : null) || ('cl_to' in c ? row[c.cl_to] : null);
    if (!parent) return;
    if (row[c.cl_type] === 'subcat') edges.push(row[c.cl_from], parent);
    else if (row[c.cl_type] === 'page' && photo.includes(parent)) photoTalk.add(row[c.cl_from]);
  });
  need(columns, 'cl_from', 'cl_type');
  if (!('cl_to' in columns)) { need(columns, 'cl_target_id'); if (!targets) throw Error('categorylinks uses cl_target_id: pass --linktarget.'); }
  return {edges, photoTalk};
}
// Files actually uploaded to this wiki. A local File: page alone doesn't mean
// that: many describe a Commons file (featured pictures, local notes).
export async function readLocalFiles(lines) {
  const names = new Set();
  need(await readTable(lines, (row, c) => { names.add(row[c.img_name]); }), 'img_name');
  return names;
}
export const MIN_LOCAL_FILES = 100_000;
// Category page titles for the edges' children, article titles for the photo
// requests, and the files uploaded to this wiki itself rather than Commons.
export async function readPages(lines, {edges, photoTalk}) {
  const wanted = new Set();
  for (let i = 0; i < edges.length; i += 2) wanted.add(edges[i]);
  const categories = new Map(), photoTitles = new Set(), localFiles = new Set();
  const columns = await readTable(lines, (row, c) => {
    const id = row[c.page_id], ns = row[c.page_namespace];
    if (ns === 14 && wanted.has(id)) categories.set(id, row[c.page_title]);
    else if (ns === 1 && photoTalk.has(id)) photoTitles.add(fromTitle(row[c.page_title]));
    else if (ns === 6) localFiles.add(row[c.page_title]);
  });
  need(columns, 'page_id', 'page_namespace', 'page_title');
  const children = new Map();
  for (let i = 0; i < edges.length; i += 2) {
    const child = categories.get(edges[i]);
    if (child === undefined) continue;
    const parent = fromTitle(edges[i + 1]), list = children.get(parent);
    if (list) list.push(fromTitle(child)); else children.set(parent, [fromTitle(child)]);
  }
  return {children, photoTitles, localFiles};
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

// Category titles without their namespace (Category:, Kategorie:, Catégorie:…).
const bare = title => String(title).replace(/^[^:]+:/, '');
const ARTICLE_NEEDS = Object.fromEntries(Object.entries(NEED_CATEGORIES[LANG] || {}).map(([title, code]) => [bare(title), code]));
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
  // A free image can still be a local upload, so the wiki's own file pages
  // decide where it lives when they are known.
  const local = props.local ? props.local.has(String(file).replace(/ /g, '_')) : !free;
  const img = imageURL(thumbURL(file, local ? (src === 'how' ? 'wikivoyage/' : 'wikipedia/') + LANG : 'commons'));
  return {id: (src === 'how' ? 'v' : 'w') + pageid, src, title: doc.title, body, img, url: `https://${host}/wiki/${encodeURIComponent(doc.title.replace(/ /g, '_'))}`, ...(desc ? {desc} : {}),
    ...(src === 'wiki' && isMature({title: doc.title, description: desc, categories: doc.category, lang: LANG}) ? {mature: 1} : {})};
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
export function cardSets(doc, card, localViews, {levels, reach = new Map(), photoTitles = new Set()}) {
  // The bands are English readership; a smaller wiki's views are scaled up to
  // match, as the Worker scales its bands (scaleBand).
  const views = localViews === null ? null : localViews / (VIEW_SCALE[LANG] ?? 1);
  const sets = [], needs = cardNeeds(doc, photoTitles), tagged = needs.length ? {...card, needs} : card;
  if (card.img) {
    const level = vitalLevel(doc, levels);
    if (level) sets.push([`wiki-${LANG}-${level}`, tagged]);
    for (const depth of randomDepths(views)) sets.push([`wiki-${LANG}-${depth}`, tagged]);
  }
  for (const [topic, level] of pageTopics(doc, reach)) {
    const topical = {...tagged, topic};
    for (const depth of DEPTHS) if (level <= topicLevels(depth) && inBand(views, TOPIC_BANDS[depth])) {
      sets.push([`topic-${LANG}-${topic}-${depth}`, topical]);
      for (const type of HELP) if (HELP_TYPES[type].some(code => needs.includes(code))) sets.push([`topic-${LANG}-${topic}-help-${type}-${depth}`, topical]);
    }
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
  const phrasebooks = PHRASEBOOK_CATEGORY[LANG] ? bare(PHRASEBOOK_CATEGORY[LANG]) : null;
  const page = {title: doc.title, categories: (Array.isArray(doc.category) ? doc.category : []).filter(c => c === phrasebooks)};
  if (isPhrasebook(page) || /^(?:travel topics?|itineraries)(?:[ :/]|$)/i.test(doc.title || '')) return null;
  return libraryCard(pageid, doc, props, 'how', `${LANG}.wikivoyage.org`);
}

// An external shuffle: every card goes to a random gzipped bucket file, then
// each bucket is shuffled in memory. Millions of cards never sit in memory at once.
// Capped sets keep a sample, so fewer buckets do; that keeps open files and
// compressor memory bounded across hundreds of sets.
const capFor = set => /-help-/.test(set) ? COMBO_CAP : set.startsWith('topic-') || set.startsWith('help-') ? SLICE_CAP : Infinity;
export const bucketsFor = set => capFor(set) === Infinity ? BUCKETS : 16;
export function createBuckets(dir) {
  const streams = new Map(), counts = Object.fromEntries(SETS.map(set => [set, 0]));
  const open = (set, bucket) => {
    const key = set + '/' + bucket;
    if (!streams.has(key)) {
      fs.mkdirSync(path.join(dir, set), {recursive: true});
      const gzip = zlib.createGzip({level: 1, windowBits: 12, memLevel: 6}), file = fs.createWriteStream(path.join(dir, set, bucket + '.ndjson.gz'));
      gzip.pipe(file);
      streams.set(key, {gzip, file});
    }
    return streams.get(key).gzip;
  };
  return {
    counts,
    async add(set, card) {
      counts[set]++;
      const stream = open(set, Math.floor(Math.random() * bucketsFor(set)));
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
  for (let bucket = 0, total = bucketsFor(set); bucket < total && cards + shardSize <= cap; bucket++) {
    const mixed = shuffle([...carry, ...await readBucket(path.join(bucketDir, set, bucket + '.ndjson.gz'))]);
    let i = 0;
    for (; i + shardSize <= mixed.length && cards + shardSize <= cap; i += shardSize) await write(mixed.slice(i, i + shardSize));
    carry = mixed.slice(i);
  }
  if (!count && carry.length) await write(carry.slice(0, Math.min(cap, carry.length)));
  return {count, bytes, cards};
}

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
export async function averageDailyViews(fetchJSON = request, now = Date.now(), lang = LANG) {
  const end = new Date(now - 2 * 86400000), start = new Date(end - 6 * 86400000);
  const data = await fetchJSON(`https://wikimedia.org/api/rest_v1/metrics/pageviews/aggregate/${lang}.wikipedia/all-access/user/daily/${day(start)}00/${day(end)}00`);
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

// Other languages: English titles to this wiki's titles through English
// Wikipedia's interlanguage links, 50 per request. Unlinked titles drop out.
export async function translateTitles(titles, lang, fetchJSON = request) {
  const found = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const data = await fetchJSON('https://en.wikipedia.org/w/api.php?' + new URLSearchParams({action: 'query', format: 'json', formatversion: '2', prop: 'langlinks', lllang: lang, lllimit: 'max', redirects: '1', titles: batch.join('|'), maxlag: '5'}));
    if (!data?.query) return null;
    const renamed = new Map([...(data.query.normalized || []), ...(data.query.redirects || [])].map(({from, to}) => [to, from]));
    for (const page of data.query.pages || []) {
      const target = page.langlinks?.[0]?.title;
      let source = page.title;
      while (renamed.has(source)) source = renamed.get(source);
      if (target) found.set(source, target);
    }
  }
  return found;
}
// Topic roots are English category names; elsewhere their linked categories.
export async function localRoots(lang, fetchJSON = request) {
  if (lang === 'en') return roots;
  const all = [...new Set(Object.values(roots).flat())].map(root => 'Category:' + root);
  const found = await translateTitles(all, lang, fetchJSON);
  if (!found) return null;
  return Object.fromEntries(Object.entries(roots).map(([topic, list]) => [topic, list.map(root => found.get('Category:' + root)).filter(Boolean).map(title => title.replace(/^[^:]+:/, ''))]));
}

// Report only: how many sampled image links load. Builds never fail on it.
async function checkImages(dir, manifest, sample = 100) {
  const set = `wiki-${LANG}-3`, shard = Math.floor(Math.random() * manifest.sets[set]);
  const cards = JSON.parse(zlib.gunzipSync(await fsp.readFile(path.join(dir, manifest.base, set, shard + '.json'))));
  // Thumbnail servers rate-limit a datacenter IP (429) long before a reader's
  // browser, so a 429 is retried once and then reported apart from failures.
  const statuses = {}, broken = [];
  for (const card of cards.slice(0, sample)) {
    let status = 'error';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(card.img, {method: 'HEAD', headers: {'User-Agent': UA}, signal: AbortSignal.timeout(15000)});
        status = response.status;
        if (status !== 429) break;
        await new Promise(r => setTimeout(r, Math.min(30, Number(response.headers.get('Retry-After')) || 5) * 1000));
      } catch {}
    }
    statuses[status] = (statuses[status] || 0) + 1;
    if (status !== 200 && status !== 429 && broken.length < 3) broken.push(`${status} ${card.img}`);
    await new Promise(r => setTimeout(r, 1000));
  }
  return {ok: statuses[200] || 0, checked: Math.min(sample, cards.length), statuses, broken};
}

const option = name => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : undefined; };
const sqlLines = file => readline.createInterface({input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity});
const textLines = file => readline.createInterface({input: fs.createReadStream(file), crlfDelay: Infinity});
const log = message => console.error(new Date().toISOString().slice(11, 19) + ' ' + message);
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  try {
    const outDir = option('out') || 'library', build = option('build');
    for (const name of ['page-props', 'page', 'categorylinks']) if (!option(name)) throw Error(`Missing --${name}.`);
    if (!/^\d{8}(-\d+)?$/.test(build || '')) throw Error('Use --build YYYYMMDD, or YYYYMMDD-N for a rebuild.');
    const dailyTotal = await averageDailyViews();
    if (!dailyTotal) throw Error(`${LANG} Wikipedia pageview totals are unavailable, keeping the current library.`);
    let [level3, level4] = await vitalLists();
    if (!level3 || !level4) throw Error('Vital-article lists are unavailable, keeping the current library.');
    if (LANG !== 'en') {
      const translated = await translateTitles([...new Set([...level3, ...level4])], LANG);
      if (!translated) throw Error('Interlanguage links are unavailable, keeping the current library.');
      [level3, level4] = [level3, level4].map(list => list.map(title => translated.get(title)).filter(Boolean));
      log(`Vital articles in ${LANG}: ${level3.length} of level 3, ${level4.length} of level 4`);
    }
    const topicRoots = await localRoots(LANG);
    if (!topicRoots) throw Error('Topic root categories are unavailable, keeping the current library.');
    log('Reading page properties');
    const props = await readPageProps(sqlLines(option('page-props')));
    // page_image holds only non-free lead images; free ones are page_image_free.
    const leadImages = props.free.size + props.any.size;
    log(`Page properties: ${props.free.size} free and ${props.any.size} other lead images, ${props.desc.size} descriptions, ${props.disambiguation.size} disambiguation pages`);
    if (leadImages < 1e6) throw Error(`Only ${leadImages} lead images in page_props: the table was misread, keeping the current library.`);
    log('Reading the category tree');
    const targets = option('linktarget') ? await readLinkTargets(sqlLines(option('linktarget'))) : null;
    const links = await readCategoryLinks(sqlLines(option('categorylinks')), targets);
    log(`Category targets: ${targets ? targets.size : 'none (cl_to)'}; subcategory edges: ${links.edges.length / 2}; photo-request talk pages: ${links.photoTalk.size}`);
    targets?.clear();
    const {children, photoTitles, localFiles} = await readPages(sqlLines(option('page')), links);
    // The image table names real uploads; File: pages are the fallback.
    const uploads = option('images') ? await readLocalFiles(sqlLines(option('images'))) : null;
    if (uploads && uploads.size < MIN_LOCAL_FILES) log(`Warning: the image table lists only ${uploads.size} files; using File: pages instead.`);
    props.local = uploads && uploads.size >= MIN_LOCAL_FILES ? uploads : localFiles;
    if (props.local === uploads) localFiles.clear();
    const edgeCount = links.edges.length / 2;
    links.edges.length = 0;
    const reach = topicCategories(children, topicRoots);
    log(`Categories with subcategories: ${children.size} of ${edgeCount} edges resolved; topic categories: ${reach.size}; photo requests: ${photoTitles.size}; local files: ${props.local.size}${props.local === uploads ? ' (image table)' : ' (File: pages)'}`);
    children.clear();
    if (reach.size < MIN_TOPIC_CATEGORIES) throw Error(`Only ${reach.size} topic categories: the category tree was misread, keeping the current library.`);
    if (!photoTitles.size) log('Warning: no talk-page photo requests found; the Photos Help sets will be empty.');
    // Opened only when read: a reader opened now would drop its lines while the articles stream in.
    const voyageFile = option('voyage');
    const voyage = voyageFile ? {get lines() { return textLines(voyageFile); }, props: option('voyage-props') ? await readPageProps(sqlLines(option('voyage-props'))) : emptyProps()} : null;
    const tmpDir = await fsp.mkdtemp(path.join(option('tmp') || outDir, '.buckets-'));
    log('Reading articles');
    const result = await buildLibrary({lines: readline.createInterface({input: process.stdin, crlfDelay: Infinity}), props, dailyTotal, levels: vitalLevels(level3, level4),
      reach, photoTitles, voyage, outDir, tmpDir, build, source: {cirrus: build.slice(0, 8)}});
    await fsp.rm(tmpDir, {recursive: true, force: true});
    const images = await checkImages(outDir, result.manifest);
    const per = test => SETS.filter(test).reduce((sum, s) => sum + result.manifest.sets[s], 0), starts = prefix => s => s.startsWith(prefix);
    console.log(`Card library ${LANG} ${build}: ${result.pages} pages read, ${result.cards} articles in at least one set (${result.unknown} without readership), ${result.guides} travel guides.`);
    console.log(`${result.files} shards, ${(result.bytes / 1e9).toFixed(2)} GB: depth sets ${per(starts('wiki-'))}, topic sets ${per(s => s.startsWith('topic-') && !s.includes('-help-'))}, topic Help sets ${per(s => s.includes('-help-'))}, Help sets ${per(starts('help-'))}, travel ${per(starts('how-'))} shards.`);
    console.log('Cards per set: ' + SETS.map(set => `${set} ${result.counts[set]}`).join(', ') + `. Average daily views used: ${Math.round(dailyTotal)}.`);
    console.log(`Image check: ${images.ok} of ${images.checked} sampled images loaded (status counts ${JSON.stringify(images.statuses)}).` + (images.broken.length ? ' Broken: ' + images.broken.join(', ') : ''));
    // Rate-limited or unreachable checks prove nothing either way; links that
    // answered must almost all load, or a systematic link bug stops the upload.
    const answered = images.checked - (images.statuses[429] || 0) - (images.statuses.error || 0), broken = answered - images.ok;
    if (answered >= 20 && broken > answered * MAX_BROKEN_IMAGES) throw Error(`${broken} of ${answered} sampled image links are broken, keeping the current library.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
