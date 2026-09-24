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
