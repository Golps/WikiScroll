// Plain-text introductions are the slowest part of every Wikimedia query:
// the API renders each page before trimming it, and 20 cold pages in one
// request can exceed the 6-second upstream deadline (measured: Russian
// Wikipedia 4.9 s, German Wikivoyage over 12 s). Fetching them in parallel
// chunks of five cuts the wait to the slowest chunk.
export const EXTRACT_CHUNK = 5;

export async function completeExtracts(pages, fetchChunk) {
  const missing = pages.filter(p => typeof p.extract !== 'string');
  await Promise.all(Array.from({length: Math.ceil(missing.length / EXTRACT_CHUNK)}, async (_, i) => {
    const chunk = missing.slice(i * EXTRACT_CHUNK, (i + 1) * EXTRACT_CHUNK);
    let data;
    try { data = await fetchChunk(chunk.map(p => p.pageid).join('|')); } catch {}
    for (const page of chunk) {
      const extract = data?.query?.pages?.[page.pageid]?.extract;
      page.extract = typeof extract === 'string' ? extract : '';
      // A failed request is not the same as a page without an introduction.
      if (!data) page.extractMissing = true;
    }
  }));
  return pages;
}

export const extractParams = ids => ({prop: 'extracts', exintro: '1', explaintext: '1', exchars: '1000', exlimit: 'max', pageids: ids});

// Many guides outside English Wikivoyage open with a heading, so their
// introduction is empty (Spanish "Japón", "Italia") or a single short line
// (Japanese 京都市). For those, the card uses the first paragraphs of the guide's
// text. Full-text extracts come one page per request, so only a few pages per
// answer get this (Wikimedia rate-limits clients that send many at once).
export const LEAD_FALLBACK_LIMIT = 8, LEAD_FALLBACK_CONCURRENCY = 4;
export const leadParams = id => ({prop: 'extracts', explaintext: '1', exsectionformat: 'plain', exchars: '1200', pageids: String(id)});
const CJK = /[぀-ヿ㐀-鿿가-힯]/;
const isListItem = line => /​/.test(line) || /^\d+[\s　]/.test(line) || /^[^.!?。]{1,60}\s[-–—]\s/u.test(line);
const sentences = text => text.match(/[^.!?。！？]+(?:[.!?。！？]+["»”」』)]?|$)\s*/gu) || [text];

// Paragraphs only: headings, list entries ("Tokio - la capital…", "1 Roma ​ 41.9 —
// …") and the line cut off by the character limit are skipped. A paragraph that
// leads into a list ("…estas son nueve de las más importantes:") loses that
// last sentence, which makes no sense without the list.
export function firstParagraphs(text, max = 1000) {
  const lines = String(text || '').split('\n').map(line => line.trim());
  let out = '';
  lines.forEach((line, i) => {
    if (out.length >= max || !line || isListItem(line) || /(\.\.\.|…)$/.test(line)) return;
    const next = lines.slice(i + 1).find(Boolean) || '';
    if (/:$/.test(line) || isListItem(next)) line = sentences(line).slice(0, -1).join('').trim();
    if (line.length < (CJK.test(line) ? 20 : 60) || !/[.!?。！？」』)"»”]$/u.test(line)) return;
    out += (out ? (CJK.test(line) ? '' : ' ') : '') + line;
  });
  return out;
}

// Pages are taken in the order given (most important first). `known` holds
// text already read for this search page (pageid -> paragraphs, '' when the
// guide has none); it costs no request and doesn't count toward the limit, so
// asking again picks up where the last answer stopped. Newly read text is added
// to `learned` as it arrives, for the caller to store. Pages that don't get
// their turn are marked leadSkipped and are not dropped for good: the caller
// asks for them again (/api/travel's resume cursor).
export async function completeLeadText(pages, fetchPage, limit = LEAD_FALLBACK_LIMIT, known = {}, learned = {}) {
  const todo = [];
  for (const page of pages) {
    if (typeof page.extract !== 'string' || page.extractMissing || page.extract.replace(/\s+/g, ' ').trim().length >= 40) continue;
    if (!Object.hasOwn(known, page.pageid)) todo.push(page);
    else if (typeof known[page.pageid] === 'string' && known[page.pageid]) page.extract = known[page.pageid];
  }
  const turn = todo.slice(0, Math.max(0, limit));
  for (const page of todo.slice(turn.length)) page.leadSkipped = true;
  // Still set if the answer budget runs out first: the page is then unfinished.
  for (const page of turn) page.leadPending = true;
  let next = 0;
  await Promise.all(Array.from({length: Math.min(LEAD_FALLBACK_CONCURRENCY, turn.length)}, async () => {
    while (next < turn.length) {
      const page = turn[next++];
      let data;
      try { data = await fetchPage(page.pageid); } catch {}
      const text = data?.query?.pages?.[page.pageid]?.extract;
      if (typeof text === 'string') {
        const lead = firstParagraphs(text);
        learned[page.pageid] = lead;
        if (lead) page.extract = lead;
      } else page.extractMissing = true;
      delete page.leadPending;
    }
  }));
  return pages;
}
