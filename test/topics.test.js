import test from 'node:test';
import assert from 'node:assert/strict';
import {diverseDepth,topicPages,topicResponse} from '../worker/topics.js';
const page=(pageid,branch,views)=>({pageid,branch,pageviews:{a:views,b:views}});
test('topic depth excludes popular pages from obscure and unknown metrics from all bands',()=>{
 const pages=[page(1,'a',1000),page(2,'a',150),page(3,'b',40),page(4,'c',15),page(5,'d',1),{pageid:6,branch:'a',pageviews:{a:null}}];
 assert.deepEqual(diverseDepth(pages,1).map(p=>p.pageid),[1]);
 assert.deepEqual(diverseDepth(pages,5).map(p=>p.pageid),[5]);
 assert.deepEqual(new Set(diverseDepth(pages,3).map(p=>p.pageid)),new Set([2,3,4]));
});
test('dense branches cannot monopolize a topic batch; candidates are deduplicated',()=>{
 const pages=Array.from({length:25},(_,i)=>page(i+1,'computing',20)).concat([page(99,'aviation',20),page(100,'materials',20),page(99,'aviation',20)]);
 const result=diverseDepth(pages,3);
 assert.ok(result.filter(p=>p.branch==='computing').length<=3);
 assert.ok(result.every((p,i)=>!i||p.branch!==result[i-1].branch));
 assert.equal(new Set(result.slice(0,3).map(p=>p.branch)).size,3);
 assert.equal(new Set(result.map(p=>p.pageid)).size,result.length);
});
test('translated topic branches stay in the selected Wikipedia edition',async()=>{
 let id=0;const requests=[];
 const result=await topicPages('tech','es',3,async address=>{
  const url=new URL(address);requests.push(url);const p=url.searchParams;
  if(p.has('lllang'))return {query:{pages:Object.fromEntries(p.get('titles').split('|').map(title=>[++id,{title,langlinks:[{'*':'Categoría:Tecnología '+id}]}]))}};
  assert.equal(url.hostname,'es.wikipedia.org');
  if(p.has('cmtitle'))return {query:{categorymembers:[{pageid:++id,ns:0,title:'Tema'}]}};
  return {query:{pages:Object.fromEntries(p.get('pageids').split('|').map(n=>[n,{...page(Number(n),'',15),title:'Tema '+n,extract:'Una introducción suficientemente larga. '.repeat(5),thumbnail:{source:'https://upload.wikimedia.org/example.jpg'}}]))}};
 });
 assert.ok(result.length>1);assert.ok(result.every(a=>a.url.startsWith('https://es.wikipedia.org/')));
 assert.equal(requests.filter(u=>u.searchParams.has('lllang')).length,1);
});
test('invalid topic inputs do not trigger upstream work',async()=>{
 const options={langs:new Set(['en']),permit:async()=>{throw Error('should not execute');}};
 for(const query of ['topic=__proto__','topic=tech&depth=99','topic=tech&lang=invalid','topic=tech&batch=64','topic=tech&draw=','topic=tech&draw=short'])assert.equal((await topicResponse(new URL('https://example.org/api/topics?'+query),{}, {},options)).status,400);
});

let topicModule=0;
const freshTopics=()=>import('../worker/topics.js?test='+topicModule++);
const topicUrl=()=>new URL('https://wikiscroll.com/api/topics?topic=tech&lang=en&depth=3&batch=8');
const topicKey=()=>new Request('https://wikiscroll.com/api/topics?v=7&topic=tech&lang=en&depth=3&batch=8');
function edgeCache(){
 const entries=new Map();
 return {entries,async match(key){return entries.get(key.url)?.clone();},async put(key,response){entries.set(key.url,response.clone());}};
}
function background(){const tasks=[];return {waitUntil:p=>tasks.push(p),done:()=>Promise.all(tasks)};}
function topicFixture(){
 const ids=new Map();
 return async address=>{
  const p=new URL(address).searchParams;
  if(p.has('cmtitle')){
   const title=p.get('cmtitle');if(!ids.has(title))ids.set(title,ids.size+1);
   return {query:{categorymembers:[{pageid:ids.get(title),ns:0,title}]},continue:{cmcontinue:'next-page'}};
  }
  return {query:{pages:Object.fromEntries(p.get('pageids').split('|').map(id=>[id,{
   ...page(Number(id),'',20),title:'Technology discovery '+id,extract:'A substantive and varied introduction to a technology discovery. '.repeat(3)
  }]))}};
 };
}
async function withTopics(cache,run){
 const original=globalThis.caches,jobs=background();globalThis.caches=cache?{default:cache}:undefined;
 try{return await run(await freshTopics(),jobs);}finally{await jobs.done();globalThis.caches=original;}
}
const options=upstream=>({langs:new Set(['en']),permit:async()=>true,limited:()=>new Response('limited',{status:429}),upstream});

