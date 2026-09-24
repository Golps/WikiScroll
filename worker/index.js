import {permit,limited,secure} from './security.js';
import {topicResponse} from './topics.js';
import {verifiedArticle} from './verified.js';
import { collectionResponse } from './collections.js';
import {averageViews,lagDays,completePageviews,scaleBand} from './pageviews.js';
import {completeExtracts,extractParams} from './extracts.js';
import {vitalArticles} from './vital.js';
import {completeNeeds,HELP_LANGS} from './needs.js';
import {todayResponse} from './today.js';
/** WikiScroll Worker: explicit routing, static assets and article unfurls.
 * Handles article requests and social previews.
 * No GitHub integration, Pages runtime, KV or framework is required.
 */
const LANGS = new Set(['en','es','fr','de','it','pt','ru','ja','zh','ar','hi','ko','nl','pl','he']);
// Wikivoyage editions large enough for a feed. Arabic and Korean have none;
// Hindi has about 200 guides. Those readers get English guides instead.
export const VOYAGE_LANGS = new Set(['en','es','fr','de','it','pt','ru','ja','zh','he','nl','pl']);
const voyageLang = lang => VOYAGE_LANGS.has(lang) ? lang : 'en';
const DISAMBIGUATION = /^topics referred to by the same term$/i;
// Link-preview services only. Search crawlers receive the same app shell as
// people, so article previews are never indexed as thin duplicates of Wikipedia.
const BOTS = /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|applebot|imessagebot|pinterestbot|redditbot/i;
const BAD_TITLE = /^(list of|index of|wikipedia:|template:|category:|portal:|draft:|module:|file:|help:|special:)/i;
// The article API is a shared, bounded supply cache. Distinct batch slots avoid
// replaying one cached random selection for every refill in the same session.
const FRESH_MS = 60_000;
const RETAIN_SECONDS = 86_400;
const UPSTREAM_TIMEOUT_MS = 6_000;
// One answer budget per request. A request can chain several upstream calls,
// each with its own 6 s deadline, but the browser stops waiting at 7.5 s
// (10 s for filtered travel). Answer with what is ready and let the rest of
// the batch finish in the background and fill the edge cache.
const RESPONSE_BUDGET_MS = 6_500;
const TRAVEL_BUDGET_MS = 8_500;
const within = (promise, ms) => { let timer; return Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve(null), ms); })]).finally(() => clearTimeout(timer)); };
const cooldowns = new Map();
const inFlight = new Map();
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const strip = s => String(s ?? '').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
const json = (body,status=200,headers={}) => Response.json(body,{status,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*',...headers}});

export function retryDelay(value, now=Date.now()) {
  if (/^\d+(\.\d+)?$/.test(value || '')) return Math.max(1000,Number(value)*1000);
  const date=Date.parse(value);
  return Number.isFinite(date) ? Math.max(1000,date-now) : 30000;
}

async function upstream(url) {
  const host=new URL(url).hostname;
  if (Date.now()<(cooldowns.get(host)||0)) return null;
  // One wall-clock deadline includes response headers AND parsing the body.
  // Promise.race also bounds this path if an upstream ignores cancellation.
  const controller=new AbortController();
  let timer;
  const timeout=new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(null);},UPSTREAM_TIMEOUT_MS);});
  try {
    return await Promise.race([timeout,(async()=>{
      const response=await fetch(url,{headers:{'User-Agent':'WikiScroll/4.0 (https://wikiscroll.com)'},signal:controller.signal});
      if(response.status===429||(response.status===503&&response.headers.has('Retry-After'))){
        cooldowns.set(host,Date.now()+retryDelay(response.headers.get('Retry-After')));
        return null;
      }
      return response.ok ? await response.json() : null;
    })()]);
  } catch { return null; }
  finally { clearTimeout(timer); }
}

