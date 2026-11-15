import assert from 'node:assert/strict';
import { lastTechnologyPage, technologyPage } from '../src/data/technologyPagination.ts';

for (const [total,size,last] of [
  [0,50,1],[1,50,1],[50,50,1],[51,50,2],[580,30,20],
  [20,20,1],[21,20,2],[10001,50,201],
]) assert.equal(lastTechnologyPage(total,size),last);

for (const [raw,last,want] of [
  [null,1,1],['1',1,1],['2',2,2],['200',200,200],
  ['2',1,null],['200',1,null],['0',1,null],['-1',2,null],
  ['01',5,null],['1.2',5,null],['2e1',50,null],['',5,null],
  ['Infinity',5,null],['abc',5,null],['9007199254740993',9999999999999,null],
]) assert.equal(technologyPage(raw,last),want);
for (const [total,size] of [[-1,30],[1,0],[1,-1],[NaN,30]]) {
  assert.throws(()=>lastTechnologyPage(total,size),/invalid technology/u);
}
console.log('Technology pagination: 27 boundary checks passed');
