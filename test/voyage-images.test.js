import test from 'node:test';import assert from 'node:assert/strict';
import {completeVoyageImages,voyageImageCandidates} from '../worker/voyage-images.js';
const photo='https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Example.jpg/960px-Example.jpg';
const page=(title,images)=>({title,images:images.map(title=>({title}))});
const answer=names=>({query:{pages:Object.fromEntries(names.map((title,i)=>[i,{title,imageinfo:[{thumburl:photo,width:2100,height:300,thumbwidth:960,thumbheight:137}]}]))}});
test('guide photos are selected only from associated files, with banner priority and UI assets excluded',()=>{
 assert.deepEqual(voyageImageCandidates(page('Test',['File:Map mag.png','File:Flag of France.png','File:GPX Document.png','File:Town.jpg','File:Town Wikivoyage Banner.jpg','File:Asia default banner.jpg'])),['File:Town Wikivoyage Banner.jpg','File:Town.jpg']);
});
test('missing guide banners resolve in one batch and reuse cached successful metadata',async()=>{
 const pages=[page('First',['File:Image-test-first banner.jpg']),page('Second',['File:Image-test-second banner.jpg'])];let requests=0;
 await completeVoyageImages(pages,async url=>{requests++;const u=new URL(url);assert.equal(u.hostname,'commons.wikimedia.org');assert.equal(u.searchParams.get('iiurlwidth'),'960');return answer(u.searchParams.get('titles').split('|'));});
 assert.equal(requests,1);for(const p of pages){assert.equal(p.thumbnail.source,photo);assert.equal(p.voyageImagePending,undefined);}
 const repeat=page('First',['File:Image-test-first banner.jpg']);await completeVoyageImages([repeat],()=>{throw Error('cached lookup must not fetch');});assert.equal(repeat.thumbnail.source,photo);
});
test('selected PageImages thumbnails and guides without usable photos cost no extra request',async()=>{
 const existing={...page('Existing',['File:Any banner.jpg']),thumbnail:{source:photo}},empty=page('Empty',['File:Map mag.png']);
 await completeVoyageImages([existing,empty],()=>{throw Error('unexpected image request');});assert.equal(existing.thumbnail.source,photo);assert.equal(empty.thumbnail,undefined);
});
test('image lookup failures release pending cards and never fabricate an image',async()=>{
 const p=page('Failure',['File:Image-test-fail banner.jpg']);let finish;const job=completeVoyageImages([p],()=>new Promise(r=>finish=r));assert.equal(p.voyageImagePending,true);finish(null);await job;assert.equal(p.voyageImagePending,undefined);assert.equal(p.thumbnail,undefined);
 const second=page('Failure2',['File:Image-test-throw banner.jpg']);await completeVoyageImages([second],()=>{throw Error('upstream down');});assert.equal(second.voyageImagePending,undefined);
});
test('untrusted file URLs and tiny or external images are rejected',async()=>{
 const p=page('Bad',['https://evil.test/picture.jpg','File:Image-test-external.jpg','File:Image-test-tiny.jpg']);
 await completeVoyageImages([p],async()=>({query:{pages:{a:{title:'File:Image-test-external.jpg',imageinfo:[{thumburl:'https://evil.test/a.jpg',width:2000,height:1000}]},b:{title:'File:Image-test-tiny.jpg',imageinfo:[{thumburl:photo,width:20,height:20}]}}}}));assert.equal(p.thumbnail,undefined);
});
test('large guide sets use at most 50 candidate files in one request',async()=>{
 const ps=Array.from({length:100},(_,i)=>page('Guide'+i,[`File:Image-bounded-${i} banner.jpg`,`File:Image-bounded-${i}.jpg`]));let requests=0;
 await completeVoyageImages(ps,async url=>{requests++;assert.equal(new URL(url).searchParams.get('titles').split('|').length,50);return null;});assert.equal(requests,1);assert.ok(ps.every(p=>!p.voyageImagePending));
});