function apiURL(lang,mode,params) {
  return `https://${lang}.${mode==='how'?'wikivoyage':'wikipedia'}.org/w/api.php?`+new URLSearchParams({action:'query',format:'json',...params});
}

function article(p,lang,mode) {
  // The short description ("species of beetle") labels the card's category.
  const desc=typeof p.description==='string'?strip(p.description).slice(0,160):'';
  return {id:(mode==='how'?'v':'w')+p.pageid,src:mode,title:p.title,body:strip(p.extract),img:p.thumbnail?.source||'',url:p.fullurl||`https://${lang}.${mode==='how'?'wikivoyage':'wikipedia'}.org/wiki/${encodeURIComponent(p.title.replace(/ /g,'_'))}`,...(desc?{desc}:{}),...(mode==='wiki'&&p.needs?.length?{needs:p.needs}:{})};
}

function shuffle(values) {
  const result=[...values];
  for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}

function selectArticles(pages,lang,mode,depth) {
  const minimum=mode==='how'?40:80;
  const candidates=shuffle([...pages.values()].filter(p=>strip(p.extract).length>=minimum));
  if(mode!=='wiki')return candidates.slice(0,20).map(p=>article(p,lang,mode));
  // Discovery depth measures article popularity only. There is no saved-item,
  // previous-card, category-similarity or other personalization input here.
  // Bands are English readership; smaller editions are scaled (pageviews.js).
  const [low,high]=scaleBand(({1:[300,Infinity],2:[100,300],3:[10,Infinity],4:[2,30],5:[0,2]})[depth],lang);
  const eligible=[],fallback=[],lag=lagDays(candidates);
  for(const page of candidates){
    const views=averageViews(page,lag);
    if(views!==null&&views>=low&&views<=high)eligible.push(page);
    else{
      const distance=views===null?Infinity:views<low?Math.log1p(low)-Math.log1p(views):Math.log1p(views)-Math.log1p(high);
      fallback.push({page,distance});
    }
  }
  // Preserve a real distinction between depths: never return the entire
  // out-of-band sample just because n is large. A small nearby fallback keeps
  // a thin first response usable while the next independent batch preloads.
  const selected=eligible.slice(0,20);
  if(selected.length<5){
    fallback.sort((a,b)=>a.distance-b.distance);
    selected.push(...fallback.slice(0,Math.min(3,5-selected.length)).map(x=>x.page));
  }
  return selected.map(p=>article(p,lang,mode));
}

function startBatch(key,lang,mode,depth,cache,ctx) {
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
      const payload={articles:await vitalArticles(lang,depth,upstream,ctx,article,info),cached_at:new Date().toISOString()};
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
    const params={generator:'random',grnnamespace:'0',grnlimit:'20',prop:'pageimages|info|description'+(mode==='wiki'?'|pageviews':''),pvipdays:'14',piprop:'thumbnail',pithumbsize:'800',pilimit:'max',inprop:'url'};
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
        if(mode==='how'&&/^(?:phrasebook|travel topics?|itineraries|phrasebooks)(?:[ :/]|$)/i.test(p.title))continue;
        if(DISAMBIGUATION.test(p.description||''))continue;
        if(!pages.has(p.pageid))fresh.push(p);
      }
      // Registered before their text arrives: selection skips pages without an
      // introduction, so an answer-budget snapshot only shows complete cards.
      for(const p of fresh)pages.set(p.pageid,p);
      // The random call returns views for only five pages; complete the
      // candidates so depth sees the whole sample, not A-to-D titles.
      await Promise.all([
        mode==='wiki'?completePageviews(fresh,ids=>upstream(apiURL(lang,mode,{prop:'pageviews',pvipdays:'14',pageids:ids}))):null,
        completeExtracts(fresh,ids=>upstream(apiURL(lang,mode,extractParams(ids)))),
        // Maintenance tags for the optional "Needs citations" card label.
        mode==='wiki'&&HELP_LANGS.has(lang)?completeNeeds(lang,fresh,params=>upstream(apiURL(lang,mode,params))):null,
      ]);
      // Only a sample that added pages publishes: a duplicate sample must not
      // answer before its sibling's views and introductions have arrived.
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

