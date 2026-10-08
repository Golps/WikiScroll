import test from 'node:test';
import assert from 'node:assert/strict';
import {createWork,createNetwork,FETCH_LIMIT,SUBREQUEST_LIMIT} from '../worker/runtime.js';
import {createSupply,createOpeningCache,validOpeningDraw,cachedWindow} from '../worker/supply.js';
import {topicResponse} from '../worker/topics.js';
import {verifyCollection} from '../worker/verified.js';
import {createPlaceResolver,parsePlaces,placeMention,travelTerms,isDisambiguation} from '../worker/travel.js';
import {VIEW_SCALE} from '../worker/pageviews.js';
import {NEED_CATEGORIES} from '../worker/needs.js';

const env={WORK_LIMIT:{limit:async()=>({success:true})}};
const context=()=>{const tasks=[];return {waitUntil:p=>tasks.push(p),done:()=>Promise.all(tasks)};};
function cache(){const values=new Map();return {async match(k){return values.get(k.url)?.clone();},async put(k,v){values.set(k.url,v.clone());}};}

test('opening retry storage is bounded, expires without extending its lifetime and refuses oversized answers',async t=>{
 let now=100000;t.mock.method(Date,'now',()=>now);const openings=createOpeningCache(),key=i=>new Request('https://wikiscroll.com/opening/'+i);
 assert.equal(validOpeningDraw(null),true);assert.equal(validOpeningDraw('a'.repeat(32)),true);assert.equal(validOpeningDraw(''),false);assert.equal(validOpeningDraw('a'.repeat(33)),false);
 for(let i=0;i<65;i++)await openings.put(key(i),Response.json({articles:[{id:'w'+(i+1)}]}));
 assert.equal(await openings.match(key(0)),undefined);assert.equal((await (await openings.match(key(64))).json()).articles[0].id,'w65');
 now+=60000;assert.ok(await openings.match(key(64)));now+=60001;assert.equal(await openings.match(key(64)),undefined);
 await openings.put(key('large'),new Response('x'.repeat(128001)));assert.equal(await openings.match(key('large')),undefined);
});

test('one invocation accounts for fetches AND caches, caps concurrency, and refuses overflow',async()=>{
 const oldFetch=globalThis.fetch,oldCache=globalThis.caches;
 let active=0,peak=0,calls=0,operations=0;
 globalThis.fetch=async()=>{calls++;operations++;active++;peak=Math.max(peak,active);await new Promise(setImmediate);active--;return Response.json({ok:true});};
 globalThis.caches={default:{async match(){operations++;},async put(){operations++;}}};
 try{
  const work=createWork(env,{},createNetwork());
  await work.cache.match(new Request('https://wikiscroll.com/cache'));
  const answers=await Promise.all(Array.from({length:60},()=>work.upstream('https://en.wikipedia.org/w/api.php')));
  for(let i=0;i<8;i++)await work.cache.put(new Request('https://wikiscroll.com/cache'),Response.json({}));
  assert.equal(calls,FETCH_LIMIT);assert.equal(answers.filter(Boolean).length,FETCH_LIMIT);
  assert.equal(peak,3);assert.equal(operations,SUBREQUEST_LIMIT);assert.equal(work.reason,'budget_exhausted');
 }finally{globalThis.fetch=oldFetch;globalThis.caches=oldCache;}
});

test('queued work expires instead of waiting indefinitely behind a saturated upstream',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});
 const oldFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Promise(()=>{});};
 try{
  const network=createNetwork(),work=createWork(env,{},network);
  const requests=Array.from({length:20},()=>work.upstream('https://en.wikipedia.org/w/api.php'));
  const settle=async()=>{for(let i=0;i<20;i++)await new Promise(setImmediate);};
  await settle();
  for(let i=0;i<5;i++){t.mock.timers.tick(6000);await settle();}
  assert.ok((await Promise.all(requests)).every(x=>x===null));
  assert.ok(calls<=12);assert.equal(work.reason,'deadline_exceeded');
 }finally{globalThis.fetch=oldFetch;}
});

