import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
test('About card and crawlable page share complete content and valid links',()=>{
 const page=read('dist/about/index.html'),home=read('dist/index.html');
 const body=page.match(/<main class="about-copy">([\s\S]*?)<\/main>/)[1];
 // The reader's copy only waits to load the film poster until About opens.
 assert.ok(home.includes(body.replace(' poster="',' data-poster="')));assert.doesNotMatch(home,/ poster="/);assert.equal((home.match(/data-about-link/g)||[]).length,2);
 for(const feature of ['Collections','Wikivoyage','15 language','Ambient','Home-screen','Cached reading','no account','Mature topics','public data'])assert.ok(body.includes(feature));
 assert.match(body,/href="https:\/\/github\.com\/Golps\/WikiScroll"/,'the About page links to the source code');
 assert.ok(read('public/sitemap.xml').includes('https://wikiscroll.com/about/'));
 assert.ok(read('public/llms.txt').includes('https://wikiscroll.com/about/'));
});
test('About opens as a dialog, closes outside or with its button, and restores focus',()=>{
 const handlers={},links=[{focus(){this.focused=true},addEventListener(t,fn){this.click=fn}}];
 const dialog={open:false,showModal(){this.open=true},close(){this.open=false;handlers.close()},addEventListener(t,fn){handlers[t]=fn},getBoundingClientRect:()=>({left:10,right:300,top:10,bottom:400}),querySelector:()=>film};let close;
 const film={paused:false,pause(){this.paused=true}};
 vm.runInNewContext(read('public/about.js'),{document:{querySelectorAll:()=>links,getElementById:id=>id==='aboutDialog'?dialog:{addEventListener(t,fn){close=fn}}}});
 const click={button:0,preventDefault(){this.prevented=true}};links[0].click(click);assert.ok(dialog.open);assert.ok(click.prevented);
 handlers.click({target:dialog,clientX:30,clientY:30});assert.ok(dialog.open);
 handlers.click({target:dialog,clientX:0,clientY:0});assert.equal(dialog.open,false);assert.ok(links[0].focused);
 assert.ok(film.paused,'closing About stops the film');
 links[0].click(click);close();assert.equal(dialog.open,false);
 links[0].click({...click,metaKey:true});assert.equal(dialog.open,false);
 let stopped=false;handlers.keydown({stopPropagation(){stopped=true}});assert.ok(stopped);
});

test('the reader loads the About film poster only when About opens',()=>{
 const links=[{focus(){},addEventListener(t,fn){this.click=fn}}],attrs={};
 const film={dataset:{poster:'/media/film-poster.jpg'},getAttribute:k=>attrs[k]??null,setAttribute:(k,v)=>attrs[k]=v,pause(){}};
 const dialog={showModal(){},close(){},addEventListener(){},querySelector:()=>film};
 vm.runInNewContext(read('public/about.js'),{document:{querySelectorAll:()=>links,getElementById:id=>id==='aboutDialog'?dialog:{addEventListener(){}}}});
 assert.equal(attrs.poster,undefined);
 links[0].click({button:0,preventDefault(){}});assert.equal(attrs.poster,'/media/film-poster.jpg');
});
