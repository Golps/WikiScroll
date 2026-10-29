import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pack,writePool,validCard,toCard,randomDepths,shorten,SETS,SHARD_SIZE,TARGET,buildPool,MINIMUM,libraryPool,LANGS,VOYAGE,setsFor,targetFor,refresh} from '../scripts/build-starter.mjs';
import {DEPTH_BANDS} from '../worker/pageviews.js';

const dir=new URL('../public/data/starter/',import.meta.url);
const card=(n,src='wiki')=>({id:(src==='wiki'?'w':'v')+n,src,title:'Article '+n,body:'A readable introduction with enough substance for a discovery card, long enough to pass.',img:'https://upload.wikimedia.org/x/'+n+'.jpg',url:`https://en.${src==='wiki'?'wikipedia':'wikivoyage'}.org/wiki/Article_${n}`});

test('the committed pool is indexed, complete and valid for its language, source and depth',()=>{
 const index=JSON.parse(fs.readFileSync(new URL('index.json',dir),'utf8'));
 assert.equal(index.v,1);assert.ok(Number.isFinite(Date.parse(index.fetchedAt)));
 assert.deepEqual(Object.keys(index.sets).sort(),LANGS.flatMap(setsFor).sort(),'every library language, with travel where it has a Wikivoyage');
 assert.deepEqual(Object.keys(index.builds).sort(),[...LANGS].sort());
 const files=fs.readdirSync(dir).filter(name=>name!=='index.json');
 const expected=Object.entries(index.sets).flatMap(([set,count])=>Array.from({length:count},(_,i)=>`${set}-${String(i).padStart(3,'0')}.json`));
 assert.deepEqual(files.sort(),expected.sort(),'every shard is indexed and every index entry exists');
 const seen=new Set();
 for(const name of files){
  const [,src,lang]=/^(wiki|how)-([a-z]+)/.exec(name),cards=JSON.parse(fs.readFileSync(new URL(name,dir),'utf8'));
  assert.ok(cards.length>0&&cards.length<=targetFor(lang));
  for(const c of cards){assert.ok(validCard(c,src,lang),name+' '+c.id);assert.ok(!seen.has(lang+c.id),'no card is in two shards');seen.add(lang+c.id);}
 }
 for(const lang of LANGS)assert.ok(index.sets[`wiki-${lang}-3`]>0,lang+' Balanced always has cards');
 assert.ok(index.sets['how-en']>0);
 const bytes=fs.readdirSync(dir).reduce((sum,name)=>sum+fs.statSync(new URL(name,dir)).size,0);
 assert.ok(bytes<20e6,'the bundled pool stays small: '+bytes);
});
test('pool cards keep the feed shape and refuse lists, foreign hosts and missing images',()=>{
 const page={pageid:7,title:'Lake Example',extract:'<b>Lake Example</b> is a lake. '.repeat(40),thumbnail:{source:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/L.jpg/320px-L.jpg'},description:'lake in Lithuania',fullurl:'https://en.wikipedia.org/wiki/Lake_Example'};
 const c=toCard(page,'wiki');
 assert.deepEqual(Object.keys(c).sort(),['body','desc','id','img','src','title','url']);
 assert.ok(c.body.length<=601&&!c.body.includes('<'));assert.match(c.img,/960px-L\.jpg$/);assert.ok(validCard(c,'wiki'));
 assert.equal(validCard({...c,title:'List of lakes'},'wiki'),false);
 assert.equal(validCard({...c,url:'https://evil.test/wiki/x'},'wiki'),false);
 assert.equal(validCard({...c,img:''},'wiki'),false);
 assert.equal(validCard(c,'wiki','de'),false,'a card must come from its own language');assert.equal(validCard({...c,url:'https://de.wikipedia.org/wiki/See'},'wiki','de'),true);assert.equal(validCard({...c,id:'v7',src:'how',img:'',url:'https://en.wikivoyage.org/wiki/X'},'how'),true);
 assert.equal(shorten('Short.'),'Short.');assert.ok(shorten('One sentence here. '.repeat(60)).endsWith('.'));
});
test('random candidates are grouped by the Worker’s own readership bands',()=>{
 assert.deepEqual(randomDepths(null),[],'unknown readership never counts as Obscure');
 assert.deepEqual(randomDepths(1),[5]);assert.deepEqual(randomDepths(2),[4,5]);assert.deepEqual(randomDepths(15),[3,4]);assert.deepEqual(randomDepths(500),[3]);
 for(const views of [0,1.5,2,5,10,29,31,250]){for(const depth of randomDepths(views)){const [lo,hi]=DEPTH_BANDS[depth];assert.ok(views>=lo&&views<=hi);}}
});
test('packing fills equal shards, removes duplicates and keeps a small set whole',()=>{
 const big=Array.from({length:TARGET+50},(_,i)=>card(i+1)),{files,index}=pack({'wiki-en-3':[...big,...big.slice(0,10)],'how-en':Array.from({length:20},(_,i)=>card(i+1,'how')),'wiki-en-1':[]});
 assert.equal(index['wiki-en-3'],TARGET/SHARD_SIZE);assert.equal(index['how-en'],1);assert.equal(index['wiki-en-1'],0);
 for(const [name,cards] of Object.entries(files))if(name.startsWith('wiki'))assert.equal(cards.length,SHARD_SIZE);
 assert.equal(files['how-en-000.json'].length,20);
 const ids=Object.values(files).flat().filter(c=>c.src==='wiki').map(c=>c.id);assert.equal(new Set(ids).size,ids.length);
});
test('writing a pool replaces old shards and the index together',async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'pool-'));
 fs.writeFileSync(path.join(out,'wiki-en-3-009.json'),'[]');fs.writeFileSync(path.join(out,'keep.txt'),'x');
 const index=await writePool(out,{'wiki-en-3':Array.from({length:SHARD_SIZE},(_,i)=>card(i+1))},'2026-10-28T00:00:00.000Z');
 assert.deepEqual(index,{'wiki-en-3':1});
 assert.deepEqual(fs.readdirSync(out).sort(),['index.json','keep.txt','wiki-en-3-000.json']);
 fs.rmSync(out,{recursive:true});
});
test('a thin week fails the build instead of shipping a small pool',async()=>{
 const empty={calls:0,json:async()=>null};
 await assert.rejects(buildPool(empty),new RegExp('Too few cards.*wiki-en-1: 0'));
 assert.ok(MINIMUM>=100);
});
test('a full build against a fake Wikimedia fills every set and packs valid shards',async()=>{
 // Random draws repeat pages across rounds, and some Known titles redirect to
 // Popular articles, as on the real wikis; no card may land in two sets.
 let next=1,draw=0;const views=[1,5,15,500],pages=new Map(),titleIds=new Map();
 const page=(id,title)=>({pageid:id,ns:0,title,extract:`${title} is a subject with a readable introduction. `.repeat(6),description:'a subject',thumbnail:{source:`https://upload.wikimedia.org/wikipedia/commons/thumb/a/a${id}/F.jpg/320px-F.jpg`},fullurl:'https://en.wikipedia.org/wiki/'+encodeURIComponent(title.replace(/ /g,'_'))});
 const http={calls:0,async json(url){
  this.calls++;const u=new URL(url),q=Object.fromEntries(u.searchParams);
  if(q.prop==='links'){const level=q.titles.includes('Level 3')?3:4,n=level===3?600:300;return {query:{pages:{1:{links:Array.from({length:n},(_,i)=>({title:`L${level} ${q.titles.split('/').pop()} ${i}`}))}}}};}
  if(q.generator==='random'&&u.hostname==='en.wikivoyage.org')return {query:{pages:Object.fromEntries(Array.from({length:20},()=>{const id=next++;return [id,{...page(id,'Town '+id),fullurl:'https://en.wikivoyage.org/wiki/Town_'+id}];}))}};
  if(q.generator==='random')return {query:{pages:Object.fromEntries(Array.from({length:50},()=>{const id=100000+(draw++*7919)%3000,p=page(id,'Random '+id);pages.set(id,p);return [id,{pageid:id,title:p.title,thumbnail:p.thumbnail}];}))}};
  if(q.prop==='pageviews')return {query:{pages:Object.fromEntries(q.pageids.split('|').map(id=>[id,{pageviews:{'2026-10-26':views[id%4],'2026-10-27':views[id%4]}}]))}};
  if(q.pageids)return {query:{pages:Object.fromEntries(q.pageids.split('|').map(id=>[id,pages.get(Number(id))]))}};
  if(q.titles)return {query:{pages:Object.fromEntries(q.titles.split('|').map(t=>{const key=t.startsWith('L4')&&t.endsWith('7')?t.replace(/^L4 \S+/,'L3 Level 3'):t;if(!titleIds.has(key))titleIds.set(key,next++);const id=titleIds.get(key);return [id,page(id,key)];}))}};
  return null;
 }};
 const {sets}=await buildPool(http);
 for(const set of SETS){assert.ok(sets[set].length>=MINIMUM,set+' '+sets[set].length);assert.ok(sets[set].every(c=>validCard(c,set.startsWith('how')?'how':'wiki')));}
 const ids=Object.values(sets).flat().map(c=>c.id);assert.equal(new Set(ids).size,ids.length,'every card belongs to exactly one set');
 const {files,index}=pack(sets);
 assert.ok(Object.values(index).every(n=>n===TARGET/SHARD_SIZE));
 assert.ok(Object.values(files).every(cards=>cards.length===SHARD_SIZE));
});