test('429 cooldown applies to already queued jobs and honors long Retry-After values',async()=>{
 const oldFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(null,{status:429,headers:{'Retry-After':'180'}});};
 try{
  const work=createWork(env,{},createNetwork());
  await Promise.all(Array.from({length:12},()=>work.upstream('https://en.wikipedia.org/w/api.php')));
  assert.ok(calls<=3);assert.equal(work.reason,'upstream_rate_limited');assert.ok(work.retrySeconds()>175);
 }finally{globalThis.fetch=oldFetch;}
});

test('every cold topic/depth/help combination stays under Free’s combined operation budget',async()=>{
 const oldCache=globalThis.caches;globalThis.caches={default:cache()};
 const counts=[];
 try{
  for(const lang of ['en','fr','ja'])for(const depth of [1,3,5])for(const help of [false,...(lang!=='ja'?[true]:[])]){
   // Separate module state ensures genuinely cold translated/category caches.
   const api=await import('../worker/topics.js?budget='+lang+depth+help);
   let next=0,active=0,peak=0;const pages=new Map();
   const views=(depth===1?500:depth===3?30:1)*VIEW_SCALE[lang];
   const fixture=async address=>{
    active++;peak=Math.max(peak,active);await new Promise(setImmediate);
    try{
     const p=new URL(address).searchParams;
     if(p.has('lllang'))return {query:{pages:Object.fromEntries(p.get('titles').split('|').map((title,i)=>[i,{title,langlinks:[{'*':'Category:'+title.slice(9)}]}]))}};
     if(p.has('cmtitle')){
      const title=p.get('cmtitle'),members=[];
      for(let i=0;i<8;i++){const id=++next;pages.set(id,{pageid:id,ns:0,title:'Discovery '+id+' '+i});members.push(pages.get(id));}
      members.push({ns:14,pageid:++next,title:title+'/sub'});
      return {query:{categorymembers:members}};
     }
     const ids=p.get('pageids').split('|').map(Number),prop=p.get('prop');
     return {query:{pages:Object.fromEntries(ids.map((id,i)=>[id,{
      ...pages.get(id),
      ...(prop.includes('info')?{talkid:100000+id}:{}),
      ...(prop==='pageviews'||prop.includes('pageviews')&&i<5?{pageviews:{a:views,b:views}}:{}),
      ...(prop==='extracts'?{extract:'A detailed introduction to this discovery, long enough to make a useful article card. '.repeat(2)}:{}),
      ...(prop==='categories'?{categories:[{title:lang==='fr'?'Catégorie:Article à référence nécessaire':'Category:All articles with unsourced statements'}]}:{})
     }]))}};
    }finally{active--;}
   };
   const ctx=context(),work=createWork(env,ctx,createNetwork());
   const response=await api.topicResponse(new URL(`https://wikiscroll.com/api/topics?topic=tech&lang=${lang}&depth=${depth}${help?'&help=1':''}`),env,ctx,{langs:new Set([lang]),permit:async()=>true,limited:()=>new Response(null,{status:429}),upstream:address=>work.request(fixture,address),work});
   const data=await response.json();await ctx.done();
   assert.equal(response.status,200,JSON.stringify({lang,depth,help,data}));
   assert.ok(data.articles.length>0,JSON.stringify({lang,depth,help}));
   assert.ok(work.used<=SUBREQUEST_LIMIT);assert.ok(peak<=3);counts.push(work.used);
  }
  assert.ok(Math.max(...counts)<=46);
 }finally{globalThis.caches=oldCache;}
});

