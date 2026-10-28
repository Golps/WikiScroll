import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {HELP_TYPES} from '../worker/needs.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('every topic and maintenance type has a bundled icon and adjacent readable text',()=>{
 const app=read('public/app.js'),sheet=read('public/images/ui-icons.svg');
 const c=vm.createContext({});vm.runInContext(app.slice(app.indexOf('const TOPICS ='),app.indexOf('const TOPIC_MAP'))+';globalThis.topicIds=TOPICS.map(t=>t.id);',c);
 for(const name of [...c.topicIds,...Object.keys(HELP_TYPES),'bookmark','clock','folder','map','offline'])assert.ok(sheet.includes('id="'+name+'"'),name);
 assert.doesNotMatch(sheet,/<(?:script|foreignObject|image)\b|(?:href|onload)=/i);
 assert.match(app,/\$\{uiIcon\(t.id\)\} <span>\$\{t.label\}<\/span>/);
 assert.match(read('public/sw.js'),/'\/images\/ui-icons.svg\?v=4'/);
});
test('interface decorations use SVG or plain labels rather than emoji characters',()=>{
 const files=['public/app.js','public/features.js','public/i18n.js',...fs.readdirSync(new URL('../src/components/',import.meta.url)).filter(f=>f.endsWith('.astro')).map(f=>'src/components/'+f)];
 for(const file of files)assert.doesNotMatch(read(file),/[\u{1F000}-\u{1FAFF}]/u,file);
});
