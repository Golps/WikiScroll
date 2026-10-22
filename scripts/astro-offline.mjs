import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Compile the generated stylesheet URLs into the existing offline shell.
// This runs only at build time; it adds no client or Worker dependency.
export default function offlineStyles() {
  return {name:'wikiscroll-offline-styles',hooks:{
    'astro:build:done':async({dir})=>{
      const walk=async(folder)=>{
        const entries=await readdir(folder,{withFileTypes:true});
        const files=await Promise.all(entries.map(entry=>entry.isDirectory()?walk(new URL(entry.name+'/',folder)):[new URL(entry.name,folder)]));
        return files.flat();
      };
      const pages=(await walk(dir)).filter(url=>url.pathname.endsWith('.html')).sort((a,b)=>a.href.localeCompare(b.href));
      const styles=new Set(),hash=createHash('sha256');
      for(const page of pages){
        const html=await readFile(page,'utf8');hash.update(html);
        for(const [,href] of html.matchAll(/<link\b[^>]*href="([^\"]+\.css)"[^>]*>/g))if(href.startsWith('/_astro/'))styles.add(href);
      }
      const assets=[...styles].sort();
      if(!assets.length)throw Error('Astro produced no reader stylesheet; refusing an incomplete offline shell');
      for(const href of assets)hash.update(await readFile(new URL(href.slice(1),dir)));
      const swPath=new URL('sw.js',dir),source=await readFile(swPath,'utf8');
      if(!source.includes('/* ASTRO_STYLES */'))throw Error('Offline stylesheet placeholder is missing');
      const compiled=source.replace('/* ASTRO_STYLES */',assets.map(asset=>JSON.stringify(asset)).join(','))
        .replace(/const CACHE='([^']+)';/,(_,name)=>`const CACHE='${name}-${hash.digest('hex').slice(0,12)}';`);
      await writeFile(swPath,compiled);
    },
  }};
}
