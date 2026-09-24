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
  assert.match(html,/onclick="closeBurger\(\);setTimeout\(openPrivacy,350\)"/);
  assert.match(html,/onclick="closeSettings\(\);setTimeout\(openPrivacy,100\)"/);
});
