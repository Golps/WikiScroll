import {permit} from './security.js';
const pending=new Map();
export async function verifiedArticle(id,lang,env,ctx) {
  const key=new Request(`https://wikiscroll.com/__verified/v2/${lang}/${id}`),cache=globalThis.caches?.default;
  try { const hit=await cache?.match(key); if(hit)return await hit.json(); } catch {}
  if(pending.has(key.url))return pending.get(key.url);
  const job=(async()=>{
    if(!await permit(env,'WORK_LIMIT','metadata'))throw Error('Busy');
    const host=`${lang}.${id[0]==='v'?'wikivoyage':'wikipedia'}.org`;
    const params=new URLSearchParams({action:'query',format:'json',pageids:id.slice(1),prop:'extracts|pageimages',exintro:'1',explaintext:'1',exchars:'600',piprop:'thumbnail',pithumbsize:'1200'});
    const response=await fetch(`https://${host}/w/api.php?${params}`,{headers:{'User-Agent':'WikiScroll/4.0 (https://wikiscroll.com)'},signal:AbortSignal.timeout(6000),redirect:'manual'});
    if(!response.ok)throw Error('Source unavailable');
    const data=await response.json(),p=data?.query?.pages?.[id.slice(1)];
    const clean=s=>String(s||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
    const value=p&&p.missing===undefined&&p.ns===0&&p.pageid===Number(id.slice(1))?{id,lang,title:clean(p.title).slice(0,160),body:clean(p.extract).slice(0,600),img:/^https:\/\/(?:upload|thumb)\.wikimedia\.org\//.test(p.thumbnail?.source||'')?p.thumbnail.source:'',src:id[0]==='v'?'how':'wiki',url:`https://${host}/?curid=${id.slice(1)}`} : null;
    if(cache)ctx.waitUntil(cache.put(key,Response.json(value,{headers:{'Cache-Control':`public,max-age=${value?86400:300}`}})).catch(()=>{}));
    return value;
  })();
  pending.set(key.url,job);
  try{return await job;}finally{pending.delete(key.url);}
}
export async function verifyCollection(c,env,ctx){
  const items=[];
  // Four requests at a time bounds memory and upstream concurrency.
  for(let i=0;i<c.items.length;i+=4){
    const batch=await Promise.all(c.items.slice(i,i+4).map(a=>verifiedArticle(a.id,a.lang,env,ctx)));
    if(batch.some(a=>!a))throw Error('Article unavailable');
    items.push(...batch.map(a=>({id:a.id,lang:a.lang,title:a.title,body:a.body.slice(0,240),img:a.img})));
  }
  return {v:1,name:c.name,items};
}
