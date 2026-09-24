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
  if(p.has('lllang'))return {query:{pages:{1:{langlinks:[{'*':'Categoría:Tecnología '+(++id)}]}}}};
  assert.equal(url.hostname,'es.wikipedia.org');
  if(p.has('cmtitle'))return {query:{categorymembers:[{pageid:++id,ns:0,title:'Tema'}]}};
  return {query:{pages:Object.fromEntries(p.get('pageids').split('|').map(n=>[n,{...page(Number(n),'',15),title:'Tema '+n,extract:'Una introducción suficientemente larga. '.repeat(5),thumbnail:{source:'https://upload.wikimedia.org/example.jpg'}}]))}};
 });
 assert.ok(result.length>1);assert.ok(result.every(a=>a.url.startsWith('https://es.wikipedia.org/')));
 assert.equal(requests.filter(u=>u.searchParams.has('lllang')).length,6);
});
test('invalid topic inputs do not trigger upstream work',async()=>{
 const options={langs:new Set(['en']),permit:async()=>{throw Error('should not execute');}};
 for(const query of ['topic=__proto__','topic=tech&depth=99','topic=tech&lang=invalid','topic=tech&batch=64'])assert.equal((await topicResponse(new URL('https://example.org/api/topics?'+query),{}, {},options)).status,400);
});

let topicModule=0;
const freshTopics=()=>import('../worker/topics.js?test='+topicModule++);
const topicUrl=()=>new URL('https://wikiscroll.com/api/topics?topic=tech&lang=en&depth=3&batch=8');
const topicKey=()=>new Request('https://wikiscroll.com/api/topics?v=5&topic=tech&lang=en&depth=3&batch=8');
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
   assert.equal((await again.json()).articles[0].id,'w90');assert.equal(calls,6);
  }finally{finish(null);}
  await jobs.done();
  const retained=await (await cache.match(topicKey())).json();assert.equal(retained.articles[0].id,'w90');
  const denied={...settings,permit:async()=>false};
  assert.equal((await api.topicResponse(topicUrl(),{},jobs,denied)).status,200);
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
 now+=180_000;failed=true;
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
  assert.equal(failure.status,503);assert.equal(failure.headers.get('Retry-After'),'30');assert.equal(cache.entries.size,0);
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
