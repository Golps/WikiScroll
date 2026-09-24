const CACHE='wikiscroll-atlas-v73';
const SHELL=['/discovery.js?v=49','/about/','/about.css?v=50','/about.js?v=47','/images/wordmark-dark.svg','/images/wordmark-light.svg','/styles.css?v=67','/images/favicon.ico?v=42','/images/apple-touch-icon.png?v=42','/images/icon-192.png?v=42','/images/icon-512.png?v=42','/translations.js?v=49','/i18n.js?v=49','/data/starter-en.json','/features.js?v=61','/','/app.js?v=71','/atlas.js?v=55','/manifest.json','/images/icon-192.png','/images/icon-512.png'];
// Wikimedia serves article images from both hosts (thumb.wikimedia.org since 2026).
const IMAGE_HOSTS=new Set(['upload.wikimedia.org','thumb.wikimedia.org']);
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('wikiscroll-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(url.pathname.startsWith('/collection'))return;
  if(req.method!=='GET'||url.pathname.includes('/api.php')||url.pathname.includes('/api/rest_v1/')||url.pathname.startsWith('/api/')||url.hostname==='wikimedia.org'||url.hostname.endsWith('.wikimedia.org')&&!IMAGE_HOSTS.has(url.hostname))return;
  if(req.mode==='navigate'&&url.origin===self.location.origin){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE).catch(()=>null);
      // Query parameters select cards inside the home app; distinct public
      // pages must keep their own offline document.
      const key=url.pathname==='/index.html'?'/':url.pathname;
      const network=fetch(req).then(response=>{
        if(response.ok&&cache)event.waitUntil(cache.put(key,response.clone()).catch(()=>{}));
        return response;
      });
      event.waitUntil(network.catch(()=>{}));
      let timer;
      const winner=await Promise.race([network.catch(()=>null),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),2500);})]);
      clearTimeout(timer);
      return winner||await cache?.match(key).catch(()=>null)||await network.catch(()=>new Response('Offline — reconnect to load WikiScroll.',{status:503,headers:{'Content-Type':'text/plain'}}));
    })());
    return;
  }
  const local=url.origin===self.location.origin;
  const image=IMAGE_HOSTS.has(url.hostname)&&req.destination==='image';
  if(!local&&!image)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE).catch(()=>null),cached=await cache?.match(req).catch(()=>null);
    if(cached)return cached;
    try{
      const response=await fetch(req);
      if(cache&&(response.ok||image&&response.type==='opaque')){
        event.waitUntil((async()=>{
          await cache.put(req,response.clone());
          if(image){const keys=await cache.keys();const images=keys.filter(k=>IMAGE_HOSTS.has(new URL(k.url).hostname));for(const key of images.slice(0,Math.max(0,images.length-80)))await cache.delete(key);}
        })().catch(()=>{}));
      }
      return response;
    }catch{return Response.error();}
  })());
});
