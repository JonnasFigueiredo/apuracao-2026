import test from 'node:test';
import assert from 'node:assert/strict';
import {formatProgress} from '../dist/data.js';

test('últimas seções pendentes não aparecem como 100% por arredondamento',()=>{
  assert.equal(formatProgress({processed:499246,total:499248,pending:2,progress:499246/499248*100}),'<100%');
  assert.equal(formatProgress({processed:499248,total:499248,pending:0,progress:100}),'100,00%');
  assert.equal(formatProgress({processed:0,total:499248,pending:499248,progress:0}),'0,00%');
  assert.equal(formatProgress({processed:9999,total:10000,pending:1,progress:99.99}),'99,99%');
});