test('the pool samples whole library shards, keeps each card in one set and skips invalid cards',async()=>{
 const root='https://cards.example/v1/',shardSets={};
 for(const set of SETS)shardSets[set]=6;
 const requests=[];
 const fetchJSON=async url=>{
  requests.push(url);
  if(url===root+'en/current.json')return {v:1,build:'20261025',base:'20261025/',shardSize:100,sets:shardSets};
  const [,set,shard]=/20261025\/([a-z0-9-]+)\/(\d+)\.json$/.exec(url),src=set.startsWith('how')?'how':'wiki';
  // Shard 0 of every set repeats the same cards, so later sets must skip them.
  return Array.from({length:100},(_,i)=>{const n=shard==='0'?i+1:SETS.indexOf(set)*1e4+Number(shard)*100+i+1000;const c=card(n,src);if(src==='how'){c.url='https://en.wikivoyage.org/wiki/G'+n;}else c.url='https://en.wikipedia.org/wiki/A'+n;return i===0&&shard==='1'?{...c,url:'https://evil.test/x'}:c;});
 };
 const {sets,build}=await libraryPool(fetchJSON,'en',{root});
 assert.equal(build,'20261025');
 const ids=new Set();
 for(const set of SETS){assert.ok(sets[set].length>=MINIMUM&&sets[set].length<=TARGET,set);for(const c of sets[set]){assert.ok(!ids.has(c.id),'one set per card');ids.add(c.id);assert.notEqual(c.url,'https://evil.test/x');}}
 assert.ok(requests.every(url=>url.startsWith(root+'en/')));
 assert.deepEqual(await libraryPool(fetchJSON,'en',{root,unless:'20261025'}),{build:'20261025',unchanged:true},'an unchanged build downloads no shards');
 assert.equal(await libraryPool(async()=>null,'en',{root}),null,'an unreadable library falls back to the live API');
 assert.equal(await libraryPool(async()=>({v:1,build:'x',base:'../',sets:{}}),'en',{root}),null,'a manifest cannot point outside its language');
});

