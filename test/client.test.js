import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
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
 const c=vm.createContext({URLSearchParams,AbortController,Date:{now:()=>now,parse:Date.parse},setTimeout:()=>1,clearTimeout(){},fetch:async url=>{urls.push(url);return ++calls===1?new Response(null,{status:503,headers:{'Retry-After':'180'}}):Response.json({articles:[{id:'w1'}]});}});
 vm.runInContext(`let curMode='wiki',curLang='en',depthLevel=5,workerBatch=7,workerCooldownUntil=0,pendingWorkerBatch=null,fillGeneration=0;const supplyControllers=new Set(),curTopics=new Set();const helpOnly=()=>false,feedContextKey=()=>curLang+'|'+depthLevel;${source.slice(start,end)}`,c);
 await c.fetchWorkerBatch(0);assert.equal(c.retryAfterMillis('180'),180000);
 await c.fetchWorkerBatch(0);assert.equal(calls,1);
 now+=180001;assert.equal((await c.fetchWorkerBatch(0))[0].id,'w1');assert.equal(urls[0],urls[1]);
 await c.fetchWorkerBatch(0);assert.notEqual(urls[1],urls[2]);
 assert.ok(c.retryAfterMillis(new Date(now+60000).toUTCString())>59000);
});

test('partial topic cards retain their batch until the completed response arrives',async()=>{
 const start=source.indexOf('function retryAfterMillis('),end=source.indexOf('function fillQueue(',start),urls=[];
 const c=vm.createContext({URLSearchParams,AbortController,Date,setTimeout:()=>1,clearTimeout(){},fetch:async url=>{urls.push(url);return Response.json({articles:[{id:'w1'}],partial:urls.length===1});}});
 vm.runInContext(`let curMode='wiki',curLang='en',depthLevel=3,workerBatch=7,workerCooldownUntil=0,pendingWorkerBatch=null,fillGeneration=0;const supplyControllers=new Set(),curTopics=new Set(['tech']);const helpOnly=()=>true,feedContextKey=()=>curLang+'|'+depthLevel;${source.slice(start,end)}`,c);
 await c.fetchWorkerBatch(0);await c.fetchWorkerBatch(0);await c.fetchWorkerBatch(0);
 assert.equal(urls[0],urls[1]);assert.notEqual(urls[1],urls[2]);assert.match(urls[0],/help=1/);
});
