import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {collectionResponse,decodeCollection,encodeCollection} from '../worker/collections.js';
const allow={limit:async()=>({success:true})},deny={limit:async()=>({success:false})};
const env={REQUEST_LIMIT:allow,WORK_LIMIT:allow,RENDER_LIMIT:allow,ASSETS:{fetch:async()=>new Response('app')}};
const payload={v:1,name:'A list',items:[{id:'w123',lang:'en',title:'FORGED TITLE',body:'FORGED EXCERPT'}]};
const req=(path='/collection',c=payload,method='GET')=>new Request('https://wikiscroll.com'+path+'?c='+encodeCollection(c),{method});
async function fixture(fn){
 const originalFetch=globalThis.fetch,originalCaches=globalThis.caches;let calls=0;const entries=new Map(),jobs=[];
 globalThis.caches={default:{match:async k=>entries.get(k.url)?.clone(),put:async(k,v)=>{entries.set(k.url,v.clone());}}};
 globalThis.fetch=async()=>{calls++;return Response.json({query:{pages:{123:{ns:0,pageid:123,title:'Verified article',extract:'Verified source text.'}}}});};
 const ctx={waitUntil:p=>jobs.push(p)};
 try{await fn(ctx,()=>calls);}finally{await Promise.all(jobs);globalThis.fetch=originalFetch;globalThis.caches=originalCaches;}
}
test('HTML, image input, and import API discard forged article text and share cached verification',async()=>fixture(async(ctx,count)=>{
 const r=await worker.fetch(req(),env,ctx);const html=await r.text();
 assert.equal(r.status,200);assert.match(html,/Verified article/);assert.doesNotMatch(html,/FORGED/);
 const result=await worker.fetch(req('/api/collection'),env,ctx);assert.equal((await result.json()).items[0].title,'Verified article');assert.equal(count(),1);
 assert.match(r.headers.get('Content-Security-Policy'),/default-src 'none'/);assert.equal(r.headers.get('X-Frame-Options'),'DENY');
}));
test('canonical decoding discards ignored properties',()=>{
 assert.deepEqual(decodeCollection(encodeCollection({...payload,nonce:1,items:payload.items.map(a=>({...a,nonce:2}))})),payload);
});
test('HEAD preview never verifies articles or renders an image',async()=>fixture(async(ctx,count)=>{
 const r=await worker.fetch(req('/collection.png',payload,'HEAD'),env,ctx);assert.equal(r.status,200);assert.equal(await r.text(),'');assert.equal(count(),0);
}));
test('denied and missing request limits fail closed before expensive work',async()=>fixture(async(ctx,count)=>{
 for(const limit of [deny,undefined]){const r=await worker.fetch(req(),{...env,REQUEST_LIMIT:limit},ctx);assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'60');assert.equal(r.headers.get('X-Frame-Options'),'DENY');}assert.equal(count(),0);
}));
test('upstream work limit fails closed; supplied text is never fallback',async()=>fixture(async(ctx,count)=>{
 const r=await worker.fetch(req(),{...env,WORK_LIMIT:deny},ctx);assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/FORGED/);assert.equal(count(),0);
}));
test('repeated spoofed crawler requests share canonical metadata despite arbitrary query strings',async()=>fixture(async(ctx,count)=>{
 for(let i=0;i<3;i++){const r=await worker.fetch(new Request('https://wikiscroll.com/?a=w123&noise='+i,{headers:{'User-Agent':'Twitterbot'}}),env,ctx);assert.match(await r.text(),/Verified article/);}assert.equal(count(),1);
}));
test('source outage does not present forged shared text as Wikimedia content',async()=>fixture(async(ctx)=>{
 globalThis.fetch=async()=>new Response('unavailable',{status:503});
 const r=await worker.fetch(req('/api/collection'),env,ctx);assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/FORGED/);
}));
