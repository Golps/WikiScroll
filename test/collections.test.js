import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeCollection,collectionResponse} from '../worker/collections.js';
const c={v:1,name:'A curious weekend',items:[{id:'w123',lang:'en',title:'Mountains & sea',body:'A place to explore.'}]};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
test('collection snapshot round trips Unicode',()=>assert.deepEqual(decodeCollection(encode({...c,name:'Café & coast'})),{...c,name:'Café & coast'}));
test('collection rejects external URLs, malformed IDs and oversized links',()=>{assert.throws(()=>decodeCollection(encode({...c,items:[{...c.items[0],id:'https://evil.test'}]})));assert.throws(()=>decodeCollection('x'.repeat(12001)));assert.throws(()=>decodeCollection(encode({...c,items:[]})));});
test('collection image serves a prebuilt PNG without source lookups or runtime rendering',async()=>{
 let calls=0;const env={ASSETS:{fetch:async request=>{calls++;assert.equal(new URL(request.url).pathname,'/images/og-discovery-v12.png');return new Response(new Uint8Array([137,80,78,71]));}}};
 const response=await collectionResponse(new Request('https://wikiscroll.com/collection.png?c='+encode({...c,name:'<img>'})),{},env);
 assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/png');assert.equal(calls,1);assert.equal((await response.arrayBuffer()).byteLength,4);
});
test('invalid shared collection returns 400, HEAD returns no body',async()=>{assert.equal((await collectionResponse(new Request('https://wikiscroll.com/collection?c=bad'),{})).status,400);const res=await collectionResponse(new Request('https://wikiscroll.com/collection?c='+encode(c),{method:'HEAD'}),{});assert.equal(await res.text(),'');});

// A shared list outlives some of its articles: Wikipedia deletes pages, and a
// deleted page can never be verified again.
function wikimedia(pages,{down=false}={}){
 const calls=[];
 const fetcher=async address=>{
  calls.push(String(address));if(down)return new Response('unavailable',{status:500});
  const ids=new URL(address).searchParams.get('pageids').split('|');
  return Response.json({query:{pages:Object.fromEntries(ids.map(id=>[id,pages[id]??{pageid:Number(id),missing:''}]))}});
 };
 return {calls,fetcher};
}
const edgeCache=()=>{const values=new Map();return {values,default:{async match(k){return values.get(k.url)?.clone();},async put(k,v){values.set(k.url,v.clone());}}};};
const page=(id,title,ns=0)=>({pageid:id,ns,title,extract:`${title} is a verified article with an introduction long enough to show.`});
const shared={v:1,name:'Field notes',items:[{id:'w11',lang:'en',title:'Supplied one',body:'Supplied.'},{id:'w22',lang:'en',title:'Supplied two',body:'Supplied.'},{id:'w33',lang:'en',title:'Supplied three',body:'Supplied.'}]};
async function withWikimedia(source,run){
 const oldFetch=globalThis.fetch,oldCaches=globalThis.caches,store=edgeCache();
 globalThis.fetch=source.fetcher;globalThis.caches=store;
 const tasks=[],ctx={waitUntil:p=>tasks.push(p)},env={WORK_LIMIT:{limit:async()=>({success:true})}};
 try{return await run(path=>collectionResponse(new Request('https://wikiscroll.com'+path+'?c='+encode(shared)),ctx,env),async()=>{await Promise.all(tasks);});}
 finally{globalThis.fetch=oldFetch;globalThis.caches=oldCaches;}
}
test('a collection with a deleted article shows the rest and says one is missing',async()=>{
 const source=wikimedia({11:page(11,'Alder'),33:page(33,'Cedar')});
 await withWikimedia(source,async(get,settle)=>{
  const response=await get('/collection');await settle();
  assert.equal(response.status,200);const html=await response.text();
  assert.match(html,/Alder/);assert.match(html,/Cedar/);assert.doesNotMatch(html,/Supplied/);
  assert.match(html,/2 DISCOVERIES/);assert.match(html,/One article from this list is no longer on Wikipedia or Wikivoyage and is not shown\./);
  const link=html.match(/importCollection=([\w-]+)/)[1];
  assert.deepEqual(decodeCollection(link).items.map(a=>a.id),['w11','w33'],'the saved copy holds only the articles shown');
  const before=source.calls.length;
  const data=await (await get('/api/collection')).json();await settle();
  assert.deepEqual(data.items.map(a=>a.id),['w11','w33']);assert.equal(data.omitted,1);
  assert.equal(source.calls.length,before,'the answer, missing article included, is reused');
 });
});
test('a page moved out of the article namespace counts as missing; a complete list has no note',async()=>{
 await withWikimedia(wikimedia({11:page(11,'Alder'),22:page(22,'Draft:Birch',118),33:page(33,'Cedar')}),async(get,settle)=>{
  const html=await (await get('/collection')).text();await settle();
  assert.match(html,/2 DISCOVERIES/);assert.doesNotMatch(html,/Birch/);
 });
 await withWikimedia(wikimedia({11:page(11,'Alder'),22:page(22,'Birch'),33:page(33,'Cedar')}),async(get,settle)=>{
  const response=await get('/api/collection');await settle();const data=await response.json();
  assert.equal(data.items.length,3);assert.equal('omitted' in data,false);
  assert.doesNotMatch(await (await get('/collection')).text(),/not shown/);
 });
});
test('a collection whose every article is gone answers 404, and an unanswered lookup still asks to retry',async()=>{
 await withWikimedia(wikimedia({}),async(get,settle)=>{
  const response=await get('/collection');await settle();
  assert.equal(response.status,404);assert.equal(response.headers.has('Retry-After'),false);assert.match(await response.text(),/no longer on Wikipedia/);
 });
 // Wikimedia failing is not the same as an article being gone.
 await withWikimedia(wikimedia({},{down:true}),async(get,settle)=>{
  const response=await get('/collection');await settle();
  assert.equal(response.status,503);assert.ok(response.headers.has('Retry-After'));
 });
});
