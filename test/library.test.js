import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {thumbURL,sqlRows,readPageProps,cirrusReader,libraryCard,dailyViews,vitalLevels,cardSets,buildLibrary,averageDailyViews,SETS,SHARD_SIZE,MINIMUM,MAX_FILES,MAX_BYTES} from '../scripts/build-library.mjs';
import {validCard} from '../scripts/build-starter.mjs';

const text='Lake Example is a freshwater lake in the north of the country, known for its clear water and its many islands. ';
const props=()=>({free:new Map(),any:new Map(),desc:new Map(),disambiguation:new Set()});

test('thumbnail links follow the upload servers’ MD5 layout',()=>{
 const md5=crypto.createHash('md5').update('Lake_Example.jpg').digest('hex');
 assert.equal(thumbURL('Lake Example.jpg'),`https://upload.wikimedia.org/wikipedia/commons/thumb/${md5[0]}/${md5.slice(0,2)}/Lake_Example.jpg/960px-Lake_Example.jpg`);
 assert.match(thumbURL('Map.svg','en'),/^https:\/\/upload\.wikimedia\.org\/wikipedia\/en\/thumb\/.+\/960px-Map\.svg\.png$/);
 assert.match(thumbURL('Café (1).jpg'),/Caf%C3%A9_\(1\)\.jpg\/960px-Caf%C3%A9_\(1\)\.jpg$/);
 for(const bad of ['', null, 'Scan.pdf', 'Page.djvu', 'Clip.webm', 'a/b.jpg']) assert.equal(thumbURL(bad),'',String(bad));
});

test('page_props rows are read from SQL inserts, including escapes',()=>{
 const line="INSERT INTO `page_props` VALUES (12,'page_image_free','Lake_Example.jpg',NULL),(12,'wikibase-shortdesc','Lake in the north, it\\'s \\\"clear\\\"',NULL),(13,'disambiguation','',NULL),(14,'defaultsort','X, Y',0.5);";
 assert.deepEqual([...sqlRows(line)],[[12,'page_image_free','Lake_Example.jpg',null],[12,'wikibase-shortdesc','Lake in the north, it\'s "clear"',null],[13,'disambiguation','',null],[14,'defaultsort','X, Y',0.5]]);
 assert.deepEqual([...sqlRows('-- MySQL dump')],[]);
});

test('only the card-relevant page properties are kept',async()=>{
 const p=await readPageProps(["INSERT INTO `page_props` VALUES (1,'page_image_free','A.jpg',NULL),(1,'page_image','A.jpg',NULL),(2,'page_image','Logo.png',NULL),(3,'disambiguation','',NULL),(1,'wikibase-shortdesc','Lake',NULL),(1,'wikibase_item','Q1',NULL);"]);
 assert.equal(p.free.get(1),'A.jpg');assert.equal(p.any.get(2),'Logo.png');assert.equal(p.desc.get(1),'Lake');assert.ok(p.disambiguation.has(3));
 assert.equal(p.desc.size+p.free.size+p.any.size+p.disambiguation.size,5,'wikibase_item and other properties are dropped');
});

test('the bulk dump pairs each document with the page ID on its action line',()=>{
 const read=cirrusReader();
 assert.equal(read('{"index":{"_type":"_doc","_id":"42"}}'),null);
 assert.deepEqual(read('{"title":"X","namespace":0}'),{pageid:42,doc:{title:'X',namespace:0}});
 assert.equal(read('{"title":"Y","namespace":0,"page_id":7}').pageid,7,'a page_id field wins');
 assert.equal(read(''),null);
});

