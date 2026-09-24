import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function harness(){
 const document={body:{classList:{toggle(){}},nodeType:0},documentElement:{}};
 const c=vm.createContext({window:{},document,Intl,MutationObserver:class{observe(){}}});
 const files=fs.readdirSync(new URL('../public/translations/',import.meta.url)).map(f=>'translations/'+f);
 for(const file of [...files,'i18n.js'])vm.runInContext(fs.readFileSync(new URL('../public/'+file,import.meta.url),'utf8'),c);
 return c.window;
}
test('every supported non-English language translates the core controls, not user text',()=>{
 const w=harness(),api=w.WSI18n;
 assert.equal(Object.keys(w.WS_TRANSLATIONS).length,14);
 for(const lang of Object.keys(w.WS_TRANSLATIONS)){
  for(const key of ['Settings','Read full article','Clear all topics','Country or region','Excerpt'])assert.ok(api.translate(key,lang)!==key,lang+': '+key);
  assert.equal(api.translate('My collection: A & B <travel>',lang),'My collection: A & B <travel>');
 }
 assert.equal(api.translate('Change ›','es'),'Cambiar ›');assert.equal(api.translate('🍽️ Food','fr'),'🍽️ Cuisine');
});
test('repeated language changes restore originals and handle freshly rendered control labels',()=>{
 const api=harness().WSI18n;
 const parent={closest:()=>null};const node={nodeType:3,parentElement:parent,nodeValue:'Save'};
 api.setLanguage('es');api.apply(node);assert.equal(node.nodeValue,'Guardar');
 api.setLanguage('fr');api.apply(node);assert.equal(node.nodeValue,'Enregistrer');
 node.nodeValue='Saved';api.apply(node);assert.equal(node.nodeValue,'Enregistré');
 api.setLanguage('en');api.apply(node);assert.equal(node.nodeValue,'Saved');
 node.parentElement={closest:()=>({})};node.nodeValue='Save';api.setLanguage('es');api.apply(node);assert.equal(node.nodeValue,'Save');
});
test('offline shell preloads every versioned interface asset referenced by the page',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),sw=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
 const assets=[...html.matchAll(/(?:src|href)="(\/[^" ]+\?v=\d+)"/g)].map(m=>m[1]);
 assert.ok(assets.length>=7);
 for(const asset of assets)assert.ok(sw.includes("'"+asset+"'"),'Missing from offline shell: '+asset);
});

test('Hebrew is optional, translates controls, and returns to English',()=>{
 const api=harness().WSI18n;
 assert.equal(api.translate('Settings'),'Settings');
 api.setLanguage('he'); assert.equal(api.translate('Settings'),'הגדרות');
 api.setLanguage('en'); assert.equal(api.translate('Settings'),'Settings');
});

