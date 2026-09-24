import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const code=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const origin='https://wikiscroll.com';
const keyOf=request=>new URL(typeof request==='string'?request:request.url,origin).href;
function cacheStore(){
 const entries=new Map();
 return {
  entries,
  async match(request){return entries.get(keyOf(request))?.clone();},
  async put(request,response){entries.set(keyOf(request),response.clone());},
  async keys(){return [...entries.keys()].map(url=>({url}));},
  async delete(request){return entries.delete(keyOf(request));}
 };
}
function harness({cache=cacheStore(),open,fetcher}={}){
 const handlers=new Map();
 const scope={
  URL,Response,setTimeout,clearTimeout,
  self:{location:new URL(origin),addEventListener:(name,handler)=>handlers.set(name,handler)},
  caches:{open:open||(async()=>cache)},
  fetch:request=>fetcher(request)
 };
 vm.runInNewContext(code,scope,{filename:'sw.js'});
 return {
  cache,
  async request(path,{navigate=true,destination=''}={}){
   let response;const tasks=[];
   const request={url:new URL(path,origin).href,method:'GET',mode:navigate?'navigate':'cors',destination};
   handlers.get('fetch')({request,respondWith:promise=>{response=promise;},waitUntil:promise=>tasks.push(promise)});
   return {response:await response,done:()=>Promise.all(tasks)};
  }
 };
}

test('offline About and home documents stay separate, including article deep links',async()=>{
 let offline=false;
 const sw=harness({fetcher:async request=>{
  if(offline)throw Error('offline');
  return new Response(new URL(request.url).pathname==='/about/'?'About WikiScroll':'Discovery reader');
 }});
 for(const path of ['/','/about/']){
  const result=await sw.request(path);assert.equal(result.response.status,200);await result.done();
 }
 assert.deepEqual(new Set(sw.cache.entries.keys()),new Set([origin+'/',origin+'/about/']));
 offline=true;
 for(const [path,body] of [['/','Discovery reader'],['/?a=w12&lang=he','Discovery reader'],['/index.html','Discovery reader'],['/about/','About WikiScroll']]){
  const result=await sw.request(path);assert.equal(await result.response.text(),body,path);await result.done();
 }
});

test('an uncached offline page does not receive the home document',async()=>{
 const cache=cacheStore();await cache.put('/',new Response('Discovery reader'));
 const sw=harness({cache,fetcher:async()=>{throw Error('offline');}});
 const result=await sw.request('/about/');
 assert.equal(result.response.status,503);assert.match(await result.response.text(),/reconnect/);await result.done();
});

test('quota failures do not replace successful navigation or asset responses',async()=>{
 const cache=cacheStore();await cache.put('/',new Response('Older homepage'));
 cache.put=async()=>{throw Error('QuotaExceededError');};
 const sw=harness({cache,fetcher:async request=>new Response(new URL(request.url).pathname==='/'?'Current homepage':'Current styles')});
 const page=await sw.request('/');assert.equal(await page.response.text(),'Current homepage');await page.done();
 const asset=await sw.request('/styles.css?v=updated',{navigate:false,destination:'style'});
 assert.equal(asset.response.status,200);assert.equal(await asset.response.text(),'Current styles');await asset.done();
});

test('unavailable cache storage and failed cache reads still deliver network responses',async()=>{
 for(const operation of ['open','match']){
  const cache=cacheStore();if(operation==='match')cache.match=async()=>{throw Error('storage unavailable');};
  const sw=harness({cache,open:operation==='open'?async()=>{throw Error('storage unavailable');}:undefined,fetcher:async()=>new Response('Live content')});
  for(const [path,navigate] of [['/',true],['/styles.css',false]]){
   const result=await sw.request(path,{navigate});assert.equal(await result.response.text(),'Live content');await result.done();
  }
 }
});

test('slow cache persistence does not delay a successful network response',async()=>{
 let finish;const pending=new Promise(resolve=>{finish=resolve;});
 const cache=cacheStore();cache.put=()=>pending;
 const sw=harness({cache,fetcher:async()=>new Response('Available now')});
 let timer;
 try{
  const requests=Promise.all([sw.request('/'),sw.request('/app.js',{navigate:false,destination:'script'})]);
  const result=await Promise.race([requests,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),100);})]);
  assert.ok(result,'Responses must not wait for cache persistence');
  assert.deepEqual(await Promise.all(result.map(item=>item.response.text())),['Available now','Available now']);
  finish();await Promise.all(result.map(item=>item.done()));
 }finally{clearTimeout(timer);finish();}
});

test('article images from both Wikimedia image hosts stay available offline',async()=>{
 let offline=false;
 const sw=harness({fetcher:async()=>{if(offline)throw Error('offline');return new Response('image bytes',{headers:{'Content-Type':'image/jpeg'}});}});
 const images=['https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Example.jpg/640px-Example.jpg','https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Other.jpg/640px-Other.jpg'];
 for(const url of images){const result=await sw.request(url,{navigate:false,destination:'image'});await result.done();}
 offline=true;
 for(const url of images){const result=await sw.request(url,{navigate:false,destination:'image'});assert.equal(await result.response.text(),'image bytes',url);await result.done();}
});
