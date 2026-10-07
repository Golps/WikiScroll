// Plain-text introductions are the slowest part of every Wikimedia query:
// the API renders each page before trimming it, and 20 cold pages in one
// request can exceed the 6-second upstream deadline (measured: Russian
// Wikipedia 4.9 s, German Wikivoyage over 12 s). Fetching them in parallel
// chunks of five cuts the wait to the slowest chunk.
export const EXTRACT_CHUNK = 5;

export async function completeExtracts(pages, fetchChunk) {
  const missing = pages.filter(p => p.extractMissing || typeof p.extract !== 'string');
  await Promise.all(Array.from({length: Math.ceil(missing.length / EXTRACT_CHUNK)}, async (_, i) => {
    const chunk = missing.slice(i * EXTRACT_CHUNK, (i + 1) * EXTRACT_CHUNK);
    let data;
    try { data = await fetchChunk(chunk.map(p => p.pageid).join('|')); } catch {}
    for (const page of chunk) {
      const extract = data?.query?.pages?.[page.pageid]?.extract;
      page.extract = typeof extract === 'string' ? extract : '';
      // A failed request is not the same as a page without an introduction.
      if (!data?.query?.pages?.[page.pageid]) page.extractMissing = true;
      else delete page.extractMissing;
    }
  }));
  return pages;
}

export const extractParams = ids => ({prop: 'extracts', exintro: '1', explaintext: '1', exchars: '1000', exlimit: 'max', pageids: ids});

// Many Wikivoyage guides have no introduction: the text starts under the first
// heading (Spanish "Japón" opens with "== Regiones =="), so exintro returns ''.
// About 40% of Spanish and Japanese guides, against 2% in English. Such guides
// used to be dropped, which left place searches nearly empty. For those pages,
// read the start of the full text instead. TextExtracts returns full text for
// one page per request, and the Workers Free plan allows 50 subrequests
// (fetch and Cache API calls together) per request, so at most FALLBACK_MAX
// pages per answer are read from Wikivoyage.
export const FALLBACK_MAX = 8;
export const fullTextParams = id => ({prop: 'extracts', explaintext: '1', exsectionformat: 'wiki', exchars: '1200', pageids: String(id)});

const HEADING = /^\s*=+[^=].*=+\s*$/;
// "Tokio - la moderna capital…": a list entry, not prose.
const LIST_ENTRY = /^[^.!?。！？]{1,60}\s[-–—:]\s/;
const SENTENCE_END = /[.!?。！？…]["'”’»)]*$/u;
// Chinese, Japanese and Korean say as much in far fewer characters.
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
const minimum = text => CJK.test(text) ? 25 : 60;
// A Wikivoyage card needs 40 characters of introduction; half that in CJK.
export const guideReadable = text => text.length >= (CJK.test(text) ? 20 : 40);

export function leadFromText(text) {
  const paragraphs = [];
  let current = [];
  const flush = () => { if (current.length) paragraphs.push(current.join(' ')); current = []; };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line || HEADING.test(line)) { flush(); continue; }
    if (LIST_ENTRY.test(line)) { flush(); continue; }
    current.push(line);
  }
  flush();
  let lead = '';
  for (let p of paragraphs) {
    p = p.replace(/\s+/g, ' ').trim();
    // A paragraph that leads into a list ("…the regions are:") loses that sentence.
    if (/[:：]$/.test(p)) p = p.replace(/[^.!?。！？]*[:：]$/u, '').trim();
    if (p.length < minimum(p) || !/[.!?。！？]/u.test(p)) continue;
    lead = lead ? lead + ' ' + p : p;
    if (lead.length >= 300) break;
  }
  return lead.length >= minimum(lead) && SENTENCE_END.test(lead) ? lead : lead.replace(/[^.!?。！？]*$/u, '').trim();
}

// store (optional): texts already read, {lookup(ids) -> Map(id -> text),
// save(id, text)}. Known texts cost no Wikivoyage request and don't count
// toward max, so each retry of an unfinished page reads the next guides
// instead of the same ones again.
export async function completeLeadFallback(pages, fetchOne, max = FALLBACK_MAX, store = null) {
  const empty = pages.filter(p => p.extract === '' && !p.extractMissing);
  // Pending until the text arrives: if the caller's answer budget ends first
  // (or a page is over the cap), the result is never cached as complete.
  for (const page of empty) page.extractMissing = true;
  if (store && empty.length) {
    let known = new Map();
    try { known = await store.lookup(empty.map(p => p.pageid)); } catch {}
    for (const page of empty) if (known.has(page.pageid)) { page.extract = known.get(page.pageid); delete page.extractMissing; }
  }
  await Promise.all(empty.filter(p => p.extractMissing).slice(0, max).map(async page => {
    let data;
    try { data = await fetchOne(page.pageid); } catch {}
    if (!data) return;
    page.extract = leadFromText(data?.query?.pages?.[page.pageid]?.extract);
    delete page.extractMissing;
    // '' is a real answer too (a page that is only lists): remember it.
    try { store?.save(page.pageid, page.extract); } catch {}
  }));
  return pages;
}