test('stale topic cards arrive immediately and remain available after an upstream outage',async()=>{
 const cache=edgeCache();
 await cache.put(topicKey(),Response.json({articles:[{id:'w90',title:'Cached discovery'}],cached_at:new Date(Date.now()-180_000).toISOString()}));
 let finish,calls=0;const stalled=new Promise(resolve=>{finish=resolve;});
 await withTopics(cache,async(api,jobs)=>{
  const settings=options(async()=>{calls++;return stalled;});
  try{
   const response=await api.topicResponse(topicUrl(),{},jobs,settings);
   assert.equal(response.status,200);assert.equal(response.headers.get('X-Cache'),'STALE');
   const payload=await response.json();assert.equal(payload.stale,true);assert.equal(payload.articles[0].id,'w90');
   const again=await api.topicResponse(topicUrl(),{},jobs,settings);
   assert.equal((await again.json()).articles[0].id,'w90');assert.ok(calls<=3);
  }finally{finish(null);}
  await jobs.done();
  const retained=await (await cache.match(topicKey())).json();assert.equal(retained.articles[0].id,'w90');
  const denied={...settings,permit:async()=>false};
  assert.equal((await api.topicResponse(topicUrl(),{},jobs,denied)).status,200);
 });
});

test('fresh topic/help openings bypass shared completed cards while retries retain their own verified batch',async t=>{
 let seed=123;t.mock.method(Math,'random',()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296));
 const cache=edgeCache();await cache.put(topicKey(),Response.json({articles:[{id:'w777'}],cached_at:new Date().toISOString()}));
 await withTopics(cache,async(api,jobs)=>{
  const categories=new Map();let next=0,details=0;
  const fixture=async address=>{
   const p=new URL(address).searchParams;
   if(p.has('cmtitle')){
    const title=p.get('cmtitle');if(!categories.has(title))categories.set(title,Array.from({length:50},()=>({pageid:++next,ns:0,title:'Opportunity '+next})));
    return {query:{categorymembers:categories.get(title)}};
   }
   if(p.get('prop').includes('info'))details++;
   return {query:{pages:Object.fromEntries(p.get('pageids').split('|').map(id=>[id,{
    pageid:Number(id),ns:0,title:'Opportunity '+id,pageviews:{a:20},categories:[{title:'Category:All articles needing additional references'}],
    ...(p.get('prop')==='extracts'?{extract:'An informative and verified introduction to this article requiring help. '.repeat(2)}:{})
   }]))}};
  };
  const settings=options(fixture),drawA=new URL(topicUrl()),drawB=new URL(topicUrl());
  drawA.searchParams.set('draw','a'.repeat(32));drawA.searchParams.set('help','1');drawB.searchParams.set('draw','b'.repeat(32));drawB.searchParams.set('help','1');
  const a=await api.topicResponse(drawA,{},jobs,settings),first=await a.json();await jobs.done();assert.equal(a.headers.get('X-Cache'),'FRESH');assert.ok(first.articles.length>0&&first.articles.every(p=>p.id!=='w777'&&p.needs.includes('citations')));
  const before=details,b=await api.topicResponse(drawB,{},jobs,settings),second=await b.json();await jobs.done();assert.equal(b.headers.get('X-Cache'),'FRESH');assert.ok(details>before);
  assert.notDeepEqual(first.articles.map(a=>a.id).sort(),second.articles.map(a=>a.id).sort());
  const count=details,retry=await api.topicResponse(drawA,{},jobs,settings);assert.equal(retry.headers.get('X-Cache'),'REPLAY');assert.deepEqual((await retry.json()).articles,first.articles);assert.equal(details,count);assert.equal(cache.entries.size,1);
 });
});

