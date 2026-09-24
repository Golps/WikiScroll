// Keep the in-reader card identical to the public About page.
import fs from 'node:fs';
const page=fs.readFileSync('public/about/index.html','utf8');
const body=page.match(/<main class="about-copy">([\s\S]*?)<\/main>/)[1];
const file='public/index.html';let html=fs.readFileSync(file,'utf8');
html=html.replace(/(<!-- ABOUT CONTENT START -->[\s\S]*?<div class="about-copy" lang="en">)[\s\S]*?(<\/div><\/dialog>\n<!-- ABOUT CONTENT END -->)/,(_,start,end)=>start+body+end);
fs.writeFileSync(file,html);
