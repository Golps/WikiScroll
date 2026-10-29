import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');

test('Astro keeps the reader scripts classic and in their required execution order',()=>{
 const html=read('dist/index.html');
 const scripts=[...html.matchAll(/<script\b([^>]*\bsrc="([^"]+)"[^>]*)>/g)];
 assert.deepEqual(scripts.map(m=>new URL(m[2],'https://wikiscroll.com').pathname),['/lang.js','/i18n.js','/discovery.js','/app.js','/atlas.js','/features.js','/webmcp.js','/about.js']);
 for(const m of scripts)assert.doesNotMatch(m[1],/\b(?:async|defer|type="module")\b/);
 assert.doesNotMatch(html,/<astro-island|astro:page-load|<script[^>]+src="\/_astro\//);
 assert.ok(html.indexOf('/lang.js')<html.indexOf('<body'));
});

test('the clean static build contains public assets but no backend, templates or private material',()=>{
 const walk=dir=>fs.readdirSync(new URL(dir,root),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+e.name+'/'):[dir+e.name]);
 const files=walk('dist/');
 assert.ok(files.includes('dist/index.html'));assert.ok(files.includes('dist/about/index.html'));
 for(const f of files){assert.doesNotMatch(f,/(?:^|\/)(?:worker|src|private|node_modules|\.git|\.env|\.dev\.vars|HANDOFF\.md)(?:\/|$)/);assert.ok(!f.endsWith('.map'));}
 for(const f of walk('public/'))if(f!=='public/sw.js')assert.deepEqual(fs.readFileSync(new URL('dist/'+f.slice(7),root)),fs.readFileSync(new URL(f,root)),f+' changed during build');
 const sw=read('dist/sw.js'),raw=read('public/sw.js');
 assert.equal(sw.split('\n').slice(2).join('\n'),raw.split('\n').slice(2).join('\n'),'only the precache list and cache identity are compiled');
 assert.doesNotMatch(sw,/ASTRO_STYLES/);
 assert.match(sw,/wikiscroll-atlas-v\d+-[a-f0-9]{12}/);
 assert.ok(!fs.existsSync(new URL('public/index.html',root)),'one editable page source, not a second HTML implementation');
 assert.ok(!files.includes('dist/styles.css'),'the retired global stylesheet is not shipped alongside the bundle');
});

test('Astro bundles the ordered styles into one file and precaches its actual generated URL',()=>{
 const html=read('dist/index.html'),sw=read('dist/sw.js');
 const styles=[...html.matchAll(/href="(\/_astro\/[^" ]+\.css)"/g)].map(m=>m[1]);
 assert.equal(styles.length,1);
 for(const url of styles){assert.ok(sw.includes(JSON.stringify(url)));assert.doesNotMatch(read('dist'+url),/@import|sourceMappingURL/);}
});
test('travel forms and collection dialogs are rendered from Astro with unique label references',()=>{
 const html=read('dist/index.html');
 for(const index of [0,1]){assert.match(html,new RegExp('id="travelPlace-'+index+'"'));assert.match(html,new RegExp('for="travelPlace-'+index+'"'));}
 assert.equal((html.match(/<form class="travel-filters"/g)||[]).length,2);
 for(const name of ['collectionChooserTemplate','collectionImportTemplate'])assert.ok(html.includes('<template id="'+name+'">'));
 assert.doesNotMatch(read('public/features.js'),/const markup=|form.innerHTML=/);
 assert.doesNotMatch(read('public/app.js'),/dlg.innerHTML=/);
});
