import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const supply = source.slice(source.indexOf('// ── PREFETCH QUEUE'), source.indexOf('// ── FEED GEOMETRY'));
const voyage = source.slice(source.indexOf('const VOYAGE_LANGS'),source.indexOf('\n',source.indexOf('function voyageLang(')));
const article = (n, src = 'wiki') => ({id:(src === 'wiki' ? 'w' : 'v') + n, src, title:'Article ' + n, body:'A meaningful introduction with enough detail to make this a readable card.', img:'https://upload.wikimedia.org/example-' + n + '.jpg', url:'https://en.' + (src === 'wiki' ? 'wikipedia' : 'wikivoyage') + '.org/wiki/Article_' + n});
const batch = (count, start = 1, src = 'wiki') => Array.from({length:count}, (_, i) => article(start + i, src));
const tick = async () => { for (let i=0; i<8; i++) await Promise.resolve(); };

function harness() {
  const storage = new Map(), timers = new Map(), requests = [];
  const nodes = [], feed = {querySelectorAll:() => nodes, addEventListener() {}};
  let timerId=0, selectedIndex=0, directCalls=0, starterRequests=0;
  const hint={style:{}}, spinner={remove(){}};
  const context = vm.createContext({
    console, Date, URLSearchParams, AbortController, shuffled:items=>[...items],
    Image:class {},
    navigator:{onLine:true},
    window:{addEventListener(){}},
    document:{getElementById:id => id==='feed'?feed:id==='hint'?hint:spinner, querySelectorAll:()=>[], addEventListener(){}},
    requestAnimationFrame:()=>1,
    setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id;},
    clearTimeout:id=>timers.delete(id),
    lsGet:key=>storage.has(key)?JSON.parse(storage.get(key)):null,
    lsSet:(key,value)=>storage.set(key,JSON.stringify(value)),
    getCurrentFeedCard:()=>nodes[selectedIndex]||null,
    renderCard:a=>nodes.push({dataset:{id:a.id}}),
    fetch:async()=>{starterRequests++;return Response.json({wiki:batch(30),how:batch(30,1,'how')});},
    workerRequest:()=>new Promise(resolve=>requests.push(resolve)),
    directRequest:async()=>{directCalls++;return [];},
  });
  vm.runInContext(`let curMode='wiki',curLang='en',depthLevel=3,curTopics=new Set(),travelFilters={place:'',style:''},helpMode='off';
    let queue=[],articles=[],filling=false,hinted=false,fillGeneration=0,fillBudget=null,apiCooldownUntil=0,travelExhausted=false;
    const fetchWiki=()=>directRequest(),fetchWikiByTopic=()=>directRequest(),fetchVoyage=()=>directRequest();
    ${voyage}
    ${supply}
    fetchWorkerBatch=()=>workerRequest();
    function withTodaySurprises(batch){return batch;}`, context);
  const run = text => vm.runInContext(text, context);
  return {
    context, nodes, requests, storage, run,
    get directCalls(){return directCalls;}, get starterRequests(){return starterRequests;},
    state:()=>JSON.parse(run('JSON.stringify({queue:queue.map(a=>a.id),articles:articles.map(a=>a.id),filling,gen:fillGeneration})')),
    add(items){context.incoming=items;return run('acceptSupply(incoming,fillGeneration)');},
    select(index){selectedIndex=index;},
    persist(){run('persistFeedReserve()');for(const [id,timer] of timers)if(timer.delay===200){timers.delete(id);timer.fn();}},
    change(script){run('fillGeneration++;queue=[];articles=[];feedSeen.clear();supplyTask=null;'+script);nodes.length=0;selectedIndex=0;},
  };
}

test('concurrent refill requests share one supply task', async () => {
  const h=harness();
  const first=h.run('fillQueue()'), second=h.run('fillQueue()');
  assert.equal(first,second);
  assert.equal(h.requests.length,1);
  h.requests[0]([]);await first;
  assert.equal(h.directCalls,1);
  assert.equal(h.state().filling,false);
});

