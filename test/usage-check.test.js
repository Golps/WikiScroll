import test from 'node:test';
import assert from 'node:assert/strict';
import {classify,evaluate,readUsage,window,LIMITS} from '../scripts/usage-check.mjs';

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

test('the window covers all of yesterday and this month so far, in UTC',()=>{
 assert.deepEqual(window(new Date('2026-10-28T14:23:00Z')),{dayStart:'2026-10-27T00:00:00.000Z',dayEnd:'2026-10-28T00:00:00.000Z',monthStart:'2026-10-01T00:00:00.000Z',now:'2026-10-28T14:23:00.000Z'});
});
