import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResult } from '../dist/data.js';

function fixture() {
  return {
    idg: '1', and: 'p', dt: '25/10/2026', ht: '17:00:00',
    carg: [{ cd: '1', agr: [{ par: [{ sg: 'PARTIDO', cand: [
      { n: '22', nmu: 'CANDIDATO B', vap: '40', pvapn: '40,123456789' },
      { n: '13', nmu: 'CANDIDATO A', vap: '60', pvapn: '59,876543211' }
    ] }] }] }],
    s: { ts: '10', st: '2', snt: '8' },
    v: { vv: '100', vb: '2', pvb: '1,75', vn: '10', vnt: '2', tvn: '12', ptvn: '10,53', tv: '114' },
    e: { c: '114', pc: '80,50', a: '28', pa: '19,50' }
  };
}

test('ordena candidatos pelos votos e preserva a precisão oficial dos percentuais', () => {
  const result = parseResult(fixture());
  assert.deepEqual(result.candidates.map(candidate => candidate.number), ['13', '22']);
  assert.equal(result.candidates[0].percent, 59.876543211);
  assert.equal(result.progress, 20);
});

test('votos nulos incluem nulos técnicos, conforme o campo tvn do EA20', () => {
  const result = parseResult(fixture());
  assert.equal(result.nullVotes, 12);
  assert.equal(result.nullPercent, 10.53);
  assert.equal(result.turnout, 114);
  assert.equal(result.abstention, 28);
  assert.equal(result.abstentionPercent, 19.5);
});

test('usa vn mais vnt quando o total de nulos não estiver disponível', () => {
  const data = fixture(); delete data.v.tvn;
  assert.equal(parseResult(data).nullVotes, 12);
});

test('uma zerésima não gera divisão por zero', () => {
  const data = fixture(); data.s = { ts: '0', st: '0', snt: '0' };
  assert.equal(parseResult(data).progress, 0);
});

test('rejeita arquivos incompletos ou com seções inconsistentes', () => {
  assert.throws(() => parseResult({}), /campos esperados/);
  const data = fixture(); data.s.st = '11';
  assert.throws(() => parseResult(data), /inconsistente/);
  data.s.st = undefined;
  assert.throws(() => parseResult(data), /inválidos/);
});
