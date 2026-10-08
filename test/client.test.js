import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const network=source.slice(source.indexOf('let apiCooldownUntil ='),source.indexOf('// ── ARTICLE VALIDATORS'));
test('client honors global 429 cooldown without a second fetch',async()=>{
  let calls=0;
  const context=vm.createContext({Date,AbortController,setTimeout,clearTimeout,fillGeneration:0,supplyControllers:new Set(),fetch:async()=>{calls++;return new Response(null,{status:429,headers:{'Retry-After':'180'}});}});
  vm.runInContext(network,context);
  await vm.runInContext('fetchOne("https://en.wikipedia.org/w/api.php")',context);
  await vm.runInContext('fetchOne("https://en.wikivoyage.org/w/api.php")',context);
  assert.equal(calls,1);
  assert.ok(vm.runInContext('apiCooldownUntil-Date.now()',context)>179000);
});
test('shared client fill budget stops nested fetches at five requests',async()=>{
  let calls=0;
  const context=vm.createContext({Date,AbortController,setTimeout,clearTimeout,fillGeneration:0,supplyControllers:new Set(),fetch:async()=>{calls++;return Response.json({ok:true});}});
  vm.runInContext(network+'\nfillBudget={remaining:5};',context);
  for(let i=0;i<9;i++)await vm.runInContext('fetchOne("https://en.wikipedia.org/w/api.php")',context);
  assert.equal(calls,5);
});
test('watchdog does not silently expire after twelve attempts',()=>{
  assert.ok(!source.includes('refillAttempts < 12'));
  assert.match(source,/if\(queue.length<QUEUE_MIN\)scheduleRefill\(\);/);
});
test('existing storage keys and native Safari privacy mechanism remain',()=>{
  for(const key of ['ws_settings','ws_liked','ws_topics','ws_history','ws_collections'])assert.ok(source.includes(key));
  // The retired most-read chart cache is removed on load rather than left behind.
  assert.match(source,/k\.startsWith\('ws_topchart_'\)/);
  assert.match(source,/indexedDB.open\('wikiscroll', 1\)/);
  assert.match(source,/dlg.showModal\(\)/);
  assert.match(source,/_privacyOpenTime < 500/);
  const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(html,/data-open-privacy="burger"/);
  assert.match(html,/data-open-privacy="settings"/);
  assert.match(source,/closeBurger\(\); setTimeout\(openPrivacy, 350\)/);
  assert.match(source,/closeSettings\(\); setTimeout\(openPrivacy, 100\)/);
});

test('Worker retries retain the same batch and honor a 180-second cooldown before any fallback',async()=>{
 const start=source.indexOf('function retryAfterMillis('),end=source.indexOf('function fillQueue(',start);
 let now=100000,calls=0;const urls=[];
 const c=vm.createContext({crypto:webcrypto,URLSearchParams,AbortController,Date:{now:()=>now,parse:Date.parse},setTimeout:()=>1,clearTimeout(){},fetch:async url=>{urls.push(url);return ++calls===1?new Response(null,{status:503,headers:{'Retry-After':'180'}}):Response.json({articles:[{id:'w1'}]});}});
 vm.runInContext(`let curMode='wiki',curLang='en',depthLevel=5,workerBatch=7,workerCooldownUntil=0,pendingWorkerBatch=null,fillGeneration=0,articles=[],queue=[];const supplyControllers=new Set(),curTopics=new Set();const helpOnly=()=>false,feedContextKey=()=>curLang+'|'+depthLevel;${source.slice(start,end)}`,c);
 await c.fetchWorkerBatch(0);assert.equal(c.retryAfterMillis('180'),180000);
 await c.fetchWorkerBatch(0);assert.equal(calls,1);
 now+=180001;assert.equal((await c.fetchWorkerBatch(0))[0].id,'w1');assert.equal(urls[0],urls[1]);
 await c.fetchWorkerBatch(0);assert.notEqual(urls[1],urls[2]);
 assert.ok(c.retryAfterMillis(new Date(now+60000).toUTCString())>59000);
});

