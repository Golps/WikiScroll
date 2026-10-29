import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {readLocalFiles,MIN_LOCAL_FILES,thumbURL,sqlRows,readTable,readPageProps,readLinkTargets,readCategoryLinks,readPages,topicCategories,cirrusReader,libraryCard,voyageCard,cardNeeds,cardSets,dailyViews,vitalLevels,buildLibrary,averageDailyViews,emptyProps,shorten,SETS,TOPICS,HELP,SHARD_SIZE,MINIMUM,MAX_FILES,MAX_BYTES,SLICE_CAP,BODY_CHARS,translateTitles,localRoots} from '../scripts/build-library.mjs';
import {roots,bands} from '../worker/topics.js';
import {availableHelpTypes} from '../worker/needs.js';

const text='Lake Example is a freshwater lake in the north of the country, known for its clear water and its many islands. ';
const props=()=>emptyProps();
const table=(name,columns,rows)=>[`CREATE TABLE \`${name}\` (`,...columns.map(c=>`  \`${c}\` int(8) NOT NULL,`),'  PRIMARY KEY (`x`)',') ENGINE=InnoDB;',
 `INSERT INTO \`${name}\` VALUES `+rows.map(r=>'('+r.map(v=>v===null?'NULL':typeof v==='number'?v:`'${String(v).replace(/'/g,"\\'")}'`).join(',')+')').join(',')+';'];

test('thumbnail links follow the upload servers’ MD5 layout',()=>{
 const md5=crypto.createHash('md5').update('Lake_Example.jpg').digest('hex');
 assert.equal(thumbURL('Lake Example.jpg'),`https://upload.wikimedia.org/wikipedia/commons/thumb/${md5[0]}/${md5.slice(0,2)}/Lake_Example.jpg/960px-Lake_Example.jpg`);
 assert.match(thumbURL('Map.svg','wikipedia/en'),/^https:\/\/upload\.wikimedia\.org\/wikipedia\/en\/thumb\/.+\/960px-Map\.svg\.png$/);
 assert.match(thumbURL('Café (1).jpg'),/Caf%C3%A9_\(1\)\.jpg\/960px-Caf%C3%A9_\(1\)\.jpg$/);
 for(const bad of ['', null, 'Scan.pdf', 'Page.djvu', 'Clip.webm', 'a/b.jpg']) assert.equal(thumbURL(bad),'',String(bad));
});

test('SQL rows are read by column name, including escapes',async()=>{
 const line="INSERT INTO `page_props` VALUES (12,'page_image_free','Lake_Example.jpg',NULL),(12,'wikibase-shortdesc','Lake in the north, it\\'s \\\"clear\\\"',NULL),(14,'defaultsort','X, Y',0.5);";
 assert.deepEqual([...sqlRows(line)],[[12,'page_image_free','Lake_Example.jpg',null],[12,'wikibase-shortdesc','Lake in the north, it\'s "clear"',null],[14,'defaultsort','X, Y',0.5]]);
 const seen=[];
 const columns=await readTable(table('t',['b','a'],[[1,2]]),(row,c)=>seen.push(row[c.a]));
 assert.deepEqual(columns,{b:0,a:1});assert.deepEqual(seen,[2]);
 await assert.rejects(readTable(['INSERT INTO `t` VALUES (1);'],()=>{}),/no CREATE TABLE/);
 const rows=[];
 await readTable(['CREATE TABLE `t` (','  `a` int,','  `b` varbinary(9),',') ENGINE=InnoDB;','INSERT INTO `t` VALUES',"(1,'x;'),","(2,'it\\'s'),","(3,'z');",'UNLOCK TABLES;','INSERT INTO `t` VALUES (4,\'w\'),(5,\'v\');'],(row,c)=>rows.push([row[c.a],row[c.b]]));
 assert.deepEqual(rows,[[1,'x;'],[2,"it's"],[3,'z'],[4,'w'],[5,'v']],'one row per line after INSERT INTO … VALUES, as in newer dumps');
});

