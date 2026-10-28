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

// A two-shard pool for every set; shard cards carry their set in the id range.
const SET_BASE={'wiki-en-1':10000,'wiki-en-2':20000,'wiki-en-3':30000,'wiki-en-4':40000,'wiki-en-5':50000,'how-en':60000};
function starterPool(path,onShard,sets=Object.fromEntries(Object.keys(SET_BASE).map(set=>[set,2]))){
  if(path==='/data/starter/index.json')return Response.json({v:1,sets});
  const [,set,shard]=path.match(/^\/data\/starter\/(.+)-(\d{3})\.json$/)||[];
  if(!set||!(sets[set]>Number(shard)))return new Response('',{status:404});
  onShard();return Response.json(batch(30,SET_BASE[set]+Number(shard)*100,set==='how-en'?'how':'wiki'));
}
// The card library on cards.wikiscroll.com: `sets` maps each set to its shard count.
function cardLibrary(url,sets,log){
  if(url==='https://cards.wikiscroll.com/v1/en/current.json')return sets?Response.json({v:1,build:'20261025',base:'20261025/',sets}):new Response('',{status:503});
  const [,set,shard]=url.match(/^https:\/\/cards\.wikiscroll\.com\/v1\/en\/20261025\/(.+)\/(\d+)\.json$/)||[];
  if(!set||!(sets?.[set]>Number(shard)))return new Response('',{status:404});
  log.push(set+'/'+shard);
  const how=set==='how-en',base=10000*(1+Object.keys(sets).indexOf(set))+Number(shard)*100;
  return Response.json(batch(100,base,how?'how':'wiki').map(a=>set.includes('help')?{...a,needs:['citations']}:a));
}
function harness({librarySets=undefined}={}) {
  const storage = new Map(), timers = new Map(), requests = [];
  const nodes = [], feed = {querySelectorAll:() => nodes, addEventListener() {}};
  let timerId=0, selectedIndex=0, directCalls=0, starterRequests=0;const starterPaths=[],shards=[];
  const hint={style:{}}, spinner={remove(){}};
  const context = vm.createContext({
    console, Date, URLSearchParams, AbortController, shuffled:items=>[...items],
    history:[],savedKey:a=>new URL(a.url).hostname+'|'+a.id,
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
    fetch:async path=>path.startsWith('https://')?cardLibrary(path,librarySets,shards):starterPool(path,()=>{starterRequests++;starterPaths.push(path);}),
    workerRequest:()=>new Promise(resolve=>requests.push(resolve)),
    directRequest:async()=>{directCalls++;return [];},
  });
  vm.runInContext(`let curMode='wiki',curLang='en',depthLevel=3,curTopics=new Set(),travelFilters={place:'',style:''},helpMode='off';
    let queue=[],articles=[],filling=false,hinted=false,fillGeneration=0,fillBudget=null,apiCooldownUntil=0,travelExhausted=false,travelContinuing=false;
    const helpTypeQuery=()=>'',matchesHelpTypes=a=>Array.isArray(a.needs)&&a.needs.some(n=>['sources','citations','unsourced','copyedit','clarify','images','outdated','incomplete','stub'].includes(n));
    const fetchWiki=()=>directRequest(),fetchWikiByTopic=()=>directRequest(),fetchVoyage=()=>directRequest();
    ${voyage}
    ${supply}
    // Card-library tests switch it on; these tests cover the Worker path.
    library.failedUntil=${librarySets===undefined?'Infinity':'0'};
    let helpTypes=['sources'];const activeHelpTypes=()=>helpTypes;
    const liveFetchWorkerBatch=fetchWorkerBatch;
    fetchWorkerBatch=()=>workerRequest();
    function withTodaySurprises(batch){return batch;}`, context);
  const run = text => vm.runInContext(text, context);
  return {
    context, nodes, requests, storage, run,
    shards,get directCalls(){return directCalls;}, get starterRequests(){return starterRequests;}, starterPaths,
    state:()=>JSON.parse(run('JSON.stringify({queue:queue.map(a=>a.id),articles:articles.map(a=>a.id),filling,gen:fillGeneration})')),
    add(items){context.incoming=items;return run('acceptSupply(incoming,fillGeneration)');},
    select(index){selectedIndex=index;},
    persist(){run('persistFeedReserve()');for(const [id,timer] of timers)if(timer.delay===200){timers.delete(id);timer.fn();}},
    async fire(delay){for(const [id,timer] of [...timers])if(timer.delay===delay){timers.delete(id);await timer.fn();}},
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

test('Only these articles rejects untagged supply while Off and Show tags leave the feed unchanged',()=>{
 for(const mode of ['off','tags','only']){
  const h=harness();h.run(`helpMode='${mode}';`);
  const count=h.add([article(1),{...article(2),needs:['citations']},{...article(3),needs:['invented']},{...article(4),needs:'citations'}]);
  assert.equal(count,mode==='only'?1:4);
  if(mode==='only')assert.deepEqual(h.state().queue,['w2']);
 }
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
  for(const preference of ["curLang='fr';","curTopics.add('science');","helpMode='only';","curMode='how';travelFilters.place='Japan';"]){
    const h=harness();h.run(preference);
    await h.run('loadStarterLibrary(fillGeneration)');
    assert.equal(h.starterRequests,0);
    assert.equal(h.nodes.length,0);
  }
});

test('live cards win online startup before any restored or fixed starter cards',async()=>{
  const h=harness();h.add(batch(25));h.run('ensureFeedAhead()');h.persist();h.change('');
  const fallback=h.run('startStartupFallback(fillGeneration)'),filling=h.run('fillQueue()');
  assert.equal(h.nodes.length,0,'cached cards do not immediately occupy the opening');
  h.requests[0](batch(40,1000));await tick();
  assert.equal(h.state().articles[0],'w1000');
  await h.fire(1800);await fallback;
  assert.equal(h.starterRequests,0,'a successful live opening does not fetch the static library');
  assert.ok(h.state().articles.every(id=>Number(id.slice(1))>=1000));
  h.requests[1]([]);await filling;
});

test('slow online startup never substitutes the fixed starter pool before the fresh draw arrives',async()=>{
  const h=harness(),fallback=h.run('startStartupFallback(fillGeneration)'),filling=h.run('fillQueue()');
  assert.equal(h.nodes.length,0);assert.equal(h.starterRequests,0);
  await h.fire(1800);await fallback;
  assert.equal(h.starterRequests,0);assert.equal(h.nodes.length,0);
  h.requests[0](batch(40,1000));await tick();assert.equal(h.state().articles[0],'w1000');
  h.requests[1]([]);await filling;
});

test('offline startup reshuffles the exact reserve and puts recently unread cards first',async()=>{
  const h=harness();h.add(batch(25));h.run('ensureFeedAhead()');h.persist();h.change('');
  h.context.navigator.onLine=false;h.context.history=[article(25)];
  h.context.shuffled=items=>[...items].reverse();
  const fallback=h.run('startStartupFallback(fillGeneration)');
  await h.fire(0);await fallback;
  assert.equal(h.state().articles[0],'w24');
  assert.equal(h.state().queue.at(-1),'w25');
  assert.equal(h.starterRequests,0);assert.equal(h.state().articles.length+h.state().queue.length,25);
});

test('a delayed starter response cannot enter a switched feed or replace live cards',async()=>{
  for(const action of ['change','live']){
    const h=harness();let deliver;
    h.context.navigator.onLine=false;
    h.context.fetch=path=>path.endsWith('index.json')?starterPool(path,()=>{}):new Promise(resolve=>{deliver=resolve;});
    const fallback=h.run('startStartupFallback(fillGeneration)'),timer=h.fire(0);
    if(action==='change')h.change("curMode='how';");
    h.add(batch(25,1000,action==='change'?'how':'wiki'));h.run('ensureFeedAhead()');
    for(let i=0;i<20&&!deliver;i++)await tick();deliver(Response.json(batch(30,1,action==='change'?'how':'wiki')));await timer;await fallback;
    assert.ok(h.state().articles.every(id=>Number(id.slice(1))>=1000));
    assert.ok(h.state().queue.every(id=>Number(id.slice(1))>=1000));
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

test('a pause after Wikimedia rate-limits the browser does not stop filtered travel, which uses WikiScroll\'s own server', async () => {
  const h=harness();
  h.change("curMode='how';travelFilters={place:'Japan',style:''};apiCooldownUntil=Date.now()+60000;");
  await h.run('fillQueue()');
  assert.equal(h.directCalls,1,'the filtered travel request is still made');
  assert.equal(h.requests.length,0,'the random-guide Worker batch is not used for filtered travel');
  h.change("curMode='how';travelFilters={place:'',style:''};apiCooldownUntil=Date.now()+60000;");
  const pending=h.run('fillQueue()');h.requests[0]([]);await pending;
  assert.equal(h.directCalls,1,'direct Wikimedia calls still wait out the pause');
});

test('a Wikimedia outage on an online opening shows the reserve, then the starter set, instead of an empty feed',async()=>{
  for(const reserve of [true,false]){
    const h=harness();
    if(reserve){h.add(batch(25,500));h.run('ensureFeedAhead()');h.persist();}
    h.change('');
    h.context.reply=new Response(null,{status:503,headers:{'Retry-After':'30'}});const reported=h.run(`noteWorkerCooldown(reply,fillGeneration,'wiki|en',{code:'upstream_unavailable'})`);
    await reported;await h.fire(0);await tick();
    const shown=[...h.state().articles,...h.state().queue];
    assert.ok(shown.length>0,'cards are shown during the outage');
    assert.equal(h.starterRequests,reserve?0:1,'the device reserve is preferred over the starter set');
    if(reserve)assert.ok(shown.every(id=>Number(id.slice(1))>=500));
  }
});
test('an outage report never replaces live cards or fires for non-upstream pauses',async()=>{
  const h=harness();h.add(batch(20,1000));h.run('ensureFeedAhead()');
  h.context.reply=new Response(null,{status:503});await h.run(`noteWorkerCooldown(reply,fillGeneration,'wiki|en',{code:'upstream_unavailable'})`);await h.fire(0);
  assert.equal(h.starterRequests,0);
  const fresh=harness();
  fresh.context.reply=new Response(null,{status:429});await fresh.run(`noteWorkerCooldown(reply,fillGeneration,'wiki|en',{code:'work_rate_limited'})`);await fresh.fire(0);
  assert.equal(fresh.starterRequests,0);assert.equal(fresh.nodes.length,0);
});

// Every setting a reader can choose, during a reported Wikimedia outage.
async function outageOpening(settings,reserves={}){
  const h=harness();h.change(settings);
  h.storage.set('ws_feed_reserves',JSON.stringify(reserves));
  h.context.reply=new Response(null,{status:503,headers:{'Retry-After':'30'}});
  await h.run(`noteWorkerCooldown(reply,fillGeneration,'x',{code:'upstream_rate_limited'})`);await h.fire(0);await tick();
  return h;
}
const shown=h=>[...h.state().articles,...h.state().queue];
const reserve=(key,items)=>({[key]:{at:Date.now(),items}});
test('an outage shows cards at every discovery depth, not only Balanced',async()=>{
  for(const depth of [1,2,3,4,5]){
    const h=await outageOpening(`depthLevel=${depth};`);
    assert.ok(shown(h).length>0,'depth '+depth+' shows cards');
    assert.equal(h.starterRequests,1);
  }
});
test('an outage prefers this device’s real cards from another depth over the starter set',async()=>{
  for(const depth of [1,2,4,5]){
    const h=await outageOpening(`depthLevel=${depth};`,reserve('topics-v5|wiki|en|3||',batch(20,700)));
    assert.ok(shown(h).length>0);assert.ok(shown(h).every(id=>Number(id.slice(1))>=700),'depth '+depth);
    assert.equal(h.starterRequests,0);
  }
});
test('an outage in another language uses that language’s saved cards and never English starter cards',async()=>{
  for(const depth of [1,3,5]){
    const empty=await outageOpening(`curLang='fr';depthLevel=${depth};`,reserve('topics-v5|wiki|en|3||',batch(20,700)));
    assert.deepEqual(shown(empty),[],'no English cards for a French reader');assert.equal(empty.starterRequests,0);
    const french=await outageOpening(`curLang='fr';depthLevel=${depth};`,reserve('topics-v5|wiki|fr|2||',batch(20,800).map(a=>({...a,url:a.url.replace('en.','fr.')}))));
    assert.ok(shown(french).length>0);assert.ok(shown(french).every(id=>Number(id.slice(1))>=800));
  }
});
test('an outage keeps topic and Help-only choices: only matching saved cards, never generic ones',async()=>{
  const topical=batch(10,900).map((a,i)=>({...a,topic:i<5?'science':'space'}));
  const topic=await outageOpening(`curTopics.add('science');depthLevel=5;`,reserve('topics-v5|wiki|en|3|science,space|',topical));
  assert.deepEqual(shown(topic).sort(),['w900','w901','w902','w903','w904']);assert.equal(topic.starterRequests,0);
  const none=await outageOpening(`curTopics.add('music');`);
  assert.deepEqual(shown(none),[]);assert.equal(none.starterRequests,0);
  const tagged=batch(6,950).map((a,i)=>i%2?a:{...a,needs:['citations']});
  const help=await outageOpening(`helpMode='only';depthLevel=1;`,reserve('topics-v5|wiki|en|3||',tagged));
  assert.deepEqual(shown(help).sort(),['w950','w952','w954']);assert.equal(help.starterRequests,0);
});
test('an outage covers unfiltered travel but never substitutes guides for a travel filter',async()=>{
  const voyage=await outageOpening(`curMode='how';`);
  assert.ok(shown(voyage).length>0);assert.ok(shown(voyage).every(id=>id.startsWith('v')));
  const filtered=await outageOpening(`curMode='how';travelFilters={place:'Japan',style:''};`,reserve('topics-v5|how|en|3||{"place":"","style":""}',batch(10,300,'how')));
  assert.deepEqual(shown(filtered),[]);assert.equal(filtered.starterRequests,0);
});
test('outage stand-ins are never saved as the current feed’s reserve and never evict another reserve',async()=>{
  const saved=reserve('topics-v5|wiki|en|3||',batch(20,700));
  const h=await outageOpening(`depthLevel=5;`,saved);
  assert.ok(shown(h).length>0);h.persist();
  const stored=JSON.parse(h.storage.get('ws_feed_reserves'));
  assert.equal(stored['topics-v5|wiki|en|5||'],undefined,'Balanced cards are not stored as an Obscure reserve');
  assert.equal(stored['topics-v5|wiki|en|3||'].items.length,20,'the source reserve is kept');
});
test('switching depth or filters while the source is paused for an outage still shows cards',async()=>{
  for(const settings of ['depthLevel=5;','depthLevel=1;','curTopics.add("science");']){
    const h=harness();
    h.storage.set('ws_feed_reserves',JSON.stringify(reserve('topics-v5|wiki|en|3||',batch(10,700).map(a=>({...a,topic:'science'})))));
    h.context.reply=new Response(null,{status:503,headers:{'Retry-After':'56'}});
    await h.run(`noteWorkerCooldown(reply,fillGeneration,workerSourceKey(),{code:'upstream_rate_limited'})`);await h.fire(0);await tick();
    h.change(settings+'restoreWorkerCooldown();');
    assert.equal((await h.run('liveFetchWorkerBatch(fillGeneration)')).length,0,'no request during the pause');
    await h.fire(0);await tick();
    assert.ok(shown(h).length>0,settings);
  }
});
test('a short non-outage pause never substitutes cards for a slow opening',async()=>{
  const h=harness();
  h.context.reply=new Response(null,{status:503,headers:{'Retry-After':'1'}});
  await h.run(`noteWorkerCooldown(reply,fillGeneration,workerSourceKey(),{code:'batch_pending'})`);await h.fire(0);
  h.run('restoreWorkerCooldown();');await h.run('liveFetchWorkerBatch(fillGeneration)');await h.fire(0);await tick();
  assert.deepEqual(shown(h),[]);assert.equal(h.starterRequests,0);
});
test('starter cards come from the reader’s own depth set and a random shard of it',async()=>{
  for(const depth of [1,2,3,4,5]){
    const h=harness();h.run(`depthLevel=${depth};`);h.context.navigator.onLine=false;
    const fallback=h.run('startStartupFallback(fillGeneration)');await h.fire(0);await fallback;
    assert.equal(h.starterPaths.length,1);assert.match(h.starterPaths[0],new RegExp(`^/data/starter/wiki-en-${depth}-00[01]\\.json$`));
    assert.ok(shown(h).every(id=>Math.floor(Number(id.slice(1))/10000)===depth),'only depth '+depth+' cards');
  }
  const shards=new Set();
  for(let i=0;i<40;i++){const h=harness();h.context.navigator.onLine=false;const f=h.run('startStartupFallback(fillGeneration)');await h.fire(0);await f;shards.add(h.starterPaths[0]);}
  assert.equal(shards.size,2,'visitors draw different shards');
  const voyage=harness();voyage.run("curMode='how';");voyage.context.navigator.onLine=false;
  const f=voyage.run('startStartupFallback(fillGeneration)');await voyage.fire(0);await f;
  assert.match(voyage.starterPaths[0],/^\/data\/starter\/how-en-00[01]\.json$/);
});
test('a depth without its own shards borrows Balanced cards only during an outage',async()=>{
  const sets={'wiki-en-3':1,'how-en':1};
  const offline=harness();offline.context.fetch=path=>starterPool(path,()=>offline.starterPaths.push(path),sets);
  offline.run('depthLevel=5;');offline.context.navigator.onLine=false;
  const f=offline.run('startStartupFallback(fillGeneration)');await offline.fire(0);await f;
  assert.deepEqual(shown(offline),[],'offline Obscure never shows Balanced cards');
  const h=harness();h.context.fetch=path=>starterPool(path,()=>h.starterPaths.push(path),sets);h.run('depthLevel=5;');
  h.context.reply=new Response(null,{status:503,headers:{'Retry-After':'30'}});
  await h.run(`noteWorkerCooldown(reply,fillGeneration,'x',{code:'upstream_unavailable'})`);await h.fire(0);await tick();await tick();
  assert.deepEqual([...h.starterPaths],['/data/starter/wiki-en-3-000.json']);assert.ok(shown(h).length>0);
});

// ── Card library ─────────────────────────────────────────────────────────────
const LIBRARY_SETS={'wiki-en-1':2,'wiki-en-2':2,'wiki-en-3':3,'wiki-en-4':2,'wiki-en-5':2,'how-en':2,
  'topic-en-geo-3':2,'help-en-sources-1':0,'help-en-sources-2':1,'help-en-sources-3':1,'help-en-sources-4':0,'help-en-sources-5':0,
  'help-en-images-3':1,'topic-en-geo-help-sources-3':1,'topic-en-geo-help-images-3':1};
const settle = async () => { for (let i=0; i<6; i++) { await new Promise(resolve => setImmediate(resolve)); await tick(); } };

test('the card library fills the feed without asking the Worker or Wikipedia', async () => {
  const h=harness({librarySets:LIBRARY_SETS});
  const filling=h.run('fillQueue()');await settle();await filling;
  assert.equal(h.requests.length,0);assert.equal(h.directCalls,0);
  assert.ok(h.state().queue.length+h.state().articles.length>=100);
  assert.ok(h.shards.every(s=>/^wiki-en-3\/[0-2]$/.test(s)),h.shards.join());
});

test('each library draw is a shard this visit has not drawn', async () => {
  const h=harness({librarySets:LIBRARY_SETS});
  for(let i=0;i<3;i++){h.change('');const filling=h.run('fillQueue()');await settle();await filling;}
  const depth3=h.shards.filter(s=>s.startsWith('wiki-en-3/'));
  assert.equal(new Set(depth3).size,3,'all three Balanced shards before any repeat');
});

test('topic, Help and their combination read their own prebuilt sets', async () => {
  const h=harness({librarySets:LIBRARY_SETS});
  h.change("curTopics=new Set(['geo']);");let filling=h.run('fillQueue()');await settle();await filling;
  assert.ok(h.shards.every(s=>s.startsWith('topic-en-geo-')&&!s.includes('help')));
  h.shards.length=0;h.change("helpMode='only';helpTypes=['sources','images'];");filling=h.run('fillQueue()');await settle();await filling;
  assert.ok(h.shards.length>=1&&h.shards.every(s=>/^topic-en-geo-help-(sources|images)-3\//.test(s)),h.shards.join());
  h.shards.length=0;h.change("curTopics=new Set();helpTypes=['sources'];");filling=h.run('fillQueue()');await settle();await filling;
  assert.equal(h.shards[0],'help-en-sources-3/0');
  assert.equal(h.requests.length,0);
});

test('a thin library setting borrows the nearest depth instead of the live API', async () => {
  const h=harness({librarySets:LIBRARY_SETS});
  h.change("depthLevel=1;helpMode='only';helpTypes=['sources'];");
  const filling=h.run('fillQueue()');await settle();await filling;
  assert.deepEqual(h.shards.slice(0,2),['help-en-sources-2/0','help-en-sources-3/0']);
  assert.equal(h.requests.length,0);assert.equal(h.directCalls,0);
});

test('a used-up library setting ends without falling back to the live feed', async () => {
  const h=harness({librarySets:LIBRARY_SETS});
  h.change("curTopics=new Set(['geo']);helpMode='only';helpTypes=['images'];");
  const filling=h.run('fillQueue()');await settle();await filling;
  assert.deepEqual(h.shards,['topic-en-geo-help-images-3/0']);
  assert.equal(h.run('libraryExhausted'),true);
  assert.equal(h.requests.length,0);assert.equal(h.directCalls,0);
  h.run('scheduleRefill()');assert.equal(h.run('refillTimer'),null,'no refills after the end');
});

test('the Worker serves when the library is unreachable or lacks the language', async () => {
  let h=harness({librarySets:null});
  let filling=h.run('fillQueue()');await settle();
  assert.equal(h.requests.length,1,'manifest failure falls back');h.requests[0]([]);await filling;
  h=harness({librarySets:LIBRARY_SETS});h.change("curLang='fr';");
  filling=h.run('fillQueue()');assert.equal(h.requests.length,1);assert.equal(h.shards.length,0);h.requests[0]([]);await filling;
});
