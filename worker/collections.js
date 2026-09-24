import { wordmark } from './wordmark.js';
import {verifyCollection} from './verified.js';
import {permit,limited} from './security.js';
import {LANGS as languages} from './languages.js';
const renders=new Map();
export const encodeCollection=c=>btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(c)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function decodeCollection(encoded) {
  if (!encoded || encoded.length>12000 || !/^[\w-]+$/.test(encoded)) throw Error('Invalid collection');
  const value=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));
  if(value.v!==1 || typeof value.name!=='string' || !value.name.trim() || value.name.length>80 || !Array.isArray(value.items) || !value.items.length || value.items.length>30) throw Error('Invalid collection');
  const seen=new Set();
  for(const a of value.items){
    if(!/^[wv][1-9]\d{0,11}$/.test(a.id)||!languages.has(a.lang)||typeof a.title!=='string'||!a.title.trim()||a.title.length>160||typeof a.body!=='string'||a.body.length>240||seen.has(a.lang+a.id)) throw Error('Invalid article');
    seen.add(a.lang+a.id);
  }
  return {v:1,name:value.name.trim(),items:value.items.map(({id,lang,title,body})=>({id,lang,title,body}))};
}
function lines(text,max=26,n=3){const words=text.split(/\s+/),out=[''];for(const word of words){let i=out.length-1;if(out[i].length+word.length+1>max&&out[i]){if(out.length===n){out[i]=out[i].slice(0,max-1)+'…';break;}out.push(word);}else out[i]+=(out[i]?' ':'')+word;}return out.map(x=>x.length>max?x.slice(0,max-1)+'…':x);}
export function collectionSVG(c){
 const title=lines(c.name,25,3),names=c.items.slice(0,3).map(a=>lines(a.title,28,2));
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#11151b"/><path d="M64 95H1136M64 550H1136" stroke="#343e4d"/><g transform="translate(64 28) scale(.48)" style="color:#edf0f5">${wordmark}</g><text x="64" y="147" font-family="DM Serif Display" font-size="22" fill="#94b8ff">A COLLECTION OF DISCOVERIES</text>${title.map((t,i)=>`<text x="64" y="${228+i*69}" font-family="DM Serif Display" font-size="62" fill="#edf0f5">${esc(t)}</text>`).join('')}<text x="64" y="492" font-family="DM Serif Display" font-size="28" fill="#aab5c5">${c.items.length} ${c.items.length===1?'article':'articles'} · Curiosity, collected.</text>${names.map((ls,i)=>`<rect x="780" y="${125+i*133}" width="356" height="115" rx="12" fill="${i===1?'#24354f':'#1b222c'}"/><text x="800" y="${154+i*133}" font-family="DM Serif Display" font-size="18" fill="#94b8ff">0${i+1}</text>${ls.map((t,j)=>`<text x="800" y="${184+i*133+j*26}" font-family="DM Serif Display" font-size="23" fill="#edf0f5">${esc(t)}</text>`).join('')}`).join('')}<text x="64" y="591" font-family="DM Serif Display" font-size="23" fill="#aab5c5">Open a collection. Find something unexpected.</text><text x="963" y="591" font-family="DM Serif Display" font-size="23" fill="#94b8ff">wikiscroll.com</text></svg>`;
}