test('cold concurrent topic requests share work and populate retained edge supply',async()=>{
 const cache=edgeCache();let calls=0;const fixture=topicFixture();
 await withTopics(cache,async(api,jobs)=>{
  const settings=options(async address=>{calls++;await new Promise(resolve=>setTimeout(resolve,1));return fixture(address);});
  const responses=await Promise.all([api.topicResponse(topicUrl(),{},jobs,settings),api.topicResponse(topicUrl(),{},jobs,settings)]);
  assert.ok(responses.every(response=>response.status===200));
  const payloads=await Promise.all(responses.map(response=>response.json()));
  assert.ok(payloads[0].articles.length>1);assert.deepEqual(payloads[0],payloads[1]);assert.equal(calls,8); // 6 branches, details, maintenance tags
  await jobs.done();
  const stored=await cache.match(topicKey());assert.equal(stored.headers.get('Cache-Control'),'public, max-age=86400');
  const hit=await api.topicResponse(topicUrl(),{},jobs,options(()=>{throw Error('fresh cache must not fetch');}));
  assert.equal(hit.headers.get('X-Cache'),'HIT');assert.equal((await hit.json()).stale,false);
 });
});

test('failed category refresh reuses its last good list and retries the same continuation',async t=>{
 let now=Date.now(),failed=false,calls=0;const fixture=topicFixture(),continuations=[];
 t.mock.method(Date,'now',()=>now);t.mock.method(Math,'random',()=>0.5);
 const api=await freshTopics();
 const upstream=async address=>{
  const p=new URL(address).searchParams;
  if(p.has('cmtitle')){calls++;continuations.push(p.get('cmcontinue'));if(failed)return null;}
  return fixture(address);
 };
 const first=await api.topicPages('tech','en',3,upstream);assert.equal(first.length,6);assert.equal(calls,6);
 now+=900_001;failed=true;
 assert.deepEqual(await api.topicPages('tech','en',3,upstream),first);assert.equal(calls,12);
 assert.deepEqual(await api.topicPages('tech','en',3,upstream),first);assert.equal(calls,18);
 assert.ok(continuations.slice(6).every(value=>value==='next-page'));
 failed=false;assert.deepEqual(await api.topicPages('tech','en',3,upstream),first);assert.equal(calls,24);
 await api.topicPages('tech','en',3,upstream);assert.equal(calls,24);
 now+=86_400_001;failed=true;
 await assert.rejects(api.topicPages('tech','en',3,upstream),/temporarily unavailable/);
});

test('uncached upstream failures are retryable and empty discovery is never cached',async()=>{
 const cache=edgeCache();
 await withTopics(cache,async(api,jobs)=>{
  const failure=await api.topicResponse(topicUrl(),{},jobs,options(async()=>null));
  assert.equal(failure.status,503);assert.equal(failure.headers.get('Retry-After'),'5');assert.equal(cache.entries.size,0);
  const empty=await api.topicResponse(topicUrl(),{},jobs,options(async()=>({query:{categorymembers:[]}})));
  assert.equal(empty.status,200);assert.deepEqual((await empty.json()).articles,[]);assert.equal(cache.entries.size,0);
 });
});

test('expired topic supply is not served and failed caches do not block live cards',async()=>{
 const cache=edgeCache();
 await cache.put(topicKey(),Response.json({articles:[{id:'w90'}],cached_at:new Date(Date.now()-86_400_001).toISOString()}));
 await withTopics(cache,async(api,jobs)=>{
  const response=await api.topicResponse(topicUrl(),{},jobs,options(async()=>null));assert.equal(response.status,503);
 });
 const broken={async match(){throw Error('cache unavailable');},async put(){throw Error('cache unavailable');}};
 await withTopics(broken,async(api,jobs)=>{
  const response=await api.topicResponse(topicUrl(),{},jobs,options(topicFixture()));assert.equal(response.status,200);
  assert.ok((await response.json()).articles.length>1);
 });
});

