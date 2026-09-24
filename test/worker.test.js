import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{renderUnfurl,retryDelay} from '../worker/index.js';

const allow={limit:async()=>({success:true})};
const env={REQUEST_LIMIT:allow,WORK_LIMIT:allow,RENDER_LIMIT:allow,ASSETS:{fetch:async()=>new Response('<html><body>WikiScroll app</body></html>',{headers:{'Content-Type':'text/html'}})}};
const ctx={waitUntil:()=>{}};
let moduleId=0;
const freshWorker=async()=> (await import(`../worker/index.js?case=${moduleId++}`)).default;
const page=(id,extra={})=>({ns:0,pageid:id,title:'Article '+id,extract:'A readable introduction with enough substance to make an interesting discovery card. '.repeat(2),thumbnail:{source:'https://upload.wikimedia.org/test.png'},...extra});
const data=pages=>Response.json({query:{pages:Object.fromEntries(pages.map(p=>[p.pageid,p]))}});
const request=query=>new Request('https://wikiscroll.com/api/articles?'+query);
function background(){const tasks=[];return {waitUntil:p=>tasks.push(p),done:()=>Promise.all(tasks)};}
function edgeCache(){const entries=new Map();return {entries,async match(key){return entries.get(key.url)?.clone();},async put(key,response){entries.set(key.url,response.clone());}};}
async function mocked(fetcher,run,cache){
  const originalFetch=globalThis.fetch,originalCaches=globalThis.caches;
  globalThis.fetch=fetcher;globalThis.caches=cache?{default:cache}:undefined;
  const jobs=background();
  try{return await run(await freshWorker(),jobs);}finally{await jobs.done();globalThis.fetch=originalFetch;globalThis.caches=originalCaches;}
}

