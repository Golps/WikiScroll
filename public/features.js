// Share only the selected snapshot; nothing is uploaded from other collections.
function encodeSnapshot(value){return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function snapshotItems(){
 const col=collections[activeCollection];if(!col)return [];
 return col.ids.map(id=>liked.get(id)).filter(Boolean).map(a=>{
  const lang=new URL(a.url).hostname.split('.')[0];
  return {id:a.id,lang,title:a.title.slice(0,160),body:(a.body||'').slice(0,240)};
 });
}
function renderCollectionShare(){
 let box=document.getElementById('collectionShare');
 if(!box){box=document.createElement('div');box.id='collectionShare';document.getElementById('collTabs').after(box);}
 box.replaceChildren();if(activeCollection===null||!collections[activeCollection])return;
 const items=snapshotItems();if(!items.length)return;
 const note=document.createElement('p');note.textContent='Share a snapshot. Anyone with the link can read these articles.';
 const button=document.createElement('button');button.className='feature-action';button.textContent='Share collection';
 const encoded=encodeSnapshot({v:1,name:collections[activeCollection].name.slice(0,80),items});
 if(items.length>30||encoded.length>12000){note.textContent='Shareable collections support up to 30 articles. Create a smaller collection to share.';button.disabled=true;}
 button.onclick=async()=>{const url='https://wikiscroll.com/collection?c='+encoded;
 try{if(navigator.share)await navigator.share({title:collections[activeCollection].name,url});else{await navigator.clipboard.writeText(url);toast('Collection link copied');}}catch(e){if(e.name!=='AbortError')toast('Could not share. Try again.');}};
 const preview=document.createElement('a');preview.textContent='Preview collection';preview.href='/collection?c='+encoded;preview.target='_blank';preview.rel='noopener';preview.className='collection-preview';
 box.append(note,button);if(!button.disabled)box.append(preview);
}
async function fetchFilteredTravel(){
 const generation=fillGeneration,lang=voyageLang();
 // The Worker reads the place as typed: "Japan, Tuscany" means either place.
 const params=()=>new URLSearchParams({lang,place:String(travelFilters.place||'').trim().slice(0,80),style:travelFilters.style||'',offset:String(travelOffset)});
 // A page of results can hold no guides about the place while later pages do,
 // so look a little further before leaving it to the next refill.
 for(let page=0;page<3&&!travelExhausted;page++){
  let data;try{const response=await fetch('/api/travel?'+params(),{signal:AbortSignal.timeout(10000)});if(!response.ok)return [];data=await response.json();}catch{return [];}
  if(generation!==fillGeneration||!data)return [];
  travelOffset=data.next??travelOffset;travelExhausted=data.next===null;
  if(typeof data.suggestion==='string')travelSuggestion=data.suggestion;
  const seen=new Set(articles.map(a=>a.id).concat(queue.map(a=>a.id)));
  const result=(data.articles||[]).filter(a=>!seen.has(a.id));
  if(result.length)return result;
 }
 return [];
}
// When a travel filter runs out, the feed ends on a card that says so and
// offers the next step: the same place in any style, all destinations, or new
// filters. It never switches to unrelated guides on its own, and it never
// just stops without a word.
const TRAVEL_STYLE_LABELS={nature:'Nature & hiking',coast:'Coasts & islands',culture:'History & culture',city:'City breaks'};
function showTravelEnd(){
 const feed=document.getElementById('feed');
 const found=!!feed.querySelector('.card[data-id]');
 let card=feed.querySelector('.travel-end');
 if(!card){card=document.createElement('div');card.className='card travel-end';feed.appendChild(card);}
 const place=travelFilters.place||'',style=travelFilters.style||'';
 card.innerHTML=`<div class="cbg"><div class="cveil"></div></div><div class="err"><div class="err-ico">🧭</div><h2 class="err-ttl">${found?"That's every matching guide":'No matching guides'}</h2><div class="err-msg">${found?"You've seen every guide that matches your travel filters.":'Nothing on Wikivoyage matches your travel filters.'}</div><p class="travel-end-filter"></p><div class="travel-end-actions"></div></div>`;
 const filter=card.querySelector('.travel-end-filter');
 if(place){const name=document.createElement('span');name.className='travel-end-place';name.dir='auto';name.textContent=place;filter.append(name);}
 if(place&&style)filter.append(' · ');
 if(style){const label=document.createElement('span');label.textContent=TRAVEL_STYLE_LABELS[style]||style;filter.append(label);}
 const actions=card.querySelector('.travel-end-actions'),add=(label,run)=>{const b=document.createElement('button');b.type='button';b.className='err-btn';b.textContent=label;b.onclick=run;actions.append(b);};
 if(!found&&travelSuggestion&&place)add('Search for “'+travelSuggestion+'”',()=>{setTravelFilters({place:travelSuggestion,style});resetFeed();});
 if(place&&style)add('Try any trip style',()=>continueTravel({place,style:''}));
 add('Explore all destinations',()=>continueTravel({place:'',style:''}));
 add('Change filters',openTravelFilters);
}
function setTravelFilters(filters){travelFilters=filters;lsSet('ws_travel_filters',travelFilters);syncTravel();}
// Keep going from where the reader is: the end card becomes a loading card,
// and new guides are added after it (cards already seen are skipped).
function continueTravel(filters){
 setTravelFilters(filters);travelOffset=0;travelExhausted=false;travelSuggestion='';
 const card=document.querySelector('#feed .travel-end');
 if(!card||!document.querySelector('#feed .card[data-id]')){resetFeed();return;}
 travelContinuing=true;
 card.innerHTML=`<div class="cbg"><div class="cveil"></div></div><div class="spin-wrap"><div class="spin h"></div><div class="spin-lbl">Loading destinations…</div></div>`;
 fillQueue().then(ensureFeedAhead);
}
function openTravelFilters(){
 const desktop=document.getElementById('settingsBtn')?.offsetParent!==null;
 if(desktop)openSettings();else openBurger();
 setTimeout(()=>document.querySelector(`${desktop?'#settingsPanel':'.burger-inner'} .travel-filters input[name="place"]`)?.focus(),350);
}
// Rebuild the feed while the drawer still covers it, then close the drawer two
// frames later. Doing both in one frame cost the close animation its first
// frames and made the drawer jump shut.
function changeFeedThenClose(change){
 change();
 requestAnimationFrame(()=>requestAnimationFrame(()=>{closeAllPanels();closeBurger();}));
}
function installTravelFilters(){
 const markup='<h3>Wikivoyage · Travel filters</h3><p>Choose a destination and trip style.</p><div class="travel-place"><div class="travel-place-head"><label for="travelPlace-N">Country or region</label><button type="button" class="travel-info" aria-expanded="false" aria-controls="travelHelp-N" aria-label="How place search works" title="How place search works">i</button></div><div class="travel-help" id="travelHelp-N" hidden><p>Type a country, region or city, like Japan or Tuscany.</p><p>To search several places at once, separate them with commas: Japan, Tuscany. Guides from each place take turns in your feed.</p><p>A guide is included when its name or introduction mentions the place.</p><p>When you\'ve seen every matching guide, the feed tells you and lets you widen the search.</p></div><input id="travelPlace-N" name="place" maxlength="80" placeholder="e.g. Japan, Tuscany"></div><label>Trip style<select name="style"><option value="">Any style</option><option value="nature">Nature & hiking</option><option value="coast">Coasts & islands</option><option value="culture">History & culture</option><option value="city">City breaks</option></select></label><div class="feature-buttons"><button class="feature-action" type="submit">Explore destinations</button><button type="button" class="travel-clear">Clear filters</button></div>';
 [document.querySelector('#settingsPanel'),document.querySelector('.burger-inner')].forEach((parent,index)=>{
 const form=document.createElement('form');form.className='travel-filters';form.innerHTML=markup.replaceAll('-N','-'+index);parent.querySelector('.platform-stats').after(form);
 // The ⓘ button shows how place search works, including several places.
 const info=form.querySelector('.travel-info'),help=form.querySelector('.travel-help');
 info.onclick=()=>{help.hidden=!help.hidden;info.setAttribute('aria-expanded',String(!help.hidden));};
 form.elements.place.value=travelFilters.place||'';form.elements.style.value=travelFilters.style||'';
 form.onsubmit=e=>{e.preventDefault();travelFilters={place:form.elements.place.value.trim(),style:form.elements.style.value};lsSet('ws_travel_filters',travelFilters);syncTravel();changeFeedThenClose(()=>{if(curMode!=='how')setMode('how');else resetFeed();});};
 form.querySelector('.travel-clear').onclick=()=>{travelFilters={place:'',style:''};lsSet('ws_travel_filters',travelFilters);syncTravel();if(curMode==='how')changeFeedThenClose(resetFeed);};
 });
}
function syncTravel(){document.querySelectorAll('.travel-filters').forEach(f=>{f.elements.place.value=travelFilters.place||'';f.elements.style.value=travelFilters.style||'';});}
installTravelFilters();
// Import is a deliberate save action, never triggered just by opening a link.
const importCode=new URL(location.href).searchParams.get('importCollection');
if(importCode){
 (async()=>{try{
 if(importCode.length>12000)throw Error();
 const response=await fetch('/api/collection?c='+encodeURIComponent(importCode),{cache:'no-store'});
 if(!response.ok)throw Error();
 const data=await response.json();
 const dlg=document.createElement('dialog');dlg.className='source-dialog collection-dialog';
 const heading=document.createElement('h2');heading.textContent='Save “'+data.name+'”?';const note=document.createElement('p');note.textContent=`Add ${data.items.length} articles to a new collection on this device.`;
 const save=document.createElement('button');save.className='feature-action';save.textContent='Save collection';const cancel=document.createElement('button');cancel.textContent='Cancel';cancel.className='source-close';
 save.onclick=()=>{let name=data.name;while(collections.some(c=>c.name.toLowerCase()===name.toLowerCase()))name+=' (copy)';const ids=[];for(const a of data.items){ids.push(a.id);if(!liked.has(a.id)){const saved={...a,src:a.id[0]==='v'?'how':'wiki',img:a.img||'',url:`https://${a.lang}.${a.id[0]==='v'?'wikivoyage':'wikipedia'}.org/?curid=${a.id.slice(1)}`};liked.set(a.id,saved);IDB.put(saved);}}collections.push({name,ids});saveCollections();saveLiked();updateBadge();activeCollection=collections.length-1;renderLikedList();dlg.close();toast('Collection saved');};
 cancel.onclick=()=>dlg.close();dlg.addEventListener('keydown',e=>e.stopPropagation());dlg.addEventListener('close',()=>setTimeout(()=>dlg.remove(),400));const actions=document.createElement('div');actions.className='collection-dialog-actions';actions.append(save,cancel);dlg.append(heading,note,actions);document.body.append(dlg);dlg.showModal();
 }catch{toast('Could not verify this collection. Please reopen the link to try again.');}})();
 const clean=new URL(location.href);clean.searchParams.delete('importCollection');window.history.replaceState(null,'',clean);
}
