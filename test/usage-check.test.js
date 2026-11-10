import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {classify,evaluate,readUsage,window,LIMITS,checkUsage} from '../scripts/usage-check.mjs';
import {parseGuards,billingMonth} from '../scripts/r2-guards.mjs';

test('R2 operations are split into uncounted, Class A and Class B',()=>{
 assert.deepEqual(classify([{action:'PutObject',requests:10},{action:'ListObjects',requests:2},{action:'GetObject',requests:50},{action:'HeadObject',requests:5},{action:'DeleteObject',requests:99}]),{a:12,b:55});
});

test('only measures at half a ceiling or more warn',()=>{
 const quiet=evaluate({workerRequests:20_000,r2Bytes:1.8e9,classA:70_000,classB:400_000});
 assert.equal(quiet.warnings.length,0);assert.equal(quiet.rows.length,4);
 const busy=evaluate({workerRequests:LIMITS.workerRequestsPerDay/2,r2Bytes:1.8e9,classA:70_000,classB:9e6});
 assert.deepEqual(busy.warnings.map(w=>w.name),['Worker requests yesterday','R2 Class B operations this month']);
});

test('the analytics answer is summed per measure, with storage per bucket',()=>{
 const usage=readUsage({workers:[{sum:{requests:300}},{sum:{requests:200}}],operations:[{sum:{requests:62_454},dimensions:{actionType:'PutObject'}},{sum:{requests:900},dimensions:{actionType:'GetObject'}}],
  storage:[{max:{payloadSize:1.7e9,metadataSize:1e6},dimensions:{bucketName:'cards'}},{max:{payloadSize:1.75e9,metadataSize:1e6},dimensions:{bucketName:'cards'}}]});
 assert.deepEqual(usage,{workerRequests:500,r2Bytes:1.751e9,classA:62_454,classB:900});
});

test('the window covers all of yesterday and this billing month so far, in UTC',()=>{
 assert.deepEqual(window(15,new Date('2026-10-28T14:23:00Z')),{dayStart:'2026-10-27T00:00:00.000Z',dayEnd:'2026-10-28T00:00:00.000Z',monthStart:'2026-10-15T00:00:00.000Z',now:'2026-10-28T14:23:00.000Z'});
 // Before the billing day the month started on that day last month, across a year end too.
 assert.equal(window(15,new Date('2026-11-14T23:00:00Z')).monthStart,'2026-10-15T00:00:00.000Z');
 assert.equal(window(15,new Date('2026-11-15T00:00:00Z')).monthStart,'2026-11-15T00:00:00.000Z');
 assert.equal(window(15,new Date('2027-01-01T08:00:00Z')).monthStart,'2026-12-15T00:00:00.000Z');
 assert.equal(window(1,new Date('2026-03-01T00:00:00Z')).monthStart,'2026-03-01T00:00:00.000Z');
});

test('the guard setting is refused when missing, malformed or above the included usage',()=>{
 const ok={writeLimit:500_000,storageLimit:5e9,billingDay:15};
 assert.deepEqual(parseGuards(JSON.stringify(ok)),ok);
 for(const bad of [undefined,'','not json','null','[]',JSON.stringify({...ok,writeLimit:undefined}),JSON.stringify({...ok,writeLimit:'500000'}),
  JSON.stringify({...ok,writeLimit:LIMITS.r2ClassAPerMonth+1}),JSON.stringify({...ok,storageLimit:LIMITS.r2Bytes+1}),JSON.stringify({...ok,storageLimit:0}),
  JSON.stringify({...ok,billingDay:0}),JSON.stringify({...ok,billingDay:29}),JSON.stringify({...ok,billingDay:2.5})])
  assert.throws(()=>parseGuards(bad),/^Error: R2_GUARDS: /);
});

test('the ledger is named for the month its billing month starts in',()=>{
 assert.equal(billingMonth(15,new Date('2026-11-14T23:59:59Z')).name,'2026-10');
 assert.equal(billingMonth(15,new Date('2026-11-15T00:00:00Z')).name,'2026-11');
 assert.equal(billingMonth(15,new Date('2027-01-03T00:00:00Z')).name,'2026-12');
});

test('the guard script prints shell settings and never the raw secret on failure',()=>{
 const run=env=>spawnSync(process.execPath,['scripts/r2-guards.mjs'],{env:{PATH:process.env.PATH,...env},encoding:'utf8'});
 const ok=run({R2_GUARDS:JSON.stringify({writeLimit:500_000,storageLimit:5e9,billingDay:15})});
 assert.equal(ok.status,0);assert.match(ok.stdout,/^WRITE_LIMIT=500000\nSTORAGE_LIMIT=5000000000\nLEDGER_MONTH=\d{4}-\d{2}\n$/);
 const bad=run({R2_GUARDS:'{"writeLimit":123456789}'});
 assert.equal(bad.status,2);assert.equal(bad.stdout,'');assert.doesNotMatch(bad.stderr,/123456789/);
 assert.equal(run({}).status,2);
});

const configured = {CF_ACCOUNT_ID:'test-account',CF_ANALYTICS_TOKEN:'test-token',R2_GUARDS:JSON.stringify({writeLimit:500_000,storageLimit:5e9,billingDay:15})};
const emptyUsage = () => ({workers:[],operations:[],storage:[]});
const analyticsResponse = account => ({ok:true,status:200,json:async()=>({data:{viewer:{accounts:[account]}}})});
async function runCheck(options={}) {
 const logs=[],errors=[];
 const status=await checkUsage({env:configured,fetchImpl:async()=>analyticsResponse(emptyUsage()),log:line=>logs.push(line),error:line=>errors.push(line),...options});
 return {status,logs,errors};
}

