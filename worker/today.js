// "On this day" Easter egg. Wikipedia's own daily feed names the articles
// behind today's anniversaries; cards are matched by exact page ID, never by
// guessing dates from article text. Only each entry's first linked page (its
// subject: the person born, the event, the holiday) counts, so a country or
// city merely mentioned in an event is never labelled.
const KINDS = {selected: 'event', events: 'event', births: 'born', deaths: 'died', holidays: 'holiday'};
const FEED_TTL = 6 * 3600, RETRY_TTL = 120;
// Wikipedia builds each edition's daily list on first request, which can take
// 3-8 s (es, pt, zh). Nothing waits on this answer, so allow it more time
// than the feed's 6 s upstream limit.
const FEED_TIMEOUT_MS = 15_000;
async function fetchFeed(url) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const response = await fetch(url, {headers: {'User-Agent': 'WikiScroll/4.0 (https://wikiscroll.com)'}, signal: controller.signal});
    return response.ok ? await response.json() : null;
  } catch { return null; } finally { clearTimeout(timer); }
}
const BAD_TITLE = /^(list of|index of|wikipedia:|template:|category:|portal:|file:|help:|special:)/i;
const strip = s => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const pending = new Map();
export const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// Card photos use 800px thumbnails; the feed's own thumbnails are 320px.
function cardImage(p) {
  const thumb = p.thumbnail?.source, original = p.originalimage;
  if (!thumb || !/^https:\/\/upload\.wikimedia\.org\//.test(thumb)) return '';
  if (original?.source && original.width <= 800 && !/\.svg$/i.test(original.source)) return original.source;
  return thumb.replace(/\/\d+px-([^/]+)$/, '/800px-$1');
}

export function parseToday(feed, lang) {
  const matches = {}, seeds = [];
  for (const [group, kind] of Object.entries(KINDS)) {
    for (const entry of Array.isArray(feed?.[group]) ? feed[group] : []) {
      const p = entry?.pages?.[0];
      if (!Number.isSafeInteger(p?.pageid) || p.pageid < 1 || (p.namespace?.id ?? 0) !== 0 || p.type === 'disambiguation') continue;
      const id = 'w' + p.pageid;
      const year = Number.isInteger(entry.year) ? entry.year : null;
      // A page listed twice (e.g. selected and events) keeps its first reading.
      if (matches[id]) continue;
      matches[id] = year === null || kind === 'holiday' ? {k: kind} : {k: kind, y: year};
      const title = strip(p.titles?.normalized || p.title?.replace(/_/g, ' '));
      const body = strip(p.extract), img = cardImage(p), url = p.content_urls?.desktop?.page;
      // Surprise appearances: births, events and holidays with a photo and a
      // real introduction. Deaths are labelled when they occur naturally only.
      if (kind !== 'died' && title && !BAD_TITLE.test(title) && body.length >= 80 && img && /^https:\/\//.test(url || ''))
        seeds.push({id, src: 'wiki', title, body, img, url, ...(p.description ? {desc: strip(p.description).slice(0, 160)} : {})});
    }
  }
  return {lang, matches, seeds: seeds.slice(0, 120)};
}

export async function todayResponse(url, ctx, {langs, permit, limited, env, feed = fetchFeed}) {
  const lang = url.searchParams.get('lang') || 'en', md = url.searchParams.get('md') || '';
  if (!langs.has(lang) || !MONTH_DAY.test(md)) return Response.json({error: 'Invalid date or language'}, {status: 400, headers: {'Cache-Control': 'no-store'}});
  const headers = ttl => ({'Cache-Control': `public, max-age=${Math.min(ttl, 3600)}`, 'Access-Control-Allow-Origin': '*'});
  // A failed or timed-out feed is a temporary error, never an empty day: the
  // browser keeps retrying, and browsers never cache the failure.
  const unavailable = () => Response.json({error: 'On this day is temporarily unavailable.'}, {status: 503, headers: {'Cache-Control': 'no-store', 'Retry-After': String(RETRY_TTL), 'Access-Control-Allow-Origin': '*'}});
  const key = new Request(`https://wikiscroll.com/__today/v3/${lang}/${md}`), cache = globalThis.caches?.default;
  try {
    const hit = await cache?.match(key);
    if (hit) { const stored = await hit.json(); return stored?.failed ? unavailable() : Response.json(stored, {headers: {...headers(3600), 'X-Cache': 'HIT'}}); }
  } catch {}
  if (!pending.has(key.url)) {
    pending.set(key.url, (async () => {
      if (!await permit(env, 'WORK_LIMIT', 'today')) return null;
      const [month, day] = md.split('-');
      const data = await feed(`https://${lang}.wikipedia.org/api/rest_v1/feed/onthisday/all/${month}/${day}`);
      // Editions without the feed answer {} and are cached like any day. A
      // failed or timed-out request leaves a short marker at the edge, so
      // Wikimedia is asked again after two minutes, not on every request.
      if (!data) {
        await cache?.put(key, Response.json({failed: true}, {headers: {'Cache-Control': `public, max-age=${RETRY_TTL}`}})).catch(() => {});
        return {failed: true};
      }
      const body = parseToday(data, lang);
      await cache?.put(key, Response.json(body, {headers: {'Cache-Control': `public, max-age=${FEED_TTL}`}})).catch(() => {});
      return {body, ttl: FEED_TTL};
    })().finally(() => pending.delete(key.url)));
  }
  const result = await pending.get(key.url);
  if (!result) return limited();
  if (result.failed) return unavailable();
  return Response.json(result.body, {headers: headers(result.ttl)});
}