async function articles(request,url,ctx,env) {
  const mode=url.searchParams.get('mode')||'wiki';
  const requested=url.searchParams.get('lang')||'en';
  const n=Number(url.searchParams.get('n')||20);
  const depth=Number(url.searchParams.get('depth')||3);
  const batch=Number(url.searchParams.get('batch')||0);
  if(!['wiki','how'].includes(mode)||!LANGS.has(requested)||!Number.isInteger(n)||n<1||n>40||!Number.isInteger(depth)||depth<1||depth>5||!Number.isInteger(batch)||batch<0||batch>63) return json({error:'Use mode=wiki|how, a supported lang, n=1..40, depth=1..5, and batch=0..63.'},400);
  const lang=mode==='how'?voyageLang(requested):requested;
  // n only slices a shared batch; arbitrary request sizes cannot multiply cache
  // keys. Versioning excludes earlier unfiltered batches after depth changes.
  const key=new Request(`${url.origin}/api/articles?version=5&mode=${mode}&lang=${lang}&depth=${mode==='how'?3:depth}&batch=${batch}`);
  const cache=globalThis.caches?.default;
  let stored;
  try{const hit=await cache?.match(key);if(hit)stored=await hit.json();}catch{}
  const valid=stored?.articles?.length&&Number.isFinite(Date.parse(stored.cached_at));
  const age=valid?Date.now()-Date.parse(stored.cached_at):Infinity;
  if(valid&&age<RETAIN_SECONDS*1000){
    const stale=age>=FRESH_MS;
    if(stale&&await permit(env,'WORK_LIMIT','feed'))ctx.waitUntil(startBatch(key,lang,mode,depth,cache,ctx).complete);
    return json({...stored,articles:stored.articles.slice(0,n),stale},200,{'X-Cache':stale?'STALE':'HIT'});
  }
  if(!await permit(env,'WORK_LIMIT','feed'))return limited();
  const pending=startBatch(key,lang,mode,depth,cache,ctx);
  ctx.waitUntil(pending.complete);
  let result=await within(pending.ready,RESPONSE_BUDGET_MS);
  if(!result)result={articles:pending.snapshot(),cached_at:new Date().toISOString()};
  if(!result.articles.length){
    const host=new URL(apiURL(lang,mode,{})).hostname;
    const retry=Math.max(5,Math.ceil(((cooldowns.get(host)||0)-Date.now())/1000));
    return json({articles:[],error:'Wikimedia is temporarily unavailable.'},503,{'Retry-After':String(retry)});
  }
  return json({...result,articles:result.articles.slice(0,n)},200,{'X-Cache':'MISS'});
}

export function renderUnfurl(meta,url,lang) {
  const title=escape(meta.title+' | WikiScroll'),description=escape(meta.body.replace(/\s*—\s*/g, ', ').slice(0,200));
  const img=escape(meta.img||'https://wikiscroll.com/images/og-discovery-v7.png');
  const canonical=escape(url);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title><meta name="robots" content="noindex,follow"><meta name="description" content="${description}"><link rel="canonical" href="${canonical}"><meta property="og:type" content="article"><meta property="og:url" content="${canonical}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:image" content="${img}"><meta property="og:site_name" content="WikiScroll"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${img}"></head><body><h1>${title}</h1><p>${description}</p><a href="${canonical}">Open in WikiScroll</a></body></html>`;
}

