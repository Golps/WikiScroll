import {permit,limited,secure} from './security.js';
import {createWork,createNetwork,unavailable} from './runtime.js';
import {createSupply,imageURL} from './supply.js';
export {retryDelay} from './runtime.js';
import {topicResponse} from './topics.js';
import {verifiedArticle} from './verified.js';
import { collectionResponse } from './collections.js';
import {averageViews,lagDays,completePageviews,scaleBand} from './pageviews.js';
import {completeExtracts,extractParams,completeLeadFallback,fullTextParams,guideReadable,FALLBACK_MAX} from './extracts.js';
import {vitalArticles} from './vital.js';
import {completeNeeds,HELP_LANGS} from './needs.js';
import {todayResponse} from './today.js';
import {LANGS} from './languages.js';
import {wantsMarkdown,htmlToMarkdown,markdownResponse} from './markdown.js';
import {parsePlaces,parseCursor,formatCursor,namesPlace,interleave,fold,isPhrasebook,phrasebookParams,isDisambiguation,TRAVEL_STYLES,travelTerms,createPlaceResolver} from './travel.js';
/** WikiScroll Worker: explicit routing, static assets and article unfurls.
 * Handles article requests and social previews.
 * No GitHub integration, Pages runtime, KV or framework is required.
 */
// Wikivoyage editions large enough for a feed. Arabic and Korean have none;
// Hindi has about 200 guides. Those readers get English guides instead.
export const VOYAGE_LANGS = new Set(['en','es','fr','de','it','pt','ru','ja','zh','he','nl','pl']);
const voyageLang = lang => VOYAGE_LANGS.has(lang) ? lang : 'en';
// Link-preview services only. Search crawlers receive the same app shell as
// people, so article previews are never indexed as thin duplicates of Wikipedia.
const BOTS = /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|applebot|imessagebot|pinterestbot|redditbot/i;
const BAD_TITLE = /^(list of|index of|wikipedia:|template:|category:|portal:|draft:|module:|file:|help:|special:)/i;
// The article API is a shared, bounded supply cache. Distinct batch slots avoid
// replaying one cached random selection for every refill in the same session.
const FRESH_MS = 60_000;
const RETAIN_SECONDS = 86_400;
const network = createNetwork(), supply = createSupply();
// One answer budget per request. A request can chain several upstream calls,
// each with its own 6 s deadline, but the browser stops waiting at 7.5 s
// (10 s for filtered travel). Answer with what is ready and let the rest of
// the batch finish in the background and fill the edge cache.
const RESPONSE_BUDGET_MS = 6_500;
const TRAVEL_BUDGET_MS = 8_500;
const within = (promise, ms) => { let timer; return Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve(null), ms); })]).finally(() => clearTimeout(timer)); };

const inFlight = new Map(), travelPending = new Map(), placesResolver = createPlaceResolver();
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const strip = s => String(s ?? '').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
// The API serves WikiScroll's own pages, which call it from the same origin, so
// it sends no CORS headers: other sites cannot spend its Wikimedia budget from
// their visitors' browsers.
const json = (body,status=200,headers={}) => Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});

function apiURL(lang,mode,params) {
  return `https://${lang}.${mode==='how'?'wikivoyage':'wikipedia'}.org/w/api.php?`+new URLSearchParams({action:'query',format:'json',...params});
}

function article(p,lang,mode) {
  // The short description ("species of beetle") labels the card's category.
  const desc=typeof p.description==='string'?strip(p.description).slice(0,160):'';
  return {id:(mode==='how'?'v':'w')+p.pageid,src:mode,title:p.title,body:strip(p.extract),img:imageURL(p.thumbnail?.source),url:p.fullurl||`https://${lang}.${mode==='how'?'wikivoyage':'wikipedia'}.org/wiki/${encodeURIComponent(p.title.replace(/ /g,'_'))}`,...(desc?{desc}:{}),...(mode==='wiki'&&p.needs?.length?{needs:p.needs}:{})};
}

function shuffle(values) {
  const result=[...values];
  for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}

