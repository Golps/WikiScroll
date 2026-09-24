import {completeExtracts, extractParams} from './extracts.js';
import {completeNeeds, HELP_LANGS} from './needs.js';
// Popular and Known draw on Wikipedia's editor-curated vital articles instead
// of the daily most-read chart, which is dominated by news, celebrities and
// automated traffic. Level 3 (about 1,000 essential topics) is Popular; Level
// 4 minus Level 3 (about 9,000 more) is Known. Other languages follow the
// English lists through interlanguage links.
// Named topic lists (redirects are followed if Wikipedia renames them again,
// as it did from "Level/4/…" to "Level 4/…"). The same prefix also holds
// "Removed" and "Article alerts" pages, which must never be sampled.
const LEVEL3 = 'Wikipedia:Vital articles/Level 3';
const LEVEL4 = ['Arts', 'Biology and health sciences', 'Everyday life', 'Geography', 'History', 'Mathematics', 'People',
  'Philosophy and religion', 'Physical sciences', 'Society and social sciences', 'Technology'].map(t => 'Wikipedia:Vital articles/Level 4/' + t);
const RETAIN_SECONDS = 7 * 86_400;
const MINIMUM = {3: 500, 4: 3000};
const memory = new Map(), building = new Map();
const strip = s => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const api = (lang, params) => `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({action: 'query', format: 'json', ...params});

async function links(title, upstream) {
  const titles = [];
  let cont;
  do {
    // Follow redirects: list pages have been renamed before.
    const data = await upstream(api('en', {prop: 'links', titles: title, redirects: '1', plnamespace: '0', pllimit: 'max', ...(cont ? {plcontinue: cont} : {})}));
    if (!data) return null;
    for (const link of Object.values(data.query?.pages || {})[0]?.links || []) titles.push(link.title);
    cont = data.continue?.plcontinue;
  } while (cont);
  return titles;
}

async function build(level, upstream) {
  const pages = level === 3 ? [LEVEL3] : LEVEL4;
  const titles = new Set();
  // Sequential on purpose: this runs about once a week per location and
  // should not burst Wikimedia with parallel list requests.
  for (const page of pages) {
    const found = await links(page, upstream);
    if (!found) return null;
    found.forEach(t => titles.add(t));
  }
  return titles.size >= MINIMUM[level] ? [...titles] : null;
}

// Cached lists: memory, then the edge cache, then a rebuild. A partial or
// failed rebuild is never cached.
export async function vitalTitles(level, upstream, ctx, {wait = true} = {}) {
  const now = Date.now(), held = memory.get(level);
  if (held && now - held.time < RETAIN_SECONDS * 1000) return held.titles;
  const key = new Request(`https://wikiscroll.com/__vital/v1/level-${level}`), cache = globalThis.caches?.default;
  try {
    const hit = await cache?.match(key);
    if (hit) {
      const stored = await hit.json();
      if (Array.isArray(stored.titles) && stored.titles.length >= MINIMUM[level]) {
        memory.set(level, {titles: stored.titles, time: Date.parse(stored.at) || now});
        return stored.titles;
      }
    }
  } catch {}
  if (!building.has(level)) {
    const job = build(level, upstream).then(async titles => {
      if (!titles) return held?.titles || null;
      memory.set(level, {titles, time: Date.now()});
      await cache?.put(key, Response.json({titles, at: new Date().toISOString()}, {headers: {'Cache-Control': `public, max-age=${RETAIN_SECONDS}`}})).catch(() => {});
      return titles;
    }).catch(() => held?.titles || null).finally(() => building.delete(level));
    building.set(level, job);
    ctx?.waitUntil?.(job);
  }
  return wait ? building.get(level) : held?.titles || null;
}

// `info.borrowed` is set when Known had to answer from Level 3; callers must
// not cache that answer, or other readers keep receiving Popular as Known.
export async function vitalArticles(lang, depth, upstream, ctx, toArticle, info = {}) {
  const level3 = await vitalTitles(3, upstream, ctx);
  if (!level3?.length) return [];
  // Warm Known's larger list on any depth 1-2 request, so it is usually ready
  // before a reader moves from Popular to Known.
  if (depth === 1) vitalTitles(4, upstream, ctx, {wait: false});
  let pool = level3;
  if (depth === 2) {
    // Level 4 takes a few seconds to assemble; until it is cached, Known
    // borrows from Level 3 rather than keeping the reader waiting.
    const level4 = await vitalTitles(4, upstream, ctx, {wait: false});
    if (level4?.length) { const essential = new Set(level3); pool = level4.filter(t => !essential.has(t)); }
    else info.borrowed = true;
  }
  let titles = shuffle(pool).slice(0, 24);
  if (lang !== 'en') {
    const data = await upstream(api('en', {titles: titles.join('|'), prop: 'langlinks', lllang: lang, lllimit: 'max'}));
    titles = Object.values(data?.query?.pages || {}).map(p => p.langlinks?.[0]?.['*']).filter(Boolean);
    if (!titles.length) return [];
  }
  const data = await upstream(api(lang, {titles: titles.join('|'), redirects: '1', prop: 'pageimages|info|description', piprop: 'thumbnail', pithumbsize: '800', pilimit: 'max', inprop: 'url'}));
  const pages = shuffle(Object.values(data?.query?.pages || {}).filter(p => Number.isSafeInteger(p.pageid) && p.pageid > 0 && p.ns === 0 && p.thumbnail?.source));
  // Cards whose introduction has already arrived. If the answer budget runs
  // out while a slower chunk is pending, the caller answers with these.
  info.snapshot = () => pages.filter(p => strip(p.extract).length >= 80).slice(0, 20).map(p => toArticle(p, lang, 'wiki'));
  await Promise.all([
    completeExtracts(pages, ids => upstream(api(lang, extractParams(ids)))),
    HELP_LANGS.has(lang) ? completeNeeds(lang, pages, params => upstream(api(lang, params))) : null,
  ]);
  return info.snapshot();
}