test('only the card-relevant page properties are kept',async()=>{
 const p=await readPageProps(table('page_props',['pp_page','pp_propname','pp_value','pp_sortkey'],[[1,'page_image_free','A.jpg',null],[1,'page_image','A.jpg',null],[2,'page_image','Logo.png',null],[3,'disambiguation','',null],[1,'wikibase-shortdesc','Lake',null],[1,'wikibase_item','Q1',null]]));
 assert.equal(p.free.get(1),'A.jpg');assert.equal(p.any.get(2),'Logo.png');assert.equal(p.desc.get(1),'Lake');assert.ok(p.disambiguation.has(3));
 assert.equal(p.desc.size+p.free.size+p.any.size+p.disambiguation.size,5,'wikibase_item and other properties are dropped');
});

test('the category tree and photo requests are read on both categorylinks schemas',async()=>{
 const pages=table('page',['page_id','page_namespace','page_title'],[[100,14,'Lakes_of_Lithuania'],[101,14,'Lakes'],[200,1,'Lake_Example'],[300,0,'Lake_Example'],[400,6,'Local_File.jpg']]);
 const old=await readCategoryLinks(table('categorylinks',['cl_from','cl_to','cl_type'],[[100,'Lakes','subcat'],[101,'Landforms','subcat'],[200,'Wikipedia_requested_photographs','page'],[300,'Lakes','page']]));
 const targets=await readLinkTargets(table('linktarget',['lt_id','lt_namespace','lt_title'],[[1,14,'Lakes'],[2,14,'Landforms'],[3,14,'Wikipedia_requested_photographs'],[4,10,'Infobox']]));
 assert.equal(targets.size,3,'only category targets are kept');
 const fresh=await readCategoryLinks(table('categorylinks',['cl_from','cl_type','cl_target_id'],[[100,'subcat',1],[101,'subcat',2],[200,'page',3],[300,'page',1]]),targets);
 for(const links of [old,fresh]){
  const {children,photoTitles,localFiles}=await readPages(pages,links);
  assert.deepEqual([...localFiles],['Local_File.jpg']);
  assert.deepEqual(children.get('Lakes'),['Lakes of Lithuania']);assert.deepEqual(children.get('Landforms'),['Lakes']);
  assert.deepEqual([...photoTitles],['Lake Example']);
 }
 await assert.rejects(readCategoryLinks(table('categorylinks',['cl_from','cl_type','cl_target_id'],[[1,'page',1]])),/--linktarget/);
 const emptied=await readCategoryLinks(table('categorylinks',['cl_from','cl_to','cl_type','cl_target_id'],[[100,'','subcat',1],[101,'','subcat',2],[200,'','page',3]]),targets);
 assert.deepEqual(emptied.edges,[100,'Lakes',101,'Landforms'],'an emptied cl_to next to cl_target_id reads the targets');assert.deepEqual([...emptied.photoTalk],[200]);
});

test('topics reach categories up to three levels below their roots, at the shortest distance',()=>{
 const children=new Map([['Islands',['Islands by country']],['Islands by country',['Islands of Greece','Islands']],['Islands of Greece',['Cyclades']],['Cyclades',['Too deep']]]);
 const reach=topicCategories(children,{geo:['Islands'],history:['Cyclades']});
 assert.deepEqual(reach.get('Islands'),[['geo',0]]);assert.deepEqual(reach.get('Cyclades'),[['geo',3],['history',0]]);
 assert.deepEqual(reach.get('Too deep'),[['history',1]],'four levels below a root is out of reach');
});

test('the bulk dump pairs each document with the page ID on its action line',()=>{
 const read=cirrusReader();
 assert.equal(read('{"index":{"_type":"_doc","_id":"42"}}'),null);
 assert.deepEqual(read('{"title":"X","namespace":0}'),{pageid:42,doc:{title:'X',namespace:0}});
 assert.equal(read('{"title":"Y","namespace":0,"page_id":7}').pageid,7,'a page_id field wins');
 assert.equal(read(''),null);
});