test('partial topic cards retain their batch until the completed response arrives',async()=>{
 const start=source.indexOf('function retryAfterMillis('),end=source.indexOf('function fillQueue(',start),urls=[];
 const c=vm.createContext({crypto:webcrypto,URLSearchParams,AbortController,Date,setTimeout:()=>1,clearTimeout(){},fetch:async url=>{urls.push(url);return Response.json({articles:[{id:'w1'}],partial:urls.length===1});}});
 vm.runInContext(`let curMode='wiki',curLang='en',depthLevel=3,workerBatch=7,workerCooldownUntil=0,pendingWorkerBatch=null,fillGeneration=0,articles=[],queue=[];const supplyControllers=new Set(),curTopics=new Set(['tech']);const helpOnly=()=>true,feedContextKey=()=>curLang+'|'+depthLevel;${source.slice(start,end)}`,c);
 await c.fetchWorkerBatch(0);await c.fetchWorkerBatch(0);await c.fetchWorkerBatch(0);
 assert.equal(urls[0],urls[1]);assert.notEqual(urls[1],urls[2]);assert.match(urls[0],/help=1/);
});

test('fresh visitors use independent opening draws even with the same shared slot, then return to cached refills',async()=>{
 const start=source.indexOf('function retryAfterMillis('),end=source.indexOf('function fillQueue(',start),openings=[];
 for(let visitor=0;visitor<16;visitor++){
  const urls=[];
  const c=vm.createContext({crypto:webcrypto,URLSearchParams,AbortController,Date,setTimeout:()=>1,clearTimeout(){},fetch:async url=>{urls.push(new URL(url,'https://wikiscroll.com'));return Response.json({articles:[{id:'w1'}]});}});
  vm.runInContext(`let curMode='wiki',curLang='en',depthLevel=3,workerBatch=7,workerCooldownUntil=0,pendingWorkerBatch=null,fillGeneration=0,articles=[],queue=[];const supplyControllers=new Set(),curTopics=new Set();const helpOnly=()=>false,feedContextKey=()=>curLang+'|'+depthLevel;${source.slice(start,end)}`,c);
  await c.fetchWorkerBatch(0);
  assert.equal(urls[0].searchParams.get('batch'),'7');assert.match(urls[0].searchParams.get('draw'),/^[a-f0-9]{32}$/);
  openings.push(urls[0].searchParams.get('draw'));
  vm.runInContext('queue.push({id:"w1"});',c);await c.fetchWorkerBatch(0);
  assert.equal(urls[1].searchParams.get('draw'),null,'ordinary preloading still uses shared supply');
 }
 assert.equal(new Set(openings).size,16);
});

test('late random supply retains its opening draw without blocking the next fresh batch',async()=>{
 const start=source.indexOf('function retryAfterMillis('),end=source.indexOf('function fillQueue(',start),urls=[];let finish;
 const late=new Promise(resolve=>{finish=resolve;});let fresh=0;
 const c=vm.createContext({crypto:webcrypto,URLSearchParams,AbortController,Date,setTimeout:()=>1,clearTimeout(){},fetch:async url=>{const u=new URL(url,'https://wikiscroll.com');urls.push(u);if(u.searchParams.has('resume'))return late;return Response.json({articles:[{id:'w'+(++fresh)}],partial:fresh===1});}});
 vm.runInContext(`let curMode='wiki',curLang='en',depthLevel=3,workerBatch=7,workerCooldownUntil=0,pendingWorkerBatch=null,fillGeneration=0,articles=[],queue=[];const supplyControllers=new Set(),curTopics=new Set(),lateSupplyTasks=new Set();const helpOnly=()=>false,feedContextKey=()=>curLang+'|'+depthLevel,acceptSupply=()=>{},ensureFeedAhead=()=>{},scheduleRefill=()=>{},QUEUE_MIN=60;${source.slice(start,end)}`,c);
 await c.fetchWorkerBatch(0);await c.fetchWorkerBatch(0);
 assert.equal(urls[0].searchParams.get('draw'),urls[1].searchParams.get('draw'));assert.equal(urls[1].searchParams.get('resume'),'1');assert.notEqual(urls[1].searchParams.get('draw'),urls[2].searchParams.get('draw'));
 finish(Response.json({articles:[{id:'w3'}],partial:false}));await new Promise(setImmediate);
});