function selectCandidates(values,lang,mode,depth) {
  // Wikivoyage: 40 characters (20 in Chinese, Japanese, Korean); Wikipedia: 80.
  const candidates=shuffle(values);
  if(mode!=='wiki')return candidates.slice(0,20);
  // Discovery depth measures article popularity only. There is no saved-item,
  // previous-card, category-similarity or other personalization input here.
  // Bands are English readership; smaller editions are scaled (pageviews.js).
  const [low,high]=scaleBand(({1:[300,Infinity],2:[100,300],3:[10,Infinity],4:[2,30],5:[0,2]})[depth],lang);
  const eligible=[],fallback=[],lag=lagDays(candidates);
  for(const page of candidates){
    const views=averageViews(page,lag);
    if(views!==null&&views>=low&&views<=high)eligible.push(page);
    else if(views!==null){
      const distance=views<low?Math.log1p(low)-Math.log1p(views):Math.log1p(views)-Math.log1p(high);
      fallback.push({page,distance});
    }
  }
  // Preserve a real distinction between depths: never return the entire
  // out-of-band sample just because n is large. A small nearby fallback keeps
  // a thin first response usable while the next independent batch preloads.
  const selected=eligible.slice(0,20);
  if(depth===3&&selected.length<5){
    fallback.sort((a,b)=>a.distance-b.distance);
    selected.push(...fallback.filter(x=>x.distance<=Math.log(2)).slice(0,Math.min(3,5-selected.length)).map(x=>x.page));
  }
  return selected;
}
function selectArticles(pages,lang,mode,depth) {
  const readable=[...pages.values()].filter(p=>mode==='how'?guideReadable(strip(p.extract)):strip(p.extract).length>=80);
  return selectCandidates(readable,lang,mode,depth).map(p=>article(p,lang,mode));
}

function startBatch(key,lang,mode,depth,cache,ctx,work) {
  const upstream=work.upstream;
  const id=key.url;
  if(inFlight.has(id))return inFlight.get(id);
  let deliver;
  const ready=new Promise(resolve=>{deliver=resolve;});
  // snapshot() returns the cards already usable if the answer budget runs out.
  const entry={ready,complete:null,snapshot:()=>[]};
  inFlight.set(id,entry);
  entry.complete=(async()=>{
    // Popular and Known sample Wikipedia's vital articles (vital.js).
    if(mode==='wiki'&&depth<=2){
      const info={};
      entry.snapshot=()=>info.snapshot?.()||[];
      const payload={articles:await vitalArticles(lang,depth,upstream,ctx,article,info,work),cached_at:new Date().toISOString()};
      deliver(payload);
      // A Known answer borrowed from Popular serves this reader only.
      if(cache&&payload.articles.length&&!info.borrowed)await cache.put(key,json(payload,200,{'Cache-Control':`public, max-age=${RETAIN_SECONDS}`})).catch(()=>{});
      return payload;
    }
    const pages=new Map();
    entry.snapshot=()=>selectArticles(pages,lang,mode,depth);
    // Candidates first, text second: the random call carries no extracts, so
    // it returns in a fraction of a second; introductions are then fetched in
    // parallel chunks for the readable candidates only (extracts.js).
    const params={generator:'random',grnnamespace:'0',grnlimit:'20',prop:'pageimages|info|description'+(mode==='wiki'?'|pageviews':'|categories'),pvipdays:'14',piprop:'thumbnail',pithumbsize:'960',pilimit:'max',inprop:mode==='wiki'?'url|talkid':'url',...(mode==='how'?phrasebookParams(lang):{})};
    // Two concurrent Wikipedia samples yield up to 40 candidates. Wikivoyage
    // needs one: its guides need no photo, so most of the 20 are usable.
    // Publish the first usable response immediately; cache the merged result
    // after its sibling finishes, without holding up the reader's next card.
    await Promise.all(Array.from({length:mode==='how'?1:2},async()=>{
      const data=await upstream(apiURL(lang,mode,params));
      const fresh=[];
      for(const p of Object.values(data?.query?.pages||{})){
        if(!Number.isSafeInteger(p.pageid)||p.pageid<1||(mode==='wiki'&&!p.thumbnail?.source)||!p.title||BAD_TITLE.test(p.title))continue;
        // Wikivoyage includes travel topics as well as destinations. Avoid
        // obvious non-destination pages without rejecting non-English guides.
        if(mode==='how'&&(isPhrasebook(p)||/^(?:travel topics?|itineraries)(?:[ :/]|$)/i.test(p.title)))continue;
        if(isDisambiguation(p))continue;
        if(!pages.has(p.pageid))fresh.push(p);
      }
      // Registered before their text arrives: selection skips pages without an
      // introduction, so an answer-budget snapshot only shows complete cards.
      for(const p of fresh)pages.set(p.pageid,p);
      // The random call returns views for only five pages; complete the
      // candidates so depth sees the whole sample, not A-to-D titles.
      supply.hydrate(fresh,lang,mode);
      if(mode==='wiki')await completePageviews(fresh,ids=>upstream(apiURL(lang,mode,{prop:'pageviews',pvipdays:'14',pageids:ids})));
      const chosen=selectCandidates(fresh,lang,mode,depth);
      await Promise.all([
        completeExtracts(chosen,ids=>upstream(apiURL(lang,mode,extractParams(ids)))).then(()=>mode==='how'?completeLeadFallback(chosen,id=>upstream(apiURL(lang,mode,fullTextParams(id)))):null),
        mode==='wiki'&&HELP_LANGS.has(lang)?completeNeeds(lang,chosen,params=>upstream(apiURL(lang,mode,params))):null,
      ]);
      // Only a sample that added pages publishes: a duplicate sample must not
      // answer before its sibling's views and introductions have arrived.
      supply.remember(fresh,lang,mode);
      const selected=fresh.length?selectArticles(pages,lang,mode,depth):[];
      if(selected.length)deliver({articles:selected,cached_at:new Date().toISOString()});
    }));
    const payload={articles:selectArticles(pages,lang,mode,depth),cached_at:new Date().toISOString()};
    deliver(payload);
    if(cache&&payload.articles.length){
      // Keep yesterday's valid supply available during a Wikimedia outage.
      // Freshness is checked in the payload, independently of edge retention.
      await cache.put(key,json(payload,200,{'Cache-Control':`public, max-age=${RETAIN_SECONDS}`})).catch(()=>{});
    }
    return payload;
  })().catch(()=>{const empty={articles:[]};deliver(empty);return empty;}).finally(()=>inFlight.delete(id));
  return entry;
}