test('cards keep the Worker’s answer shape and refuse disambiguation, lists and other namespaces',()=>{
 const p=props();p.free.set(5,'Lake Example.jpg');p.desc.set(5,'Lake in the north');p.any.set(6,'Poster.jpg');
 const card=libraryCard(5,{namespace:0,title:'Lake Example',opening_text:text.repeat(20)},p);
 assert.deepEqual(Object.keys(card).sort(),['body','desc','id','img','src','title','url']);
 assert.equal(card.id,'w5');assert.equal(card.url,'https://en.wikipedia.org/wiki/Lake_Example');assert.match(card.img,/\/wikipedia\/commons\/thumb\/.+\/960px-/);
 assert.ok(card.body.length<=BODY_CHARS+1&&card.body.length>600,'introductions keep the live feed’s length');
 assert.match(libraryCard(6,{namespace:0,title:'Film',opening_text:text},p).img,/\/wikipedia\/en\/thumb\//,'non-free lead images are local to English Wikipedia');
 p.local=new Set(['Lake_Example.jpg']);
 assert.match(libraryCard(5,{namespace:0,title:'Lake Example',opening_text:text},p).img,/\/wikipedia\/en\/thumb\//,'a free image uploaded to English Wikipedia itself is local');
 assert.match(libraryCard(6,{namespace:0,title:'Film',opening_text:text},p).img,/\/wikipedia\/commons\/thumb\//,'with the file pages known, any other image is on Commons');
 assert.equal(libraryCard(7,{namespace:0,title:'No image',opening_text:text},p).img,'','an image is optional on the card itself');
 p.disambiguation.add(8);
 assert.equal(libraryCard(8,{namespace:0,title:'Mercury',opening_text:text},p),null);
 assert.equal(libraryCard(9,{namespace:4,title:'Wikipedia:About',opening_text:text},p),null);
 assert.equal(libraryCard(9,{namespace:0,title:'List of lakes',opening_text:text},p),null);
 assert.equal(libraryCard(9,{namespace:0,title:'Short',opening_text:'Too short.'},p),null);
 assert.equal(shorten('Short.'),'Short.');assert.ok(shorten('One sentence here. '.repeat(100)).endsWith('.'));
});

test('maintenance needs come from hidden categories and talk-page photo requests, in the live order',()=>{
 const doc={title:'Lake Example',category:['Lakes','All articles with unsourced statements','All stub articles','All articles lacking sources']};
 assert.deepEqual(cardNeeds(doc),['sources','unsourced','stub']);
 assert.deepEqual(cardNeeds(doc,new Set(['Lake Example'])),['sources','unsourced','images','stub']);
 assert.deepEqual(cardNeeds({title:'X'}),[]);
});

test('each page joins the depth, topic and Help sets the live feeds would draw it into',()=>{
 const levels=vitalLevels(['Water'],['Water','Lake']),reach=topicCategories(new Map([['Rivers',['Rivers of Europe']]]),{geo:['Rivers']});
 const card={id:'w1',src:'wiki',title:'Water',body:text,img:'https://upload.wikimedia.org/x/960px-a.jpg',url:'https://en.wikipedia.org/wiki/Water'};
 const sets=(doc,views,c=card)=>cardSets(doc,c,views,{levels,reach}).map(([set])=>set);
 assert.deepEqual(sets({title:'Water'},500),['wiki-en-1','wiki-en-3'],'Level 3 wins over Level 4');
 assert.deepEqual(sets({title:'Lakes',redirect:[{namespace:0,title:'Lake'}]},null),['wiki-en-2'],'vital titles match through redirects');
 assert.deepEqual(sets({title:'Pond'},null),[],'unknown readership joins no readership-based set');
 assert.deepEqual(sets({title:'Danube',category:['Rivers of Europe']},40),['wiki-en-3','topic-en-geo-3','topic-en-geo-4'],'topics use their own readership bands');
 assert.deepEqual(sets({title:'Danube',category:['Rivers']},2),['wiki-en-4','wiki-en-5','topic-en-geo-5']);
 assert.deepEqual(sets({title:'Brook',category:['Rivers of Europe']},2),['wiki-en-4','wiki-en-5','topic-en-geo-5'],'one level down is within reach of every depth');
 assert.deepEqual(sets({title:'Danube',category:['Rivers of Europe']},40,{...card,img:''}),['topic-en-geo-3','topic-en-geo-4'],'topic cards do not need an image; depth cards do');
 const help=cardSets({title:'Stub',category:['All stub articles','All articles needing additional references']},{...card,img:''},3,{levels,reach});
 assert.deepEqual(help.map(([set])=>set),['help-en-sources-5','help-en-detail-5']);
 assert.deepEqual(help[0][1].needs,['citations','stub']);assert.equal(help[0][1].topic,undefined);
 const tagged=cardSets({title:'Danube',category:['Rivers of Europe','All stub articles']},card,40,{levels,reach});
 assert.deepEqual(tagged.find(([s])=>s==='wiki-en-3')[1].needs,['stub'],'ordinary cards carry their maintenance tag');
 assert.equal(tagged.find(([s])=>s==='topic-en-geo-3')[1].topic,'geo');
 const combo=tagged.find(([s])=>s==='topic-en-geo-help-detail-3');
 assert.ok(combo,'a tagged topic card joins its topic and Help type set');assert.equal(combo[1].topic,'geo');assert.deepEqual(combo[1].needs,['stub']);
 assert.ok(!tagged.some(([s])=>s==='topic-en-geo-help-sources-3'),'only the Help types it needs');
});

test('travel guides skip phrasebooks and travel topics and need no image',()=>{
 const p=props(),guide=text.slice(0,60);
 const card=voyageCard(3,{namespace:0,title:'Vilnius',opening_text:guide},p);
 assert.equal(card.id,'v3');assert.equal(card.src,'how');assert.equal(card.url,'https://en.wikivoyage.org/wiki/Vilnius');assert.equal(card.img,'');
 assert.equal(voyageCard(4,{namespace:0,title:'Lithuanian phrasebook',opening_text:guide},p),null);
 assert.equal(voyageCard(4,{namespace:0,title:'Kalba',category:['Phrasebooks'],opening_text:guide},p),null);
 assert.equal(voyageCard(4,{namespace:0,title:'Travel topics',opening_text:guide},p),null);
 p.free.set(5,'Old Town.jpg');assert.match(voyageCard(5,{namespace:0,title:'Old Town',opening_text:guide},p).img,/wikipedia\/commons/);
});

test('the set list covers every feed the site offers',()=>{
 assert.deepEqual(TOPICS,Object.keys(roots));assert.deepEqual(HELP,availableHelpTypes('en'));
 assert.equal(SETS.length,5+TOPICS.length*5+HELP.length*5+TOPICS.length*HELP.length*5+1);
 assert.equal(new Set(SETS).size,SETS.length);
});

test('a full build shuffles every card into exactly one shard per set and writes the manifest last',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'library-')),out=path.join(dir,'out'),tmp=path.join(dir,'tmp');fs.mkdirSync(out);fs.mkdirSync(tmp);
 const p=props(),lines=[],count=1250,views={3:500,4:5,5:1};
 for(let i=1;i<=count;i++){
  p.free.set(i,`Photo ${i}.jpg`);
  const depth=3+i%3,title=i<=600?`Vital ${i}`:`Article ${i}`;
  lines.push(JSON.stringify({index:{_id:String(i)}}),JSON.stringify({namespace:0,title,opening_text:text,popularity_score:views[depth]/1e6,category:['Islands',...(i%5?[]:['All stub articles'])]}));
 }
 lines.push(JSON.stringify({index:{_id:'99999'}}),JSON.stringify({namespace:0,title:'Unknown',opening_text:text}));p.free.set(99999,'U.jpg');
 const voyage={props:props(),lines:Array.from({length:150},(_,i)=>[JSON.stringify({index:{_id:String(i+1)}}),JSON.stringify({namespace:0,title:'Town '+i,opening_text:text})]).flat()};
 const level3=Array.from({length:550},(_,i)=>`Vital ${i+1}`),level4=Array.from({length:600},(_,i)=>`Vital ${i+1}`);
 const minimum={...MINIMUM};for(const set of Object.keys(MINIMUM))MINIMUM[set]=1;
 try{
  const result=await buildLibrary({lines,props:p,dailyTotal:1e6,levels:vitalLevels(level3,level4),reach:topicCategories(new Map(),{geo:['Islands']}),voyage,outDir:out,tmpDir:tmp,build:'20261025'});
  assert.equal(result.pages,count+1);assert.equal(result.unknown,1);assert.equal(result.guides,150);
  const manifest=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(out,'current.json'))));
  assert.equal(manifest.v,1);assert.equal(manifest.base,'20261025/');assert.equal(manifest.shardSize,SHARD_SIZE);assert.deepEqual(Object.keys(manifest.sets),SETS);
  const seen=Object.fromEntries(SETS.map(s=>[s,new Set()]));
  for(const set of SETS){
   const folder=path.join(out,'20261025',set),files=fs.existsSync(folder)?fs.readdirSync(folder):[];
   assert.deepEqual(files.sort(),Array.from({length:manifest.sets[set]},(_,i)=>i+'.json').sort(),set);
   for(const name of files){
    const cards=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(folder,name))));
    assert.ok(cards.length===SHARD_SIZE||files.length===1);
    for(const c of cards){assert.ok(!seen[set].has(c.id),'no card repeats within a set');seen[set].add(c.id);if(set.startsWith('topic-'))assert.equal(c.topic,'geo');if(set.startsWith('help-'))assert.ok(c.needs.length);}
   }
  }
  assert.equal(manifest.sets['wiki-en-1'],5,'550 Level 3 cards make five full shards');
  assert.ok(!seen['wiki-en-2'].has('w1'),'Level 3 articles are Popular, not Known');
  assert.ok(manifest.sets['topic-en-geo-1']>0&&manifest.sets['help-en-detail-4']>0,'topic and Help sets are built');assert.equal(manifest.sets['how-en'],1);
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
 assert.ok(MAX_FILES*2*5<1_000_000,'R2 includes 1M writes a month: two builds a week');
 assert.ok(MAX_BYTES*2<10e9,'R2 includes 10 GB; old and new builds overlap during the swap');
 assert.ok(SLICE_CAP>=SHARD_SIZE*100,'topic and Help slices stay large pools');
});

