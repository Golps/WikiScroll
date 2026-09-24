// Wikimedia's pageviews prop answers for at most five pages per request and
// fills them alphabetically, silently continuing the rest. Unless callers
// complete the missing pages, depth sampling sees a quarter of its candidates
// and favors titles that begin with early letters.
export const PAGEVIEW_CHUNK = 5;

const counted = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;

// Days that are null for every page in a batch are publication lag, not
// zero readership, and are left out of every average.
export function lagDays(pages) {
  const days = new Set(), live = new Set();
  for (const page of pages) {
    const views = page?.pageviews;
    if (!views || typeof views !== 'object') continue;
    for (const [day, value] of Object.entries(views)) { days.add(day); if (counted(value)) live.add(day); }
  }
  return new Set([...days].filter(day => !live.has(day)));
}

// Inside the reported window a null day means no recorded views. A page with
// no counted day at all stays unknown: an outage must never make a famous
// article qualify as an obscure discovery.
export function averageViews(page, lag = new Set()) {
  const views = page?.pageviews;
  if (!views || typeof views !== 'object') return null;
  let sum = 0, days = 0, known = false;
  for (const [day, value] of Object.entries(views)) {
    if (lag.has(day)) continue;
    if (counted(value)) { sum += value; days++; known = true; }
    else if (value === null) days++;
  }
  return known && days ? sum / days : null;
}

// Fetch missing pageviews in parallel chunks of five. Failed chunks leave
// their pages unknown rather than rejecting the whole batch.
export async function completePageviews(pages, fetchChunk) {
  const missing = pages.filter(p => !p.pageviews || typeof p.pageviews !== 'object');
  await Promise.all(Array.from({length: Math.ceil(missing.length / PAGEVIEW_CHUNK)}, async (_, i) => {
    const chunk = missing.slice(i * PAGEVIEW_CHUNK, (i + 1) * PAGEVIEW_CHUNK);
    let data;
    try { data = await fetchChunk(chunk.map(p => p.pageid).join('|')); } catch {}
    for (const page of chunk) {
      const views = data?.query?.pages?.[page.pageid]?.pageviews;
      if (views && typeof views === 'object') page.pageviews = views;
    }
  }));
  return pages;
}

// Readership differs by an order of magnitude between Wikipedia editions, so
// depth bands calibrated on English are scaled per language. Factors compare
// the 25th/50th/75th/90th percentile daily views of illustrated random
// articles with English (72-170 articles per language, September 2026).
// public/app.js keeps an identical copy; test/discovery-quality.test.js checks.
export const VIEW_SCALE = {en:1, ja:1, ru:0.6, de:0.5, he:0.4, fr:0.3, it:0.25, pt:0.25, es:0.25, pl:0.2, zh:0.2, ko:0.2, hi:0.15, ar:0.15, nl:0.1};
export function scaleBand([low, high], lang) {
  const factor = VIEW_SCALE[lang] ?? 1;
  return [low * factor, high * factor];
}