async function handle(request,env,ctx) {
    const url=new URL(request.url);
    if(['/collection','/collection.png','/api/collection'].includes(url.pathname)) return collectionResponse(request,ctx,env);
    if(url.pathname.startsWith('/api/')){
      if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS'}});
      if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed'},405,{'Allow':'GET, HEAD, OPTIONS'});
      if(url.pathname==='/api/travel'){
        const requested=url.searchParams.get('lang')||'en',place=(url.searchParams.get('place')||'').trim(),style=url.searchParams.get('style')||'',offset=Number(url.searchParams.get('offset')||0);
        const styles={nature:'nature OR hiking OR park',coast:'beach OR coast OR island',culture:'museum OR history OR culture',city:'city OR urban'};
        if(!LANGS.has(requested)||place.length>80||!Number.isInteger(offset)||offset<0||offset>10000||style&&!Object.hasOwn(styles,style))return json({error:'Invalid travel filters'},400);
        if(!await permit(env,'WORK_LIMIT','travel'))return limited();
        const started=Date.now();
        const clean=place.replace(/[^\p{L}\p{N}\s'-]/gu,' ').trim();
        const query=[clean?JSON.stringify(clean):'',style?'('+styles[style]+')':''].filter(Boolean).join(' ');
        if(!query)return json({error:'Choose a travel filter'},400);
        const lang=voyageLang(requested);
        const data=await upstream(apiURL(lang,'how',{generator:'search',gsrsearch:query,gsrnamespace:'0',gsrlimit:'20',gsroffset:String(offset),prop:'pageimages|info|description',piprop:'thumbnail',pithumbsize:'800',pilimit:'max',inprop:'url'}));
        if(!data||data.error)return json({error:'Travel search temporarily unavailable'},503);
        const found=Object.values(data.query?.pages||{}).filter(p=>p.pageid>0&&!DISAMBIGUATION.test(p.description||''));
        // Guides whose introduction misses the budget are left out of this page.
        await within(completeExtracts(found,ids=>upstream(apiURL(lang,'how',extractParams(ids)))),Math.max(0,TRAVEL_BUDGET_MS-(Date.now()-started)));
        return json({articles:found.filter(p=>strip(p.extract).length>=40).map(p=>article(p,lang,'how')),next:data.continue?.gsroffset??null});
      }
      if(url.pathname==='/api/today'){
        const response=await todayResponse(url,ctx,{langs:LANGS,permit,limited,env});
        return request.method==='HEAD'?new Response(null,response):response;
      }
      if(url.pathname==='/api/topics'){
        const response=await topicResponse(url,env,ctx,{langs:LANGS,permit,limited,upstream});
        return request.method==='HEAD'?new Response(null,response):response;
      }
      if(url.pathname==='/api/articles'){
        const response=await articles(request,url,ctx,env);
        return request.method==='HEAD'?new Response(null,response):response;
      }
      return json({error:'Not found'},404);
    }
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
    const id=url.searchParams.get('a'),lang=url.searchParams.get('lang')||'en';
    if(id&&/^[wv][1-9]\d{0,11}$/.test(id)&&LANGS.has(lang)&&BOTS.test(request.headers.get('User-Agent')||'')){
      let meta;try{meta=await verifiedArticle(id,lang,env,ctx);}catch{return new Response('Preview temporarily unavailable',{status:503,headers:{'Retry-After':'60'}});}
      if(meta){
        // Never let a cached bot response become a human's app shell.
        return new Response(request.method==='HEAD'?null:renderUnfurl(meta,url.href,lang),{headers:{'Content-Type':'text/html;charset=UTF-8','Content-Security-Policy':"default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",'Cache-Control':'private, no-store','Vary':'User-Agent','X-Robots-Tag':'noindex'}});
      }
    }
    let response=await env.ASSETS.fetch(request);
    if(response.headers.get('content-type')?.includes('text/html')){
      const headers=new Headers(response.headers);headers.set('Cache-Control','no-cache');headers.set('Vary','User-Agent');
      response=new Response(response.body,{status:response.status,headers});
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
  try{return secure(await handle(request,env,ctx));}
  catch{return secure(new Response('Temporarily unavailable. Please retry.',{status:503,headers:{'Cache-Control':'no-store','Retry-After':'60'}}));}
}};
