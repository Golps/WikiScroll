import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {publicationPlan, publishLibrary, RETAIN_MS} from '../scripts/publish-library.mjs';
const now=Date.UTC(2026,9,29), current='20261025', build='20261101';
const object=(id,size=100)=>({Key:`v1/en/${id}/wiki-en-3/0.json`,Size:size});
const input=(extra={})=>({objects:[object(current)],retired:{},current,build,lang:'en',bytes:100,writes:10,cost:5,storageLimit:1000000,writeLimit:100,now,...extra});

test('storage includes the live build, incoming build, other languages and accounting headroom',()=>{
 assert.throws(()=>publicationPlan(input({objects:[object(current,600),{Key:'v1/fr/20261025/a',Size:200}],bytes:300,storageLimit:1000})),/Storage guard/);
 assert.equal(publicationPlan(input()).peak,200+65536);
});
test('only explicitly retired old builds outside the grace period can be removed',()=>{
 const p=publicationPlan(input({objects:[object(current),object('20261018'),object('20261019'),object('20261020')],
 retired:{[current]:0,'20261018':now-RETAIN_MS,'20261019':now-RETAIN_MS+1}}));
 assert.deepEqual(p.remove,['20261018']);assert.equal(p.journal[current],now);
 assert.equal(p.journal['20261020'],now,'previously untracked builds receive a full grace period');
 assert.equal(p.journal['20261019'],now-RETAIN_MS+1);
});
test('a serialized second publication sees the prior reservation and cannot exceed write budget',()=>{
 const first=publicationPlan(input({writes:80,cost:15}));
 assert.throws(()=>publicationPlan(input({writes:first.writes,cost:15})),/Write guard/);
});
test('corrupt accounting and immutable build overwrites fail closed',()=>{
 for(const change of [{writes:NaN},{retired:{'../outside':0}},{objects:[{Key:'x',Size:'100'}]},{current:build}])assert.throws(()=>publicationPlan(input(change)));
});
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'library-publication-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.mkdirSync(path.join(dir,build,'wiki-en-3'),{recursive:true});
 fs.writeFileSync(path.join(dir,build,'wiki-en-3/0.json'),gzipSync('[]'));
 fs.writeFileSync(path.join(dir,'current.json'),gzipSync(JSON.stringify({build,base:build+'/'})));
 const env={R2_BUCKET:'test-bucket',R2_ENDPOINT:'https://example.invalid',LANG_CODE:'en',LIBRARY_BUILD:build,STORAGE_LIMIT:'1000000',WRITE_LIMIT:'10000'};
 const old=gzipSync(JSON.stringify({build:current}));
 const entries=[object(current),{Key:'v1/en/current.json',Size:old.length}];const calls=[];
 const run=(_cmd,args,options)=>{
  calls.push({args,input:options.input});
  if(args[0]==='s3api')return Buffer.from(JSON.stringify({Contents:entries}));
  if(args[0]==='s3'&&args[1]==='cp'&&args[2]==='s3://test-bucket/v1/en/current.json')return old;
  return Buffer.from('');
 };
 return {dir,env,calls,run};
}
test('publisher reserves usage first, uploads shards, records retirement, then switches manifest',t=>{
 const f=fixture(t);publishLibrary(f.dir,f.env,f.run);
 const changes=f.calls.filter(c=>c.args[0]==='s3'&&!(c.args[1]==='cp'&&c.args[3]==='-'));
 assert.match(changes[0].args[3],/usage\/writes-/);
 assert.equal(changes[1].args[1],'sync');assert.match(changes[2].args[3],/usage\/retired-en/);
 assert.match(changes.at(-1).args[3],/v1\/en\/current.json$/);
 assert.ok(!f.calls.some(c=>c.args[1]==='rm'),'current files are never deleted during the switch');
});
test('failed upload leaves the live manifest alone and does not leak raw CLI errors',t=>{
 const f=fixture(t);assert.throws(()=>publishLibrary(f.dir,f.env,(cmd,args,options)=>{
  if(args[1]==='sync')throw new Error('sensitive remote diagnostic');
  return f.run(cmd,args,options);
 }),/^Error: R2 operation failed; publication stopped$/);
 assert.ok(!f.calls.some(c=>c.args[2]===path.join(f.dir,'current.json')));
});
test('failed or malformed listings never become an empty bucket',t=>{
 const f=fixture(t);
 for(const reply of ['{}','{"IsTruncated":true,"Contents":[]}'])assert.throws(()=>publishLibrary(f.dir,f.env,()=>Buffer.from(reply)),/Incomplete bucket listing/);
 assert.throws(()=>publishLibrary(f.dir,f.env,()=>{throw new Error('access denied')}),/R2 operation failed/);
});
test('workflow serializes all languages and runs without dropping queued publications',()=>{
 const workflow=fs.readFileSync(new URL('../.github/workflows/card-library.yml',import.meta.url),'utf8');
 assert.match(workflow,/concurrency:\n  group: wikiscroll-library-publication\n  cancel-in-progress: false\n  queue: max/);
 assert.match(workflow,/max-parallel: 1/);assert.match(workflow,/node scripts\/publish-library.mjs/);
});