test('an introduction outage yields retryable failure, not a cached successful empty topic',async()=>{
 const oldCache=globalThis.caches;globalThis.caches={default:cache()};
 try{
  const api=await import('../worker/topics.js?text-outage');
  let id=0;const fixture=async address=>{
   const p=new URL(address).searchParams;
   if(p.has('cmtitle'))return {query:{categorymembers:[{pageid:++id,ns:0,title:'Discovery'}]}};
   if(p.get('prop')==='extracts')return null;
   return {query:{pages:Object.fromEntries(p.get('pageids').split('|').map(id=>[id,{pageid:Number(id),title:'Discovery',pageviews:{a:30}}]))}};
  };
  const ctx=context(),response=await api.topicResponse(new URL('https://wikiscroll.com/api/topics?topic=tech'),env,ctx,{langs:new Set(['en']),permit:async()=>true,limited:()=>null,upstream:fixture});
  assert.equal(response.status,503);assert.ok(response.headers.has('Retry-After'));await ctx.done();
 }finally{globalThis.caches=oldCache;}
});

test('standalone Help supplies verified articles at every depth in all four supported editions within the Free budget',async()=>{
 const oldCache=globalThis.caches;globalThis.caches={default:cache()};
 try{
  for(const lang of ['en','de','fr','es'])for(const depth of [1,2,3,4,5]){
   const api=await import('../worker/topics.js?standalone-help='+lang+depth);
   let next=0;const source=new Map(),views=(depth===1?500:depth===2?200:depth===3?30:depth===4?10:1)*VIEW_SCALE[lang];
   const category=Object.keys(NEED_CATEGORIES[lang])[0],need=NEED_CATEGORIES[lang][category];
   const fixture=async address=>{
    const p=new URL(address).searchParams;
    if(p.has('cmtitle')||p.has('gcmtitle')){
     const members=Array.from({length:8},()=>{const id=++next;const page={ns:0,pageid:id,title:'Help opportunity '+id};source.set(id,page);return page;});
     if(p.has('gcmtitle'))return {query:{pages:Object.fromEntries(members.map(a=>[100000+a.pageid,{ns:1,pageid:100000+a.pageid,subjectid:a.pageid,associatedpage:a.title}]))}};
     return {query:{categorymembers:members}};
    }
    const ids=p.get('pageids').split('|').map(Number),prop=p.get('prop');
    return {query:{pages:Object.fromEntries(ids.map((id,i)=>[id,{
     ...(source.get(id)||{ns:1,pageid:id}),
     ...(prop.includes('info')?{talkid:100000+id}:{}),
     ...(prop==='pageviews'||prop.includes('pageviews')&&i<5?{pageviews:{a:views,b:views}}:{}),
     ...(prop==='extracts'?{extract:'An informative and verified introduction to this article requiring help. '.repeat(2)}:{}),
     ...(prop==='categories'?{categories:id<100000?[{title:category}]:[]}:{})
    }]))}};
   };
   const ctx=context(),work=createWork(env,ctx,createNetwork());
   const response=await api.topicResponse(new URL(`https://wikiscroll.com/api/topics?topic=help&lang=${lang}&depth=${depth}`),env,ctx,{langs:new Set([lang]),permit:async()=>true,limited:()=>new Response(null,{status:429}),upstream:address=>work.request(fixture,address),work});
   const data=await response.json();await ctx.done();
   assert.equal(response.status,200,JSON.stringify({lang,depth,data}));
   assert.ok(data.articles.length>0,lang+' '+depth);
   assert.ok(data.articles.every(a=>a.needs.includes(need)&&a.url.startsWith(`https://${lang}.wikipedia.org/`)));
   assert.ok(work.used<=SUBREQUEST_LIMIT,lang+' '+depth+' '+work.used);
  }
 }finally{globalThis.caches=oldCache;}
});

