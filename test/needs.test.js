import test from 'node:test';
import assert from 'node:assert/strict';
import {completeNeeds, sampleNeedyTitles, randomPrefix, weightedCategories, NEED_CATEGORIES,TALK_NEED_CATEGORIES} from '../worker/needs.js';
import {topicPages} from '../worker/topics.js';

test('needs come from hidden tracking categories, ordered by what to fix first, 50 pages per request', async () => {
  const requests = [];
  const pages = Array.from({length: 60}, (_, i) => ({pageid: i + 1}));
  await completeNeeds('en', pages, async params => {
    requests.push(params);
    assert.equal(params.prop, 'categories');
    assert.ok(params.clcategories.includes('Category:All articles needing additional references'));
    const ids = params.pageids.split('|');
    return {query: {pages: Object.fromEntries(ids.map(id => [id, {pageid: +id, categories: id === '1' ? [{title: 'Category:All stub articles'}, {title: 'Category:All articles needing additional references'}] : []}]))}};
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(pages[0].needs, ['citations', 'stub']);
  assert.deepEqual(pages[1].needs, []);
});

test('failed lookups show no tag, and unsupported languages are left alone', async () => {
  const pages = [{pageid: 1}];
  await completeNeeds('en', pages, async () => null);
  assert.deepEqual(pages[0].needs, []);
  const ja = [{pageid: 2}];
  await completeNeeds('ja', ja, async () => { throw Error('must not be called'); });
  assert.equal(ja[0].needs, undefined);
});

test('huge maintenance lists are read from random points across the alphabet', async () => {
  const prefixes = new Set(Array.from({length: 200}, () => randomPrefix()[0]));
  assert.ok(prefixes.size >= 15);
  const draws = weightedCategories('de', 400);
  const kinds = new Set(draws.map(d => d.need));
  assert.deepEqual([...kinds].sort(), ['citations', 'incomplete']);
  const seen = [];
  const titles = await sampleNeedyTitles('en', async params => {
    seen.push(params);
    if(params.generator)return {query:{pages:{[seen.length+100]:{ns:1,pageid:seen.length+100,subjectid:seen.length,title:'Talk:T'+seen.length,associatedpage:'T'+seen.length}}}};
    return {query: {categorymembers: [{ns: 0, pageid: seen.length, title: 'T' + seen.length}, {ns: 14, pageid: 99, title: 'Category:X'}]}};
  });
  assert.equal(seen.length, 10);
  assert.ok(seen.every(p => (p.cmlimit||p.gcmlimit) === '8'));
  assert.ok(seen.every(p => p.generator?p.gcmnamespace==='1'&&Object.hasOwn(TALK_NEED_CATEGORIES.en,p.gcmtitle):p.cmnamespace === '0' && /^[A-Z][a-z]$/.test(p.cmstartsortkeyprefix) && Object.hasOwn(NEED_CATEGORIES.en, p.cmtitle)));
  assert.equal(titles.length, 10);
});

test('writing needs and photo requests come from verified article and talk categories, never missing thumbnails',async()=>{
 const pages=[{pageid:1,talkid:101},{pageid:2,talkid:102},{pageid:3}];
 await completeNeeds('en',pages,async p=>({query:{pages:p.pageids==='101|102'?{101:{pageid:101,ns:1,categories:[{title:'Category:Wikipedia requested photographs'}]},102:{pageid:102,ns:1,categories:[]}}:{1:{pageid:1,categories:[{title:'Category:All Wikipedia articles needing copy edit'}]},2:{pageid:2,categories:[{title:'Category:All Wikipedia articles needing clarification'}]},3:{pageid:3,categories:[]}}}}));
 assert.deepEqual(pages[0].needs,['copyedit','images']);assert.deepEqual(pages[1].needs,['clarify']);assert.deepEqual(pages[2].needs,[]);
});

test('failed needs and introductions are retried rather than preserved as verified empty data',async()=>{
 const {completeExtracts}=await import('../worker/extracts.js');const pages=[{pageid:1,talkid:101}];
 await completeNeeds('en',pages,async()=>null);await completeExtracts(pages,async()=>null);
 assert.equal(pages[0].needsMissing,true);assert.equal(pages[0].extractMissing,true);
 await completeNeeds('en',pages,async p=>({query:{pages:{[p.pageids]:{pageid:Number(p.pageids),ns:p.pageids==='101'?1:0,categories:p.pageids==='101'?[{title:'Category:Wikipedia requested photographs'}]:[]}}}}));
 await completeExtracts(pages,async()=>({query:{pages:{1:{extract:'A verified introduction.'}}}}));
 assert.deepEqual(pages[0].needs,['images']);assert.equal(pages[0].needsMissing,undefined);
 assert.equal(pages[0].extract,'A verified introduction.');assert.equal(pages[0].extractMissing,undefined);
});

function wiki({needs = () => false} = {}) {
  return async address => {
    const p = new URL(address).searchParams;
    if(p.has('gcmtitle'))return {query:{pages:{901:{pageid:901,ns:1,subjectid:401,associatedpage:'Image opportunity'}}}};
    if (p.get('list') === 'categorymembers') {
      const base = p.get('cmtitle').length * 100;
      return {query: {categorymembers: Array.from({length: 6}, (_, i) => ({ns: 0, pageid: base + i, title: 'Page ' + (base + i)}))}};
    }
    if (p.has('cmtitle')) return {query: {categorymembers: Array.from({length: 4}, (_, i) => ({ns: 0, pageid: p.get('cmtitle').length * 10 + i, title: 'Topic page ' + i}))}};
    if (p.get('prop') === 'categories') return {query: {pages: Object.fromEntries(p.get('pageids').split('|').map(id => [id, {pageid: +id, categories: needs(+id) ? [{title: 'Category:All articles with unsourced statements'}] : []}]))}};
    if (p.get('prop') === 'extracts') return {query: {pages: Object.fromEntries(p.get('pageids').split('|').map(id => [id, {pageid: +id, extract: 'A substantive introduction that makes a readable discovery card. '.repeat(2)}]))}};
    return {query: {pages: Object.fromEntries(p.get('pageids').split('|').map(id => [id, {pageid: +id, title: 'Article ' + id, pageviews: {a: 20, b: 20}, thumbnail: {source: 'https://thumb.wikimedia.org/x.jpg'}}]))}};
  };
}

test('Help Wikipedia alone returns articles that need work, labelled by need, not by topic', async () => {
  const articles = await topicPages('help', 'en', 3, wiki({needs: () => true}));
  assert.ok(articles.length > 0);
  assert.ok(articles.every(a => a.needs?.includes('unsourced') && a.topic === undefined));
});

test('Help Wikipedia with a subject keeps only that subject\'s articles that need work', async () => {
  // Half of the subject's articles need work (even page ids).
  const articles = await topicPages('tech', 'en', 3, wiki({needs: id => id % 2 === 0}), {help: true});
  assert.ok(articles.length > 0);
  assert.ok(articles.every(a => a.topic === 'tech' && a.needs?.length && Number(a.id.slice(1)) % 2 === 0));
});

test('Popular with Help Wikipedia still fills from the most-read articles that need work', async () => {
  const articles = await topicPages('help', 'en', 1, wiki({needs: () => true}));
  assert.ok(articles.length >= 1);
});

test('a photograph-only opportunity appears as its article, with an explicit request label',async()=>{
 const random=Math.random;Math.random=()=>0.999;
 try{
  const articles=await topicPages('help','en',3,async address=>{
   const p=new URL(address).searchParams;
   if(p.has('gcmtitle'))return {query:{pages:{901:{pageid:901,ns:1,subjectid:401,associatedpage:'A place needing a photograph'}}}};
   if(p.get('prop')==='categories')return {query:{pages:{[p.get('pageids')]:{pageid:Number(p.get('pageids')),ns:p.get('pageids')==='901'?1:0,categories:p.get('pageids')==='901'?[{title:'Category:Wikipedia requested photographs'}]:[]}}}};
   if(p.get('prop')==='extracts')return {query:{pages:{401:{extract:'A useful introduction to this place and why it matters, with a complete readable description. '.repeat(2)}}}};
   return {query:{pages:{401:{pageid:401,ns:0,talkid:901,title:'A place needing a photograph',pageviews:{a:20}}}}};
  });
  assert.equal(articles.length,1);assert.equal(articles[0].id,'w401');assert.deepEqual(articles[0].needs,['images']);assert.equal(articles[0].img,'');
 }finally{Math.random=random;}
});

test('partial maintenance retries reuse successful article checks and retry only missing talk checks',async()=>{
 const pages=[{pageid:1,talkid:101}],calls=[];let failing=true;
 const query=async p=>{calls.push(p.pageids);if(p.pageids==='101')return failing?null:{query:{pages:{101:{pageid:101,ns:1,categories:[{title:'Category:Wikipedia requested photographs'}]}}}};return {query:{pages:{1:{pageid:1,ns:0,categories:[{title:'Category:All articles needing additional references'}]}}}};};
 await completeNeeds('en',pages,query);assert.equal(pages[0].needsMissing,true);assert.deepEqual(pages[0].needs,['citations']);
 failing=false;await completeNeeds('en',pages,query);assert.deepEqual(calls,['1','101','101']);assert.deepEqual(pages[0].needs,['citations','images']);assert.equal(pages[0].needsMissing,undefined);
});
test('partial maintenance retries reuse successful talk checks and retry only missing article checks',async()=>{
 const pages=[{pageid:2,talkid:102}],calls=[];let failing=true;
 const query=async p=>{calls.push(p.pageids);if(p.pageids==='2')return failing?null:{query:{pages:{2:{pageid:2,ns:0,categories:[]}}}};return {query:{pages:{102:{pageid:102,ns:1,categories:[{title:'Category:Wikipedia requested photographs'}]}}}};};
 await completeNeeds('en',pages,query);failing=false;await completeNeeds('en',pages,query);assert.deepEqual(calls,['2','102','2']);assert.deepEqual(pages[0].needs,['images']);assert.equal(pages[0].needsMissing,undefined);
});
test('partial maintenance reuse keeps its original expiry instead of renewing on retry',async t=>{
 let now=100000;t.mock.method(Date,'now',()=>now);const pages=[{pageid:3,talkid:103}],calls=[];
 const query=async p=>{calls.push(p.pageids);return p.pageids==='3'?{query:{pages:{3:{pageid:3,ns:0,categories:[]}}}}:null;};
 await completeNeeds('en',pages,query);now+=1800000;await completeNeeds('en',pages,query);now+=1800001;await completeNeeds('en',pages,query);
 assert.deepEqual(calls,['3','103','103','3','103']);assert.equal(pages[0].needsMissing,true);
});
