import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function harness(){
 const document={body:{classList:{toggle(){}},nodeType:0},documentElement:{}};
 const c=vm.createContext({window:{},document,Intl,MutationObserver:class{observe(){}}});
 for(const file of ['translations.js','i18n.js'])vm.runInContext(fs.readFileSync(new URL('../public/'+file,import.meta.url),'utf8'),c);
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