test('topic pages without reported views are completed in chunks of five before depth filtering',async()=>{
 const chunks=[];
 const result=await topicPages('tech','en',3,async address=>{
  const p=new URL(address).searchParams;
  if(p.has('cmtitle'))return {query:{categorymembers:Array.from({length:3},(_,i)=>({pageid:Number(p.get('cmtitle').length*10+i),ns:0,title:'T'}))}};
  if(p.get('prop')==='pageviews'){const ids=p.get('pageids').split('|');chunks.push(ids.length);return {query:{pages:Object.fromEntries(ids.map(id=>[id,{pageid:Number(id),pageviews:{a:20,b:20}}]))}};}
  // The detail request mimics Wikimedia: no views on these pages.
  return {query:{pages:Object.fromEntries(p.get('pageids').split('|').map(id=>[id,{pageid:Number(id),title:'Technology '+id,extract:'A substantive introduction to a technology subject. '.repeat(3)}]))}};
 });
 assert.ok(result.length>0);assert.ok(chunks.length>0&&chunks.every(n=>n<=5));
});

test('Help Wikipedia is refused where its maintenance lists are unreliable or the flag is malformed',async()=>{
 const options={langs:new Set(['en','ja']),permit:async()=>{throw Error('should not execute');}};
 for(const query of ['topic=help&lang=ja','topic=tech&help=1&lang=ja','topic=tech&help=yes&lang=en'])assert.equal((await topicResponse(new URL('https://example.org/api/topics?'+query),{},{},options)).status,400,query);
});

test('translated topic branches are looked up once a day, not on every refill',async()=>{
 const {topicPages}=await freshTopics();let id=0;const requests=[];
 const upstream=async address=>{
  const url=new URL(address);requests.push(url);const p=url.searchParams;
  if(p.has('lllang'))return {query:{pages:{1:{langlinks:[{'*':'Kategorie:Technik '+p.get('titles')}]}}}};
  if(p.has('cmtitle'))return {query:{categorymembers:[{pageid:++id,ns:0,title:'Thema'}]}};
  return {query:{pages:Object.fromEntries(p.get('pageids').split('|').map(n=>[n,{...page(Number(n),'',15),title:'Thema '+n,extract:'Eine ausreichend lange Einleitung. '.repeat(5),thumbnail:{source:'https://upload.wikimedia.org/x.jpg'}}]))}};
 };
 for(let refill=0;refill<4;refill++)await topicPages('tech','de',3,upstream);
 const lookups=requests.filter(u=>u.searchParams.has('lllang')).map(u=>u.searchParams.get('titles'));
 assert.ok(lookups.length<=12,'at most one lookup per branch: '+lookups.length);
 assert.equal(new Set(lookups).size,lookups.length,'no branch is translated twice');
});

test('a single qualified branch yields up to three distinct cards rather than dropping two',()=>{
 const result=diverseDepth([page(1,'biology',1),page(2,'biology',1),page(3,'biology',1),page(4,'biology',1)],5);
 assert.equal(result.length,3);assert.equal(new Set(result.map(p=>p.pageid)).size,3);
});

test('a failed Help-only batch resumes its verified candidates without redrawing or refetching metadata',async()=>{
 for(const query of ['topic=help','topic=tech&help=1'])await withTopics(edgeCache(),async(api,jobs)=>{
  let id=0,ready=false;const calls={samples:0,metadata:0,views:0,needs:0,text:0};
  const fixture=async address=>{
   const p=new URL(address).searchParams;
   if(p.has('gcmtitle')){calls.samples++;return {query:{pages:{[10000+id]:{ns:1,pageid:10000+id,subjectid:++id,associatedpage:'Opportunity '+id}}}};}
   if(p.has('cmtitle')){calls.samples++;return {query:{categorymembers:[{ns:0,pageid:++id,title:'Opportunity '+id}]}};}
   const ids=p.get('pageids').split('|');
   if(p.get('prop')==='extracts'){calls.text++;return ready?{query:{pages:Object.fromEntries(ids.map(id=>[id,{pageid:Number(id),extract:'A complete and verified introduction to this article needing work. '.repeat(3)}]))}}:null;}
   if(p.get('prop')==='categories'){calls.needs++;return {query:{pages:Object.fromEntries(ids.map(id=>[id,{pageid:Number(id),categories:[{title:'Category:All articles needing additional references'}]}]))}};}
   if(p.get('prop')==='pageviews')calls.views++;else calls.metadata++;
   return {query:{pages:Object.fromEntries(ids.map(id=>[id,{pageid:Number(id),ns:0,title:'Opportunity '+id,pageviews:{a:20}}]))}};
  };
  const url=new URL('https://wikiscroll.com/api/topics?lang=en&depth=3&batch=27&'+query),settings=options(fixture);
  assert.equal((await api.topicResponse(url,{},jobs,settings)).status,503);await jobs.done();const before={...calls};ready=true;
  const response=await api.topicResponse(url,{},jobs,settings),body=await response.json();await jobs.done();
  assert.equal(response.status,200);assert.ok(body.articles.length);assert.ok(body.articles.every(a=>a.needs?.includes('citations')));
  for(const phase of ['samples','metadata','views','needs'])assert.equal(calls[phase],before[phase],phase+' was repeated');
  assert.ok(calls.text>before.text);
 });
});