async function articles(request,url,ctx,env,work) {
  const mode=url.searchParams.get('mode')||'wiki';
  const requested=url.searchParams.get('lang')||'en';
  const n=Number(url.searchParams.get('n')||20);
  const depth=Number(url.searchParams.get('depth')||3);
  const batch=Number(url.searchParams.get('batch')||0);
  if(!['wiki','how'].includes(mode)||!LANGS.has(requested)||!Number.isInteger(n)||n<1||n>40||!Number.isInteger(depth)||depth<1||depth>5||!Number.isInteger(batch)||batch<0||batch>63) return json({error:'Use mode=wiki|how, a supported lang, n=1..40, depth=1..5, and batch=0..63.'},400);
  const lang=mode==='how'?voyageLang(requested):requested;
  // n only slices a shared batch; arbitrary request sizes cannot multiply cache
  // keys. Versioning excludes earlier unfiltered batches after depth changes.
  const key=new Request(`${url.origin}/api/articles?version=7&mode=${mode}&lang=${lang}&depth=${mode==='how'?3:depth}&batch=${batch}`);
  const cache=work.cache;
  let stored;
  try{const hit=await cache?.match(key);if(hit)stored=await hit.json();}catch{}
  const valid=stored?.articles?.length&&Number.isFinite(Date.parse(stored.cached_at));
  const age=valid?Date.now()-Date.parse(stored.cached_at):Infinity;
  if(valid&&age<RETAIN_SECONDS*1000){
    const stale=age>=FRESH_MS;
    if(stale&&!inFlight.has(key.url)&&await permit(env,'WORK_LIMIT','feed'))ctx.waitUntil(startBatch(key,lang,mode,depth,cache,ctx,work).complete);
    return json({...stored,articles:stored.articles.slice(0,n),stale},200,{'X-Cache':stale?'STALE':'HIT'});
  }
  if(!inFlight.has(key.url)&&!await permit(env,'WORK_LIMIT','feed'))return limited();
  const pending=startBatch(key,lang,mode,depth,cache,ctx,work);
  ctx.waitUntil(pending.complete);
  let result=await within(pending.ready,RESPONSE_BUDGET_MS);
  if(!result)result={articles:pending.snapshot(),cached_at:new Date().toISOString()};
  if(!result.articles.length){
    return unavailable(work);
  }
  return json({...result,articles:result.articles.slice(0,n)},200,{'X-Cache':'MISS'});
}

export function renderUnfurl(meta,url,lang) {
  const title=escape(meta.title+' | WikiScroll'),description=escape(meta.body.replace(/\s*—\s*/g, ', ').slice(0,200));
  const img=escape(meta.img||'https://wikiscroll.com/images/og-discovery-v8.png');
  const canonical=escape(url);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title><meta name="robots" content="noindex,follow"><meta name="description" content="${description}"><link rel="canonical" href="${canonical}"><meta property="og:type" content="article"><meta property="og:url" content="${canonical}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:image" content="${img}"><meta property="og:site_name" content="WikiScroll"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${img}"></head><body><h1>${title}</h1><p>${description}</p><a href="${canonical}">Open in WikiScroll</a></body></html>`;
}

