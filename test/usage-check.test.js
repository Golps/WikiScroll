import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {classify,evaluate,readUsage,window,LIMITS} from '../scripts/usage-check.mjs';
import {parseGuards,billingMonth} from '../scripts/r2-guards.mjs';

test('R2 operations are split into free, Class A and Class B',()=>{
 assert.deepEqual(classify([{action:'PutObject',requests:10},{action:'ListObjects',requests:2},{action:'GetObject',requests:50},{action:'HeadObject',requests:5},{action:'DeleteObject',requests:99}]),{a:12,b:55});
});

test('only measures at half a free limit or more warn',()=>{
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

test('the guard setting is refused when missing, malformed or above a free allowance',()=>{
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
