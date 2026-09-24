import {averageViews,lagDays,completePageviews,scaleBand} from './pageviews.js';
import {completeExtracts,extractParams} from './extracts.js';
import {completeNeeds,sampleNeedyTitles,HELP_LANGS} from './needs.js';
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
const lists=new Map(),pending=new Map();
const FRESH_MS=120_000,RETAIN_SECONDS=86_400;
const bands={1:[300,Infinity],2:[100,500],3:[10,300],4:[5,60],5:[0,10]};
export function diverseDepth(pages,depth,lang='en'){
 const [lo,hi]=scaleBand(bands[depth],lang),groups=new Map(),lag=lagDays(pages);
 for(const p of shuffle(pages)){
  const mean=averageViews(p,lag);if(mean===null||mean<lo||mean>hi)continue;
  const list=groups.get(p.branch)||[];list.push(p);groups.set(p.branch,list);
 }
 const result=[],seen=new Set();
 for(let round=0;round<3;round++)for(const list of groups.values()){
  const p=list[round];if(p&&!seen.has(p.pageid)&&result.at(-1)?.branch!==p.branch){result.push(p);seen.add(p.pageid);}
 }
 return result;
}
// topic 'help' samples Wikipedia's maintenance lists; help:true narrows any
// other topic to articles that need work (needs.js).
export async function topicPages(topic,lang,depth,upstream,{help=false}={}){
 const needy=topic==='help'||help;
 let sourceFailed=false;
 const query=async(language,params)=>{
  let data;try{data=await upstream(`https://${language}.wikipedia.org/w/api.php?`+new URLSearchParams({action:'query',format:'json',...params}));}catch{}
  if(!data||data.error){sourceFailed=true;return null;}return data;
 };
 async function members(title){
  const key=lang+'|'+title,entry=lists.get(key);
  if(entry&&Date.now()-entry.time<FRESH_MS)return entry.items;
  const data=await query(lang,{list:'categorymembers',cmtitle:title,cmtype:'page|subcat',cmlimit:'500',...(entry?.next?{cmcontinue:entry.next}:{})});
  // A transient error must not erase a usable category branch or turn it into
  // a cached empty category. Keep the last successful page through an outage.
  if(!Array.isArray(data?.query?.categorymembers)){
   sourceFailed=true;return entry&&Date.now()-entry.time<RETAIN_SECONDS*1000?entry.items:[];
  }
  const items=data.query.categorymembers;
  if(lists.size>=256)lists.delete(lists.keys().next().value);lists.set(key,{items,next:data.continue?.cmcontinue,time:Date.now()});
  return items;
 }
 const candidates=topic==='help'?[await sampleNeedyTitles(lang,params=>query(lang,params))]:await Promise.all(shuffle(roots[topic]).slice(0,6).map(async root=>{
  let title='Category:'+root;
  if(lang!=='en'){
   const d=await query('en',{titles:title,prop:'langlinks',lllang:lang,lllimit:'1'});
   title=Object.values(d?.query?.pages||{})[0]?.langlinks?.[0]?.['*'];if(!title)return [];
  }
  let entries=await members(title),selected=shuffle(entries.filter(p=>p.ns===0)).slice(0,3);
  for(let level=0;level<(depth>=4?3:2);level++){
   const child=shuffle(entries.filter(p=>p.ns===14))[0];if(!child)break;
   entries=await members(child.title);selected.push(...shuffle(entries.filter(p=>p.ns===0)).slice(0,5));
  }
  return shuffle(selected).slice(0,14).map(p=>({...p,branch:root}));
 }));
 const map=new Map();for(const p of candidates.flat())if(!map.has(p.pageid))map.set(p.pageid,p);
 const ids=[...map.keys()],pages=[];
 await Promise.all(Array.from({length:Math.ceil(ids.length/20)},async(_,i)=>{
  // No introductions yet: they are the slow part, so only chosen pages get them.
  const d=await query(lang,{pageids:ids.slice(i*20,i*20+20).join('|'),prop:'pageviews|pageimages|info|description',pvipdays:'14',piprop:'thumbnail',pithumbsize:'800',pilimit:'max',inprop:'url'});
  const accepted=[];
  for(const p of Object.values(d?.query?.pages||{}))if(p.pageid>0&&p.title&&!/^(Lists? of|Index of|Outline of|Comparison of|Category:)/i.test(p.title)&&!/^topics referred to by the same term$/i.test(p.description||''))accepted.push({...p,branch:map.get(p.pageid)?.branch});
  // Only five of every twenty pages carry views; complete the rest so depth
  // bands are not decided by alphabetical order.
  await completePageviews(accepted,async ids=>{try{return await upstream(`https://${lang}.wikipedia.org/w/api.php?`+new URLSearchParams({action:'query',format:'json',prop:'pageviews',pvipdays:'14',pageids:ids}));}catch{return null;}});
  pages.push(...accepted);
 }));
 // Maintenance tags for every candidate when filtering by need; otherwise
 // only for the chosen cards (their optional "Needs citations" tag).
 if(needy){await completeNeeds(lang,pages,params=>query(lang,params));pages.splice(0,pages.length,...pages.filter(p=>p.needs?.length));}
 let chosen=diverseDepth(pages,depth,lang);
 if(needy&&chosen.length<8){
  // Articles that need work are rarely famous: rather than an empty Popular
  // feed, take the needy pages closest to the requested readership.
  const [lo,hi]=scaleBand(bands[depth],lang),lag=lagDays(pages),taken=new Set(chosen.map(p=>p.pageid));
  const distance=p=>{const v=averageViews(p,lag);return v===null?Infinity:v<lo?Math.log1p(lo)-Math.log1p(v):v>hi?Math.log1p(v)-Math.log1p(hi):0;};
  chosen=chosen.concat(pages.filter(p=>!taken.has(p.pageid)).sort((a,b)=>distance(a)-distance(b)).slice(0,8-chosen.length));
 }
 if(!needy&&HELP_LANGS.has(lang))await completeNeeds(lang,chosen,params=>query(lang,params));
 await completeExtracts(chosen,async ids=>{try{return await upstream(`https://${lang}.wikipedia.org/w/api.php?`+new URLSearchParams({action:'query',format:'json',...extractParams(ids)}));}catch{return null;}});
 const articles=chosen.filter(p=>typeof p.extract==='string'&&p.extract.length>=80).map(p=>({id:'w'+p.pageid,src:'wiki',...(topic==='help'?{}:{topic}),...(p.needs?.length?{needs:p.needs}:{}),title:p.title,body:p.extract,img:p.thumbnail?.source||'',url:p.fullurl||`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g,'_'))}`}));
 if(!articles.length&&sourceFailed)throw Error('Topic source temporarily unavailable');
 return articles;
}
export async function topicResponse(url,env,ctx,{langs,permit,limited,upstream}){
 const topic=url.searchParams.get('topic'),lang=url.searchParams.get('lang')||'en',depth=Number(url.searchParams.get('depth')||3),batch=Number(url.searchParams.get('batch')||0);
 const helpParam=url.searchParams.get('help'),help=helpParam==='1';
 if(!(Object.hasOwn(roots,topic)||topic==='help')||!langs.has(lang)||!Number.isInteger(depth)||!bands[depth]||!Number.isInteger(batch)||batch<0||batch>63||(helpParam!==null&&!help))return Response.json({error:'Invalid topic parameters'},{status:400});
 if((topic==='help'||help)&&!HELP_LANGS.has(lang))return Response.json({error:'Help Wikipedia is not available in this language'},{status:400});
 const key=new Request(`${url.origin}/api/topics?v=5&topic=${topic}&lang=${lang}&depth=${depth}&batch=${batch}${help&&topic!=='help'?'&help=1':''}`),cache=globalThis.caches?.default;
 const respond=(payload,cacheState)=>Response.json(payload,{headers:{'Cache-Control':'no-store',...(cacheState?{'X-Cache':cacheState}:{})}});
 let stored;try{const hit=await cache?.match(key);if(hit)stored=await hit.json();}catch{}
 const age=Array.isArray(stored?.articles)&&stored.articles.length?Date.now()-Date.parse(stored.cached_at):Infinity;
 function refresh(){
  if(pending.has(key.url))return pending.get(key.url);
  const metered=async request=>await permit(env,'WORK_LIMIT','topic-upstream')?upstream(request):null;
  const task=topicPages(topic,lang,depth,metered,{help:help&&topic!=='help'}).then(async articles=>{
   const payload={articles,cached_at:new Date().toISOString()};
   if(articles.length&&cache)await cache.put(key,Response.json(payload,{headers:{'Cache-Control':`public, max-age=${RETAIN_SECONDS}`}})).catch(()=>{});
   return payload;
  }).finally(()=>pending.delete(key.url));pending.set(key.url,task);ctx.waitUntil(task.catch(()=>{}));
  return task;
 }
 if(Number.isFinite(age)&&age>=0&&age<RETAIN_SECONDS*1000){
  const stale=age>=FRESH_MS;
  if(stale&&!pending.has(key.url)&&await permit(env,'WORK_LIMIT','topics'))refresh();
  return respond({...stored,stale},stale?'STALE':'HIT');
 }
 if(!pending.has(key.url)&&!await permit(env,'WORK_LIMIT','topics'))return limited();
 try{return respond(await refresh(),'MISS');}
 catch{return Response.json({articles:[],error:'Topic search temporarily unavailable'},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'30'}});}
}
