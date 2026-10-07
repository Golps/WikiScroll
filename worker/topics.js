import {averageViews,lagDays,completePageviews,scaleBand} from './pageviews.js';
import {completeExtracts,extractParams} from './extracts.js';
import {completeNeeds,sampleNeedyTitles,HELP_LANGS} from './needs.js';
import {createWork,unavailable} from './runtime.js';
import {imageURL,validOpeningDraw,createOpeningCache} from './supply.js';
// Each refill samples several branches; neither likes nor previous cards enter
// this pipeline. Bounds keep category traversal and upstream work finite.
export const roots={
space:['Galaxies','Nebulae','Exoplanets','Comets','Asteroids','Observatories','Space probes','Astronomical instruments','Cosmology','Celestial mechanics','Space telescopes','Stellar evolution'],
architecture:['Architectural styles','Bridges','Landscape architecture','Vernacular architecture','Architectural elements','Building materials','Urban design','Religious architecture','Castles','Sustainable architecture','Industrial architecture','Architectural history'],
music:['Musical instruments','Music theory','Musical forms','Ethnomusicology','Folk music','Electronic music','Chamber music','Music technology','Musical tuning','Percussion instruments','Music notation','Musicology'],
tech:['Computing','Electrical engineering','Mechanical engineering','Materials science','Telecommunications','Aviation','Spaceflight','Energy technology','Medical technology','Robotics','Optical devices','Manufacturing'],
science:['Physics','Chemistry','Biology','Astronomy','Earth sciences','Ecology','Mathematics','Neuroscience','Genetics','Microbiology','Scientific instruments','Oceanography'],
biology:['Genetics','Cell biology','Ecology','Evolutionary biology','Microbiology','Botany','Zoology','Biochemistry','Neuroscience','Marine biology','Mycology','Physiology'],
sports:['Athletics (track and field)','Water sports','Winter sports','Combat sports','Racket sports','Team sports','Cycling','Sports equipment','Sport climbing','Equestrian sports','Sports science','Traditional sports'],
food:['Food ingredients','Cooking techniques','Fermented foods','Breads','Beverages','Regional cuisines','Spices','Desserts','Food preservation','Street food','Cheeses','Soups'],
history:['Ancient history','Medieval history','Archaeology','Economic history','Social history','History of science','Maritime history','Diplomatic history','Revolutions','Historical documents','Historical people','Military history'],
geo:['Islands','Rivers','Mountains','Deserts','Caves','Volcanoes','Glaciers','Wetlands','Landforms','Cartography','Coasts','National parks'],
arts:['Painting','Sculpture','Architecture','Literature','Classical music','Cinema','Dance','Printmaking','Photography','Folk art','Textile arts','Theatre'],
people:['Scientists','Explorers','Philosophers','Inventors','Artists','Writers','Mathematicians','Historians','Engineers','Educators','Composers','Humanitarians']};
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const lists=new Map(),pending=new Map(),translatedRoots=new Map(),progress=new Map();
const openingCache=createOpeningCache();
const FRESH_MS=120_000,RETAIN_SECONDS=86_400,CATEGORY_MS=15*60_000;
const bands={1:[300,Infinity],2:[100,500],3:[10,300],4:[5,60],5:[0,10]};
function readyArticles(chosen,topic,lang){
 return chosen.filter(p=>!p.extractMissing&&typeof p.extract==='string'&&p.extract.length>=80).map(p=>({id:'w'+p.pageid,src:'wiki',...(topic==='help'?{}:{topic}),...(p.needs?.length?{needs:p.needs}:{}),title:p.title,body:p.extract,img:imageURL(p.thumbnail?.source),url:p.fullurl||`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g,'_'))}`}));
}
export function diverseDepth(pages,depth,lang='en'){
 const [lo,hi]=scaleBand(bands[depth],lang),groups=new Map(),lag=lagDays(pages);
 for(const p of shuffle(pages)){
  const mean=averageViews(p,lag);if(mean===null||mean<lo||mean>hi)continue;
  const list=groups.get(p.branch)||[];list.push(p);groups.set(p.branch,list);
 }
 const result=[],seen=new Set();
 for(let round=0;round<3;round++)for(const list of groups.values()){
  const p=list[round];if(p&&!seen.has(p.pageid)&&(result.length===0||groups.size===1||result.at(-1)?.branch!==p.branch)){result.push(p);seen.add(p.pageid);}
 }
 return result;
}
// topic 'help' samples Wikipedia's maintenance lists; help:true narrows any
// other topic to articles that need work (needs.js).
export async function topicPages(topic,lang,depth,upstream,{help=false,supply=null,state={}}={}){
 const needy=topic==='help'||help;
 let sourceFailed=false;
 const query=async(language,params)=>{
  let data;try{data=await upstream(`https://${language}.wikipedia.org/w/api.php?`+new URLSearchParams({action:'query',format:'json',...params}));}catch{}
  if(!data||data.error){sourceFailed=true;return null;}return data;
 };
 async function members(title){
  const key=lang+'|'+title,entry=lists.get(key);
  // Keep two independently sampled windows; rotate the continuation while
  // serving cached windows, rather than repeatedly draining the first 500.
  if(entry&&Date.now()-entry.time<CATEGORY_MS&&(!entry.next||++entry.uses%3!==0))return entry.windows.flat();
  const data=await query(lang,{list:'categorymembers',cmtitle:title,cmtype:'page|subcat',cmlimit:'500',...(entry?.next?{cmcontinue:entry.next}:{})});
  if(!Array.isArray(data?.query?.categorymembers)){
   sourceFailed=true;return entry&&Date.now()-entry.time<RETAIN_SECONDS*1000?entry.windows.flat():[];
  }
  const windows=entry?.next?[...entry.windows.slice(-1),data.query.categorymembers]:[data.query.categorymembers];
  lists.delete(key);if(lists.size>=128)lists.delete(lists.keys().next().value);
  lists.set(key,{windows,next:data.continue?.cmcontinue,time:Date.now(),uses:0});
  return windows.flat();
 }
 const branches=state.branches ||= topic==='help'?[]:shuffle(roots[topic]).slice(0,6);
 const titles=new Map(branches.map(root=>[root,'Category:'+root]));
 if(!state.candidates&&lang!=='en'&&branches.length){
  const missing=[];
  for(const root of branches){
   const known=translatedRoots.get(lang+'|'+root);
   if(known&&Date.now()-known.time<RETAIN_SECONDS*1000)titles.set(root,known.title);else missing.push(root);
  }
  if(missing.length){
   const d=await query('en',{titles:missing.map(root=>'Category:'+root).join('|'),prop:'langlinks',lllang:lang,lllimit:'max'});
   const pages=Object.values(d?.query?.pages||{});
   for(const root of missing){
    const title=pages.find(p=>p.title==='Category:'+root)?.langlinks?.[0]?.['*']||null;
    titles.set(root,title);
    if(d){const key=lang+'|'+root;translatedRoots.delete(key);if(translatedRoots.size>=512)translatedRoots.delete(translatedRoots.keys().next().value);translatedRoots.set(key,{title,time:Date.now()});}
   }
  }
 }
 const candidates=state.candidates || (topic==='help'?[await sampleNeedyTitles(lang,params=>query(lang,params),8)]:await Promise.all(branches.map(async root=>{
  const title=titles.get(root);if(!title)return [];
  let entries=await members(title),selected=shuffle(entries.filter(p=>p.ns===0)).slice(0,3);
  for(let level=0;level<(depth>=4?3:2);level++){
   const child=shuffle(entries.filter(p=>p.ns===14))[0];if(!child)break;
   entries=await members(child.title);selected.push(...shuffle(entries.filter(p=>p.ns===0)).slice(0,5));
  }
  return shuffle(selected).slice(0,14).map(p=>({...p,branch:root}));
 })));
 if(!sourceFailed)state.candidates=candidates;
 // Sixty candidates reserve room for translated traversal, complete
 // readership, maintenance tags (50 per query), and chosen introductions.
 const balanced=[],candidateLimit=60;
 for(let round=0;balanced.length<candidateLimit&&candidates.some(list=>round<list.length);round++)for(const list of candidates)if(list[round]&&balanced.length<candidateLimit)balanced.push(list[round]);
 const map=new Map();for(const p of balanced)if(!map.has(p.pageid))map.set(p.pageid,p);
 const ids=[...map.keys()],pages=[];
 state.pages ||= new Map();
 const missing=ids.filter(id=>!state.pages.has(id));
 await Promise.all(Array.from({length:Math.ceil(missing.length/20)},async(_,i)=>{
  // No introductions yet: they are the slow part, so only chosen pages get them.
  const d=await query(lang,{pageids:missing.slice(i*20,i*20+20).join('|'),prop:'pageviews|pageimages|info|description',pvipdays:'14',piprop:'thumbnail',pithumbsize:'960',pilimit:'max',inprop:'url|talkid'});
  for(const p of Object.values(d?.query?.pages||{}))if(map.has(p.pageid)&&p.pageid>0&&p.title&&(p.ns===undefined||p.ns===0)&&!/^(Lists? of|Index of|Outline of|Comparison of|Category:)/i.test(p.title)&&!/^topics referred to by the same term$/i.test(p.description||'')){const page={...p,branch:map.get(p.pageid)?.branch};state.pages.set(p.pageid,page);}
 }));
 await Promise.all(Array.from({length:Math.ceil(ids.length/20)},async(_,i)=>{
  const accepted=ids.slice(i*20,i*20+20).map(id=>state.pages.get(id)).filter(Boolean);
  // Only five of every twenty pages carry views; complete the rest so depth
  // bands are not decided by alphabetical order.
  supply?.hydrate(accepted,lang);
  for(const p of accepted)if(averageViews(p)===null)delete p.pageviews;
  await completePageviews(accepted,ids=>query(lang,{prop:'pageviews',pvipdays:'14',pageids:ids}));
  supply?.remember(accepted,lang);
  pages.push(...accepted);
 }));
 if(pages.length&&pages.every(p=>averageViews(p)===null))sourceFailed=true;
 // Maintenance tags for every candidate when filtering by need; otherwise
 // only for the chosen cards (their optional "Needs citations" tag).
 if(needy){await completeNeeds(lang,pages,params=>query(lang,params));if(pages.some(p=>p.needsMissing))sourceFailed=true;pages.splice(0,pages.length,...pages.filter(p=>p.needs?.length));}
 let chosen=diverseDepth(pages,depth,lang);
 if(needy&&depth<=2&&chosen.length<8){
  // Articles that need work are rarely famous: rather than an empty Popular
  // feed, take the needy pages closest to the requested readership.
  const [lo,hi]=scaleBand(bands[depth],lang),lag=lagDays(pages),taken=new Set(chosen.map(p=>p.pageid));
  const distance=p=>{const v=averageViews(p,lag);return v===null?Infinity:v<lo?Math.log1p(lo)-Math.log1p(v):v>hi?Math.log1p(v)-Math.log1p(hi):0;};
  chosen=chosen.concat(pages.filter(p=>!taken.has(p.pageid)&&averageViews(p,lag)!==null).sort((a,b)=>distance(a)-distance(b)).slice(0,8-chosen.length));
 }
 if(!needy&&HELP_LANGS.has(lang))await completeNeeds(lang,chosen,params=>query(lang,params));
 state.chosen=chosen;
 await completeExtracts(chosen,ids=>query(lang,extractParams(ids)));
 supply?.remember(pages,lang);
 if(chosen.some(p=>p.extractMissing))sourceFailed=true;
 state.incomplete=chosen.some(p=>p.extractMissing)||(needy&&sourceFailed);
 const articles=readyArticles(chosen,topic,lang);
 if(!articles.length&&sourceFailed)throw Error('Topic source temporarily unavailable');
 return articles;
}
export async function topicResponse(url,env,ctx,{langs,permit,limited,upstream,work,supply}){
 const suppliedWork=!!work;work ||= createWork(env,ctx);
 const topic=url.searchParams.get('topic'),lang=url.searchParams.get('lang')||'en',depth=Number(url.searchParams.get('depth')||3),batch=Number(url.searchParams.get('batch')||0);
 const helpParam=url.searchParams.get('help'),help=helpParam==='1';
 const draw=url.searchParams.get('draw');
 if(!(Object.hasOwn(roots,topic)||topic==='help')||!langs.has(lang)||!Number.isInteger(depth)||!bands[depth]||!Number.isInteger(batch)||batch<0||batch>63||(helpParam!==null&&!help)||!validOpeningDraw(draw))return Response.json({error:'Invalid topic parameters'},{status:400});
 if((topic==='help'||help)&&!HELP_LANGS.has(lang))return Response.json({error:'Help Wikipedia is not available in this language'},{status:400});
 const key=new Request(`${url.origin}/api/topics?v=7&topic=${topic}&lang=${lang}&depth=${depth}&batch=${batch}${help&&topic!=='help'?'&help=1':''}${draw?'&draw='+draw:''}`),cache=draw?openingCache:work.cache;
 const respond=(payload,cacheState)=>Response.json(payload,{headers:{'Cache-Control':'no-store',...(cacheState?{'X-Cache':cacheState}:{})}});
 let stored;try{const hit=await cache?.match(key);if(hit)stored=await hit.json();}catch{}
 const age=Array.isArray(stored?.articles)&&stored.articles.length?Date.now()-Date.parse(stored.cached_at):Infinity;
 function refresh(){
  if(pending.has(key.url))return pending.get(key.url);
  const metered=request=>suppliedWork?upstream(request):work.request(upstream,request);
  let state=progress.get(key.url);
  if(!state||Date.now()-state.at>300000){state={at:Date.now()};progress.delete(key.url);if(progress.size>=128)progress.delete(progress.keys().next().value);progress.set(key.url,state);}
  const task=topicPages(topic,lang,depth,metered,{help:help&&topic!=='help',supply,state}).then(async articles=>{
   const payload={articles,cached_at:new Date().toISOString(),...(state.incomplete?{partial:true}:{})};
   if(!state.incomplete){
    if(articles.length&&cache)await cache.put(key,Response.json(payload,{headers:{'Cache-Control':`public, max-age=${RETAIN_SECONDS}`}})).catch(()=>{});
    progress.delete(key.url);
   }
   return payload;
  }).finally(()=>pending.delete(key.url));pending.set(key.url,task);ctx.waitUntil(task.catch(()=>{}));
  return task;
 }
 if(Number.isFinite(age)&&age>=0&&age<RETAIN_SECONDS*1000){
  const stale=!draw&&age>=FRESH_MS;
  if(stale&&!pending.has(key.url)&&await permit(env,'WORK_LIMIT','topics'))refresh();
  return respond({...stored,stale},draw?'REPLAY':stale?'STALE':'HIT');
 }
 if(!pending.has(key.url)&&!await permit(env,'WORK_LIMIT','topics'))return limited();
 let timer;
 try{
  const task=refresh();
  const answer=await Promise.race([task,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),9000);})]);
  if(answer)return respond(answer,draw?'FRESH':'MISS');
  const articles=readyArticles(progress.get(key.url)?.chosen||[],topic,lang);
  if(articles.length)return respond({articles,partial:true},draw?'FRESH':'MISS');
  // The shared job continues within its original invocation budget. Retrying
  // this key joins it instead of repeating sampling and source lookups.
  if(work.reason==='upstream_rate_limited'||work.reason==='work_rate_limited')return unavailable(work,'Topic search temporarily unavailable');
  return Response.json({articles:[],code:'batch_pending',error:'Articles are still loading.'},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'2'}});
 }
 catch{return unavailable(work,'Topic search temporarily unavailable');}
 finally{clearTimeout(timer);}
}