export async function collectionResponse(request,ctx,env){
 const u=new URL(request.url);let encoded=u.searchParams.get('c'),c;
 try{c=decodeCollection(encoded);}catch{return new Response('This collection link is invalid or incomplete.',{status:400});}
 if(!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405});
 if(request.method==='HEAD')return new Response(null,{headers:{'Content-Type':u.pathname.endsWith('.png')?'image/png':u.pathname.startsWith('/api/')?'application/json':'text/html;charset=utf-8','Cache-Control':'no-store'}});
 try{c=await verifyCollection(c,env,ctx);}catch(error){console.warn('Collection verification:',error.message);return new Response('These articles cannot be verified right now. Please retry shortly.',{status:503,headers:{'Retry-After':'60','Cache-Control':'no-store'}});}
 if(u.pathname==='/api/collection')return Response.json(c,{headers:{'Cache-Control':'no-store'}});
 encoded=encodeCollection(c);
 const canonical='https://wikiscroll.com/collection?c='+encoded, image='https://wikiscroll.com/collection.png?v=42&c='+encoded;
 if(u.pathname==='/collection.png'){
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(encoded))),b=>b.toString(16).padStart(2,'0')).join('');
  const key=new Request('https://wikiscroll.com/__collection-image/v4/'+digest),cache=globalThis.caches?.default;
  try{const hit=await cache?.match(key);if(hit)return hit;}catch{}
  if(renders.has(digest))return (await renders.get(digest)).clone();
  const job=(async()=>{
   if(!await permit(env,'RENDER_LIMIT','images'))return limited();
   const {renderPNG}=await import('./collection-image.js');
   const png=await renderPNG(collectionSVG(c));
   const res=new Response(png,{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=86400'}});
   if(cache)ctx.waitUntil(cache.put(key,res.clone()).catch(()=>{}));return res;
  })();
  renders.set(digest,job);
  try{return (await job).clone();}finally{renders.delete(digest);}
 }
 const description=`${c.items.length} articles to explore: ${c.items.slice(0,3).map(a=>a.title).join(', ').replace(/\s*—\s*/g, ', ')}${c.items.length>3?', and more.':'.'}`.slice(0,300);
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.name)} | WikiScroll collection</title><meta name="robots" content="noindex,follow"><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonical)}"><meta property="og:type" content="website"><meta property="og:site_name" content="WikiScroll"><meta property="og:title" content="${esc(c.name)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:type" content="image/png"><meta property="og:image:alt" content="${esc(c.name)}: a collection of ${c.items.length} articles on WikiScroll"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(c.name)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(image)}"><link rel="icon" href="/images/favicon.ico"><style>body{margin:0;background:#11151b;color:#edf0f5;font:17px/1.6 system-ui}main{max-width:850px;margin:auto;padding:36px 24px}a{color:#94b8ff}header{border-bottom:1px solid #343e4d;margin-bottom:36px;padding-bottom:18px}h1{font:clamp(36px,7vw,62px)/1.1 Georgia;margin:18px 0}h2{font:28px/1.2 Georgia}article{background:#1b222c;border:1px solid #343e4d;border-radius:14px;padding:24px;margin:18px 0}p{color:#aab5c5}.action{display:inline-block;padding:12px 20px;border-radius:10px;background:#36c;color:white;text-decoration:none}small{letter-spacing:1px}footer{margin-top:40px}.collection-image{display:block;width:100%;height:240px;object-fit:contain;background:#11151b;border-radius:10px;margin-bottom:20px}@media(max-width:600px){.collection-image{height:180px}}</style></head><body><main><header><a href="/"><img src="/images/wordmark-dark.svg" alt="WikiScroll" width="180" height="38" style="vertical-align:middle"></a> / SHARED COLLECTION</header><small>${c.items.length} DISCOVERIES</small><h1>${esc(c.name)}</h1><p>A reading list shared with you. Open any article to explore.</p><a class="action" href="/?importCollection=${encoded}">Save a copy to my collections</a>${c.items.map(a=>`<article>${a.img?`<img class="collection-image" src="${esc(a.img)}" alt="" loading="lazy" decoding="async">`:""}<small>${a.id[0]==='v'?'WIKIVOYAGE':'WIKIPEDIA'} · ${esc(a.lang.toUpperCase())}</small><h2>${esc(a.title)}</h2><p>${esc(a.body)}</p><a href="/?a=${a.id}&amp;lang=${a.lang}">Discover in WikiScroll →</a> · <a href="https://${a.lang}.${a.id[0]==='v'?'wikivoyage':'wikipedia'}.org/?curid=${a.id.slice(1)}">Read original article</a></article>`).join('')}<footer><p>This reading list has a name chosen by its creator. Its article selection stays fixed; titles and excerpts are verified against Wikimedia and may update. Anyone with the link can read it. Article excerpts come from Wikipedia and Wikivoyage; see each original article for attribution and licensing.</p><a href="/">Discover more with WikiScroll</a></footer></main></body></html>`;
 return new Response(request.method==='HEAD'?null:html,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'public,max-age=3600','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https://upload.wikimedia.org https://thumb.wikimedia.org; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",'Referrer-Policy':'strict-origin','X-Content-Type-Options':'nosniff'}});
}
