import fs from 'node:fs';
import {Resvg,initWasm} from '@resvg/resvg-wasm';
await initWasm(fs.readFileSync(new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm',import.meta.url)));
function png(svg,path,width){const r=new Resvg(svg,{font:{loadSystemFonts:false},...(width?{fitTo:{mode:'width',value:width}}:{})});fs.writeFileSync(path,r.render().asPng());r.free();}
// The approved social artwork is an exported raster source, not a generated globe.
fs.copyFileSync('branding/discovery-preview.png','public/images/og-discovery-v10.png');
const icon=fs.readFileSync('branding/monogram.svg','utf8');
for(const size of [192,512])png(icon,`public/images/icon-${size}.png`,size);png(icon,'public/images/apple-touch-icon.png',180);png(icon.replace('<path', '<g transform="translate(51.2 51.2) scale(.8)"><path').replace('</svg>','</g></svg>'),'public/images/icon-maskable.png',512);
png(icon,'branding/favicon.png',32);const data=fs.readFileSync('branding/favicon.png'),header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header[6]=32;header[7]=32;header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(data.length,14);header.writeUInt32LE(22,18);fs.writeFileSync('public/images/favicon.ico',Buffer.concat([header,data]));
