// "Help Wikipedia": maintenance templates ("More citations needed", "Citation
// needed", stubs...) put an article into hidden tracking categories. Only
// editions whose categories are single, large, flat lists are supported
// (verified September 2026); Italian, Portuguese, Russian and Japanese split
// theirs into dated or regional subcategories, so they are left out.
// public/app.js keeps HELP_LANGS in sync (checked by the test suite).
export const NEED_CATEGORIES = {
  en: {
    'Category:All articles lacking sources': 'sources',                          // ~33,000
    'Category:All articles needing additional references': 'citations',          // ~541,000
    'Category:All articles with unsourced statements': 'unsourced',              // ~585,000
    'Category:All Wikipedia articles in need of updating': 'outdated',           // ~45,000
    'Category:All stub articles': 'stub',                                        // ~2,300,000
  },
  de: {
    'Kategorie:Wikipedia:Belege fehlen': 'citations',                            // ~52,000
    'Kategorie:Wikipedia:Lückenhaft': 'incomplete',                              // ~16,000
  },
  fr: {
    'Catégorie:Article manquant de références/Liste complète': 'citations',       // ~145,000
    'Catégorie:Article à référence nécessaire': 'unsourced',                     // ~95,000
    'Catégorie:Article à mettre à jour': 'outdated',                             // ~8,600
  },
  es: {
    'Categoría:Wikipedia:Artículos que necesitan referencias': 'citations',      // ~75,000
    'Categoría:Wikipedia:Artículos con pasajes que requieren referencias': 'unsourced', // ~56,000
  },
};
export const HELP_LANGS = new Set(Object.keys(NEED_CATEGORIES));
// Most actionable first; a card shows only the first need it has.
export const NEED_ORDER = ['sources', 'citations', 'unsourced', 'outdated', 'incomplete', 'stub'];
// The standalone feed favours sourcing work; stubs are plentiful, so rarer.
const SAMPLE_WEIGHT = {sources: 2, citations: 3, unsourced: 3, outdated: 1, incomplete: 2, stub: 1};

// Adds `needs` (ordered keys) to each page, 50 pages per request. A failed
// lookup leaves needs empty: no tag is better than a wrong one.
export async function completeNeeds(lang, pages, query) {
  const categories = NEED_CATEGORIES[lang];
  if (!categories) return pages;
  const todo = pages.filter(p => !Array.isArray(p.needs));
  await Promise.all(Array.from({length: Math.ceil(todo.length / 50)}, async (_, i) => {
    const chunk = todo.slice(i * 50, i * 50 + 50);
    let data;
    try { data = await query({prop: 'categories', clcategories: Object.keys(categories).join('|'), cllimit: 'max', pageids: chunk.map(p => p.pageid).join('|')}); } catch {}
    for (const page of chunk) {
      const found = new Set((data?.query?.pages?.[page.pageid]?.categories || []).map(c => categories[c.title]).filter(Boolean));
      page.needs = NEED_ORDER.filter(need => found.has(need));
    }
  }));
  return pages;
}

// Tracking categories hold hundreds of thousands of titles, sorted
// alphabetically. Starting each read at a random two-letter prefix spreads
// the sample across the alphabet instead of returning only "A" titles.
const UPPER = 'ABCDEFGHIJKLMNOPRSTW', LOWER = 'aeioulnrst';
export function randomPrefix(random = Math.random) {
  return UPPER[Math.floor(random() * UPPER.length)] + LOWER[Math.floor(random() * LOWER.length)];
}
export function weightedCategories(lang, count, random = Math.random) {
  const entries = Object.entries(NEED_CATEGORIES[lang] || {});
  const total = entries.reduce((sum, [, need]) => sum + SAMPLE_WEIGHT[need], 0);
  return Array.from({length: count}, () => {
    let pick = random() * total;
    for (const [title, need] of entries) { pick -= SAMPLE_WEIGHT[need]; if (pick < 0) return {title, need}; }
    return {title: entries[0][0], need: entries[0][1]};
  });
}
// Many short reads (10 x 8 titles) rather than a few long ones: consecutive
// titles share a prefix ("Black Metal", "Black Power"...), so short runs
// keep a batch varied.
export async function sampleNeedyTitles(lang, query, draws = 10, perDraw = 8) {
  const seen = new Map();
  await Promise.all(weightedCategories(lang, draws).map(async ({title, need}) => {
    const data = await query({list: 'categorymembers', cmtitle: title, cmnamespace: '0', cmtype: 'page', cmlimit: String(perDraw), cmstartsortkeyprefix: randomPrefix()});
    for (const member of data?.query?.categorymembers || []) if (member.ns === 0 && !seen.has(member.pageid)) seen.set(member.pageid, {pageid: member.pageid, title: member.title, branch: need});
  }));
  return [...seen.values()];
}
