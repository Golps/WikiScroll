// Wikivoyage travel search (/api/travel): how the place filter is read and how
// results are ranked. The request handling itself lives in index.js.

// "Japan, Tuscany", "Japan / Tuscany" and "Japan or Tuscany" each mean either
// place. Punctuation works in every language; the word "or" is recognized in
// English and in the reader's own language. "and" is never a separator, so
// "Trinidad and Tobago" stays one place.
const OR_WORDS = {en: 'or', es: 'o', it: 'o', pt: 'ou|o', fr: 'ou', de: 'oder', pl: 'lub', ru: 'или', he: 'או', ar: 'أو'};
export const MAX_PLACES = 3;

export function parsePlaces(input, lang = 'en') {
  const words = [...new Set(['or', ...(OR_WORDS[lang] || '').split('|')].filter(Boolean))].join('|');
  const parts = String(input || '').replace(/[’‘`´]/g, "'").split(new RegExp(`[,;/|、，；،]|\\s(?:${words})\\s`, 'iu'));
  const seen = new Set(), places = [];
  for (const part of parts) {
    const clean = part.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (clean && !seen.has(fold(clean))) { seen.add(fold(clean)); places.push(clean); }
  }
  return places.slice(0, MAX_PLACES);
}

// Case, accents, apostrophes and hyphens don't matter when comparing names:
// "Cote d’Azur" matches "Côte d'Azur", "Saint Tropez" matches "Saint-Tropez".
export function fold(text) {
  return String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[’‘`´]/g, "'").replace(/[-‐–—]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Full-text search also finds guides that mention the place only in passing
// (a Korean city with a ferry to Japan). A guide belongs to the place when its
// title or its introduction names it.
export function namesPlace(page, place) {
  const name = fold(place);
  return placeMention(page.title,name) || placeMention(page.extract,name);
}

// Match complete words, not Rome within syndrome. Geographic ancestry
// distinguishes places such as Elba and North Elba.
// For scripts without word separators, accept a complete title (including an
// administrative suffix); containment is established by geographic ancestry.
export function placeMention(text, name) {
 const value=fold(text);if(!name||!value)return false;
 if(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(name))return value===name||value.startsWith(name)&&/^(?:市|府|県|都|省|区|州|郡|地区|지역|시|도)(?:[（(\s]|$)/u.test(value.slice(name.length));
 const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return new RegExp('(?<![\\p{L}\\p{N}])'+escaped+'(?![\\p{L}\\p{N}])','u').test(value);
}

// Ordering within a page stays Wikivoyage's search relevance. Measured and
// rejected (September 24, 2026): dropping guides that mention the place only
// after their first sentence lost Tokyo, Sapporo, Rio de Janeiro and Kansai;
// moving them to the end of the page pushed English Tokyo behind airports.

// Disambiguation pages, by description (English) or by title in each edition:
// "Goiás (desambiguação)", "Paris (homonymie)", "Georgia (Begriffsklärung)".
const DISAMBIGUATION_DESCRIPTION = /^topics referred to by the same term$/i;
const DISAMBIGUATION_TITLE = /\((?:disambiguation|desambiguaci[oó]n|desambiguação|homonymie|begriffsklärung|disambigua|значения|曖昧さ回避|消歧[义義]|doorverwijspagina|ujednoznacznienie|פירושונים)\)$/iu;
export const isDisambiguation = page => Object.hasOwn(page?.pageprops||{},'disambiguation') || DISAMBIGUATION_DESCRIPTION.test(page?.description || '') || DISAMBIGUATION_TITLE.test(page?.title || '');

// Phrasebooks are language guides, not destinations. Each Wikivoyage edition
// names them its own way (checked against every edition's phrasebook
// category): "Japanese phrasebook", "Sprachführer Englisch", "Guía de
// húngaro", "Guide linguistique basque", "שיחון איטלקי", "Taalgids Deens",
// "Rozmówki czeskie", "Guia de conversação alemão", "Японский разговорник",
// "英語会話集", "丹麦语会话手册". Italian titles them with the language alone
// ("Cinese"), so the category is checked too: phrasebookParams adds it to the
// same request, and a page in it comes back with a categories list.
export const PHRASEBOOK_CATEGORY = {en: 'Category:Phrasebooks', de: 'Kategorie:Sprachführer', es: 'Categoría:Guías de conversación', fr: 'Catégorie:Guides linguistiques', he: 'קטגוריה:שיחונים', it: 'Categoria:Frasari', ja: 'カテゴリ:会話集', nl: 'Categorie:Taalgids', pl: 'Kategoria:Rozmówki', pt: 'Categoria:Guias de conversação', ru: 'Категория:Разговорники', zh: 'Category:会话手册'};
export const PHRASEBOOK = /\bphrasebooks?\b|^Sprachführer\b|^Guías? de conversación\b|^Guides? linguistiques?\b|^שיחו[ןנ]|^Frasari[oi]?\b|会話集$|^Taalgids\b|^Rozmówki\b|^Guias? de conversação\b|разговорник|会话手册|會話手冊/iu;
// Spanish: "Guía de húngaro" (a language, lower case), never "Guía de Madrid".
const SPANISH_GUIDE = /^Guía de \p{Ll}/u;
export const phrasebookParams = lang => PHRASEBOOK_CATEGORY[lang] ? {clcategories: PHRASEBOOK_CATEGORY[lang], cllimit: 'max'} : {};
export const isPhrasebook = page => PHRASEBOOK.test(page?.title || '') || SPANISH_GUIDE.test(page?.title || '') || (Array.isArray(page?.categories) && page.categories.length > 0);

// Alternate between places so one never crowds out another. A guide that
// matches two places appears once.
export function interleave(lists) {
  const out = [], seen = new Set();
  for (let i = 0; lists.some(list => i < list.length); i++)
    for (const list of lists) if (i < list.length && !seen.has(list[i].pageid)) { seen.add(list[i].pageid); out.push(list[i]); }
  return out;
}

// The pagination cursor holds one search offset per place: "20" for one place,
// "20.12" for two, with "-" for a place that has no more results.
export function parseCursor(value, count) {
  const slots = Math.max(count, 1);
  if (value == null || value === '') return Array(slots).fill(0);
  if (!/^(\d{1,5}|-)(\.(\d{1,5}|-)){0,2}$/.test(value)) return null;
  const parts = value.split('.').map(v => v === '-' ? null : Number(v));
  if (parts.length > slots || parts.some(v => v !== null && v > 10000)) return null;
  while (parts.length < slots) parts.push(0);
  return parts;
}
export function formatCursor(parts) {
  if (parts.every(part => part === null)) return null;
  return parts.length === 1 ? parts[0] : parts.map(part => part === null ? '-' : part).join('.');
}

// Search vocabulary belongs to the guide edition, not the interface language.
export const TRAVEL_TERMS = {
 en:['nature OR hiking OR park','beach OR coast OR island','museum OR history OR culture','city OR urban'],
 es:['naturaleza OR senderismo OR parque','playa OR costa OR isla','museo OR historia OR cultura','ciudad OR urbano'],
 fr:['nature OR randonnée OR parc','plage OR côte OR île','musée OR histoire OR culture','ville OR urbain'],
 de:['Natur OR Wandern OR Park','Strand OR Küste OR Insel','Museum OR Geschichte OR Kultur','Stadt OR urban'],
 it:['natura OR escursionismo OR parco','spiaggia OR costa OR isola','museo OR storia OR cultura','città OR urbano'],
 pt:['natureza OR caminhada OR parque','praia OR costa OR ilha','museu OR história OR cultura','cidade OR urbano'],
 ru:['природа OR поход OR парк','пляж OR побережье OR остров','музей OR история OR культура','город'],
 ja:['自然 OR 登山 OR 公園','海岸 OR ビーチ OR 島','博物館 OR 歴史 OR 文化','都市 OR 市街'],
 zh:['自然 OR 徒步 OR 公园 OR 公園','海滩 OR 海灘 OR 海岸 OR 岛 OR 島','博物馆 OR 博物館 OR 历史 OR 歷史 OR 文化','城市'],
 he:['טבע OR טיולים OR פארק','חוף OR אי','מוזיאון OR היסטוריה OR תרבות','עיר'],
 nl:['natuur OR wandelen OR park','strand OR kust OR eiland','museum OR geschiedenis OR cultuur','stad'],
 pl:['przyroda OR turystyka OR park','plaża OR wybrzeże OR wyspa','muzeum OR historia OR kultura','miasto']
};
export const TRAVEL_STYLES = ['nature','coast','culture','city'];
export const travelTerms = (lang,style) => (TRAVEL_TERMS[lang] || TRAVEL_TERMS.en)[TRAVEL_STYLES.indexOf(style)] || '';

// GeoCrumbs exposes the parent page ID as geocrumb-is-in. Follow those IDs,
// rather than guessing containment from a passing mention in an introduction.
export function createPlaceResolver() {
 const identities=new Map(),parents=new Map(),TTL=86400000;
 const put=(map,key,value)=>{map.delete(key);map.set(key,{value,time:Date.now()});if(map.size>2000)map.delete(map.keys().next().value);};
 const get=(map,key)=>{const entry=map.get(key);return entry&&Date.now()-entry.time<TTL?entry.value:undefined;};
 const api=(lang,params)=>`https://${lang}.wikivoyage.org/w/api.php?`+new URLSearchParams({action:'query',format:'json',prop:'pageprops',ppprop:'geocrumb-is-in|disambiguation',...params});
 const remember=(lang,p)=>{if(p.pageid>0){const raw=p.pageprops?.['geocrumb-is-in'];put(parents,lang+'|'+p.pageid,raw&&/^\d+$/.test(raw)?Number(raw):null);}};
 return {
  async resolve(lang,places,query){
   const result=new Map(),missing=[];
   for(const place of places){const id=get(identities,lang+'|'+fold(place));if(id!==undefined)result.set(place,id);else missing.push(place);}
   if(missing.length){
    const data=await query(api(lang,{titles:missing.join('|'),redirects:'1'}));
    if(!data?.query)return result;
    const rows=Object.values(data.query.pages||{}),aliases=new Map([...(data?.query?.normalized||[]),...(data?.query?.redirects||[])].map(a=>[fold(a.from),fold(a.to)]));
    for(const place of missing){let name=fold(place);for(let i=0;i<8&&aliases.has(name);i++)name=aliases.get(name);
     const p=rows.find(p=>fold(p.title)===name&&p.ns===0&&p.pageid>0&&!Object.hasOwn(p.pageprops||{},'disambiguation'));
     const id=p?.pageid||null;result.set(place,id);if(p)remember(lang,p);
     if(data?.query)put(identities,lang+'|'+fold(place),id);
    }
   }
   return result;
  },
  async annotate(lang,pages,targets,query){
   for(const p of pages)remember(lang,p);
   for(let hop=0;hop<5;hop++){
    const missing=new Set();
    for(const p of pages){let id=p.pageid;const visited=new Set();
     while(id&&!visited.has(id)&&!targets.has(id)){visited.add(id);const parent=get(parents,lang+'|'+id);if(parent===undefined){missing.add(id);break;}id=parent;}
    }
    if(!missing.size)break;
    const data=await query(api(lang,{pageids:[...missing].slice(0,50).join('|')}));
    if(!data?.query?.pages)break;
    for(const p of Object.values(data.query.pages))remember(lang,p);
   }
  },
  belongs(lang,page,target){
   if(!target)return null;
   let id=page.pageid,steps=0;const visited=new Set();
   while(id&&!visited.has(id)){
    if(id===target)return true;visited.add(id);
    const parent=get(parents,lang+'|'+id);
    if(parent===undefined)return 'pending';
    if(parent===null)return steps?false:null;
    id=parent;steps++;
   }
   return false;
  }
 };
}
