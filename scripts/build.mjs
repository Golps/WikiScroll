import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Wrangler's watch build and a manual test/build share dist/. Serialize them.
const root=fileURLToPath(new URL('../',import.meta.url));
const lock=join(tmpdir(),'wikiscroll-build-'+createHash('sha256').update(root).digest('hex').slice(0,16));
const owner=join(lock,'owner.json'),nonce=process.pid+'-'+Date.now();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function acquire(){
  const deadline=Date.now()+120000;
  while(true){
    try{
      await mkdir(lock);
      try{await writeFile(owner,JSON.stringify({pid:process.pid,nonce}));}
      catch(error){await rm(lock,{recursive:true,force:true});throw error;}
      return;
    }
    catch(error){if(error.code!=='EEXIST')throw error;}
    try{
      const held=JSON.parse(await readFile(owner,'utf8'));
      try{process.kill(held.pid,0);}catch(error){
        if(error.code==='ESRCH'){
          // Only one waiter may retire a dead owner's lock. Recheck its identity
          // after claiming cleanup so a newly acquired lock cannot be removed.
          const cleanup=join(lock,'cleanup');
          try{
            await mkdir(cleanup);
            if(JSON.parse(await readFile(owner,'utf8')).nonce===held.nonce)await rm(lock,{recursive:true,force:true});
            else await rm(cleanup,{recursive:true,force:true});
          }catch{}
          continue;
        }
      }
    }catch{} // A new lock's owner file may still be in the process of being written.
    if(Date.now()>=deadline)throw Error('Another Astro build is still running. Wait for it to finish before rebuilding.');
    await sleep(200);
  }
}
async function release(){
  try{if(JSON.parse(await readFile(owner,'utf8')).nonce===nonce)await rm(lock,{recursive:true,force:true});}catch{}
}
await acquire();
try{
  const child=spawn(process.execPath,['node_modules/astro/bin/astro.mjs','build'],{cwd:root,stdio:'inherit'});
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
  if(code)process.exitCode=code;
}finally{await release();}
