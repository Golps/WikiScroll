// Generate the shared-collection artwork offline; Workers Free requests never
// initialize a renderer or rasterize fonts. Link titles/descriptions stay specific.
import fs from 'node:fs';
import {Resvg,initWasm} from '@resvg/resvg-wasm';
await initWasm(fs.readFileSync(new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm',import.meta.url)));
const font=fs.readFileSync(new URL('../branding/fonts/DMSerifDisplay-Regular.ttf',import.meta.url));
const svg=fs.readFileSync(new URL('../branding/share-card.svg',import.meta.url),'utf8')
 .replace('>Turn</text>','>Curiosity,</text>')
 .replace('>doomscrolling</text>','>collected.</text>')
 .replace('font-size="70" fill="#94b8ff">into discovery','font-size="44" fill="#94b8ff">Share a little wonder.');
const renderer=new Resvg(svg,{font:{fontBuffers:[font],defaultFontFamily:'DM Serif Display',loadSystemFonts:false}});
try{const image=renderer.render();try{fs.writeFileSync(new URL('../public/images/og-collection-v1.png',import.meta.url),image.asPng());}finally{image.free();}}finally{renderer.free();}