test('cards keep the feed shape and refuse disambiguation, missing images and other namespaces',()=>{
 const p=props();p.free.set(5,'Lake Example.jpg');p.desc.set(5,'Lake in the north');p.any.set(6,'Poster.jpg');
 const card=libraryCard(5,{namespace:0,title:'Lake Example',opening_text:text.repeat(10)},p);
 assert.ok(validCard(card,'wiki'));assert.equal(card.id,'w5');assert.equal(card.desc,'Lake in the north');
 assert.equal(card.url,'https://en.wikipedia.org/wiki/Lake_Example');assert.match(card.img,/\/wikipedia\/commons\/thumb\//);assert.ok(card.body.length<=601);
 assert.match(libraryCard(6,{namespace:0,title:'Film',opening_text:text},p).img,/\/wikipedia\/en\/thumb\//,'non-free lead images are local to English Wikipedia');
 assert.equal(libraryCard(7,{namespace:0,title:'No image',opening_text:text},p),null);
 p.free.set(8,'A.jpg');p.disambiguation.add(8);
 assert.equal(libraryCard(8,{namespace:0,title:'Mercury',opening_text:text},p),null);
 p.free.set(9,'A.jpg');
 assert.equal(libraryCard(9,{namespace:4,title:'Wikipedia:About',opening_text:text},p),null);
 assert.equal(libraryCard(9,{namespace:0,title:'List of lakes',opening_text:text},p),null);
 assert.equal(libraryCard(9,{namespace:0,title:'Short',opening_text:'Too short.'},p),null);
});

test('depth uses the Worker’s readership bands and vital lists, never guessing unknown readership',()=>{
 assert.equal(dailyViews({popularity_score:0.000001},5e6),5);
 assert.equal(dailyViews({},5e6),null);assert.equal(dailyViews({popularity_score:'x'},5e6),null);
 const levels=vitalLevels(['Water'],['Water','Lake']);
 assert.deepEqual(cardSets({title:'Water'},500,levels),['wiki-en-1','wiki-en-3'],'Level 3 wins over Level 4');
 assert.deepEqual(cardSets({title:'Lakes',redirect:[{namespace:0,title:'Lake'}]},null,levels),['wiki-en-2'],'vital titles match through redirects');
 assert.deepEqual(cardSets({title:'Pond'},1,levels),['wiki-en-5']);
 assert.deepEqual(cardSets({title:'Pond'},null,levels),[]);
});

test('a full build shuffles every card into exactly one shard per set and writes the manifest last',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'library-')),out=path.join(dir,'out'),tmp=path.join(dir,'tmp');fs.mkdirSync(out);fs.mkdirSync(tmp);
 const p=props(),lines=[],count=1250;
 const views={3:500,4:5,5:1};
 for(let i=1;i<=count;i++){
  p.free.set(i,`Photo ${i}.jpg`);
  const depth=3+i%3,title=i<=600?`Vital ${i}`:`Article ${i}`;
  lines.push(JSON.stringify({index:{_id:String(i)}}),JSON.stringify({namespace:0,title,opening_text:text,popularity_score:views[depth]/1e6}));
 }
 lines.push(JSON.stringify({index:{_id:'99999'}}),JSON.stringify({namespace:0,title:'Unknown',opening_text:text}));p.free.set(99999,'U.jpg');
 const level3=Array.from({length:550},(_,i)=>`Vital ${i+1}`),level4=Array.from({length:600},(_,i)=>`Vital ${i+1}`);
 const minimum={...MINIMUM};for(const set of SETS)MINIMUM[set]=1;
 try{
  const result=await buildLibrary({lines,props:p,dailyTotal:1e6,levels:vitalLevels(level3,level4),outDir:out,tmpDir:tmp,build:'20261025'});
  assert.equal(result.pages,count+1);assert.equal(result.unknown,1);
  const manifest=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(out,'current.json'))));
  assert.equal(manifest.v,1);assert.equal(manifest.base,'20261025/');assert.equal(manifest.shardSize,SHARD_SIZE);assert.deepEqual(Object.keys(manifest.sets),SETS);
  const seen=Object.fromEntries(SETS.map(s=>[s,new Set()]));
  for(const set of SETS){
   const files=fs.readdirSync(path.join(out,'20261025',set));
   assert.deepEqual(files.sort(),Array.from({length:manifest.sets[set]},(_,i)=>i+'.json').sort());
   for(const name of files){
    const cards=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(out,'20261025',set,name))));
    assert.ok(cards.length===SHARD_SIZE||files.length===1);
    for(const c of cards){assert.ok(validCard(c,'wiki'));assert.ok(!seen[set].has(c.id),'no card repeats within a set');seen[set].add(c.id);}
   }
  }
  assert.equal(manifest.sets['wiki-en-1'],5,'550 Level 3 cards make five full shards');
  assert.ok(!seen['wiki-en-2'].has('w1'),'Level 3 articles are Popular, not Known');
  const order=[...seen['wiki-en-3']].map(id=>Number(id.slice(1)));
  assert.ok(order.some((id,i)=>i&&id<order[i-1]),'cards are shuffled, not in dump order');
 }finally{Object.assign(MINIMUM,minimum);fs.rmSync(dir,{recursive:true,force:true});}
});

test('a thin build fails before anything is written for upload',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'library-'));
 try{
  await assert.rejects(buildLibrary({lines:[],props:props(),dailyTotal:1e6,levels:new Map(),outDir:dir,tmpDir:dir,build:'20261025'}),/Too few cards/);
  assert.equal(fs.existsSync(path.join(dir,'current.json')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('free-tier guards leave room for five weekly builds and the weekly swap',()=>{
 assert.ok(MAX_FILES*5<1_000_000,'R2 includes 1M writes a month');
 assert.ok(MAX_BYTES*2<10e9,'R2 includes 10 GB; old and new builds overlap during the swap');
});

test('daily views average the last week of English Wikipedia totals',async()=>{
 let asked;
 const avg=await averageDailyViews(async url=>{asked=url;return {items:[1,2,3,4,5,6,7].map(n=>({views:n*1e6}))};},Date.UTC(2026,9,28));
 assert.equal(avg,4e6);assert.match(asked,/aggregate\/en\.wikipedia\/all-access\/user\/daily\/2026102000\/2026102600$/);
 assert.equal(await averageDailyViews(async()=>null),null);
});