test('daily views average the last week of English Wikipedia totals',async()=>{
 let asked;
 const avg=await averageDailyViews(async url=>{asked=url;return {items:[1,2,3,4,5,6,7].map(n=>({views:n*1e6}))};},Date.UTC(2026,9,28));
 assert.equal(avg,4e6);assert.match(asked,/aggregate\/en\.wikipedia\/all-access\/user\/daily\/2026102000\/2026102600$/);
 assert.equal(await averageDailyViews(async()=>null),null);
});

test('the image table names real local uploads, not File: pages that describe Commons files',async()=>{
 const names=await readLocalFiles(table('image',['img_name','img_size'],[['Film_poster.jpg',100],['Local_photo.png',200]]));
 assert.deepEqual([...names].sort(),['Film_poster.jpg','Local_photo.png']);
 const p=props();p.free.set(5,'Panther_chameleon.jpg');p.local=names;
 assert.match(libraryCard(5,{namespace:0,title:'Panther chameleon',opening_text:text},p).img,/\/wikipedia\/commons\/thumb\//,'a free image with only a local description page stays on Commons');
 assert.ok(MIN_LOCAL_FILES>=100000);
});

test('English titles follow interlanguage links, through renames and redirects', async () => {
  const urls = [];
  const fetchJSON = async url => {
    urls.push(url);
    return {query: {normalized: [{from: 'lake example', to: 'Lake example'}], redirects: [{from: 'Lake example', to: 'Lake Example'}],
      pages: [{title: 'Lake Example', langlinks: [{lang: 'de', title: 'Beispielsee'}]}, {title: 'Unlinked'}]}};
  };
  const found = await translateTitles(['lake example', 'Unlinked'], 'de', fetchJSON);
  assert.deepEqual([...found], [['lake example', 'Beispielsee']]);
  assert.match(urls[0], /lllang=de/);
  assert.equal(await translateTitles(['X'], 'de', async () => null), null, 'a failed lookup is not an empty answer');
});

test('topic roots become the linked local categories', async () => {
  assert.equal(await localRoots('en'), roots);
  const fetchJSON = async url => {
    const titles = new URLSearchParams(url.split('?')[1]).get('titles').split('|');
    return {query: {pages: titles.map((title, i) => ({title, ...(i % 2 ? {} : {langlinks: [{title: 'Kategorie:' + title.slice(9) + ' (de)'}]})}))}};
  };
  const local = await localRoots('de', fetchJSON);
  assert.deepEqual(Object.keys(local), Object.keys(roots));
  for (const list of Object.values(local)) for (const root of list) assert.match(root, /^[^:]+ \(de\)$/, 'namespace dropped');
});