// Opening texts already read for guides without an introduction (extracts.js
// completeLeadFallback): kept in this isolate and in the edge cache for a day,
// so a retried travel page makes progress. Subrequest budget per travel answer
// on the Workers Free plan (50, Cache API calls included): page cache 2,
// All fetches and cache operations share runtime.js's 48-operation ceiling.
// Stored texts are checked in a small window so geographic ancestry and
// opening-text retries also have room in the invocation budget.
// Agent discovery (RFC 8288): the homepage points to its machine-readable
// description and its Markdown version. There is deliberately no api-catalog
// or service-desc: /api/ is the reader's own rate-limited backend, not a
// public API (robots.txt disallows it).
const HOME_LINKS='</llms.txt>; rel="describedby"; type="text/markdown", </about/>; rel="service-doc"; type="text/html", </>; rel="alternate"; type="text/markdown"';
const LEAD_LOOKUPS=12,leads=new Map();
function leadStore(lang,ctx,work){
  const cache=work.cache,key=id=>new Request(`https://wikiscroll.com/__lead/v1/${lang}/${id}`);
  const remember=(id,text)=>{if(leads.size>=4000)leads.delete(leads.keys().next().value);leads.set(lang+'|'+id,text);};
  return {
    async lookup(ids){
      const found=new Map(),rest=[];
      for(const id of ids){const k=lang+'|'+id;if(leads.has(k))found.set(id,leads.get(k));else rest.push(id);}
      await Promise.all(rest.slice(0,LEAD_LOOKUPS).map(async id=>{try{const hit=await cache?.match(key(id));if(hit){const text=await hit.text();found.set(id,text);remember(id,text);}}catch{}}));
      return found;
    },
    save(id,text){remember(id,text);if(cache)ctx.waitUntil(cache.put(key(id),new Response(text,{headers:{'Content-Type':'text/plain;charset=utf-8','Cache-Control':'public, max-age=86400'}})).catch(()=>{}));},
  };
}

