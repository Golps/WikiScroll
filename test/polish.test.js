import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const read=f=>fs.readFileSync(new URL('../public/'+f,import.meta.url),'utf8');
const classes=()=>{const set=new Set();return {add:n=>set.add(n),remove:n=>set.delete(n),contains:n=>set.has(n)}};

test('sharing falls back to copy on failure, reports copy failure, and quietly honors cancellation',async()=>{
 const code=app.slice(app.indexOf('async function doShare'),app.indexOf('// ── TOPICS'));
 const messages=[],copies=[];const navigator={share:async()=>{throw Error('Unavailable')},clipboard:{writeText:async url=>copies.push(url)}};
 const c=vm.createContext({navigator,window:{},deepLinkUrl:()=> 'https://wikiscroll.com/?a=w1',toast:m=>messages.push(m)});vm.runInContext(code,c);
 await c.doShare({id:'w1'});assert.equal(copies.length,1);assert.equal(messages[0],'Link copied!');
 navigator.share=async()=>{throw Object.assign(Error(),{name:'AbortError'})};await c.doShare({id:'w1'});assert.equal(messages.length,1);assert.equal(copies.length,1);
 delete navigator.share;navigator.clipboard.writeText=async()=>{throw Error('Denied')};await c.doShare({id:'w1'});assert.match(messages[1],/Could not share/);
});

test('gesture coach shows one gesture at a time, moves from scroll to swipe, and remembers each',()=>{
 const events={},attrs={},store={};let timer;
 const rows={scroll:{hidden:false},swipe:{hidden:false}};
 const coach={classList:classes(),style:{},setAttribute:(k,v)=>attrs[k]=v,removeAttribute:k=>delete attrs[k],addEventListener:(e,f)=>events[e]=f,querySelector:q=>rows[q.match(/"(\w+)"/)[1]]};
 const feed={scrollTop:0,addEventListener:(e,f)=>events['feed'+e]=f};
 const localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=v};
 const header={getBoundingClientRect:()=>({bottom:118})};
 const load=()=>{const window={addEventListener(){}};vm.runInNewContext(read('discovery.js'),{document:{getElementById:id=>id==='coach'?coach:feed,querySelector:q=>q==='.hdr'?header:null,addEventListener(){},documentElement:{classList:classes()}},window,localStorage,addEventListener(){},setTimeout:f=>{timer=f;return 1},clearTimeout(){}});return window.WSDiscoveryHint;};
 let coachApi=load();
 coachApi.show({swipe:true});assert.ok(coach.classList.contains('is-visible'));assert.equal(coach.style.top,'128px','sits under the header');
 assert.equal(rows.scroll.hidden,false);assert.equal(rows.swipe.hidden,true,'one gesture at a time');
 timer();assert.equal(attrs['aria-hidden'],'true');
 coachApi.show({swipe:true});coachApi.learned('swipe');assert.equal(rows.scroll.hidden,false,'swiping early leaves the scroll tip up');
 delete store.ws_coach;coachApi=load();
 coachApi.show({swipe:true});feed.scrollTop=80;events.feedscroll();
 assert.ok(coach.classList.contains('is-visible'));assert.equal(rows.scroll.hidden,true);assert.equal(rows.swipe.hidden,false,'scrolling turns the pill into the swipe tip');
 coachApi.learned('swipe');assert.ok(!coach.classList.contains('is-visible'));feed.scrollTop=0;
 coachApi=load();coachApi.show({swipe:true});assert.ok(!coach.classList.contains('is-visible'),'nothing left to teach');
 delete store.ws_coach;coachApi=load();coachApi.show({swipe:false});feed.scrollTop=80;events.feedscroll();assert.ok(!coach.classList.contains('is-visible'),'no swipe tip when swiping is off');feed.scrollTop=0;
 delete store.ws_coach;coachApi=load();coachApi.show({swipe:true});events.click();assert.ok(!coach.classList.contains('is-visible'),'tap dismisses');
});

test('failed map lookup clears the old destination and keeps the failure visible',async()=>{
 const overlay={classList:classes()},loading={classList:classes(),querySelector:()=>label},label={textContent:''};let removed=false,view;
 const map={setView:(coords,zoom)=>{view={coords,zoom};return map},invalidateSize(){}};
 const c=vm.createContext({mapRequest:0,mapMarker:{remove(){removed=true}},mapInstance:map,closeAllPanels(){},closeBurger(){},ensureMapLibrary:async()=>{},geocodePlace:async()=>null,setTimeout:f=>{f();return 1},console,document:{getElementById:id=>id==='mapOverlay'?overlay:id==='mapLoading'?loading:{},body:{classList:classes()}}});
 vm.runInContext(app.slice(app.indexOf('async function openMap'),app.indexOf('function closeMap')),c);
 await c.openMap({title:'Unresolvable destination',url:'https://en.wikivoyage.org'});
 assert.ok(removed);assert.equal(c.mapMarker,null);assert.deepEqual(Array.from(view.coords),[20,0]);assert.equal(view.zoom,2);assert.match(label.textContent,/Could not locate/);assert.equal(loading.classList.contains('hidden'),false);
});