test('missing monitoring configuration fails before any analytics request',async()=>{
 for(const env of [{},{...configured,CF_ACCOUNT_ID:''},{...configured,CF_ANALYTICS_TOKEN:''},{...configured,CF_ANALYTICS_TOKEN:'  '},{...configured,R2_GUARDS:''},{...configured,R2_GUARDS:'private-invalid-guard'}]) {
  let called=false;
  const result=await runCheck({env,fetchImpl:async()=>{called=true;throw Error('unexpected request');}});
  assert.equal(result.status,2);assert.equal(called,false);assert.deepEqual(result.logs,[]);
  assert.match(result.errors.join('\n'),/Usage not checked:/);
  assert.doesNotMatch(result.errors.join('\n'),/test-account|test-token|private-invalid-guard/);
 }
 const cli=spawnSync(process.execPath,['scripts/usage-check.mjs'],{env:{PATH:process.env.PATH},encoding:'utf8'});
 assert.equal(cli.status,2);assert.equal(cli.stdout,'');assert.match(cli.stderr,/Usage not checked:/);
});

test('verified readings keep the success and threshold-warning exit statuses',async()=>{
 const quiet=await runCheck();
 assert.equal(quiet.status,0);assert.equal(quiet.logs.length,4);assert.deepEqual(quiet.errors,[]);
 const warning=await runCheck({fetchImpl:async()=>analyticsResponse({...emptyUsage(),workers:[{sum:{requests:50_000}}]})});
 assert.equal(warning.status,1);assert.equal(warning.logs.length,4);assert.match(warning.errors[0],/Past 50.0% of a ceiling: Worker requests yesterday/);
});

test('network, HTTP, GraphQL and invalid JSON failures cannot become threshold warnings',async()=>{
 for(const fetchImpl of [
  async()=>{throw Error('private-network-detail test-token');},
  async()=>({ok:false,status:403,json:async()=>({errors:[{message:'private-account-detail'}]})}),
  async()=>({ok:true,status:200,json:async()=>({data:{viewer:{accounts:[emptyUsage()]}},errors:[{message:'private-account-detail'}]})}),
  async()=>({ok:true,status:200,json:async()=>{throw Error('private-invalid-json');}}),
  async()=>({ok:true,status:200,json:async()=>({data:{viewer:{accounts:[]}}})}),
 ]) {
  const result=await runCheck({fetchImpl});
  assert.equal(result.status,2);assert.deepEqual(result.logs,[]);assert.match(result.errors.join('\n'),/Usage not checked:/);
  assert.doesNotMatch(result.errors.join('\n'),/private-|test-token/);
 }
});

test('missing or malformed datasets fail rather than being counted as zero',async()=>{
 for(const account of [
  {},{...emptyUsage(),workers:null},{...emptyUsage(),operations:undefined},{...emptyUsage(),storage:{}},
  {...emptyUsage(),workers:[null]},{...emptyUsage(),workers:[{sum:{requests:-1}}]},
  {...emptyUsage(),workers:[{sum:{requests:'5'}}]},{...emptyUsage(),workers:[{sum:{requests:NaN}}]},
  {...emptyUsage(),operations:[{sum:{requests:1}}]},
  {...emptyUsage(),storage:[{max:{payloadSize:1,metadataSize:null},dimensions:{bucketName:'private-bucket'}}]},
  {...emptyUsage(),storage:[{max:{payloadSize:1,metadataSize:0}}]},
 ]) {
  assert.throws(()=>readUsage(account),/incomplete or invalid analytics/);
  const result=await runCheck({fetchImpl:async()=>analyticsResponse(account)});
  assert.equal(result.status,2);assert.deepEqual(result.logs,[]);assert.doesNotMatch(result.errors.join('\n'),/private-bucket/);
 }
});

test('the analytics request stays read-only, bounded and uses the configured billing window',async()=>{
 let request;
 const result=await runCheck({now:new Date('2026-11-10T14:23:00Z'),fetchImpl:async(url,options)=>{request={url,...options};return analyticsResponse(emptyUsage());}});
 assert.equal(result.status,0);assert.equal(request.url,'https://api.cloudflare.com/client/v4/graphql');
 assert.equal(request.method,'POST');assert.equal(request.headers.Authorization,'Bearer test-token');
 assert.ok(request.signal instanceof AbortSignal);assert.equal(request.signal.aborted,false);
 const body=JSON.parse(request.body);
 assert.match(body.query,/^query\(/);assert.doesNotMatch(body.query,/mutation/);
 assert.equal(body.variables.account,'test-account');assert.equal(body.variables.monthStart,'2026-10-15T00:00:00.000Z');
 assert.doesNotMatch(result.logs.join('\n'),/test-account|test-token/);
});

test('the workflow always checks configuration and only alerts for a measured warning',()=>{
 const source=readFileSync(new URL('../.github/workflows/usage-check.yml',import.meta.url),'utf8');
 const step=source.match(/      - name: Compare usage with its ceilings\n([\s\S]*?)(?=      - name:)/)?.[1];
 assert.ok(step);assert.doesNotMatch(step,/^\s+if:/m);
 assert.match(step,/node scripts\/usage-check\.mjs/);assert.match(step,/\[ "\$status" -ne 0 \] && \[ "\$status" -ne 1 \]/);
 assert.match(step,/exit 1/);assert.match(source,/if: steps\.usage\.outputs\.status == '1'/);
 assert.doesNotMatch(source,/continue-on-error:/);
});