// A fake library for every language: `builds` picks each language's build,
// and `broken` languages can't be read.
function fakeLibrary(builds,broken=new Set(),travel=4){
 return async url=>{
  const [,lang,rest]=/^https:\/\/cards\.wikiscroll\.com\/v1\/([a-z]+)\/(.+)$/.exec(url);
  if(broken.has(lang))return null;
  const build=builds[lang]||'20261025';
  if(rest==='current.json')return {v:1,build,base:build+'/',sets:Object.fromEntries(setsFor(lang).map(set=>[set,set.startsWith('how')?travel:3]))};
  const [,set,shard]=/\/([a-z0-9-]+)\/(\d+)\.json$/.exec(rest),src=set.startsWith('how')?'how':'wiki',depth=Number(set.split('-')[2]||9);
  return Array.from({length:100},(_,i)=>{const n=depth*1e5+Number(shard)*100+i+1;return {...card(n,src),url:`https://${lang}.${src==='wiki'?'wikipedia':'wikivoyage'}.org/wiki/${build}_${n}`};});
 };
}
test('a refresh resamples only languages whose library build changed and keeps the rest',async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'pool-')),log=()=>{};
 await refresh(out,{fetchJSON:fakeLibrary({}),log,live:()=>assert.fail('the live API is only for an unusable English library')});
 const first=JSON.parse(fs.readFileSync(path.join(out,'index.json'),'utf8'));
 assert.deepEqual(Object.keys(first.sets).sort(),LANGS.flatMap(setsFor).sort());
 assert.equal(first.sets['wiki-en-3'],TARGET/SHARD_SIZE);assert.equal(first.sets['wiki-de-3'],targetFor('de')/SHARD_SIZE);
 assert.ok(!('how-ko' in first.sets)&&VOYAGE.has('de')&&!VOYAGE.has('ko'),'Korean readers browse English guides');
 const german=fs.readFileSync(path.join(out,'wiki-de-3-000.json'),'utf8');
 // Next week only English and French have new builds; German can't be read.
 assert.equal(await refresh(out,{fetchJSON:fakeLibrary({en:'20261101',fr:'20261101'},new Set(['de'])),log}).then(index=>Object.keys(index).length),Object.keys(first.sets).length);
 const second=JSON.parse(fs.readFileSync(path.join(out,'index.json'),'utf8'));
 assert.equal(second.builds.en,'20261101');assert.equal(second.builds.fr,'20261101');assert.equal(second.builds.de,'20261025');assert.equal(second.builds.es,'20261025');
 assert.equal(fs.readFileSync(path.join(out,'wiki-de-3-000.json'),'utf8'),german,'an unreadable language keeps its previous pool');
 assert.match(fs.readFileSync(path.join(out,'wiki-fr-3-000.json'),'utf8'),/20261101_/);
 assert.equal(await refresh(out,{fetchJSON:fakeLibrary({en:'20261101',fr:'20261101'}),log}),null,'nothing changed, nothing written');
 // A thin travel set outside English is dropped; a thin English set uses the live API.
 let live=0;
 await refresh(out,{all:true,fetchJSON:fakeLibrary({},new Set(['en']),0),log,live:async()=>{live++;throw Error('Too few cards');}});
 const third=JSON.parse(fs.readFileSync(path.join(out,'index.json'),'utf8'));
 assert.equal(live,1);assert.equal(third.builds.en,'20261101','English keeps its pool when the live API is short too');
 assert.ok(!('how-de' in third.sets)&&third.sets['wiki-de-1']>0&&third.sets['how-en']>0);
 assert.ok(!fs.readdirSync(out).some(name=>name.startsWith('how-de-')),'dropped sets leave no orphan shards');
 fs.rmSync(out,{recursive:true});
});
test('the pool covers exactly the reader’s library and Wikivoyage languages',()=>{
 const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const list=name=>JSON.parse(app.match(new RegExp(`const ${name}\\s*=\\s*new Set\\((\\[[^\\]]+\\])`))[1].replace(/'/g,'"'));
 assert.deepEqual([...LANGS].sort(),list('LIBRARY_LANGS').sort());
 assert.deepEqual([...VOYAGE].sort(),list('VOYAGE_LANGS').sort());
});
