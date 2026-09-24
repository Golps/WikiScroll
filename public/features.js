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
const TRAVEL_STYLES={nature:'nature hiking park',coast:'beach coast island',culture:'museum history culture',city:'city urban'};
async function fetchFilteredTravel(){
 if(travelExhausted)return [];
 const generation=fillGeneration,lang=voyageLang();
 const place=String(travelFilters.place||'').replace(/[^\p{L}\p{N}\s'-]/gu,' ').trim().slice(0,80);
 const style=TRAVEL_STYLES[travelFilters.style]||'';
 const query=[place?`"${place}"`:'',style?`(${style.split(' ').join(' OR ')})`:''].filter(Boolean).join(' ');
 const params=new URLSearchParams({lang,place,style:travelFilters.style||'',offset:String(travelOffset)});
 let data;try{const response=await fetch('/api/travel?'+params,{signal:AbortSignal.timeout(10000)});if(!response.ok)return [];data=await response.json();}catch{return [];}
 if(generation!==fillGeneration)return [];
 if(!data)return [];
 travelOffset=data.next??travelOffset;travelExhausted=data.next===null;
 const seen=new Set(articles.map(a=>a.id).concat(queue.map(a=>a.id)));
 const result=(data.articles||[]).filter(a=>!seen.has(a.id));
 if(travelExhausted&&!result.length)toast('No more matching destinations. Try broadening your travel filters.');
 return result;
}
function installTravelFilters(){
 const markup='<h3>Wikivoyage · Travel filters</h3><p>Choose a destination and trip style.</p><label>Country or region<input name="place" maxlength="80" placeholder="e.g. Japan, Tuscany"></label><label>Trip style<select name="style"><option value="">Any style</option><option value="nature">Nature & hiking</option><option value="coast">Coasts & islands</option><option value="culture">History & culture</option><option value="city">City breaks</option></select></label><div class="feature-buttons"><button class="feature-action" type="submit">Explore destinations</button><button type="button" class="travel-clear">Clear filters</button></div>';
 for(const parent of [document.querySelector('#settingsPanel'),document.querySelector('.burger-inner')]){
 const form=document.createElement('form');form.className='travel-filters';form.innerHTML=markup;parent.querySelector('.platform-stats').after(form);
 form.elements.place.value=travelFilters.place||'';form.elements.style.value=travelFilters.style||'';
 form.onsubmit=e=>{e.preventDefault();travelFilters={place:form.elements.place.value.trim(),style:form.elements.style.value};lsSet('ws_travel_filters',travelFilters);syncTravel();closeAllPanels();closeBurger();if(curMode!=='how')setMode('how');else resetFeed();};
 form.querySelector('.travel-clear').onclick=()=>{travelFilters={place:'',style:''};lsSet('ws_travel_filters',travelFilters);syncTravel();if(curMode==='how'){closeAllPanels();closeBurger();resetFeed();}};
 }
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