test('human deep links receive the app, not crawler HTML',async()=>{
  const response=await worker.fetch(new Request('https://wikiscroll.com/?a=w123',{headers:{'User-Agent':'Mozilla/5.0'}}),env,ctx);
  assert.match(await response.text(),/WikiScroll app/);
  assert.equal(response.headers.get('Vary'),'User-Agent');
});
test('reject invalid article query parameters before upstream access',async()=>{
  for(const query of ['lang=evil.test','mode=bad','n=NaN','n=-1','n=200','n=1.5','batch=-1','batch=64','batch=1.5','depth=0','depth=6']){
    const response=await worker.fetch(request(query),env,ctx);
    assert.equal(response.status,400,query);
  }
});
test('API errors remain JSON and mutations are rejected',async()=>{
  assert.equal((await worker.fetch(new Request('https://wikiscroll.com/api/unknown'),env,ctx)).status,404);
  assert.equal((await worker.fetch(new Request('https://wikiscroll.com/api/articles',{method:'POST'}),env,ctx)).status,405);
});
test('unfurl escapes article text and request URL',()=>{
  const html=renderUnfurl({title:'<script>alert(1)</script>',body:'"<img onerror=x>',img:'https://example.test/" onload="evil'},'https://wikiscroll.com/?a=w1&lang=en','en');
  assert.ok(!html.includes('<script>'));
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/&amp;lang=en/);
});
test('Retry-After seconds and HTTP dates are honored',()=>{
  assert.equal(retryDelay('180',0),180000);
  assert.equal(retryDelay('Thu, 01 Jan 1970 00:03:00 GMT',0),180000);
  assert.equal(retryDelay(null,0),30000);
});
test('cold supply makes two concurrent calls and deduplicates candidates',async()=>{
  let count=0,active=0,peak=0;
  await mocked(async url=>{
    if(!new URL(url).searchParams.has('generator'))return data([]); // pageview completion
    count++;active++;peak=Math.max(peak,active);
    assert.equal(new URL(url).searchParams.get('grnlimit'),'20');
    await new Promise(r=>setTimeout(r,2));active--;
    return data([page(1),page(-1),page(2,{extract:'tiny'}),page(3,{thumbnail:null})]);
  },async(api,jobs)=>{
    const response=await api.fetch(request('n=40'),env,jobs);
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).articles.map(a=>a.id),['w1']);
    await jobs.done();assert.equal(count,2);assert.equal(peak,2);
  });
});
test('first good batch is delivered without waiting for its slow sibling',async()=>{
  let count=0,finish;
  const slow=new Promise(resolve=>{finish=resolve;});
  const cache=edgeCache();
  await mocked(async url=>!new URL(url).searchParams.has('generator')?data([]):++count===1?data([page(1)]):slow,async(api,jobs)=>{
    try{
      const response=await api.fetch(request('n=20'),env,jobs);
      assert.deepEqual((await response.json()).articles.map(a=>a.id),['w1']);
    }finally{finish(data([page(2)]));}
    await jobs.done();
    const cached=await api.fetch(request('n=20'),env,jobs);
    assert.equal(cached.headers.get('X-Cache'),'HIT');
    assert.deepEqual(new Set((await cached.json()).articles.map(a=>a.id)),new Set(['w1','w2']));
    assert.equal(count,2);
  },cache);
});
test('overlapping requests share in-flight work; batch and depth have distinct cache entries',async()=>{
  let count=0;const cache=edgeCache();
  await mocked(async url=>{if(!new URL(url).searchParams.has('generator'))return data([]);const id=++count;await new Promise(r=>setTimeout(r,2));return data([page(id)]);},async(api,jobs)=>{
    const pair=await Promise.all([api.fetch(request('batch=3&depth=3&n=20'),env,jobs),api.fetch(request('batch=3&depth=3&n=40'),env,jobs)]);
    assert.ok(pair.every(r=>r.status===200));await jobs.done();assert.equal(count,2);
    await api.fetch(request('batch=3&depth=3&n=1'),env,jobs);assert.equal(count,2);
    await api.fetch(request('batch=4&depth=3'),env,jobs);await jobs.done();
    await api.fetch(request('batch=3&depth=4'),env,jobs);await jobs.done();
    assert.equal(count,6);assert.equal(cache.entries.size,3);
  },cache);
});
test('stale edge supply is returned while a refresh runs in the background',async()=>{
  const cache=edgeCache();const key=new Request('https://wikiscroll.com/api/articles?version=5&mode=wiki&lang=en&depth=3&batch=8');
  await cache.put(key,Response.json({articles:[{id:'w9',title:'Previously cached'}],cached_at:new Date(Date.now()-120000).toISOString()}));
  let finish;const slow=new Promise(resolve=>{finish=resolve;});
  await mocked(async()=>slow,async(api,jobs)=>{
    try{
      const response=await api.fetch(request('batch=8'),env,jobs);
      assert.equal(response.headers.get('X-Cache'),'STALE');
      const result=await response.json();assert.equal(result.stale,true);assert.equal(result.articles[0].id,'w9');
    }finally{finish(data([page(10)]));}
    await jobs.done();
    const refreshed=await api.fetch(request('batch=8'),env,jobs);
    assert.equal(refreshed.headers.get('X-Cache'),'HIT');assert.equal((await refreshed.json()).articles[0].id,'w10');
  },cache);
});
test('edge cache failures do not block usable upstream articles',async()=>{
  const broken={async match(){throw Error('unavailable');},async put(){throw Error('unavailable');}};
  await mocked(async()=>data([page(1)]),async(api,jobs)=>{
    const response=await api.fetch(request(''),env,jobs);assert.equal(response.status,200);
    await jobs.done();
  },broken);
});
test('depth prefers qualifying candidates without discarding the readable fallback',async()=>{
  await mocked(async()=>data([page(1,{pageviews:{a:1,b:1}}),page(2,{pageviews:{a:50,b:30}})]),async(api,jobs)=>{
    const response=await api.fetch(request('depth=3'),env,jobs);
    assert.deepEqual((await response.json()).articles.map(a=>a.id),['w2','w1']);
  });
});
test('depth selects distinct balanced, niche and obscure pools instead of sorting the same articles',async()=>{
  const candidates=[
    ...Array.from({length:6},(_,i)=>page(i+1,{pageviews:{a:50,b:50}})),
    ...Array.from({length:6},(_,i)=>page(i+11,{pageviews:{a:5,b:5}})),
    ...Array.from({length:6},(_,i)=>page(i+21,{pageviews:{a:1,b:1}})),
  ];
  await mocked(async url=>{
    assert.ok(new URL(url).searchParams.get('prop').split('|').includes('pageviews'));
    return data(candidates);
  },async(api,jobs)=>{
    for(const [depth,start] of [[3,1],[4,11],[5,21]]){
      const response=await api.fetch(request('n=40&depth='+depth),env,jobs);
      const ids=(await response.json()).articles.map(a=>a.id);
      assert.deepEqual(new Set(ids),new Set(Array.from({length:6},(_,i)=>'w'+(start+i))),`depth ${depth}`);
      await jobs.done();
    }
  });
});
test('missing metrics do not qualify as obscure; a sparse response has at most three nearby fallbacks',async()=>{
  const candidates=[page(1,{pageviews:{a:0,b:2}}),page(2,{pageviews:{a:3}}),page(3,{pageviews:{a:4}}),page(4,{pageviews:{a:5}}),
    page(5,{pageviews:{a:1000}}),page(6,{pageviews:{a:null,b:null}}),page(7),page(8,{pageviews:{a:-1}})];
  await mocked(async()=>data(candidates),async(api,jobs)=>{
    const response=await api.fetch(request('n=40&depth=5'),env,jobs);
    const ids=(await response.json()).articles.map(a=>a.id);
    assert.equal(ids[0],'w1');assert.deepEqual(new Set(ids),new Set(['w1','w2','w3','w4']));
  });
});
test('depth shuffles eligible candidates and caps both the partial and completed cache at twenty',async()=>{
  const candidates=Array.from({length:40},(_,i)=>page(i+1,{pageviews:{a:20}}));
  const originalRandom=Math.random,cache=edgeCache();let count=0;
  Math.random=()=>0;
  try{
    await mocked(async()=>data(candidates.slice((count++%2)*20,(count%2?20:40))),async(api,jobs)=>{
      const response=await api.fetch(request('n=40&depth=3'),env,jobs);
      const partial=(await response.json()).articles.map(a=>a.id);
      assert.equal(partial.length,20);assert.notDeepEqual(partial,Array.from({length:20},(_,i)=>'w'+(i+1)));
      await jobs.done();
      const cached=await api.fetch(request('n=40&depth=3'),env,jobs);
      assert.equal(cached.headers.get('X-Cache'),'HIT');
      assert.equal((await cached.json()).articles.length,20);
    },cache);
  }finally{Math.random=originalRandom;}
});
test('a rate limit pauses only the affected source host',async()=>{
  const seen=[];
  await mocked(async url=>{
    const host=new URL(url).hostname;seen.push(host);
    return host==='en.wikipedia.org'?new Response('',{status:429,headers:{'Retry-After':'30'}}):data([page(1)]);
  },async(api,jobs)=>{
    const first=await api.fetch(request('mode=wiki'),env,jobs);assert.equal(first.status,503);assert.ok(Number(first.headers.get('Retry-After'))>=29);
    const firstCount=seen.length;
    const second=await api.fetch(request('mode=wiki&batch=1'),env,jobs);assert.equal(second.status,503);assert.equal(seen.length,firstCount);
    const voyage=await api.fetch(request('mode=how'),env,jobs);assert.equal(voyage.status,200);
    assert.equal((await voyage.json()).articles[0].id,'v1');
  });
});
test('one six-second deadline bounds both upstream calls, including ignored aborts',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const signals=[];
  await mocked(async(url,options)=>{signals.push(options.signal);return new Promise(()=>{});},async(api,jobs)=>{
    const pending=api.fetch(request(''),env,jobs);
    await new Promise(setImmediate);
    assert.equal(signals.length,2);
    t.mock.timers.tick(6000);
    const response=await pending;assert.equal(response.status,503);
    assert.ok(signals.every(signal=>signal.aborted));
  });
});
test('bot deep links get article-specific metadata',async()=>{
  let upstreamURL='';
  await mocked(async url=>{upstreamURL=String(url);return data([page(123,{title:'Atlas',extract:'A collection of maps.'})]);},async(api,jobs)=>{
    const response=await api.fetch(new Request('https://wikiscroll.com/?a=w123&lang=fr',{headers:{'User-Agent':'Twitterbot'}}),env,jobs);
    assert.match(await response.text(),/Atlas \| WikiScroll/);
    assert.match(upstreamURL,/fr.wikipedia.org/);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  });
});
test('travel filters are relayed to Wikivoyage and preserve pagination without requiring photos',async()=>{
 let upstreamURL;
 await mocked(async url=>{upstreamURL=new URL(url);return Response.json({query:{pages:{7:page(7,{thumbnail:undefined,title:'Kyoto'})}},continue:{gsroffset:20}});},async worker=>{
 const response=await worker.fetch(new Request('https://wikiscroll.com/api/travel?lang=en&place=Japan&style=culture'),env,ctx);
 assert.equal(response.status,200);const body=await response.json();assert.equal(body.articles[0].src,'how');assert.equal(body.articles[0].img,'');assert.equal(body.next,20);
 assert.equal(upstreamURL.hostname,'en.wikivoyage.org');assert.match(upstreamURL.searchParams.get('gsrsearch'),/Japan/);
 });
});
test('travel filters reject invalid offsets and unknown styles before contacting Wikimedia',async()=>{
 await mocked(()=>{throw Error('unexpected upstream request')},async worker=>{
 for(const query of ['offset=-1&place=Japan','place=Japan&style=__proto__','lang=bogus&place=Japan'])assert.equal((await worker.fetch(new Request('https://wikiscroll.com/api/travel?'+query),env,ctx)).status,400);
 });
});