test('first batch becomes readable while the next network batch is still pending', async () => {
  const h=harness();
  let complete=false;
  const filling=h.run('fillQueue()');filling.then(()=>{complete=true;});
  h.requests[0](batch(40));await tick();
  assert.equal(complete,false);
  assert.equal(h.requests.length,2);
  assert.equal(h.nodes.length,17);
  assert.equal(h.state().queue.length,23);
  assert.equal(h.state().articles[0],'w1');
  h.requests[1]([]);await filling;
});

test('stale replies cannot enter a new source or clear its active supply lock', async () => {
  const h=harness(), oldTask=h.run('fillQueue()');
  h.change("curMode='how';");
  const newTask=h.run('fillQueue()');
  h.requests[0](batch(40));await oldTask;
  assert.deepEqual(h.state().articles,[]);
  assert.deepEqual(h.state().queue,[]);
  assert.equal(h.state().filling,true);
  h.requests[1](batch(40,1,'how'));await tick();
  assert.ok(h.state().articles.every(id=>id.startsWith('v')));
  assert.equal(h.nodes.length,17);
  h.requests[2]([]);await newTask;
  assert.equal(h.state().filling,false);
});

test('duplicates are rejected across queued and already-rendered articles', () => {
  const h=harness();
  assert.equal(h.add([...batch(20),...batch(10)]),20);
  h.run('ensureFeedAhead()');
  assert.equal(h.add([...batch(20),article(21),{...article(22),id:'invalid'}]),1);
  const state=h.state();
  assert.equal(state.articles.length+state.queue.length,21);
  assert.equal(new Set([...state.articles,...state.queue]).size,21);
});

test('a cached reserve restores only the exact source, language, and preference context', () => {
  const h=harness();h.add(batch(25));h.run('ensureFeedAhead()');h.select(5);h.persist();
  assert.equal(h.run('restoreFeedReserve().length'),20);
  h.change("curMode='how';");
  assert.equal(h.run('restoreFeedReserve().length'),0);
  h.add(batch(25,1,'how'));h.run('ensureFeedAhead()');h.persist();
  assert.equal(h.run('restoreFeedReserve()[0].src'),'how');
  h.run("travelFilters={place:'Japan',style:'culture'};");
  assert.equal(h.run('restoreFeedReserve().length'),0);
  h.change("curMode='wiki';curLang='es';travelFilters={place:'',style:''};");
  assert.equal(h.run('restoreFeedReserve().length'),0);
  h.run("curLang='en';depthLevel=5;");
  assert.equal(h.run('restoreFeedReserve().length'),0);
  h.run('depthLevel=3;curTopics.add("science");');
  assert.equal(h.run('restoreFeedReserve().length'),0);
  h.run('curTopics.clear();');
  assert.equal(h.run('restoreFeedReserve().length'),20);
  assert.equal(h.run('restoreFeedReserve()[0].id'),'w6');
});

test('starter fallback never substitutes English random content for explicit filters', async () => {
  for(const preference of ["curLang='fr';","curTopics.add('science');","depthLevel=1;","curMode='how';travelFilters.place='Japan';"]){
    const h=harness();h.run(preference);
    await h.run('loadStarterLibrary(fillGeneration)');
    assert.equal(h.starterRequests,0);
    assert.equal(h.nodes.length,0);
  }
});

test('normal supply waits for a requested shared article before rendering', () => {
  const h=harness();h.run('pendingDeepGeneration=fillGeneration;');
  h.add(batch(40));h.run('ensureFeedAhead()');
  assert.equal(h.nodes.length,0);
  assert.equal(h.state().queue.length,40);
  h.run('pendingDeepGeneration=-1;ensureFeedAhead();');
  assert.equal(h.nodes.length,17);
});
