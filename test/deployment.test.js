import test from 'node:test';
import assert from 'node:assert/strict';
import {activeVersion} from '../scripts/verify-deployment.mjs';
const since='2026-10-07T10:00:00Z';
const answer=(created_on,versions)=>({success:true,result:{deployments:[{created_on,versions}]}});
test('a restricted-token upload succeeds only when a new version actually receives all traffic',()=>{
  const versions=[{version_id:'new-version',percentage:100}];
  assert.equal(activeVersion(answer('2026-10-07T10:01:00Z',versions),since),'new-version');
  assert.throws(()=>activeVersion(answer('2026-10-07T09:00:00Z',versions),since));
  assert.throws(()=>activeVersion(answer('2026-10-07T10:01:00Z',[{version_id:'new-version',percentage:50}]),since));
  assert.throws(()=>activeVersion({success:false},since));
});
