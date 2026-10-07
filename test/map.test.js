import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import worker from '../worker/index.js';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('map credentials come from Worker-rendered configuration, never a hardcoded production key',()=>{
 const start=source.indexOf('const CARTO_BASEMAP_KEY'),end=source.indexOf('let mapInstance',start);
 const c=vm.createContext({encodeURIComponent,document:{querySelector:()=>({content:'configured-map-key'})}});
 vm.runInContext(source.slice(start,end),c);
 assert.ok(c.cartoTileURL(false).endsWith('?key=configured-map-key'));
 assert.doesNotMatch(source,/cb1_[A-Za-z0-9_]+/);
 const home=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(home,/<meta name="carto-basemap-key" content="">/);
});
test('the Worker injects only a validated map key into the reader metadata',async()=>{
 const original=globalThis.HTMLRewriter;
 globalThis.HTMLRewriter=class {
   on(selector,handler){assert.equal(selector,'meta[name="carto-basemap-key"]');this.handler=handler;return this;}
   async transform(response){
     let value='';this.handler.element({setAttribute(name,v){assert.equal(name,'content');value=v;}});
     return new Response((await response.text()).replace('content=""',`content="${value}"`),response);
   }
 };
 const env={ASSETS:{fetch:async()=>new Response('<meta name="carto-basemap-key" content="">',{headers:{'Content-Type':'text/html'}})}};
 try{
   const good=await worker.fetch(new Request('https://wikiscroll.com/'),{...env,CARTO_BASEMAP_KEY:'configured-map-key'},{waitUntil(){}});
   assert.match(await good.text(),/content="configured-map-key"/);
   const bad=await worker.fetch(new Request('https://wikiscroll.com/'),{...env,CARTO_BASEMAP_KEY:'"><script>bad</script>'},{waitUntil(){}});
   assert.equal(await bad.text(),'<meta name="carto-basemap-key" content="">');
 }finally{globalThis.HTMLRewriter=original;}
});
test('CARTO key is encoded and both theme styles use authenticated raster endpoints',()=>{
 const start=source.indexOf('function cartoTileURL('),end=source.indexOf('let mapInstance',start);
 const context=vm.createContext({encodeURIComponent});vm.runInContext(source.slice(start,end),context);
 for(const [dark,style] of [[true,'dark_all'],[false,'voyager']]){
  const url=context.cartoTileURL(dark,'test&key=value');
  assert.match(url,new RegExp('/rastertiles/'+style+'/'));
  assert.ok(url.endsWith('?key=test%26key%3Dvalue'));
 }
 assert.equal((source.match(/L\.tileLayer\(cartoTileURL\(isDark\)/g)||[]).length,2);
});
test('map resources load only on demand, share one request and retry after failure',async()=>{
 const nodes=[];const context=vm.createContext({Promise,Error,L:{},setTimeout:()=>1,clearTimeout(){},document:{createElement:tag=>({tag,remove(){this.removed=true}}),head:{appendChild:el=>nodes.push(el)}}});
 const start=source.indexOf('let mapLibraryPromise='),end=source.indexOf('async function openMap',start);vm.runInContext(source.slice(start,end),context);
 assert.equal(nodes.length,0);
 const first=context.ensureMapLibrary();assert.equal(first,context.ensureMapLibrary());assert.equal(nodes.length,2);
 nodes[0].onerror();nodes[1].onload();await assert.rejects(first);assert.ok(nodes.every(n=>n.removed));
 const retry=context.ensureMapLibrary();assert.equal(nodes.length,4);nodes[2].onload();nodes[3].onload();await retry;await context.ensureMapLibrary();assert.equal(nodes.length,4);
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');assert.doesNotMatch(html,/<(?:link|script)[^>]*leaflet/);
});
