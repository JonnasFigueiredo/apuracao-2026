import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectOfficial, compareDisplay, freshnessProblem, regionCodes, formatInteger, formatPercent, isComplete } from '../scripts/monitor/checks.mjs';

function fixture(region='br') {
  return {
    ele:'6258', t:'2', cdabr:region, tpabr:region==='br'?'br':'uf', idg:'1', and:'p', dg:'25/10/2026', hg:'19:00:00', dt:'25/10/2026', ht:'18:59:00',
    carg:[{ cd:'1', agr:[{ par:[{ cand:[{ n:'22', vap:'40', pvapn:'40' },{ n:'13', vap:'60', pvapn:'60' }] }] }] }],
    s:{ ts:'10', st:'2', snt:'8', pstn:'20' },
    v:{ vv:'100', vb:'2', tvn:'12', tv:'114', pvbn:'1,754385965', ptvnn:'10,526315789' },
    e:{ est:'148', esa:'142', esni:'6', c:'114', a:'28', pcn:'80,281690141', pan:'19,718309859' }
  };
}

function viewOf(result) {
  const metrics = Object.fromEntries(Object.entries({ sectionsCount:result.processed, totalSections:result.total, pendingSections:result.pending, validVotes:result.valid, blankVotes:result.blank, nullVotes:result.nullVotes, turnout:result.turnout, abstention:result.abstention }).map(([k,v]) => [k,formatInteger(v)]));
  Object.assign(metrics,{ apurationPercent:formatPercent(result.progress), progressValue:formatPercent(result.progress), blankPercent:formatPercent(result.blankPercent), nullPercent:formatPercent(result.nullPercent), turnoutPercent:`${formatPercent(result.turnoutPercent)} do eleitorado apurado`, abstentionPercent:`${formatPercent(result.abstentionPercent)} do eleitorado apurado` });
  return {
    metrics, updated:`TSE ${result.updated}`,
    candidates:result.candidates.map(c => ({ number:c.number, votes:`${formatInteger(c.votes)} votos`, percent:formatPercent(c.percent) })),
    states:regionCodes.filter(uf => uf !== 'br').map(uf => ({ uf, leader:result.kind, percent:formatPercent(result.leader.percent), progress:`${formatPercent(result.progress)} apurado`, stale:false })),
    map:regionCodes.filter(uf => uf !== 'br').map(uf => ({ uf, leader:result.kind, stale:false })),
    counts:{ lula:'27', flavio:'0' }
  };
}

test('monitor rejeita 100% arredondado quando ainda há seções pendentes', () => {
  const data=fixture();data.s={ts:'499248',st:'499246',snt:'2',pstn:'99,999599397'};
  const result=inspectOfficial(data,'br'),view=viewOf(result),official=new Map(regionCodes.map(uf=>[uf,result]));
  assert.ok(compareDisplay(view,official).some(message=>message.startsWith('Apuração:')));
  view.metrics.apurationPercent='<100%';view.metrics.progressValue='<100%';
  for(const row of view.states) row.progress='<100% apurado';
  assert.deepEqual(compareDisplay(view,official),[]);
});

test('monitor confere abstenção sem incluir eleitores de seções não instaladas', () => {
  const result = inspectOfficial(fixture(),'br');
  assert.equal(result.abstention,28);
  assert.equal(result.abstentionPercent,19.718309859);
  assert.equal(result.kind,'lula');
});

test('monitor rejeita votos, percentuais e eleição incompatíveis mesmo com HTTP 200', () => {
  for (const mutate of [d => d.v.vv='101', d => d.carg[0].agr[0].par[0].cand[0].pvapn='39', d => d.e.a='29', d => d.s.snt='9', d => d.ele='6257', d => d.v.tvn='-1', d => delete d.e.esa]) {
    const data=fixture(); mutate(data); assert.throws(() => inspectOfficial(data,'br'));
  }
});

test('monitor aceita zerésima sem indicar um candidato líder', () => {
  const data=fixture('se');
  data.s={ts:'10',st:'0',snt:'10',pstn:'0'};
  for (const key of Object.keys(data.v)) data.v[key]='0';
  for (const key of Object.keys(data.e)) data.e[key]='0';
  for (const candidate of data.carg[0].agr[0].par[0].cand) {candidate.vap='0';candidate.pvapn='0';}
  assert.equal(inspectOfficial(data,'se').kind,'waiting');
});

test('monitor identifica empate pelos votos exatos e soma nulos técnicos sem tvn', () => {
  const data=fixture(); delete data.v.tvn; data.v.vn='10';data.v.vnt='2';
  for (const candidate of data.carg[0].agr[0].par[0].cand) {candidate.vap='50';candidate.pvapn='50';}
  const result=inspectOfficial(data,'br'); assert.equal(result.nullVotes,12);assert.equal(result.kind,'tie');
});

test('monitor detecta divergência na tela, mapa, resumo e parcial anterior', () => {
  const result=inspectOfficial(fixture(),'br'), official=new Map(regionCodes.map(uf => [uf,result]));
  const view=viewOf(result); assert.deepEqual(compareDisplay(view,official),[]);
  view.metrics.abstention='29'; view.candidates[0].percent='59,00%'; view.map[0].leader='flavio'; view.states[0].stale=true;view.counts.lula='26';
  const differences=compareDisplay(view,official).join('\n');
  assert.match(differences,/abstention/);assert.match(differences,/Percentual 13/);assert.match(differences,/Liderança do mapa/);assert.match(differences,/parcial anterior/);assert.match(differences,/Contagem de UFs Lula/);
});

test('monitor só cobra arquivo recente na janela de apuração e respeita resultado final', () => {
  const result=inspectOfficial(fixture(),'br');
  const options={from:'2026-10-25T17:00:00-03:00',until:'2026-10-26T15:00:00-03:00',now:Date.parse('2026-10-25T19:50:00-03:00')};
  assert.match(freshnessProblem(result,options),/50 min/);
  assert.equal(freshnessProblem({...result,final:true},options),null);
  assert.equal(freshnessProblem(result,{...options,now:Date.parse('2026-10-27T19:50:00-03:00')}),null);
  assert.equal(freshnessProblem(result,{...options,now:Date.parse('2026-10-25T19:20:00-03:00')}),null);
  assert.match(freshnessProblem({...result,generated:''},options),/sem data/);
  assert.match(freshnessProblem(result,{...options,until:undefined,now:Date.parse('2026-10-27T19:50:00-03:00')}),/sem arquivo nacional novo/);
});

test('monitor só encerra após resultado final e totalização completa em todas as abrangências', () => {
  const complete={final:true,total:10,processed:10};
  const official=new Map(regionCodes.map(uf => [uf,{...complete}]));
  assert.equal(isComplete(official),true);
  official.get('se').final=false;assert.equal(isComplete(official),false);
  official.get('se').final=true;official.get('br').processed=9;assert.equal(isComplete(official),false);
  official.get('br').processed=10;official.delete('ac');assert.equal(isComplete(official),false);
});
