import assert from 'node:assert/strict';
import { checkTechnologyD1Readiness } from './technology-release-d1-check.mjs';
const good=()=>({success:true,results:[{
  authorized_publishers:4,authorized_admins:1,
  agent_receipts_table:1,admin_receipts_table:1,historical_rows:580,
}]});
assert.deepEqual(checkTechnologyD1Readiness([good()]),{
  authorizedPublishers:4,authorizedAdmins:1,historicalRows:580,
});
assert.equal(checkTechnologyD1Readiness(good()).historicalRows,580);
assert.equal(checkTechnologyD1Readiness({
  ...good(),results:[{...good().results[0],historical_rows:581}],
}).historicalRows,581);
for(const field of ['authorized_publishers','authorized_admins','agent_receipts_table','admin_receipts_table']) {
  const invalid=good();
  invalid.results[0][field]=field==='authorized_publishers'?3:0;
  assert.throws(()=>checkTechnologyD1Readiness([invalid]),/release gate failed/u);
}
for(const invalid of [
  null,[],{},[{}],[{success:false,results:good().results}],
  [{success:true,results:[]}],
  [{success:true,results:[{},{}]}],
  [{...good(),results:[{...good().results[0],historical_rows:579}]}],
]) assert.throws(()=>checkTechnologyD1Readiness(invalid));
console.log('D1 release safety gate: 15 positive/negative checks passed');