test('topic and Help fills keep requesting their partial batch rather than stopping after the first cards',async()=>{
 for(const help of [false,true]){
  const start=source.indexOf('function fillQueue()'),end=source.indexOf('let refillTimer=',start);let calls=0;const urls=[];
  const c=vm.createContext({Promise,Date,URLSearchParams,fillGeneration:0,queue:[],QUEUE_MIN:60,QUEUE_TARGET:100,curMode:'wiki',curTopics:new Set(help?[]:['tech']),helpOnly:()=>help,travelFilters:{},apiCooldownUntil:0,workerCooldownUntil:0,scheduleRefill(){},syncTravelEnd(){},ensureFeedAhead(){},fetchWiki:()=>{throw Error('a filtered feed must not request unfiltered fallback');},fetchVoyage:()=>{},fetchWorkerBatch:async()=>{calls++;urls.push(calls);return [{id:'w'+calls}];},acceptSupply(batch){c.queue.push(...batch);return batch.length;}});
  vm.runInContext(`let supplyTask=null,filling=false,fillBudget=null,pendingWorkerBatch={params:new URLSearchParams({topic:'tech'})};${source.slice(start,end)}`,c);
  await c.fillQueue();assert.equal(calls,5);assert.equal(c.queue.length,5);
 }
});

test('an upstream cooldown can use cache-only cards without restarting a Wikimedia batch',async()=>{
 const start=source.indexOf('function retryAfterMillis('),end=source.indexOf('function fillQueue(',start),urls=[];
 const c=vm.createContext({crypto:webcrypto,URLSearchParams,AbortController,Date,setTimeout:()=>1,clearTimeout(){},fetch:async url=>{urls.push(new URL(url,'https://wikiscroll.com'));return urls.length===1?Response.json({code:'upstream_rate_limited'},{status:503,headers:{'Retry-After':'28'}}):Response.json({articles:[{id:'w99'}],cached_only:true});}});
 vm.runInContext(`let curMode='wiki',curLang='en',depthLevel=3,workerBatch=7,workerCooldownUntil=0,pendingWorkerBatch=null,fillGeneration=0,articles=[{id:'w1'}],queue=[];const supplyControllers=new Set(),curTopics=new Set();const helpOnly=()=>true,feedContextKey=()=>curLang+'|'+depthLevel;${source.slice(start,end)}`,c);
 await c.fetchWorkerBatch(0);assert.equal((await c.fetchWorkerBatch(0))[0].id,'w99');
 assert.equal(urls[1].pathname,'/api/topics');assert.equal(urls[1].searchParams.get('topic'),'help');assert.equal(urls[1].searchParams.get('cached'),'1');assert.equal(urls[1].searchParams.has('draw'),false);
 await c.fetchWorkerBatch(0);assert.notEqual(urls[1].searchParams.get('batch'),urls[2].searchParams.get('batch'));
});

