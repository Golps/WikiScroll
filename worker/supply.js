import {averageViews} from './pageviews.js';
const MAX_PAGES = 3000, METRICS_MS = 6 * 3600000, TEXT_MS = 24 * 3600000;
export const validOpeningDraw=draw=>draw===null||/^[a-f0-9]{32}$/.test(draw);
// Fresh opening draws never share a completed batch with another visitor.
// Keep only a small, short-lived response cache for retries of that exact draw;
// do not put one-off visit keys into the shared edge supply cache.
export function createOpeningCache(){
  const entries=new Map();
  return {
    async match(key){
      const entry=entries.get(key.url);
      if(!entry)return;
      if(Date.now()-entry.at>=120000){entries.delete(key.url);return;}
      return new Response(entry.body,{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    },
    async put(key,response){
      const body=await response.text();if(body.length>128000)return;
      entries.delete(key.url);if(entries.size>=64)entries.delete(entries.keys().next().value);
      entries.set(key.url,{body,at:Date.now()});
    }
  };
}
// Small reusable source records, independent of batch, depth, likes and history.
// Failed metrics/tags never overwrite known successful data.
export function createSupply() {
  const records = new Map(), hydrated = new WeakMap();
  const key = (lang, mode, id) => lang + '|' + mode + '|' + id;
  return {
    hydrate(pages, lang, mode = 'wiki') {
      const now = Date.now();
      for (const p of pages) {
        const r = records.get(key(lang, mode, p.pageid)); if (!r) continue;
        const flags = {}; hydrated.set(p, flags);
        if (now - r.viewsAt < METRICS_MS && averageViews(p) === null) { p.pageviews = r.pageviews; flags.views = true; }
        if (now - r.textAt < TEXT_MS && (p.extractMissing || typeof p.extract !== 'string')) { p.extract = r.extract; delete p.extractMissing; flags.text = true; }
        if (now - r.needsAt < 3600000 && (p.needsMissing || !Array.isArray(p.needs))) { p.needs = r.needs; delete p.needsMissing; flags.needs = true; }
      }
      return pages;
    },
    remember(pages, lang, mode = 'wiki') {
      const now = Date.now();
      for (const p of pages) {
        if (!Number.isSafeInteger(p.pageid) || p.pageid < 1) continue;
        const id = key(lang, mode, p.pageid), r = records.get(id) || {}, flags = hydrated.get(p) || {};
        if (!flags.views && averageViews(p) !== null) { r.pageviews = p.pageviews; r.viewsAt = now; }
        if (!flags.text && typeof p.extract === 'string' && !p.extractMissing) { r.extract = p.extract; r.textAt = now; }
        if (!flags.needs && Array.isArray(p.needs) && !p.needsMissing) { r.needs = p.needs; r.needsAt = now; }
        if (r.viewsAt === undefined && r.textAt === undefined && r.needsAt === undefined) continue;
        records.delete(id); records.set(id, r);
        if (records.size > MAX_PAGES) records.delete(records.keys().next().value);
      }
    }
  };
}
export function imageURL(source) {
  if (!/^https:\/\/(?:upload|thumb)\.wikimedia\.org\//.test(source || '')) return '';
  return source.replace(/\/((?:lang[a-z-]+-)?)\d+px-([^/?]+)(\?[^/]*)?$/, '/$1960px-$2$3');
}
