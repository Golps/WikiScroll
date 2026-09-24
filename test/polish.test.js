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
 const c=vm.createContext({navigator,deepLinkUrl:()=> 'https://wikiscroll.com/?a=w1',toast:m=>messages.push(m)});vm.runInContext(code,c);
 await c.doShare({id:'w1'});assert.equal(copies.length,1);assert.equal(messages[0],'Link copied!');
 navigator.share=async()=>{throw Object.assign(Error(),{name:'AbortError'})};await c.doShare({id:'w1'});assert.equal(messages.length,1);assert.equal(copies.length,1);
 delete navigator.share;navigator.clipboard.writeText=async()=>{throw Error('Denied')};await c.doShare({id:'w1'});assert.match(messages[1],/Could not share/);
});

test('discovery cue advances one card without saving, fades on scroll and pauses dismissal while focused',()=>{
 const events={},attrs={};let timer,scroll,focus;
 const hint={classList:classes(),setAttribute:(k,v)=>attrs[k]=v,removeAttribute:k=>delete attrs[k],addEventListener:(e,f)=>events[e]=f};
 const feed={scrollTop:0,addEventListener:(e,f)=>events['feed'+e]=f,querySelectorAll:()=>[1,2,3],scrollTo:arg=>scroll=arg,focus:()=>focus=true};
 const document={activeElement:null,getElementById:id=>id==='hint'?hint:feed,addEventListener(){}};const window={addEventListener(){}};
 vm.runInNewContext(read('discovery.js'),{document,window,setTimeout:f=>{timer=f;return 1},clearTimeout(){},feedMotionLocked:false,ensureFeedAhead(){},getCurrentFeedCard:()=>1,feedCardTop:card=>card*700,matchMedia:()=>({matches:true})});
 window.WSDiscoveryHint.show();assert.ok(hint.classList.contains('is-visible'));document.activeElement=hint;timer();assert.ok(hint.classList.contains('is-visible'));
 events.click();assert.equal(scroll.top,1400);assert.equal(scroll.behavior,'instant');assert.ok(focus);assert.equal(attrs['aria-hidden'],'true');
 document.activeElement=null;window.WSDiscoveryHint.show();feed.scrollTop=80;events.feedscroll();assert.equal(attrs['aria-hidden'],'true');assert.equal(hint.tabIndex,-1);
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
  const c = vm.createContext({document: {createElement: () => dialog, body: {append: node => appended.push(node)}},
    liked: new Map([['w1', {id: 'w1', title: 'Nautilus'}]]), collections: [{name: 'Sea life', ids: []}], addToCollection() {}, setTimeout});
  vm.runInContext(code + ';openCollectionChooser("w1")', c);
  assert.deepEqual(appended, [dialog], 'the dialog is added to the page');
  assert.equal(dialog.opened, true, 'and shown as a modal');
  let stopped = false; dialog.listeners.keydown({stopPropagation() { stopped = true; }});
  assert.ok(stopped, 'Escape inside the dialog does not also close the Saved Articles panel');
});
