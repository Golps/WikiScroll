import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function fn(name,next){return source.slice(source.indexOf('function '+name+'('),source.indexOf(next,source.indexOf('function '+name+'(')));}
test('saved topics are restored to selected and accessible state on both surfaces',()=>{
 const chips=['science','food','science','food'].map(id=>({dataset:{tid:id},selected:false,attrs:{},classList:{toggle(name,on){this.owner.selected=on;}},setAttribute(k,v){this.attrs[k]=v;}}));
 chips.forEach(c=>c.classList.owner=c);
 const context=vm.createContext({document:{querySelectorAll:()=>chips},curTopics:new Set(['science']),updateTopicBadge(){},syncHelpUI(){}});
 vm.runInContext(fn('syncTopicUI','function toggleTopic'),context);vm.runInContext('syncTopicUI()',context);
 assert.deepEqual(chips.map(c=>c.selected),[true,false,true,false]);
 assert.deepEqual(chips.map(c=>c.attrs['aria-pressed']),['true','false','true','false']);
 context.curTopics.clear();vm.runInContext('syncTopicUI()',context);assert.ok(chips.every(c=>!c.selected));
 assert.match(fn('loadPersistedState','function saveLiked'),/new Set\(savedTopics.filter[^]*?syncTopicUI\(\)/);
});
test('language switch updates a deep-link language so refresh cannot revert the selection',()=>{
 let replaced;let saves=0,resets=0;const context=vm.createContext({LANGS:[{c:'en'},{c:'es'}],curLang:'en',location:{href:'https://wikiscroll.com/?a=w123&lang=en'},URL,window:{history:{replaceState:(_,__,url)=>replaced=url.href}},applyLangUI(){},loadToday(){},saveSettings(){saves++;},syncActivityDisplay(){},resetFeed(){resets++;}});
 vm.runInContext(fn('setLang',"document.getElementById('langBtn')"),context);
 vm.runInContext('setLang("es")',context);assert.equal(context.curLang,'es');assert.equal(replaced,'https://wikiscroll.com/?a=w123&lang=es');assert.equal(resets,1);assert.equal(saves,1);
 vm.runInContext('setLang("bogus")',context);assert.equal(context.curLang,'es');assert.equal(resets,1);
});
test('topic refill delegates to the generation-safe Worker request',async()=>{
 let generation;const context=vm.createContext({fillGeneration:17,fetchWorkerBatch:async gen=>{generation=gen;return [{id:'w123'}];}});
 vm.runInContext(source.slice(source.indexOf('async function fetchWikiByTopic'),source.indexOf('async function fetchVoyage')),context);
 const result=await vm.runInContext('fetchWikiByTopic()',context);assert.equal(generation,17);assert.equal(result[0].id,'w123');
});
test('cards do not present excerpt reading-time estimates as article reading times',()=>{
 assert.doesNotMatch(source,/function readingTime\(/);
 assert.doesNotMatch(source,/class="read-time"/);
 assert.doesNotMatch(fs.readFileSync(new URL('../public/atlas.js',import.meta.url),'utf8'),/updateExcerptTime/);
});
test('Wikivoyage random fallback ignores Wikipedia topics and accepts guides without thumbnails',async()=>{
 let requested='';
 const context=vm.createContext({fillGeneration:1,travelFilters:{},curLang:'en',curTopics:new Set(['technology']),isValidTitle:()=>true,stripHtml:s=>s,NONPLACE_RE:/phrasebook/i,fetchOne:async url=>{requested=url;return {query:{pages:{7:{pageid:7,title:'A remote destination',extract:'Discover winding lanes, local markets and walking trails in this quiet destination.'}}}};}});
 const start=source.indexOf('async function fetchVoyage()');
 vm.runInContext(source.slice(source.indexOf('const VOYAGE_LANGS'),source.indexOf('\n',source.indexOf('function voyageLang(')))+'\n'+source.slice(start,source.indexOf('// ── PREFETCH QUEUE',start)),context);
 const result=await vm.runInContext('fetchVoyage()',context);
 assert.equal(result.length,1);assert.equal(result[0].img,'');assert.equal(result[0].src,'how');
 assert.match(requested,/generator=random/);assert.doesNotMatch(requested,/categorymembers/);
});