test('messages shown after an action are translated in every language, including collection names and counts',()=>{
 const w=harness(),api=w.WSI18n,langs=Object.keys(w.WS_TRANSLATIONS);
 const messages=['Link copied!','✨ Feed refreshed','📎 Opened shared article','Could not share. Open the article to copy its link.','Collection deleted',
  'No articles in this collection yet. Add some from the "All" tab.',"Swipe right or press Save to keep articles here. They'll be available offline too.",
  'Articles you view will appear here so you can find them again.','Clear travel filters',"Wikipedia didn't respond.","Wikivoyage didn't respond.",
  "You're offline. Reconnect and try again. Your saved articles are still available.",'No matching guides. Try a broader country or region, or clear your travel filters in Settings.',
  '📍 Could not locate this place','Map could not load. Close it and try again.','❌ Map failed to render','Tap a collection below to add this article immediately.',
  '＋ Create new collection','Create a new collection','Create and save','Back','Create your first collection to organize this article.',
  'Shareable collections support up to 30 articles. Create a smaller collection to share.','Could not verify this collection. Please reopen the link to try again.',
  'No more matching destinations. Try broadening your travel filters.','🌍 Travel','View map','📖 Just now','Enter a collection name','Read on Wikivoyage ↗',
  "📡 You're offline. Cached articles still work",'A collection with this name already exists'];
 for(const lang of langs)for(const message of messages)assert.notEqual(api.translate(message,lang),message,lang+': '+message);
 const name='Sea $& life <b>';
 for(const lang of langs)for(const message of ['📁 Collection "'+name+'" created','Added to "'+name+'"',name+' · Add here',name+' ✓ Added','Save “'+name+'”?']){
  const result=api.translate(message,lang);
  assert.notEqual(result,message,lang+': '+message);assert.ok(result.includes(name),lang+' keeps the collection name as typed: '+result);
 }
 for(const lang of langs)assert.match(api.translate('Add 12 articles to a new collection on this device.',lang),/12/,lang);
 assert.equal(api.translate('Added to "Viaje"','es'),'Añadido a "Viaje"');
});
test('every literal toast message in the app has a translation',()=>{
 const w=harness(),api=w.WSI18n;
 const code=['app.js','features.js'].map(f=>fs.readFileSync(new URL('../public/'+f,import.meta.url),'utf8')).join('\n');
 const literals=[...code.matchAll(/toast\((['"])((?:(?!\1).)+)\1\s*[,)]/g)].map(m=>m[2].replace(/\\'/g,"'"));
 assert.ok(literals.length>=8);
 for(const lang of Object.keys(w.WS_TRANSLATIONS))for(const text of literals)assert.notEqual(api.translate(text,lang),text,lang+': '+text);
});

test('each reader downloads only their own language, and every language works offline',()=>{
 const read=f=>fs.readFileSync(new URL('../public/'+f,import.meta.url),'utf8');
 const html=read('index.html'),sw=read('sw.js'),loader=read('lang.js');
 assert.doesNotMatch(html,/translations/,'the page itself loads no dictionary');
 assert.ok(html.indexOf('/lang.js?v=')<html.indexOf('<body'),'the loader starts in <head>');
 const version=loader.match(/const VERSION = (\d+);/)[1];
 const langs=fs.readdirSync(new URL('../public/translations/',import.meta.url)).map(f=>f.replace('.js',''));
 assert.equal(langs.length,14);
 for(const lang of langs){
  assert.ok(sw.includes(`'/translations/${lang}.js?v=${version}'`),'offline shell: '+lang);
  assert.match(read(`translations/${lang}.js`),new RegExp(`^\\(window\\.WS_TRANSLATIONS \\|\\|= \\{\\}\\)\\["${lang}"\\] = \\{`,'m'));
 }
});
test('a dictionary that arrives after the page is shown is applied to it',async()=>{
 const loads=[];let resolveLoad;
 const document={body:{classList:{toggle(){}},nodeType:0},documentElement:{},dispatchEvent(e){loads.push(e.type);}};
 const c=vm.createContext({window:{},document,Intl,Event:class{constructor(type){this.type=type;}},MutationObserver:class{observe(){}}});
 c.window.WSTranslations={load:lang=>{loads.push('load '+lang);return new Promise(r=>{resolveLoad=r;});}};
 vm.runInContext(fs.readFileSync(new URL('../public/i18n.js',import.meta.url),'utf8'),c);
 const api=c.window.WSI18n;
 api.setLanguage('es');
 assert.equal(api.translate('Settings'),'Settings','English until the dictionary arrives');
 vm.runInContext(fs.readFileSync(new URL('../public/translations/es.js',import.meta.url),'utf8'),c);
 resolveLoad(true);await new Promise(r=>setTimeout(r,0));
 assert.equal(api.translate('Settings'),'Ajustes');
 assert.deepEqual(loads,['load es','wsi18n:ready']);
 api.setLanguage('en');assert.equal(loads.length,2,'English needs no download');
});
