import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function harness(){
 const timers=new Map(),started=[],handlers=new Map();let id=0;
 class Image {set src(v){this.url=v;if(v)started.push(this);}get src(){return this.url;}}
 const card={querySelector:()=>({getAttribute:()=> 'https://image/current'})};
 const context=vm.createContext({Image,HTMLImageElement:Image,navigator:{onLine:true},document:{hidden:false,querySelectorAll:()=>[card],addEventListener:(name,fn)=>handlers.set(name,fn)},getCurrentFeedCard:()=>card,queue:Array.from({length:24},(_,i)=>({img:'https://image/'+i})),setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(source.slice(source.indexOf('const _imgCache = new Map();'),source.indexOf('function feedContextKey()')),context);
 vm.runInContext(source.slice(source.indexOf('function finishImageFallback'),source.indexOf('function toast')),context);
 return {context,started,timers,handlers,Image,run:code=>vm.runInContext(code,context),tick(ms){for(const [id,t] of [...timers])if(t.ms===ms){timers.delete(id);t.fn();}}};
}
test('image preloading prioritizes the visible card and caps active speculative requests',()=>{
 const h=harness();h.run('preloadQueueImages()');assert.equal(h.started.length,4);assert.equal(h.started[0].src,'https://image/current');
 h.started[0].onload();assert.equal(h.started.length,5);assert.equal(h.run('imageLoads'),4);
 h.run('preloadQueueImages()');assert.equal(h.started.length,5);
});
test('failed preloads release slots, retry once, and never block card data',()=>{
 const h=harness();h.run('preloadQueueImages()');const failed=h.started[0];failed.onerror();assert.equal(h.started.length,5);
 // Release the other active loads, then the one delayed retry can run.
 for(let i=1;i<h.started.length;i++)h.started[i].onload?.();h.tick(1500);
 const retries=h.started.filter(i=>i.src==='https://image/current');assert.equal(retries.length,2);retries[1].onerror();h.tick(1500);
 assert.equal(h.started.filter(i=>i.src==='https://image/current').length,2);assert.equal(h.run('queue.length'),24);
});
test('stale/offline image preloads do not start a retry',()=>{
 const h=harness();h.run('preloadQueueImages()');h.started[0].onerror();h.run('imageTargets=[]');h.tick(1500);assert.equal(h.started.length,5);
 h.run('navigator.onLine=false; imageTargets=["https://image/new"]; preloadImg(imageTargets[0]); pumpImageLoads()');assert.equal(h.started.length,5);
});
test('visible image retries once, preserves fallback, and ignores detached elements',()=>{
 const h=harness(),img=new h.Image();let removed=0;
 Object.assign(img,{dataset:{fallback:'remove'},isConnected:true,getAttribute:()=> 'https://image/photo',remove:()=>removed++});
 h.handlers.get('error')({target:img});assert.equal(removed,0);h.tick(1500);assert.equal(img.src,'https://image/photo');
 h.handlers.get('error')({target:img});assert.equal(removed,1);
 const detached=new h.Image();Object.assign(detached,{dataset:{fallback:'remove'},isConnected:false,getAttribute:()=> 'https://image/gone',remove:()=>removed++});
 h.handlers.get('error')({target:detached});h.tick(1500);assert.equal(detached.src,undefined);
});
test('a 960px thumbnail that keeps failing tries the 500px standard width, then the other upload folder, before the fallback',()=>{
 const h=harness(),img=new h.Image();let removed=0,src='https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Lake.jpg/960px-Lake.jpg';
 Object.assign(img,{dataset:{fallback:'remove'},isConnected:true,getAttribute:()=>src,remove:()=>removed++});
 Object.defineProperty(img,'src',{set(v){src=v;},get(){return src;}});
 h.handlers.get('error')({target:img});h.tick(1500);
 h.handlers.get('error')({target:img});assert.equal(removed,0);assert.equal(src,'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Lake.jpg/500px-Lake.jpg');
 h.handlers.get('error')({target:img});assert.equal(removed,0);assert.equal(src,'https://upload.wikimedia.org/wikipedia/en/thumb/a/ab/Lake.jpg/500px-Lake.jpg','then the wiki’s own upload folder');
 h.handlers.get('error')({target:img});assert.equal(removed,1,'then the card falls back to text');
});
test('a library image linked to the wrong upload folder tries the other one',()=>{
 const h=harness(),img=new h.Image();let src='https://upload.wikimedia.org/wikipedia/en/thumb/2/2d/Chameleon.jpg/960px-Chameleon.jpg';
 Object.assign(img,{dataset:{fallback:'remove',imageRetried:'1',imageSmaller:'1'},isConnected:true,getAttribute:()=>src,remove(){}});
 Object.defineProperty(img,'src',{set(v){src=v;},get(){return src;}});
 h.handlers.get('error')({target:img});assert.equal(src,'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Chameleon.jpg/960px-Chameleon.jpg');
});
test('a hung image releases its background slot after the deadline',()=>{
 const h=harness();h.run('preloadQueueImages()');h.tick(15000);
 assert.equal(h.run('imageLoads'),4);assert.equal(h.started.length,8);
 assert.equal(h.started[0].src,'');
});
