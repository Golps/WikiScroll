import {verifyCollection} from './verified.js';
import {createWork} from './runtime.js';
import {LANGS as languages} from './languages.js';
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

export async function collectionResponse(request,ctx,env,work=createWork(env,ctx)){
 const u=new URL(request.url);let encoded=u.searchParams.get('c'),c;
 try{c=decodeCollection(encoded);}catch{return new Response('This collection link is invalid or incomplete.',{status:400});}
 if(!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405});
 if(request.method==='HEAD')return new Response(null,{headers:{'Content-Type':u.pathname.endsWith('.png')?'image/png':u.pathname.startsWith('/api/')?'application/json':'text/html;charset=utf-8','Cache-Control':'no-store'}});
 if(u.pathname==='/collection.png'){
  if(!work.charge(true))return new Response('Please retry shortly.',{status:503,headers:{'Retry-After':'5'}});
  const asset=await env.ASSETS.fetch(new Request(new URL('/images/og-discovery-v9.png',u)));
  return new Response(asset.body,{status:asset.status,headers:{'Content-Type':'image/png','Cache-Control':asset.ok?'public,max-age=86400':'no-store'}});
 }
 try{c=await verifyCollection(c,env,ctx,work);}catch(error){console.warn('Collection verification:',error.message);return new Response('These articles cannot be verified right now. Please retry shortly.',{status:503,headers:{'Retry-After':String(work.retrySeconds()),'Cache-Control':'no-store'}});}
 if(u.pathname==='/api/collection')return Response.json(c,{headers:{'Cache-Control':'no-store'}});
 encoded=encodeCollection(c);
 const canonical='https://wikiscroll.com/collection?c='+encoded, image='https://wikiscroll.com/collection.png?v=44&c='+encoded;

 const description=`${c.items.length} articles to explore: ${c.items.slice(0,3).map(a=>a.title).join(', ').replace(/\s*—\s*/g, ', ')}${c.items.length>3?', and more.':'.'}`.slice(0,300);
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.name)} | WikiScroll collection</title><meta name="robots" content="noindex,follow"><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonical)}"><meta property="og:type" content="website"><meta property="og:site_name" content="WikiScroll"><meta property="og:title" content="${esc(c.name)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:type" content="image/png"><meta property="og:image:alt" content="${esc(c.name)}: a collection of ${c.items.length} articles on WikiScroll"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(c.name)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(image)}"><link rel="icon" href="/images/favicon.ico"><style>body{margin:0;background:#11151b;color:#edf0f5;font:17px/1.6 system-ui}main{max-width:850px;margin:auto;padding:36px 24px}a{color:#94b8ff}header{border-bottom:1px solid #343e4d;margin-bottom:36px;padding-bottom:18px}h1{font:clamp(36px,7vw,62px)/1.1 Georgia;margin:18px 0}h2{font:28px/1.2 Georgia}article{background:#1b222c;border:1px solid #343e4d;border-radius:14px;padding:24px;margin:18px 0}p{color:#aab5c5}.action{display:inline-block;padding:12px 20px;border-radius:10px;background:#36c;color:white;text-decoration:none}small{letter-spacing:1px}footer{margin-top:40px}.collection-image{display:block;width:100%;height:240px;object-fit:contain;background:#11151b;border-radius:10px;margin-bottom:20px}@media(max-width:600px){.collection-image{height:180px}}</style></head><body><main><header><a href="/"><img src="/images/wordmark-dark.svg" alt="WikiScroll" width="180" height="38" style="vertical-align:middle"></a> / SHARED COLLECTION</header><small>${c.items.length} DISCOVERIES</small><h1>${esc(c.name)}</h1><p>A reading list shared with you. Open any article to explore.</p><a class="action" href="/?importCollection=${encoded}">Save a copy to my collections</a>${c.items.map(a=>`<article>${a.img?`<img class="collection-image" src="${esc(a.img)}" alt="" loading="lazy" decoding="async">`:""}<small>${a.id[0]==='v'?'WIKIVOYAGE':'WIKIPEDIA'} · ${esc(a.lang.toUpperCase())}</small><h2>${esc(a.title)}</h2><p>${esc(a.body)}</p><a href="/?a=${a.id}&amp;lang=${a.lang}">Discover in WikiScroll →</a> · <a href="https://${a.lang}.${a.id[0]==='v'?'wikivoyage':'wikipedia'}.org/?curid=${a.id.slice(1)}">Read original article</a></article>`).join('')}<footer><p>This reading list has a name chosen by its creator. Its article selection stays fixed; titles and excerpts are verified against Wikimedia and may update. Anyone with the link can read it. Article excerpts come from Wikipedia and Wikivoyage; see each original article for attribution and licensing.</p><a href="/">Discover more with WikiScroll</a></footer></main></body></html>`;
 return new Response(request.method==='HEAD'?null:html,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'public,max-age=3600','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https://upload.wikimedia.org https://thumb.wikimedia.org; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",'Referrer-Policy':'strict-origin','X-Content-Type-Options':'nosniff'}});
}
