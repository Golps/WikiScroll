import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const likes=source.slice(source.indexOf('function toggleLike('),source.indexOf('function updateBadge('));
const workerFetch=source.slice(source.indexOf('async function fetchWorkerBatch('),source.indexOf('function fillQueue('));

function likesHarness(){
  const writes=[],deleted=[],frames=[],saves=[];
  const buttons=new Map();
  const context=vm.createContext({
    document:{getElementById:id=>{
      if(!buttons.has(id))buttons.set(id,{className:'act',innerHTML:''});
      return buttons.get(id);
    }},
    IDB:{put:a=>writes.push(a.id),delete:id=>deleted.push(id)},
    updateBadge(){},renderLikedList(){},atlasIcon:{bookmark:'bookmark'},
    requestAnimationFrame:fn=>frames.push(fn),
    saveLiked:()=>saves.push(true),
    resetFeed(){throw new Error('Saving must not restart or retarget discovery');},
    fillQueue(){throw new Error('Saving must not trigger a personalized refill');},
    fetch(){throw new Error('Saving must not request recommendations');},
  });
  vm.runInContext(`
    let articles=[{id:'w48895',title:'Tom Cruise'},{id:'w25308',title:'Rock climbing'}];
    let queue=[{id:'w12566',title:'Ginkgo biloba'},{id:'w30487',title:'Superconductivity'},{id:'w26845',title:'Saffron'}];
    let liked=new Map(),curTopics=new Set(['science']),depthLevel=4,curMode='wiki',fillGeneration=7;
    ${likes}
  `,context);
  const state=()=>JSON.parse(vm.runInContext('JSON.stringify({articles,queue,topics:[...curTopics],depth:depthLevel,mode:curMode,generation:fillGeneration})',context));
  return {context,state,writes,deleted,saves,buttons,flushFrames(){for(const fn of frames.splice(0))fn();}};
}

test('saving a celebrity or sports article never changes discovery order or selected topics',()=>{
  const h=likesHarness(),before=h.state();
  vm.runInContext('toggleLike("w48895");toggleLike("w25308");',h.context);
  assert.deepEqual(h.state(),before);
  assert.deepEqual(h.writes,['w48895','w25308']);
  assert.equal(h.saves.length,2);
  assert.equal(vm.runInContext('liked.size',h.context),2);
  assert.match(h.buttons.get('lb-w48895').innerHTML,/Saved/);
});

test('unsaving an article leaves the pending cards and feed generation untouched',()=>{
  const h=likesHarness();
  vm.runInContext('toggleLike("w48895");',h.context);
  const before=h.state();
  vm.runInContext('toggleLike("w48895");',h.context);h.flushFrames();
  assert.deepEqual(h.state(),before);
  assert.equal(vm.runInContext('liked.size',h.context),0);
  assert.deepEqual(h.deleted,['w48895']);
  assert.match(h.buttons.get('lb-w48895').innerHTML,/>Save</);
});

test('removing a saved article from collections does not retarget discovery',()=>{
  const h=likesHarness();
  vm.runInContext('toggleLike("w48895");',h.context);
  const before=h.state();
  vm.runInContext('removeLike("w48895");',h.context);h.flushFrames();
  assert.deepEqual(h.state(),before);
  assert.equal(vm.runInContext('liked.size',h.context),0);
});

test('backend discovery requests do not contain likes or previous-card information',async()=>{
  const requests=[];
  const context=vm.createContext({
    AbortController,URLSearchParams,Date,
    setTimeout:()=>1,clearTimeout(){},
    fetch:async url=>{requests.push(new URL(url,'https://wikiscroll.com'));return Response.json({articles:[]});},
  });
  vm.runInContext(`
    let curMode='wiki',curLang='en',depthLevel=4,workerBatch=3,workerCooldownUntil=0,fillGeneration=0;
    const supplyControllers=new Set(),curTopics=new Set();
    const helpOnly=()=>false;
    let liked=new Map(),articles=[{id:'w48895',title:'Tom Cruise'}],queue=[];
    ${workerFetch}
  `,context);
  await vm.runInContext('fetchWorkerBatch(fillGeneration)',context);
  vm.runInContext('liked.set("w48895",articles[0]);articles=[{id:"w25308",title:"Rock climbing"}];',context);
  await vm.runInContext('fetchWorkerBatch(fillGeneration)',context);
  for(const request of requests)request.searchParams.delete('batch');
  assert.equal(requests[0].href,requests[1].href);
  assert.equal(requests[0].searchParams.get('depth'),'4');
  assert.equal(requests[0].searchParams.get('mode'),'wiki');
  assert.doesNotMatch(requests[1].href,/Tom|Cruise|48895|climbing|25308|liked|previous|related/i);
});