test('30 cold guides without introductions verify with 38 combined operations and coalesce',async()=>{
 const oldFetch=globalThis.fetch,oldCache=globalThis.caches;let calls=0,active=0,peak=0;
 globalThis.caches={default:cache()};
 globalThis.fetch=async address=>{
  calls++;active++;peak=Math.max(peak,active);await new Promise(setImmediate);active--;
  const p=new URL(address).searchParams;
  return Response.json({query:{pages:Object.fromEntries(p.get('pageids').split('|').map(id=>[id,{pageid:Number(id),ns:0,title:'Verified guide '+id,extract:p.has('exintro')?'':'== Understand ==\nA verified opening paragraph about this destination and its history, gardens and sights.'}]))}});
 };
 try{
  const c={v:1,name:'Trip',items:Array.from({length:30},(_,i)=>({id:'v'+(i+100),lang:'es',title:'Untrusted',body:'Untrusted'}))};
  const ctx=context(),work=createWork(env,ctx,createNetwork()),other=createWork(env,ctx,createNetwork());
  const [a,b]=await Promise.all([verifyCollection(c,env,ctx,work),verifyCollection({...c,name:'Another title'},env,ctx,other)]);
  await ctx.done();assert.equal(a.items.length,30);assert.equal(b.name,'Another title');assert.ok(a.items.every(p=>p.title.startsWith('Verified')));
  assert.equal(calls,36);assert.equal(Math.max(work.used,other.used),38);assert.equal(peak,3);
  await verifyCollection(c,env,ctx,createWork(env,ctx,createNetwork()));assert.equal(calls,36);
 }finally{globalThis.fetch=oldFetch;globalThis.caches=oldCache;}
});

test('successful source records are reused across batches without extending their freshness',async t=>{
 let now=100000;t.mock.method(Date,'now',()=>now);
 const supply=createSupply(),known={pageid:1,pageviews:{a:50},extract:'Known introduction',needs:['citations']};
 supply.remember([known],'en');now+=5*3600000;
 const recycled={pageid:1};supply.hydrate([recycled],'en');assert.equal(recycled.extract,known.extract);
 supply.remember([recycled],'en');now+=2*3600000;
 const expired={pageid:1};supply.hydrate([expired],'en');assert.equal(expired.pageviews,undefined);assert.equal(expired.extract,known.extract);
 const otherLanguage={pageid:1};supply.hydrate([otherLanguage],'fr');assert.equal(otherLanguage.extract,undefined);
 supply.remember([{pageid:1,needs:[],needsMissing:true}],'en');
});

test('verified cached needs and text recover failed lookups without renewing the original source lifetime',async t=>{
 let now=100000;t.mock.method(Date,'now',()=>now);
 const supply=createSupply(),known={pageid:42,extract:'Known introduction',needs:['images']};
 supply.remember([known],'en');now+=1800000;
 const failed={pageid:42,extract:'',extractMissing:true,needs:[],needsMissing:true};
 supply.hydrate([failed],'en');
 assert.equal(failed.extract,known.extract);assert.deepEqual(failed.needs,['images']);
 assert.equal(failed.extractMissing,undefined);assert.equal(failed.needsMissing,undefined);
 supply.remember([failed],'en');now+=1800001;
 const expired={pageid:42};supply.hydrate([expired],'en');
 assert.equal(expired.needs,undefined);assert.equal(expired.extract,known.extract);
});

test('travel resolves geographic ancestry instead of confusing Elba with North Elba or Kyoto with Tokyo',async()=>{
 const resolver=createPlaceResolver();
 const roots={Elba:{pageid:1,ns:0,title:'Elba'},'京都市':{pageid:4,ns:0,title:'京都市'}};
 const query=async address=>{const p=new URL(address).searchParams;return {query:{pages:p.has('titles')?Object.fromEntries(p.get('titles').split('|').map(t=>[roots[t].pageid,roots[t]])):{8:{pageid:8,pageprops:{'geocrumb-is-in':'4'}}}}};};
 const ids=await resolver.resolve('en',['Elba'],query);
 const pages=[{pageid:2,title:'Portoferraio',pageprops:{'geocrumb-is-in':'1'}},{pageid:3,title:'North Elba',pageprops:{'geocrumb-is-in':'99'}},{pageid:99,title:'New York'}];
 await resolver.annotate('en',pages,new Set([1]),query);
 assert.equal(resolver.belongs('en',pages[0],ids.get('Elba')),true);assert.equal(resolver.belongs('en',pages[1],ids.get('Elba')),false);
 const jp=await resolver.resolve('ja',['京都市'],query),guides=[{pageid:5,title:'京都の地区',pageprops:{'geocrumb-is-in':'8'}},{pageid:6,title:'東京都'}];
 await resolver.annotate('ja',guides,new Set([4]),query);
 assert.equal(resolver.belongs('ja',guides[0],jp.get('京都市')),true);
 assert.equal(placeMention('東京都','京都'),false);assert.equal(isDisambiguation({title:'京都',pageprops:{disambiguation:''}}),true);
 assert.deepEqual(parsePlaces('Côte d’Azur'),["Côte d'Azur"]);
 assert.match(travelTerms('ja','nature'),/自然/);assert.doesNotMatch(travelTerms('es','coast'),/beach/);
 const unavailable=await resolver.resolve('fr',['Paris'],async()=>null);assert.equal(unavailable.has('Paris'),false);
});