test('upstream pauses follow one edition while genuine Worker limits remain global',async()=>{
 const start=source.indexOf('function retryAfterMillis('),end=source.indexOf('async function fetchWorkerBatch(',start);let now=100000;
 const c=vm.createContext({Date:{now:()=>now,parse:Date.parse},curMode:'wiki',curLang:'en',voyageLang:()=>c.curLang,fillGeneration:0,workerCooldownUntil:0,pendingWorkerBatch:null});vm.runInContext(source.slice(start,end),c);
 const pause=()=>Response.json({code:'upstream_rate_limited'},{status:503,headers:{'Retry-After':'28'}});
 await c.noteWorkerCooldown(pause(),0,'wiki|en');assert.equal(c.workerCooldownUntil,128000);
 c.curMode='how';c.restoreWorkerCooldown();assert.equal(c.workerCooldownUntil,0);
 c.curMode='wiki';c.curLang='es';c.restoreWorkerCooldown();assert.equal(c.workerCooldownUntil,0);
 c.curLang='en';c.restoreWorkerCooldown();assert.equal(c.workerCooldownUntil,128000);
 await c.noteWorkerCooldown(new Response(null,{status:429,headers:{'Retry-After':'60'}}),0,'wiki|en');c.curMode='how';c.restoreWorkerCooldown();assert.equal(c.workerCooldownUntil,160000);
 now=160001;c.restoreWorkerCooldown();assert.equal(c.workerCooldownUntil,160000);assert.ok(c.workerCooldownUntil<now);
});
test('an old generation’s delayed error body cannot pause the new feed',async()=>{
 const start=source.indexOf('function retryAfterMillis('),end=source.indexOf('async function fetchWorkerBatch(',start);let release;const body=new Promise(r=>{release=r;});
 const c=vm.createContext({Date,curMode:'wiki',curLang:'en',voyageLang:()=>c.curLang,fillGeneration:0,workerCooldownUntil:0,pendingWorkerBatch:null});vm.runInContext(source.slice(start,end),c);
 const pending=c.noteWorkerCooldown({status:503,headers:new Headers({'Retry-After':'180'}),json:()=>body},0,'wiki|en');c.fillGeneration++;c.curMode='how';release({code:'upstream_rate_limited'});await pending;
 assert.equal(c.workerCooldownUntil,0);c.curMode='wiki';c.restoreWorkerCooldown();assert.equal(c.workerCooldownUntil,0);
});

test('successful partial cooldown preserves cards and recovers cache without repeating upstream work',async()=>{
 const start=source.indexOf('function retryAfterMillis('),end=source.indexOf('function fillQueue(',start),urls=[];
 const c=vm.createContext({crypto:webcrypto,URLSearchParams,AbortController,Date,setTimeout:()=>1,clearTimeout(){},fetch:async url=>{urls.push(url);return urls.length===1?Response.json({articles:[{id:'w1'}],partial:true,code:'upstream_rate_limited'},{headers:{'Retry-After':'30'}}):Response.json({articles:[{id:'w2'}],cached_only:true});}});
 vm.runInContext(`let curMode='wiki',curLang='en',depthLevel=3,workerBatch=7,workerCooldownUntil=0,pendingWorkerBatch=null,fillGeneration=0,articles=[{id:'w0'}],queue=[];const supplyControllers=new Set(),curTopics=new Set(['tech']);const helpOnly=()=>true,feedContextKey=()=>curLang+'|'+depthLevel;${source.slice(start,end)}`,c);
 assert.equal((await c.fetchWorkerBatch(0))[0].id,'w1');
 assert.ok(vm.runInContext('workerCooldownUntil-Date.now()',c)>29000);
 assert.equal((await c.fetchWorkerBatch(0))[0].id,'w2');
 assert.match(urls[1],/cached=1/);assert.match(urls[1],/topic=tech/);assert.match(urls[1],/help=1/);
});
test('repeated partial topic supply releases the foreground after bounded retries',async()=>{
 const start=source.indexOf('function retryAfterMillis('),end=source.indexOf('function fillQueue(',start),urls=[];
 const c=vm.createContext({crypto:webcrypto,URLSearchParams,AbortController,Date,setTimeout:()=>1,clearTimeout(){},fetch:async url=>{urls.push(url);return Response.json({articles:[{id:'w1'}],partial:true});}});
 vm.runInContext(`let curMode='wiki',curLang='en',depthLevel=3,workerBatch=7,workerCooldownUntil=0,pendingWorkerBatch=null,fillGeneration=0,articles=[{id:'w0'}],queue=[];const lateSupplyTasks=new Set([{},{}]),supplyControllers=new Set(),curTopics=new Set(['tech']);const helpOnly=()=>false,feedContextKey=()=>curLang+'|'+depthLevel;${source.slice(start,end)}`,c);
 for(let i=0;i<4;i++)await c.fetchWorkerBatch(0);
 assert.equal(urls[0],urls[1]);assert.equal(urls[1],urls[2]);assert.notEqual(urls[2],urls[3]);
});
