import {imageURL} from './supply.js';
// Wikivoyage banners are deliberately omitted by PageImages. Resolve only
// files actually included in the guide, in one bounded Commons batch.
export const voyageImageParams = {imlimit:'max'};
const files=new Map(),TTL=86400000,MAX_FILES=512;
const excluded=/\b(?:flag|logo|icon|symbol|map|locator|coat.of.arms|gpx|pictogram|default|disambig)\b/i;
const genericBanner=/^File:(?:Africa|Asia|Europe|Oceania|North America|South America|Antarctica|Australia|Caribbean|New Zealand|Middle East)[ _].*banner/i;
export function voyageImageCandidates(page){
 const names=(page.images||[]).map(x=>x.title).filter(n=>typeof n==='string'&&n.length<=240&&/^File:/i.test(n)&&/\.(?:jpe?g|png|webp)$/i.test(n)&&!excluded.test(n.replaceAll('_',' '))&&!genericBanner.test(n.replaceAll('_',' ')));
 return [...new Set(names)].sort((a,b)=>Number(/banner/i.test(b))-Number(/banner/i.test(a))).slice(0,2);
}
export async function completeVoyageImages(pages,fetchURL){
 const pending=pages.filter(p=>!imageURL(p.thumbnail?.source)&&voyageImageCandidates(p).length).slice(0,25);
 if(!pending.length)return;
 for(const p of pending)p.voyageImagePending=true;
 try{
  const candidates=new Map(pending.map(p=>[p,voyageImageCandidates(p)])),needed=[...new Set([...candidates.values()].flat())],known=new Map(),now=Date.now();
  for(const name of needed){const cached=files.get(name);if(cached&&now-cached.at<TTL)known.set(name,cached.info);else files.delete(name);}
  const missing=needed.filter(n=>!known.has(n));
  if(missing.length){
   let data;try{data=await fetchURL('https://commons.wikimedia.org/w/api.php?'+new URLSearchParams({action:'query',format:'json',titles:missing.join('|'),prop:'imageinfo',iiprop:'url|size',iiurlwidth:'960'}));}catch{}
   const renamed=new Map((data?.query?.normalized||[]).map(n=>[n.from,n.to]));
   const resolved=new Map(Object.values(data?.query?.pages||{}).map(p=>[p.title,p.imageinfo?.[0]]));
   for(const name of missing){const info=resolved.get(renamed.get(name)||name);if(!info||!imageURL(info.thumburl||info.url))continue;known.set(name,info);files.delete(name);files.set(name,{at:now,info});if(files.size>MAX_FILES)files.delete(files.keys().next().value);}
  }
  for(const [p,names] of candidates){
   for(const name of names){const info=known.get(name),url=imageURL(info?.thumburl||info?.url);if(!url||!(info.width>=240&&info.height>=100))continue;p.thumbnail={source:url,width:info.thumbwidth||info.width,height:info.thumbheight||info.height};break;}
  }
 }finally{for(const p of pending)delete p.voyageImagePending;}
}