async function handle(request,env,ctx,work) {
    const upstream=work.upstream;
    const url=new URL(request.url);
    if(['/collection','/collection.png','/api/collection'].includes(url.pathname)) return collectionResponse(request,ctx,env,work);
    if(url.pathname.startsWith('/api/')){
      if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed'},405,{'Allow':'GET, HEAD'});
      if(url.pathname==='/api/travel'){
        const requested=url.searchParams.get('lang')||'en',input=(url.searchParams.get('place')||'').trim(),style=url.searchParams.get('style')||'';

        if(!LANGS.has(requested)||input.length>80||style&&!TRAVEL_STYLES.includes(style))return json({error:'Invalid travel filters'},400);
        // One to three places ("Japan, Tuscany"), each searched on its own so
        // results alternate between them; the cursor keeps one offset per place.
        const places=parsePlaces(input,requested),cursor=parseCursor(url.searchParams.get('offset'),places.length);
        if(!cursor)return json({error:'Invalid travel filters'},400);
        if(!places.length&&!style)return json({error:'Choose a travel filter'},400);
        const lang=voyageLang(requested);
        // Many readers ask for the same destination and style: complete result
        // pages are shared from the edge cache for an hour, before any upstream work.
        const key=new Request(`${url.origin}/api/travel?v=9&lang=${lang}&place=${encodeURIComponent(places.map(fold).join('|'))}&style=${style}&offset=${cursor.map(c=>c??'-').join('.')}`),cache=work.cache;
        try{const hit=await cache?.match(key);if(hit)return json(await hit.json(),200,{'X-Cache':'HIT'});}catch{}
        if(travelPending.has(key.url))return (await travelPending.get(key.url)).clone();
        if(!await permit(env,'WORK_LIMIT','travel'))return limited();
        const job=(async()=>{
        const started=Date.now(),limit=String(places.length>1?Math.ceil(30/places.length):30);
        const searches=await Promise.all((places.length?places:[null]).map(async(place,i)=>{
          if(cursor[i]===null)return {place,pages:[],next:null};
          const query=[place?JSON.stringify(place):'',style?'('+travelTerms(lang,style)+')':''].filter(Boolean).join(' ');
          const data=await upstream(apiURL(lang,'how',{generator:'search',gsrsearch:query,gsrnamespace:'0',gsrlimit:limit,gsroffset:String(cursor[i]),prop:'pageimages|info|description|categories|pageprops',ppprop:'geocrumb-is-in|disambiguation',piprop:'thumbnail',pithumbsize:'960',pilimit:'max',inprop:'url',...phrasebookParams(lang)}));
          if(!data||data.error)return null;
          // Search relevance order (the generator's index), not page-ID order.
          const pages=Object.values(data.query?.pages||{}).filter(p=>p.pageid>0&&!isDisambiguation(p)&&!isPhrasebook(p)).sort((a,b)=>(a.index??0)-(b.index??0));
          return {place,pages,next:data.continue?.gsroffset??null};
        }));
        if(searches.includes(null))return unavailable(work,'Travel search temporarily unavailable');
        const canonical=new Map(searches.flatMap(s=>s.pages).map(p=>[p.pageid,p]));
        for(const search of searches)search.pages=search.pages.map(p=>canonical.get(p.pageid));
        const found=[...canonical.values()];
        const identityTask=(async()=>{
          if(!places.length)return new Map();
          const identities=await placesResolver.resolve(lang,places,upstream);
          await placesResolver.annotate(lang,found,new Set([...identities.values()].filter(Boolean)),upstream);
          return identities;
        })();
        // Guides whose introduction misses the budget are left out of this page.
        // Guides without an introduction use their opening text: texts read
        // before come from leadStore, at most FALLBACK_MAX more are read now, and
        // the rest leave the page unfinished, so the browser's retry reads them.
        supply.hydrate(found,lang,'how');
        const texts=completeExtracts(found,ids=>upstream(apiURL(lang,'how',extractParams(ids)))).then(()=>completeLeadFallback(found,id=>upstream(apiURL(lang,'how',fullTextParams(id))),FALLBACK_MAX,leadStore(lang,ctx,work))).then(()=>supply.remember(found,lang,'how'));
        work.keep(texts);
        const preparation=Promise.all([texts,identityTask]);work.keep(preparation);
        await within(preparation,Math.max(0,TRAVEL_BUDGET_MS-(Date.now()-started)));
        const identities=await within(identityTask,0)||new Map();
        // Keep guides that are about the place: named in the title or introduction.
        const ready=searches.map(s=>s.pages.filter(p=>{
          if(!guideReadable(strip(p.extract)))return false;
          if(!s.place)return true;
          const belongs=placesResolver.belongs(lang,p,identities.get(s.place));
          if(belongs==='pending'||!identities.has(s.place)){p.locationMissing=true;return false;}
          delete p.locationMissing;
          return belongs===null?namesPlace(p,s.place):belongs;
        }));
        const body={articles:interleave(ready).map(p=>article(p,lang,'how')),next:formatCursor(searches.map(s=>s.next))};
        const unfinished=s=>s.pages.some(p=>typeof p.extract!=='string'||p.extractMissing||p.locationMissing);
        let complete=!searches.some(unfinished);
        // Some guides' text did not arrive in time: moving on would skip them for
        // good (and could end the feed early). "retry" keeps each unfinished
        // place on its current page; the browser asks again, skipping guides it
        // already has, and only then follows "next".
        if(!complete)body.retry=formatCursor(searches.map((s,i)=>unfinished(s)?cursor[i]:s.next));
        // A misspelled place finds nothing: offer the search engine's correction.
        if(!found.length&&places.length===1&&cursor[0]===0){
          const hint=await upstream(apiURL(lang,'how',{list:'search',srsearch:places[0],srnamespace:'0',srinfo:'suggestion',srlimit:'1',srprop:''}));
          const suggestion=String(hint?.query?.searchinfo?.suggestion||'').replace(/[^\p{L}\p{N}\s'-]/gu,' ').replace(/\s+/g,' ').trim().slice(0,80);
          if(suggestion&&fold(suggestion)!==fold(places[0]))body.suggestion=suggestion.charAt(0).toLocaleUpperCase(lang)+suggestion.slice(1);
          if(!hint)complete=false;
        }
        // Only a page where every guide's introduction arrived is cached. A
        // partial or failed page is not, so a slow moment never hides guides for an hour.
        if(cache&&complete)ctx.waitUntil(cache.put(key,json(body,200,{'Cache-Control':'public, max-age=3600'})).catch(()=>{}));
        if(!body.articles.length&&!complete&&work.reason)return unavailable(work,'Travel guides are temporarily unavailable');
        return json(body,200,{'X-Cache':'MISS'});
        })();
        travelPending.set(key.url,job);work.keep(job);
        try{return (await job).clone();}finally{travelPending.delete(key.url);}
      }
      if(url.pathname==='/api/today'){
        const response=await todayResponse(url,ctx,{langs:LANGS,permit,limited,env,work,feed:address=>work.upstream(address,{timeoutMs:15000})});
        return request.method==='HEAD'?new Response(null,response):response;
      }
      if(url.pathname==='/api/topics'){
        const response=await topicResponse(url,env,ctx,{langs:LANGS,permit,limited,upstream,work,supply});
        return request.method==='HEAD'?new Response(null,response):response;
      }
      if(url.pathname==='/api/articles'){
        const response=await articles(request,url,ctx,env,work);
        return request.method==='HEAD'?new Response(null,response):response;
      }
      return json({error:'Not found'},404);
    }
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
    const id=url.searchParams.get('a'),lang=url.searchParams.get('lang')||'en';
    if(id&&/^[wv][1-9]\d{0,11}$/.test(id)&&LANGS.has(lang)&&BOTS.test(request.headers.get('User-Agent')||'')){
      let meta;try{meta=await verifiedArticle(id,lang,env,ctx,work);}catch{return new Response('Preview temporarily unavailable',{status:503,headers:{'Retry-After':'60'}});}
      if(meta){
        // Never let a cached bot response become a human's app shell.
        return new Response(request.method==='HEAD'?null:renderUnfurl(meta,url.href,lang),{headers:{'Content-Type':'text/html;charset=UTF-8','Content-Security-Policy':"default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",'Cache-Control':'private, no-store','Vary':'User-Agent','X-Robots-Tag':'noindex'}});
      }
    }
    // Agents that ask for Markdown get the page's text: llms.txt stands for the
    // reader (a JavaScript app with no text of its own), About is converted.
    const page=url.pathname==='/'||url.pathname==='/index.html'?'home':/^\/about(?:\/|\/index\.html)?$/.test(url.pathname)?'about':null;
    if(page&&wantsMarkdown(request.headers.get('Accept'))){
      const source=await env.ASSETS.fetch(new Request(new URL(page==='home'?'/llms.txt':'/about/',url.origin)));
      if(source.ok){
        const text=await source.text();
        const response=markdownResponse(page==='home'?text:htmlToMarkdown(text,url.origin+'/about/'),request.method==='HEAD');
        if(page==='home')response.headers.set('Link',HOME_LINKS);
        return response;
      }
    }
    // About is a static page: only its Vary header changes, since the same URL can answer in Markdown.
    if(page==='about'){
      const response=await env.ASSETS.fetch(request),headers=new Headers(response.headers);
      headers.set('Vary','Accept');
      return new Response(response.body,{status:response.status,headers});
    }
    let response=await env.ASSETS.fetch(request);
    if(response.headers.get('content-type')?.includes('text/html')){
      const headers=new Headers(response.headers);headers.set('Cache-Control','no-cache');headers.set('Vary','Accept, User-Agent');
      if(page==='home')headers.set('Link',HOME_LINKS);
      response=new Response(response.body,{status:response.status,headers});
      const mapKey=env.CARTO_BASEMAP_KEY;
      if(page==='home'&&typeof mapKey==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(mapKey)){
        response=new HTMLRewriter().on('meta[name="carto-basemap-key"]',{element(el){el.setAttribute('content',mapKey);}}).transform(response);
      }
      const beacon=env.WEB_ANALYTICS_TOKEN;
      if(beacon&&/^[a-f0-9]{32}$/i.test(beacon)){
        response=new HTMLRewriter().on('body',{element(el){el.append(`<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${beacon}"}'></script>`,{html:true});}}).transform(response);
      }
    }
    return response;

}
export default {async fetch(request,env,ctx){
  const url=new URL(request.url);
  const dynamic=url.pathname.startsWith('/api/')||url.pathname.startsWith('/collection')||(url.searchParams.has('a')&&BOTS.test(request.headers.get('User-Agent')||''));
  if(dynamic&&!await permit(env,'REQUEST_LIMIT',request.headers.get('CF-Connecting-IP')||'unknown'))return secure(limited());
  const work=createWork(env,ctx,network);
  try{return secure(await handle(request,env,ctx,work));}
  catch{return secure(new Response('Temporarily unavailable. Please retry.',{status:503,headers:{'Cache-Control':'no-store','Retry-After':'60'}}));}
}};
