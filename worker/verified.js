import {createWork} from './runtime.js';
import {fullTextParams,leadFromText,guideReadable} from './extracts.js';
import {imageURL} from './supply.js';
const pending=new Map();
const clean=s=>String(s||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
const host=(id,lang)=>`${lang}.${id[0]==='v'?'wikivoyage':'wikipedia'}.org`;
const api=(id,lang,params)=>`https://${host(id,lang)}/w/api.php?`+new URLSearchParams({action:'query',format:'json',...params});
const valid=(p,id)=>p&&p.missing===undefined&&p.ns===0&&p.pageid===Number(id.slice(1));
function value(p,id,lang){
 return valid(p,id)?{id,lang,title:clean(p.title).slice(0,160),body:clean(p.extract).slice(0,600),img:imageURL(p.thumbnail?.source),src:id[0]==='v'?'how':'wiki',url:`https://${host(id,lang)}/?curid=${id.slice(1)}`} : null;
}
const params=ids=>({pageids:ids.join('|'),prop:'extracts|pageimages',exintro:'1',explaintext:'1',exchars:'600',exlimit:'max',piprop:'thumbnail',pithumbsize:'960',pilimit:'max'});
async function opening(p,id,lang,work){
 if(id[0]!=='v'||guideReadable(clean(p.extract)))return true;
 const data=await work.upstream(api(id,lang,fullTextParams(id.slice(1))));
 if(!data?.query?.pages?.[id.slice(1)])return false;
 p.extract=leadFromText(data.query.pages[id.slice(1)].extract);return true;
}
export async function verifiedArticle(id,lang,env,ctx,work=createWork(env,ctx)) {
 const key=new Request(`https://wikiscroll.com/__verified/v4/${lang}/${id}`),cache=work.cache;
 try {const hit=await cache?.match(key);if(hit)return await hit.json();}catch{}
 if(pending.has(key.url))return pending.get(key.url);
 const job=(async()=>{
  const data=await work.upstream(api(id,lang,params([id.slice(1)])));
  if(!data?.query?.pages)throw Error(work.reason||'Source unavailable');
  const p=data.query.pages[id.slice(1)];
  if(valid(p,id)&&!await opening(p,id,lang,work))throw Error(work.reason||'Opening text unavailable');
  const result=value(p,id,lang);
  if(cache)work.keep(cache.put(key,Response.json(result,{headers:{'Cache-Control':`public,max-age=${result?86400:300}`}})));
  return result;
 })();
 pending.set(key.url,job);work.keep(job);
 try{return await job;}finally{pending.delete(key.url);}
}

// One canonical pack per article selection, independent of its untrusted name
// and excerpts. Metadata is fetched in five-page groups, and partial verified
// progress survives a bounded retry without accepting any supplied content.
export async function verifyCollection(c,env,ctx,work=createWork(env,ctx)){
 const selection=c.items.map(a=>a.lang+'|'+a.id).sort().join(',');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(selection))),b=>b.toString(16).padStart(2,'0')).join('');
 const key=new Request('https://wikiscroll.com/__verified-collection/v1/'+digest),cache=work.cache;
 let stored;try{const hit=await cache?.match(key);if(hit)stored=await hit.json();}catch{}
 const lookup=new Map((stored?.items||[]).map(a=>[a.lang+'|'+a.id,a]));
 const finish=items=>({v:1,name:c.name,items:c.items.map(a=>{const item=items.get(a.lang+'|'+a.id);if(!item)throw Error('Article unavailable');return {id:a.id,lang:a.lang,title:item.title,body:item.body.slice(0,240),img:item.img};})});
 if(c.items.every(a=>lookup.has(a.lang+'|'+a.id)))return finish(lookup);
 if(pending.has(key.url))return finish(await pending.get(key.url));
 const job=(async()=>{
  const rows=new Map((stored?.pending||[]).map(a=>[a.lang+'|'+a.id,a]));
  const groups=new Map();
  for(const a of c.items)if(!lookup.has(a.lang+'|'+a.id)&&!rows.has(a.lang+'|'+a.id)){
   const group=a.lang+'|'+a.id[0],list=groups.get(group)||[];list.push(a);groups.set(group,list);
  }
  const chunks=[];for(const list of groups.values())for(let i=0;i<list.length;i+=5)chunks.push(list.slice(i,i+5));
  await Promise.all(chunks.map(async list=>{
   const data=await work.upstream(api(list[0].id,list[0].lang,params(list.map(a=>a.id.slice(1)))));
   for(const a of list){const p=data?.query?.pages?.[a.id.slice(1)];if(valid(p,a.id))rows.set(a.lang+'|'+a.id,{id:a.id,lang:a.lang,page:p});}
  }));
  await Promise.all([...rows.values()].map(async({id,lang,page})=>{
   if(!await opening(page,id,lang,work))return;
   const item=value(page,id,lang);if(item){lookup.set(lang+'|'+id,item);rows.delete(lang+'|'+id);}
  }));
  const complete=c.items.every(a=>lookup.has(a.lang+'|'+a.id));
  if(cache)await cache.put(key,Response.json({items:[...lookup.values()],pending:[...rows.values()]},{headers:{'Cache-Control':`public,max-age=${complete?86400:300}`}}));
  return lookup;
 })();
 pending.set(key.url,job);work.keep(job);
 try{return finish(await job);}finally{pending.delete(key.url);}
}