test('Collect in Saved Articles opens the collection chooser as a modal dialog', () => {
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('function openCollectionChooser('));
  const stub = () => { const found = {}, listeners = {}; return {style: {}, hidden: false, listeners, append() {}, addEventListener(type, fn) { listeners[type] = fn; }, setCustomValidity() {}, focus() {}, querySelector: s => (found[s] ||= stub())}; };
  const dialog = Object.assign(stub(), {showModal() { this.opened = true; }});
  const appended = [];
  const c = vm.createContext({cloneUiTemplate:()=>dialog,document: {createElement: () => dialog, body: {append: node => appended.push(node)}},
    liked: new Map([['w1', {id: 'w1', title: 'Nautilus'}]]), collections: [{name: 'Sea life', ids: []}], addToCollection() {}, setTimeout});
  vm.runInContext(code + ';openCollectionChooser("w1")', c);
  assert.deepEqual(appended, [dialog], 'the dialog is added to the page');
  assert.equal(dialog.opened, true, 'and shown as a modal');
  let stopped = false; dialog.listeners.keydown({stopPropagation() { stopped = true; }});
  assert.ok(stopped, 'Escape inside the dialog does not also close the Saved Articles panel');
});


test('cloned dialog shells scope root ARIA references and input labels per instance',()=>{
 const node=(id,attrs={})=>({id,getAttribute:key=>attrs[key]??null,setAttribute:(key,value)=>attrs[key]=value,attrs});
 const roots=[];
 const template={content:{firstElementChild:{cloneNode(){
  const title=node('title'),input=node('name'),label=node('',{for:'name'}),root=node('',{'aria-labelledby':'title','aria-describedby':'external title'});
  root.querySelectorAll=selector=>selector==='[id]'?[title,input]:[label];root.children={title,input,label};roots.push(root);return root;
 }}}};
 const c=vm.createContext({document:{getElementById:()=>template}});
 vm.runInContext('let uiTemplateSequence=0;'+app.slice(app.indexOf('function cloneUiTemplate('),app.indexOf('function openCollectionChooser(')),c);
 const first=c.cloneUiTemplate('template'),second=c.cloneUiTemplate('template');
 assert.equal(first.attrs['aria-labelledby'],first.children.title.id);
 assert.equal(first.attrs['aria-describedby'],'external '+first.children.title.id);
 assert.equal(first.children.label.attrs.for,first.children.input.id);
 assert.notEqual(first.children.input.id,second.children.input.id);
});

test('focus rings hide after a tap or click and return on any key press',()=>{
 const listeners={},root={classList:classes()};
 vm.runInNewContext(read('discovery.js').slice(read('discovery.js').indexOf('/* Focus rings')),{document:{documentElement:root},addEventListener:(e,f)=>listeners[e]=f});
 listeners.pointerdown();assert.ok(root.classList.contains('pointer-input'));
 listeners.keydown({metaKey:false,ctrlKey:false,altKey:false});assert.ok(!root.classList.contains('pointer-input'));
 listeners.touchstart();listeners.keydown({metaKey:true});assert.ok(root.classList.contains('pointer-input'),'shortcuts do not count as keyboard navigation');
 const css=fs.readFileSync(new URL('../src/styles/discovery.css',import.meta.url),'utf8');
 assert.match(css,/\.pointer-input :focus, \.pointer-input :focus-visible \{ outline: none !important; \}/);
});

test('sharing an article sends the link alone so apps show its preview',async()=>{
 const code=app.slice(app.indexOf('async function doShare'),app.indexOf('// ── TOPICS'));
 const shared=[];
 const c=vm.createContext({navigator:{share:async data=>{shared.push(data)}},deepLinkUrl:()=> 'https://wikiscroll.com/?a=w1',toast(){}});vm.runInContext(code,c);
 await c.doShare({id:'w1',title:'Octopus'});
 assert.equal(JSON.stringify(shared),'[{"url":"https://wikiscroll.com/?a=w1"}]');
 assert.doesNotMatch(app,/WSShareCard|files:/);
});

test('settings choices share one hover and settings opens at the top',()=>{
 const css=fs.readFileSync(new URL('../src/styles/settings.css',import.meta.url),'utf8');
 for (const sel of ['.reading-size-choices button:not(.on):hover','.help-type-grid button:hover','.depth-step:not(.active):hover','.sp-about-links .about-link:hover']) assert.ok(css.includes(sel),sel);
 assert.match(app,/getElementById\('settingsPanel'\)\.scrollTop = 0/);
 assert.match(app,/#burgerMenu \.burger-inner'\); if \(inner\) inner\.scrollTop = 0/);
});