test('a slow Help topic shares its pending job and exposes only ready verified cards',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});
 await withTopics(edgeCache(),async(api,jobs)=>{
  let id=0,samples=0,textCalls=0,release;const held=new Promise(resolve=>{release=resolve;});
  const fixture=async address=>{
   const p=new URL(address).searchParams;
   if(p.has('cmtitle')){samples++;return {query:{categorymembers:[{pageid:++id,ns:0,title:'Opportunity '+id}]}};}
   const ids=p.get('pageids').split('|');
   const data={query:{pages:Object.fromEntries(ids.map(id=>[id,{pageid:Number(id),ns:0,title:'Opportunity '+id,pageviews:{a:20},categories:[{title:'Category:All articles needing additional references'}],...(p.get('prop')==='extracts'?{extract:'A verified and complete article introduction with useful information. '.repeat(3)}:{})}]))}};
   if(p.get('prop')==='extracts'&&++textCalls===2){await held;return data;}
   return data;
  };
  const url=new URL('https://wikiscroll.com/api/topics?topic=tech&help=1&depth=3&batch=30'),settings=options(fixture);
  const first=api.topicResponse(url,{},jobs,settings);
  for(let i=0;i<20;i++)await new Promise(setImmediate);
  t.mock.timers.tick(9000);const response=await first,body=await response.json();
  assert.equal(response.status,200);assert.equal(body.partial,true);assert.equal(body.articles.length,5);assert.ok(body.articles.every(a=>a.needs?.includes('citations')));
  assert.ok(samples>=3&&samples<=6);
  const next=api.topicResponse(url,{},jobs,settings);release();
  const full=await next;assert.equal(full.status,200);assert.equal((await full.json()).articles.length,6);assert.equal(samples,6,'each of the six branches was sampled once');await jobs.done();
 });
});

test('a partly failed Help batch serves ready cards without caching an incomplete batch or losing retry progress',async()=>{
 const cache=edgeCache();await withTopics(cache,async(api,jobs)=>{
  let id=0,ready=false,text=0,samples=0;
  const fixture=async address=>{
   const p=new URL(address).searchParams;
   if(p.has('cmtitle')){samples++;return {query:{categorymembers:[{pageid:++id,ns:0,title:'Opportunity '+id}]}};}
   if(p.get('prop')==='extracts'&&++text===2&&!ready)return null;
   return {query:{pages:Object.fromEntries(p.get('pageids').split('|').map(id=>[id,{
    pageid:Number(id),ns:0,title:'Opportunity '+id,pageviews:{a:20},
    categories:[{title:'Category:All articles needing additional references'}],
    ...(p.get('prop')==='extracts'?{extract:'An informative and verified introduction to this article requiring help. '.repeat(2)}:{})
   }]))}};
  };
  const url=new URL('https://wikiscroll.com/api/topics?topic=tech&help=1&depth=3&batch=29'),settings=options(fixture);
  const first=await api.topicResponse(url,{},jobs,settings),body=await first.json();await jobs.done();
  assert.equal(first.status,200);assert.equal(body.articles.length,5);assert.equal(body.partial,true);assert.equal(cache.entries.size,0);
  const before=samples;ready=true;
  const next=await api.topicResponse(url,{},jobs,settings),full=await next.json();await jobs.done();
  assert.equal(next.status,200);assert.equal(full.articles.length,6);assert.equal(full.partial,undefined);assert.equal(samples,before);assert.equal(cache.entries.size,1);
 });
});