test('pageviews are completed five at a time so depth sees every candidate, not only early-alphabet titles',async()=>{
  const views={a:40,b:40};const chunks=[];
  // Wikimedia reports views for the first five pages only; the rest must be completed.
  const random=Array.from({length:20},(_,i)=>page(i+1,i<5?{pageviews:views}:{}));
  await mocked(async url=>{
    const p=new URL(url).searchParams;
    if(p.has('generator')){assert.match(p.get('prop'),/description/);return data(random);}
    assert.equal(p.get('prop'),'pageviews');const ids=p.get('pageids').split('|');chunks.push(ids.length);
    return data(ids.map(id=>({pageid:Number(id),pageviews:views})));
  },async(api,jobs)=>{
    const response=await api.fetch(request('n=40&depth=3'),env,jobs);
    const ids=(await response.json()).articles.map(a=>a.id);
    assert.equal(ids.length,20);assert.ok(ids.includes('w20'));
    assert.ok(chunks.length>=3&&chunks.every(n=>n<=5));
  });
});
test('zero-view days count as zero, publication-lag days are ignored, and unknown pages stay unknown',async()=>{
  const {averageViews,lagDays}=await import('../worker/pageviews.js');
  const pages=[{pageviews:{d1:4,d2:null,d3:0,d4:null}},{pageviews:{d1:9,d2:3,d3:null,d4:null}},{pageviews:{d1:null,d2:null,d3:null,d4:null}},{}];
  const lag=lagDays(pages);
  assert.deepEqual([...lag],['d4']);
  assert.equal(averageViews(pages[0],lag),4/3);
  assert.equal(averageViews(pages[1],lag),4);
  assert.equal(averageViews(pages[2],lag),null);
  assert.equal(averageViews(pages[3],lag),null);
});
test('card descriptions are relayed and disambiguation pages are dropped',async()=>{
  await mocked(async url=>{
    if(!new URL(url).searchParams.has('generator'))return data([]);
    return data([page(1,{description:'Species of beetle',pageviews:{a:20}}),page(2,{description:'Topics referred to by the same term',pageviews:{a:20}})]);
  },async(api,jobs)=>{
    const articles=(await (await api.fetch(request('depth=3'),env,jobs)).json()).articles;
    assert.deepEqual(articles.map(a=>[a.id,a.desc]),[['w1','Species of beetle']]);
  });
});
test('search crawlers get the canonical app; preview pages are never indexed',async()=>{
  for(const agent of ['Mozilla/5.0 (compatible; Googlebot/2.1)','Mozilla/5.0 (compatible; bingbot/2.0)']){
    const response=await worker.fetch(new Request('https://wikiscroll.com/?a=w123',{headers:{'User-Agent':agent}}),env,ctx);
    assert.match(await response.text(),/WikiScroll app/,agent);
  }
  await mocked(async()=>data([page(123,{title:'Atlas',extract:'A collection of maps.'})]),async(api,jobs)=>{
    const response=await api.fetch(new Request('https://wikiscroll.com/?a=w123',{headers:{'User-Agent':'facebookexternalhit/1.1'}}),env,jobs);
    assert.equal(response.headers.get('X-Robots-Tag'),'noindex');
    assert.match(await response.text(),/<meta name="robots" content="noindex,follow">/);
  });
});
test('languages without a Wikivoyage edition receive English guides',async()=>{
  const hosts=[];
  await mocked(async url=>{const u=new URL(url);hosts.push(u.hostname);return data([page(4,{title:'Seoul',thumbnail:undefined})]);},async(api,jobs)=>{
    for(const lang of ['ko','ar','hi']){
      const response=await api.fetch(request(`mode=how&lang=${lang}&batch=${lang.charCodeAt(0)%60}`),env,jobs);
      assert.equal(response.status,200,lang);
    }
    const travel=await api.fetch(new Request('https://wikiscroll.com/api/travel?lang=ko&place=Seoul'),env,jobs);
    assert.equal(travel.status,200);
  });
  assert.ok(hosts.length&&hosts.every(h=>h==='en.wikivoyage.org'),hosts.join());
});
test('Wikivoyage candidates arrive without text, then introductions load in parallel chunks of five',async()=>{
  const chunks=[];let randomProps;
  const guides=Array.from({length:20},(_,i)=>({ns:0,pageid:i+1,title:'Guide '+(i+1)}));
  await mocked(async url=>{
    const p=new URL(url).searchParams;
    if(p.has('generator')){randomProps=p.get('prop');return data(guides);}
    assert.equal(p.get('prop'),'extracts');const ids=p.get('pageids').split('|');chunks.push(ids.length);
    return data(ids.map(id=>({pageid:Number(id),extract:'A walkable old town with markets, museums and a river promenade.'})));
  },async(api,jobs)=>{
    const response=await api.fetch(request('mode=how&lang=de&n=40'),env,jobs);
    assert.equal((await response.json()).articles.length,20);
  });
  assert.doesNotMatch(randomProps,/extracts/);
  assert.equal(chunks.length,4);assert.ok(chunks.every(n=>n===5));
});
test('depth bands follow each Wikipedia edition\'s readership',async()=>{
  // 1.5 views a day is Niche on English Wikipedia but Balanced on Dutch (scale 0.1).
  const candidates=[page(1,{pageviews:{a:1.5,b:1.5}}),...Array.from({length:6},(_,i)=>page(i+2,{pageviews:{a:0.05,b:0.05}}))];
  await mocked(async url=>new URL(url).searchParams.has('generator')?data(candidates):data([]),async(api,jobs)=>{
    const nl=(await (await api.fetch(request('lang=nl&depth=3&n=40'),env,jobs)).json()).articles.map(a=>a.id);
    await jobs.done();
    const en=(await (await api.fetch(request('lang=en&depth=4&n=40'),env,jobs)).json()).articles.map(a=>a.id);
    assert.equal(nl[0],'w1');assert.ok(en.includes('w1'));
  });
});
test('shared collections keep images from the current Wikimedia thumbnail host',async()=>{
  const {verifiedArticle}=await import('../worker/verified.js?thumbs');
  await mocked(async()=>data([page(77,{title:'Kyoto',extract:'A city of temples.',thumbnail:{source:'https://thumb.wikimedia.org/wikipedia/commons/thumb/k/ky/Kyoto.jpg/1200px-Kyoto.jpg'}})]),async()=>{
    const meta=await verifiedArticle('w77','en',env,{waitUntil(){}});
    assert.match(meta.img,/^https:\/\/thumb\.wikimedia\.org\//);
  });
  const c={v:1,name:'Trip',items:[{id:'w77',lang:'en',title:'Kyoto',body:'A city of temples.'}]};
  const encoded=Buffer.from(JSON.stringify(c)).toString('base64url');
  await mocked(async()=>data([page(77,{title:'Kyoto',extract:'A city of temples.',thumbnail:{source:'https://thumb.wikimedia.org/k.jpg'}})]),async(api,jobs)=>{
    const response=await api.fetch(new Request('https://wikiscroll.com/collection?c='+encoded),env,jobs);
    assert.match(response.headers.get('Content-Security-Policy'),/img-src 'self' https:\/\/upload\.wikimedia\.org https:\/\/thumb\.wikimedia\.org/);
    assert.match(await response.text(),/src="https:\/\/thumb\.wikimedia\.org\/k\.jpg"/);
  });
});
test('every response asks browsers to keep using HTTPS',async()=>{
  const response=await worker.fetch(new Request('https://wikiscroll.com/'),env,ctx);
  assert.equal(response.headers.get('Strict-Transport-Security'),'max-age=31536000');
});
const settle=async(n=20)=>{for(let i=0;i<n;i++)await new Promise(setImmediate);};
test('a slow cold batch answers within the browser\'s patience with the cards already complete',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const guides=Array.from({length:20},(_,i)=>({ns:0,pageid:i+1,title:'Guide '+(i+1)}));
  const later=(ms,value)=>new Promise(resolve=>setTimeout(()=>resolve(value),ms));
  let chunk=0;
  await mocked(async url=>{
    const p=new URL(url).searchParams;
    if(p.has('generator'))return later(1000,data(guides));
    // One introduction chunk is quick; three arrive just inside their own 6 s
    // deadline, which would push the whole answer past 7 s.
    const ids=p.get('pageids').split('|'),text='A walkable old town with markets, museums and a river promenade.';
    return later(chunk++===0?300:5900,data(ids.map(id=>({pageid:Number(id),extract:text}))));
  },async(api,jobs)=>{
    let response;const pending=api.fetch(request('mode=how&lang=de&n=40&batch=9'),env,jobs).then(r=>response=r);
    await settle();
    for(const ms of [1000,300,5000])t.mock.timers.tick(ms),await settle();
    assert.equal(response,undefined);
    t.mock.timers.tick(200);await settle();await pending;
    assert.equal(response.status,200);
    assert.equal((await response.json()).articles.length,5);
    t.mock.timers.tick(2000);await settle();
  });
});
test('Popular answers with its complete cards when a slow introduction misses the budget',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const later=(ms,value)=>new Promise(resolve=>setTimeout(()=>resolve(value),ms));
  const titles=Array.from({length:600},(_,i)=>'Essential '+i);
  let chunk=0;
  await mocked(async url=>{
    const p=new URL(url).searchParams;
    if(p.get('prop')==='links'){
      // The Level 3 list; Level 4 is left empty so it stays out of the way.
      const all=p.get('titles').endsWith('Level 3')?titles:[],start=Number(p.get('plcontinue')||0);
      return Response.json({query:{pages:{1:{links:all.slice(start,start+500).map(title=>({ns:0,title}))}}},...(start+500<all.length?{continue:{plcontinue:String(start+500)}}:{})});
    }
    if(p.get('prop')==='categories')return Response.json({query:{pages:{}}});
    if(p.get('prop')==='extracts'){
      // One chunk of five arrives quickly; the others only just inside their own 6 s deadline.
      const ids=p.get('pageids').split('|');
      return later(chunk++===0?300:5900,data(ids.map(id=>({pageid:Number(id),extract:'An essential subject that every curious reader eventually meets. '.repeat(2)}))));
    }
    return data(p.get('titles').split('|').map((title,i)=>page(2000+i,{title,extract:undefined})));
  },async(api,jobs)=>{
    let response;const pending=api.fetch(request('mode=wiki&lang=en&depth=1&n=40&batch=3'),env,jobs).then(r=>response=r);
    await settle(60);
    t.mock.timers.tick(300);await settle(60);
    t.mock.timers.tick(6200);await settle(60);await pending;
    assert.equal(response.status,200,'ready cards are not discarded as a 503');
    assert.equal((await response.json()).articles.length,5);
    t.mock.timers.tick(2000);await settle(60);
  });
});
test('filtered travel answers within its budget, leaving out guides whose text is late',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const later=(ms,value)=>new Promise(resolve=>setTimeout(()=>resolve(value),ms));
  let chunk=0;
  await mocked(async url=>{
    const p=new URL(url).searchParams;
    if(p.has('generator'))return later(3000,data(Array.from({length:10},(_,i)=>({pageid:i+1,title:'Town '+(i+1)}))));
    const ids=p.get('pageids').split('|');
    return later(chunk++===0?500:5800,data(ids.map(id=>({pageid:Number(id),extract:'A harbour town with ferries to the islands and a busy fish market.'}))));
  },async(api,jobs)=>{
    let response;const pending=api.fetch(new Request('https://wikiscroll.com/api/travel?lang=en&place=Norway'),env,jobs).then(r=>response=r);
    await settle();
    // Search 3 s, first text chunk 3.5 s, the rest 8.8 s: past the 8.5 s budget.
    for(const ms of [3000,500,4800])t.mock.timers.tick(ms),await settle();
    assert.equal(response,undefined);
    t.mock.timers.tick(200);await settle();await pending;
    assert.equal(response.status,200);
    assert.equal((await response.json()).articles.length,5);
    t.mock.timers.tick(1000);await settle();
  });
});

