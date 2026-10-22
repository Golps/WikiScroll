import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {HELP_TYPES,NEED_CATEGORIES,availableHelpTypes,selectedHelpNeeds,sampleNeedyTitles} from '../worker/needs.js';
import {createWork,createNetwork,SUBREQUEST_LIMIT} from '../worker/runtime.js';
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const slice=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)));
const config=Object.fromEntries(Object.entries(HELP_TYPES).map(([id,needs])=>[id,{needs,langs:['en','de','fr','es'].filter(l=>availableHelpTypes(l).includes(id))}]));
function client(){
 const notices=[],timers=new Map();let i=0;
 const c=vm.createContext({curMode:'wiki',curLang:'en',helpMode:'only',fillGeneration:0,curTopics:new Set(),depthLevel:3,travelFilters:{},helpTypes:Object.keys(HELP_TYPES),document:{querySelector:()=>({dataset:{helpConfig:JSON.stringify(config)}}),querySelectorAll:()=>[]},saveSettings(){},resetFeed(){c.fillGeneration++;},toast:m=>notices.push(m),setTimeout:fn=>{timers.set(++i,fn);return i;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(slice('const HELP_LANGS','const BAD_TITLE_RE')+slice('// The server\'s category groups','// ── STATE')+slice('function syncHelpTypeUI','// Keep the three choices')+slice('function feedContextKey','function validReserveArticle'),c);
 return {c,timers,notices,run:code=>vm.runInContext(code,c)};
}
test('help filters group source flags and expose only categories available in the selected edition',()=>{
 assert.equal(Object.keys(HELP_TYPES).length,6);
 assert.deepEqual(availableHelpTypes('en'),Object.keys(HELP_TYPES));
 assert.deepEqual(availableHelpTypes('de'),['sources','detail']);assert.deepEqual(availableHelpTypes('fr'),['sources','outdated']);assert.deepEqual(availableHelpTypes('es'),['sources']);assert.deepEqual(availableHelpTypes('ja'),[]);
 assert.deepEqual(selectedHelpNeeds('en',['images']),['images']);assert.deepEqual(selectedHelpNeeds('en',['sources']),['sources','citations','unsourced']);
});
test('photo-only sampling uses talk-page requests and retains eight independent diversity lanes',async()=>{
 let id=0;const seen=[];
 const pages=await sampleNeedyTitles('en',async p=>{seen.push(p);const subjectid=++id;return {query:{pages:{[1000+id]:{pageid:1000+id,ns:1,subjectid,associatedpage:'Guide '+id}}}};},8,8,['images']);
 assert.equal(seen.length,8);assert.ok(seen.every(p=>p.gcmtitle==='Category:Wikipedia requested photographs'&&p.gcmnamespace==='1'));assert.equal(new Set(pages.map(p=>p.branch)).size,8);assert.ok(pages.every(p=>p.pageid<1000));
});
test('remembered help selections are canonical, language-aware, nonempty and debounced',()=>{
 const h=client();assert.equal(h.run('helpTypeQuery()'),'');
 h.run("setHelpTypes(['images'])");assert.equal(h.run('helpTypeQuery()'),'images');const photoKey=h.run('feedContextKey()');
 assert.equal(h.run("matchesHelpTypes({needs:['citations']})"),false);assert.equal(h.run("matchesHelpTypes({needs:['citations','images']})"),true);
 h.run('setHelpTypes([])');assert.equal(h.run('helpTypeQuery()'),'images');assert.equal(h.notices.length,1);
 h.run("setHelpTypes(['outdated','sources'])");assert.equal(h.run('helpTypeQuery()'),'sources,outdated');assert.notEqual(h.run('feedContextKey()'),photoKey);assert.equal(h.timers.size,1);
 [...h.timers.values()][0]();assert.equal(h.c.fillGeneration,1);
 h.run("setHelpTypes(['images']);curLang='de'");assert.equal(h.run('helpTypeQuery()'),'');assert.deepEqual([...h.run('activeHelpTypes()')],['sources','detail']);h.run("curLang='en'");assert.equal(h.run('helpTypeQuery()'),'images');
 h.run("helpMode='tags'");assert.doesNotMatch(h.run('feedContextKey()'),/images/);
});
function fixture(need='images',lang='en'){
 const category=Object.entries(NEED_CATEGORIES[lang]).find(([,code])=>code===need)?.[0];
 let next=0;const pages=new Map();
 return async address=>{
  const p=new URL(address).searchParams;
  if(p.has('gcmtitle')||p.has('cmtitle')){
   const members=Array.from({length:8},()=>{const pageid=++next,article={pageid,ns:0,title:'Discovery '+pageid};pages.set(pageid,article);return article;});
   return p.has('gcmtitle')?{query:{pages:Object.fromEntries(members.map(a=>[100000+a.pageid,{ns:1,pageid:100000+a.pageid,subjectid:a.pageid,associatedpage:a.title}]))}}:{query:{categorymembers:members}};
  }
  const prop=p.get('prop');return {query:{pages:Object.fromEntries(p.get('pageids').split('|').map(Number).map(id=>[id,{...(id>=100000?{pageid:id,ns:1}:pages.get(id)),...(prop.includes('info')?{talkid:100000+id}:{}),...(prop.includes('pageviews')?{pageviews:{a:30,b:30}}:{}),...(prop==='extracts'?{extract:'A substantive introduction to a verified article that needs improvement. '.repeat(3)}:{}),...(prop==='categories'?{categories:id>=100000?(need==='images'?[{title:'Category:Wikipedia requested photographs'}]:[]):[{title:category||'Category:All articles needing additional references'}]}:{})}]))}};
 };
}
const env={WORK_LIMIT:{limit:async()=>({success:true})}};
const background=()=>{const tasks=[];return {waitUntil:p=>tasks.push(p),done:()=>Promise.all(tasks)};};
const options=(upstream,work)=>({langs:new Set(['en','de']),permit:async()=>true,limited:()=>null,upstream,...(work?{work}:{})});
test('standalone and topic-narrowed photo requests produce useful batches within the Free operation budget',async()=>{
 const old=globalThis.caches;globalThis.caches={default:{match:async()=>undefined,put:async()=>{}}};
 try{for(const topic of ['help','tech']){
  const api=await import('../worker/topics.js?photo-types='+topic),ctx=background(),work=createWork(env,ctx,createNetwork()),upstream=fixture();
  const response=await api.topicResponse(new URL('https://wikiscroll.com/api/topics?topic='+topic+'&needs=images'+(topic==='tech'?'&help=1':'')),env,ctx,options(a=>work.request(upstream,a),work));
  const data=await response.json();await ctx.done();assert.equal(response.status,200);assert.ok(data.articles.length>=12,'a single need must not collapse to three cards');assert.ok(data.articles.every(a=>a.needs.includes('images')));assert.ok(work.used<=SUBREQUEST_LIMIT);if(topic==='tech')assert.ok(data.articles.every(a=>a.topic==='tech'));
 }}finally{globalThis.caches=old;}
});
test('help-type validation rejects malformed or unsupported choices before upstream work',async()=>{
 const api=await import('../worker/topics.js?invalid-types');let calls=0;
 for(const query of ['topic=help&needs=','topic=help&needs=images,images','topic=help&needs=unknown','topic=help&lang=de&needs=images','topic=tech&needs=images']){
  const ctx=background(),r=await api.topicResponse(new URL('https://wikiscroll.com/api/topics?'+query),env,ctx,options(async()=>{calls++;}));assert.equal(r.status,400);await ctx.done();
 }assert.equal(calls,0);
});
test('cached recovery isolates subsets, canonicalizes order, and shares the default all-types cache',async()=>{
 const entries=new Map(),put=async(key,articles)=>entries.set(key,Response.json({articles,cached_at:new Date().toISOString()}));
 const base='https://wikiscroll.com/api/topics?v=8&topic=help&lang=en&depth=3&batch=0';
 await put(base,[{id:'w1',needs:['citations']}]);await put(base+'&needs=sources%2Coutdated',[{id:'w2',needs:['outdated']}]);await put(base.replace('v=8','v=7'),[{id:'w3',needs:['citations']}]);
 const old=globalThis.caches;globalThis.caches={default:{match:async key=>entries.get(key.url)?.clone(),put:async()=>{}}};
 try{const api=await import('../worker/topics.js?type-cache');for(const [types,expected] of [['images',[]],['outdated,sources',['w2']],[Object.keys(HELP_TYPES).reverse().join(','),['w1']]]){
  const ctx=background(),r=await api.topicResponse(new URL('https://wikiscroll.com/api/topics?topic=help&batch=0&cached=1&needs='+types),env,ctx,options(()=>{throw Error('cache-only recovery must never request upstream');}));
  assert.equal(r.status,200);assert.deepEqual((await r.json()).articles.map(a=>a.id),expected);await ctx.done();
 }}finally{globalThis.caches=old;}
});

test('every available maintenance group yields verified cards in its supported edition',async()=>{
 const old=globalThis.caches;globalThis.caches={default:{match:async()=>undefined,put:async()=>{}}};
 try {for(const lang of ['en','de','fr','es'])for(const type of availableHelpTypes(lang)){
  const needs=selectedHelpNeeds(lang,[type]),known=new Set(Object.values(NEED_CATEGORIES[lang]));
  const need=type==='images'?'images':needs.find(n=>known.has(n));
  const api=await import('../worker/topics.js?groups='+lang+type),ctx=background(),work=createWork(env,ctx,createNetwork()),upstream=fixture(need,lang);
  const r=await api.topicResponse(new URL('https://wikiscroll.com/api/topics?topic=help&lang='+lang+'&needs='+type),env,ctx,{...options(a=>work.request(upstream,a),work),langs:new Set([lang])});
  const data=await r.json();await ctx.done();assert.equal(r.status,200,lang+' '+type);assert.ok(data.articles.length>0,lang+' '+type);assert.ok(data.articles.every(a=>a.needs.includes(need)));assert.ok(work.used<=SUBREQUEST_LIMIT);
 }}finally {globalThis.caches=old;}
});