test('abandoned active leases are reclaimed when their original work deadline passes',async t=>{
 let now=100000;t.mock.method(Date,'now',()=>now);const network=createNetwork();let cancelled=0;
 const abandoned=Array.from({length:3},()=>network.schedule(()=>new Promise(()=>{}),{timeLeft:()=>100,fail(){}},()=>{cancelled++;}));
 await new Promise(setImmediate);now+=101;
 const fresh=await network.schedule(async()=>({ready:true}),{timeLeft:()=>100,fail(){}});
 assert.deepEqual(fresh,{ready:true});assert.equal(cancelled,3);assert.deepEqual(await Promise.all(abandoned),[null,null,null]);
});

// Requests may overlap in one Cloudflare isolate. Their timers, controllers
// and continuation queue must belong to the originating request context.
test('a slow invocation never occupies another invocation’s upstream slots',async()=>{
 const a=createWork(env),b=createWork(env);assert.notEqual(a.network,b.network);
 const waiting=Array.from({length:3},()=>a.network.schedule(()=>new Promise(()=>{}),{timeLeft:()=>1000,fail(){}}));
 assert.deepEqual(await b.network.schedule(async()=>({ready:true}),b),{ready:true});
});

test('independent invocation queues still share Wikimedia Retry-After cooldowns',async()=>{
 const original=globalThis.fetch,cooldowns=new Map();let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(null,{status:429,headers:{'Retry-After':'180'}});};
 try {
  const a=createWork(env,{},createNetwork(cooldowns)),b=createWork(env,{},createNetwork(cooldowns));
  assert.equal(await a.upstream('https://en.wikipedia.org/w/api.php'),null);
  assert.equal(await b.upstream('https://en.wikipedia.org/w/api.php'),null);
  assert.equal(calls,1);assert.ok(b.retrySeconds()>175);
 }finally{globalThis.fetch=original;}
});

test('cooldown recovery reads eight cache slots, deduplicates, excludes expired/partial cards and never fetches',async()=>{
 const store=cache(),base=new Request('https://wikiscroll.com/api/topics?v=7&topic=help&lang=en&depth=3&batch=60');
 let reads=0;const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('cache recovery must not fetch upstream');};
 try{
  for(const [slot,body] of [[60,{articles:[{id:'w1'},{id:'w2'}]}],[61,{articles:[{id:'w1'},{id:'w3'}]}],[62,{articles:[{id:'w4'}],partial:true}],[63,{articles:[{id:'w5'}],cached_at:new Date(Date.now()-86400001).toISOString()}],[0,{articles:[{id:'w6'}]}]]){
   const key=new URL(base.url);key.searchParams.set('batch',String(slot));await store.put(new Request(key),Response.json({cached_at:new Date().toISOString(),...body}));
  }
  const result=await cachedWindow({match:async k=>{reads++;return store.match(k);}},base,60);
  assert.equal(reads,8);assert.equal(result.cached_only,true);assert.deepEqual(result.articles.map(a=>a.id),['w1','w2','w3','w6']);
 }finally{globalThis.fetch=original;}
});
