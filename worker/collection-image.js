import { Resvg, initWasm } from '@resvg/resvg-wasm';
import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import font from './fonts/DMSerifDisplay-Regular.ttf';
let ready;
export async function renderPNG(svg){
 ready ||= initWasm(wasm);await ready;
 const renderer=new Resvg(svg,{font:{fontBuffers:[new Uint8Array(font)],defaultFontFamily:'DM Serif Display',loadSystemFonts:false}});
 try{const rendered=renderer.render();try{return rendered.asPng();}finally{rendered.free();}}finally{renderer.free();}
}
