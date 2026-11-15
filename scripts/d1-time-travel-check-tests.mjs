import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {validateTimeTravelCheckpoint} from './d1-time-travel-check.mjs';

const valid='00000085-0000024c-00004c6d-8e61117bf38d7adb71b934ebbf891683';
assert.equal(validateTimeTravelCheckpoint({bookmark:valid}),true);
assert.equal(validateTimeTravelCheckpoint({bookmark:valid,unknown:'safe-to-ignore'}),true);
for(const input of [
  null,undefined,[],{},'bookmarks',{bookmark:null},{bookmark:''},
  {bookmark:'00000085'},
  {bookmark:valid+'\nresponse-header:secret'},
  {bookmark:'***'},
  {bookmark:'a'.repeat(129)},
]) assert.throws(()=>validateTimeTravelCheckpoint(input));
// Verify the CLI never prints a real-looking bookmark in logs or errors.
const script=new URL('./d1-time-travel-check.mjs',import.meta.url).pathname;
const ready=spawnSync(process.execPath,[script],{
  input:JSON.stringify({bookmark:valid}),encoding:'utf8',
});
assert.equal(ready.status,0);
assert.match(ready.stdout,/READY/u);
assert.ok(!ready.stdout.includes(valid));
assert.ok(!ready.stderr.includes(valid));

const invalidCli=spawnSync(process.execPath,[script],{
  input:JSON.stringify({bookmark:'secret-the-cli-must-never-echo'}),encoding:'utf8',
});
assert.notEqual(invalidCli.status,0);
assert.match(invalidCli.stderr,/BLOCKED/u);
assert.ok(!invalidCli.stderr.includes('secret-the-cli-must-never-echo'));
console.log('D1 Time Travel recovery gate: 20 positive and negative checks passed');
