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
    'Category:All Wikipedia articles needing copy edit': 'copyedit',
    'Category:All Wikipedia articles needing clarification': 'clarify',
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
// Photograph requests are on talk pages. Never infer one from a missing image.
export const TALK_NEED_CATEGORIES={en:{'Category:Wikipedia requested photographs':'images'}};
// Most actionable first; a card shows only the first need it has.
export const NEED_ORDER = ['sources', 'citations', 'unsourced', 'copyedit', 'clarify', 'images', 'outdated', 'incomplete', 'stub'];
// The standalone feed favours sourcing work; stubs are plentiful, so rarer.
const SAMPLE_WEIGHT = {sources: 2, citations: 3, unsourced: 3, outdated: 1, incomplete: 2, stub: 1,copyedit:2,clarify:1,images:2};

// Adds verified `needs` (ordered keys), 50 pages per request. Retry only
// missing checks; partial results stay incomplete and never invent tags.
const checkedParts=new WeakMap(), NEED_TTL=3600000;
export async function completeNeeds(lang, pages, query) {
  const categories = NEED_CATEGORIES[lang];
  if (!categories) return pages;
  const todo = pages.filter(p => p.needsMissing || !Array.isArray(p.needs));
  await Promise.all(Array.from({length: Math.ceil(todo.length / 50)}, async (_, i) => {
    const chunk = todo.slice(i * 50, i * 50 + 50),now=Date.now();
    const talkCategories=TALK_NEED_CATEGORIES[lang];
    const state=page=>{
      let parts=checkedParts.get(page);if(!parts||parts.lang!==lang){parts={lang};checkedParts.set(page,parts);}
      if(parts.article&&now-parts.article.at>=NEED_TTL)delete parts.article;
      if(parts.talk&&(parts.talk.id!==page.talkid||now-parts.talk.at>=NEED_TTL))delete parts.talk;
      return parts;
    };
    const articles=chunk.filter(p=>!state(p).article);
    const talks=talkCategories?chunk.filter(p=>Number.isSafeInteger(p.talkid)&&p.talkid>0&&!state(p).talk):[];
    let data,talkData;
    await Promise.all([
      (async()=>{if(articles.length)try { data = await query({prop: 'categories', clcategories: Object.keys(categories).join('|'), cllimit: 'max', pageids: articles.map(p => p.pageid).join('|')}); } catch {}})(),
      (async()=>{if(talks.length)try{talkData=await query({prop:'categories',clcategories:Object.keys(talkCategories).join('|'),cllimit:'max',pageids:talks.map(p=>p.talkid).join('|')});}catch{}})(),
    ]);
    for(const page of articles){
      const p=data?.query?.pages?.[page.pageid];
      if(p?.pageid===page.pageid&&p.missing===undefined&&(p.ns===undefined||p.ns===0))state(page).article={at:Date.now(),needs:(p.categories||[]).map(c=>categories[c.title]).filter(Boolean)};
    }
    for(const page of talks){
      const p=talkData?.query?.pages?.[page.talkid];
      if(p?.ns===1&&p.pageid===page.talkid&&p.missing===undefined)state(page).talk={id:page.talkid,at:Date.now(),needs:(p.categories||[]).map(c=>talkCategories[c.title]).filter(Boolean)};
    }
    for (const page of chunk) {
      const parts=state(page),found=new Set([...(parts.article?.needs||[]),...(parts.talk?.needs||[])]);
      page.needs = NEED_ORDER.filter(need => found.has(need));
      if (!parts.article || talkCategories&&Number.isSafeInteger(page.talkid)&&page.talkid>0&&!parts.talk) page.needsMissing = true;
      else delete page.needsMissing;
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
  const entries = [...Object.entries(NEED_CATEGORIES[lang] || {}).map(([title,need])=>({title,need,namespace:0})),...Object.entries(TALK_NEED_CATEGORIES[lang]||{}).map(([title,need])=>({title,need,namespace:1}))];
  if(!entries.length)return [];
  const total = entries.reduce((sum, {need}) => sum + SAMPLE_WEIGHT[need], 0);
  return Array.from({length: count}, () => {
    let pick = random() * total;
    for (const entry of entries) { pick -= SAMPLE_WEIGHT[entry.need]; if (pick < 0) return entry; }
    return entries[0];
  });
}
// Many short reads (10 x 8 titles) rather than a few long ones: consecutive
// titles share a prefix ("Black Metal", "Black Power"...), so short runs
// keep a batch varied.
export async function sampleNeedyTitles(lang, query, draws = 10, perDraw = 8) {
  const seen = new Map();
  await Promise.all(weightedCategories(lang, draws).map(async ({title, need,namespace}) => {
    if(namespace===1){
      const data=await query({generator:'categorymembers',gcmtitle:title,gcmnamespace:'1',gcmtype:'page',gcmlimit:String(perDraw),gcmstartsortkeyprefix:randomPrefix(),prop:'info',inprop:'subjectid|associatedpage'});
      for(const page of Object.values(data?.query?.pages||{}))if(page.ns===1&&Number.isSafeInteger(page.subjectid)&&page.subjectid>0&&!seen.has(page.subjectid))seen.set(page.subjectid,{pageid:page.subjectid,title:page.associatedpage||page.title.replace(/^Talk:/,''),branch:need});
      return;
    }
    const data = await query({list: 'categorymembers', cmtitle: title, cmnamespace: '0', cmtype: 'page', cmlimit: String(perDraw), cmstartsortkeyprefix: randomPrefix()});
    for (const member of data?.query?.categorymembers || []) if (member.ns === 0 && !seen.has(member.pageid)) seen.set(member.pageid, {pageid: member.pageid, title: member.title, branch: need});
  }));
  return [...seen.values()];
}
