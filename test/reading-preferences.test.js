import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const slice=(from,to)=>app.slice(app.indexOf(from),app.indexOf(to,app.indexOf(from)));
function preferences(){
 const classes=new Set(),events=[];let saved;
 const c=vm.createContext({readingTextSize:'standard',dimImages:false,READING_TEXT_SIZES:['standard','large','larger'],document:{body:{dataset:{},classList:{toggle(k,on){on?classes.add(k):classes.delete(k);}}}},window:{dispatchEvent:e=>events.push(e.type)},Event,saveSettings(){saved={size:c.readingTextSize,dim:c.dimImages};},syncAllToggles(){},resetFeed(){throw Error('reading preferences must not reset the feed');}});
 vm.runInContext(slice('function applyReadingPreferences(', 'function setAmbient('),c);
 return {c,classes,events,saved:()=>saved};
}
test('reading size changes persist, refit excerpts and never reset discovery',()=>{
 const h=preferences();h.c.setReadingTextSize('larger');
 assert.equal(h.c.document.body.dataset.readingSize,'larger');assert.deepEqual(h.saved(),{size:'larger',dim:false});
 assert.deepEqual(h.events,['reading-preference-change']);
 h.c.setReadingTextSize('bogus');assert.equal(h.c.readingTextSize,'larger');assert.equal(h.events.length,1);
 h.c.setReadingTextSize('standard');assert.equal(h.c.document.body.dataset.readingSize,'standard');
});
test('dimming defaults off and does not change reading size or discovery',()=>{
 const h=preferences();h.c.applyReadingPreferences();assert.ok(!h.classes.has('dim-images'));
 h.c.setDimImages(true);assert.ok(h.classes.has('dim-images'));assert.equal(h.saved().dim,true);
 h.c.setDimImages(false);assert.ok(!h.classes.has('dim-images'));assert.equal(h.c.readingTextSize,'standard');
});
test('reading preferences survive saves of unrelated settings',()=>{
 let saved;const c=vm.createContext({lsSet:(_,v)=>saved=v,readingTextSize:'large',dimImages:true,ambientEnabled:false,swipeEnabled:true,kbBarEnabled:true,helpMode:'only',lightMode:true,depthLevel:5,curLang:'he'});
 vm.runInContext(slice('function saveSettings(', 'function saveHistory('),c);c.saveSettings();
 assert.equal(saved.readingTextSize,'large');assert.equal(saved.dimImages,true);assert.equal(saved.depth,5);assert.equal(saved.lang,'he');
});
test('image inspection ignores drags and long presses, and supports keyboard activation',()=>{
 const handlers={},attrs={},image={dataset:{},setAttribute:(k,v)=>attrs[k]=v,addEventListener:(k,f)=>handlers[k]=f};
 let opens=0,now=0;const c=vm.createContext({performance:{now:()=>now},openImageInspection:()=>opens++});
 vm.runInContext(slice('function setupImageInspection(', "imageDialog.addEventListener('pointerdown'"),c);
 c.setupImageInspection({querySelector:()=>image},{title:'Test'});
 handlers.pointerdown({isPrimary:true,pointerId:1,clientX:0,clientY:0});now=100;handlers.click();assert.equal(opens,1);
 handlers.pointerdown({isPrimary:true,pointerId:1,clientX:0,clientY:0});handlers.pointermove({pointerId:1,clientX:35,clientY:0});handlers.click();assert.equal(opens,1);
 handlers.pointerdown({isPrimary:true,pointerId:1,clientX:0,clientY:0});now=800;handlers.click();assert.equal(opens,1);
 let prevented=false;handlers.keydown({key:'Enter',preventDefault(){prevented=true;}});assert.equal(opens,2);assert.ok(prevented);
 assert.equal(attrs.role,'button');assert.equal(attrs['aria-haspopup'],'dialog');
});
test('every interface dictionary covers the new reading and image controls',()=>{
 const files=fs.readdirSync(new URL('../public/translations/',import.meta.url));
 for(const f of files){const c={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../public/translations/'+f,import.meta.url),'utf8'),c);const d=Object.values(c.window.WS_TRANSLATIONS)[0];for(const key of ['Reading text','Standard','Large','Larger','Dim images in dark mode','View image','Close image','View image and credits on the original article'])assert.ok(d[key],f+': '+key);}
});

test('image inspection refuses unloaded photos and blocked interactions',()=>{
 let opens=0,blocked=false;const c=vm.createContext({imageDialog:{open:false,showModal(){opens++;}},document:{querySelector:()=>blocked,body:{classList:{contains:()=>false}},getElementById:()=>({})}});
 vm.runInContext(slice('function openImageInspection(', 'function setupImageInspection('),c);
 c.openImageInspection({title:'Test'}, {complete:false,naturalWidth:0});
 c.openImageInspection({title:'Test'}, {complete:true,naturalWidth:0});
 blocked=true;c.openImageInspection({title:'Test'},{complete:true,naturalWidth:800});assert.equal(opens,0);
});