test('a slow Help-only batch without ready cards remains pending and the retry joins the original job',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});
 await withTopics(edgeCache(),async(api,jobs)=>{
  let id=0,samples=0,release;const held=new Promise(resolve=>{release=resolve;});
  const fixture=async address=>{
   const p=new URL(address).searchParams;
   if(p.has('cmtitle')){samples++;await held;return {query:{categorymembers:[{pageid:++id,ns:0,title:'Opportunity '+id}]}};}
   return {query:{pages:Object.fromEntries(p.get('pageids').split('|').map(id=>[id,{
    pageid:Number(id),ns:0,title:'Opportunity '+id,pageviews:{a:20},
    categories:[{title:'Category:All articles needing additional references'}],
    extract:'An informative and verified introduction to this article requiring help. '.repeat(2)
   }]))}};
  };
  const url=new URL('https://wikiscroll.com/api/topics?topic=tech&help=1&depth=3&batch=31'),settings=options(fixture);
  const first=api.topicResponse(url,{},jobs,settings);
  for(let i=0;i<20;i++)await new Promise(setImmediate);
  t.mock.timers.tick(9000);const response=await first,body=await response.json();
  assert.equal(response.status,503);assert.equal(body.code,'batch_pending');assert.deepEqual(body.articles,[]);assert.equal(response.headers.get('Retry-After'),'2');
  assert.ok(samples>=3&&samples<=6);
  const next=api.topicResponse(url,{},jobs,settings);release();
  const full=await next;assert.equal(full.status,200);assert.equal((await full.json()).articles.length,6);assert.equal(samples,6,'each of the six branches was sampled once');await jobs.done();
 });
});

test('ready Help cards expose an upstream pause even with HTTP 200',async()=>{
 const {createWork}=await import('../worker/runtime.js');
 await withTopics(null,async(api,jobs)=>{
  let id=0;const work=createWork({},jobs);
  const fixture=async address=>{
   const p=new URL(address).searchParams;
   if(p.has('cmtitle'))return {query:{categorymembers:[{pageid:++id,ns:0,title:'Discovery '+id}]}};
   if(p.get('prop')==='extracts'&&p.get('pageids').split('|').includes('6')){work.fail('upstream_rate_limited',30000);return null;}
   return {query:{pages:Object.fromEntries(p.get('pageids').split('|').map(id=>[id,{pageid:Number(id),ns:0,title:'Discovery '+id,pageviews:{a:20},categories:[{title:'Category:All articles needing additional references'}],...(p.get('prop')==='extracts'?{extract:'An informative and verified introduction to this article requiring help. '.repeat(2)}:{})}]))}};
  };
  const response=await api.topicResponse(new URL('https://wikiscroll.com/api/topics?topic=tech&help=1&depth=3&batch=31'),{},jobs,{...options(fixture),work});
  const data=await response.json();assert.equal(response.status,200);assert.ok(data.articles.length);assert.equal(data.partial,true);assert.equal(data.code,'upstream_rate_limited');assert.ok(Number(response.headers.get('Retry-After'))>=29);
 });
});

test('topic introductions start while optional maintenance enrichment is still pending',async()=>{
 let finishNeeds,extractStarted=false,serialFallback=false;
 const blocked=new Promise(resolve=>finishNeeds=resolve),state={candidates:[[{pageid:1,ns:0,title:'Discovery'}]]};
 const run=topicPages('tech','en',3,async address=>{
  const p=new URL(address).searchParams;
  if(p.get('prop')==='categories'){await blocked;return {query:{pages:{1:{pageid:1,categories:[]}}}};}
  if(p.get('prop')==='extracts'){extractStarted=true;finishNeeds();return {query:{pages:{1:{extract:'An informative and substantive introduction about a fascinating discovery. '.repeat(3)}}}};}
  return {query:{pages:{1:{pageid:1,ns:0,title:'Discovery',pageviews:{a:20}}}}};
 },{state});
 // Bound the assertion so a serial implementation fails instead of hanging.
 const timer=setTimeout(()=>{serialFallback=true;finishNeeds();},100);
 const cards=await run;clearTimeout(timer);
 assert.equal(extractStarted,true);assert.equal(cards.length,1);
 assert.equal(serialFallback,false);assert.ok(!state.chosen[0].needsMissing);
});