test('a Known batch borrowed from Popular is served but never cached',async()=>{
  const cache=edgeCache();
  const essentials=Array.from({length:600},(_,i)=>'Essential '+i);
  await mocked(async address=>{
    const p=new URL(address).searchParams;
    // Level 3 is available; Level 4 is not assembled yet.
    if(p.get('prop')==='links')return Response.json({query:{pages:{1:{links:p.get('titles').endsWith('Level 3')?essentials.map(title=>({ns:0,title})):[]}}}});
    if(p.get('prop')==='extracts')return data(p.get('pageids').split('|').map(id=>page(Number(id))));
    if(p.has('titles'))return data(p.get('titles').split('|').map((title,i)=>page(100+i,{title})));
    return data([]);
  },async(api,jobs)=>{
    const known=await api.fetch(request('depth=2&batch=5&n=40'),env,jobs);await jobs.done();
    assert.equal(known.status,200);assert.ok((await known.json()).articles.length>0,'the reader still gets cards');
    const keys=[...cache.entries.keys()].filter(k=>k.includes('/api/articles'));
    assert.deepEqual(keys,[],'no Known entry is stored');
    await api.fetch(request('depth=1&batch=5&n=40'),env,jobs);await jobs.done();
    assert.equal([...cache.entries.keys()].filter(k=>k.includes('/api/articles')&&k.includes('depth=1')).length,1,'Popular is cached as usual');
  },cache);
});
test('every copy of the supported language list is identical',async()=>{
  const {readFileSync}=await import('node:fs');
  const {LANGS}=await import('../worker/languages.js');
  const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
  const shared=[...LANGS].sort();
  assert.equal(shared.length,15);
  // The router and shared collections use the one Worker list.
  for(const file of ['worker/index.js','worker/collections.js']){
    assert.match(read(file),/import \{LANGS( as languages)?\} from '\.\/languages\.js';/,file);
    assert.doesNotMatch(read(file),/'ar','hi','ko'|'en es fr/,file+' keeps no copy of its own');
  }
  const reader=[...read('public/app.js').match(/const LANGS = \[([\s\S]*?)\];/)[1].matchAll(/c:'([a-z]{2})'/g)].map(m=>m[1]).sort();
  assert.deepEqual(reader,shared);
});
test('the API sends no CORS headers, so other sites cannot spend its budget',async()=>{
  const invalid=await worker.fetch(request('lang=evil.test'),env,ctx);
  assert.equal(invalid.headers.get('Access-Control-Allow-Origin'),null);
  const preflight=await worker.fetch(new Request('https://wikiscroll.com/api/articles',{method:'OPTIONS'}),env,ctx);
  assert.equal(preflight.status,405);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),null);
  assert.equal(preflight.headers.get('Allow'),'GET, HEAD');
  const {readFileSync}=await import('node:fs');
  for(const file of ['worker/index.js','worker/today.js','worker/topics.js','worker/collections.js'])
    assert.doesNotMatch(readFileSync(new URL('../'+file,import.meta.url),'utf8'),/Access-Control-Allow-Origin/,file);
});
test('complete travel pages are shared from the edge cache; partial pages are not cached',async t=>{
  const cache=edgeCache();let searches=0;
  await mocked(async url=>{const p=new URL(url).searchParams;if(p.has('generator')){searches++;return Response.json({query:{pages:{7:page(7,{title:'Kyoto',extract:undefined})}},continue:{gsroffset:20}});}
    return Response.json({query:{pages:{7:{pageid:7,extract:'A historic city with temples, gardens and a famous market street.'}}}});},async(worker,jobs)=>{
    const ask=place=>worker.fetch(new Request('https://wikiscroll.com/api/travel?lang=en&style=culture&place='+place),env,jobs);
    const first=await ask('Japan');await jobs.done();
    assert.equal(first.headers.get('X-Cache'),'MISS');
    const again=await ask('%20japan%20%20');
    assert.equal(again.headers.get('X-Cache'),'HIT','the same destination in other spacing or case is the same page');
    assert.equal(searches,1);assert.equal((await again.json()).articles[0].title,'Kyoto');
  },cache);
  t.mock.timers.enable({apis:['setTimeout']});
  const partial=edgeCache();
  await mocked(async url=>{const p=new URL(url).searchParams;if(p.has('generator'))return Response.json({query:{pages:{8:page(8,{title:'Nara',extract:undefined})}}});return new Promise(()=>{});},async(worker,jobs)=>{
    const pending=worker.fetch(new Request('https://wikiscroll.com/api/travel?lang=en&place=Nara'),env,jobs);
    await settle();t.mock.timers.tick(8600);await settle();
    const response=await pending;assert.equal(response.status,200);
    assert.equal(partial.entries.size,0,'a page missing introductions is never cached');
    t.mock.timers.tick(7000);await settle();
  },partial);
});
