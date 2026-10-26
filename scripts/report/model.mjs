import { inspectOfficial } from '../monitor/checks.mjs';
import { states } from '../../dist/states.js';

export const territories = [...states.map(({uf,name,region}) => ({uf,name,region})), {uf:'zz',name:'Exterior',region:'Exterior'}];
export const scopes = ['br', ...territories.map(s => s.uf)];
export const finalists = [{number:'13',name:'Lula'},{number:'22',name:'Flávio Bolsonaro'}];
export const sourceUrl = (turn,scope) => {
  const election=String(turn)==='1'?'6257':'6258';
  return `https://resultados.tse.jus.br/oficial/ele2026/${election}/dados/${scope}/${scope}-c0001-e${election.padStart(6,'0')}-u.json`;
};
export const complete = data => data?.final === true && data.total > 0 && data.processed === data.total && data.pending === 0;
const percentage = (votes,valid) => valid ? votes/valid*100 : 0;
const votesFor = (data,number) => data.candidates.find(c => c.number===number)?.votes ?? 0;
export function change(first,second) {
  return {first,second,delta:second-first,growthPercent:first===0?null:(second-first)/first*100};
}
function candidateChange(first,second,candidate) {
  const counts=change(votesFor(first,candidate.number),votesFor(second,candidate.number));
  const firstPercent=percentage(counts.first,first.valid),secondPercent=percentage(counts.second,second.valid);
  return {...candidate,...counts,firstPercent,secondPercent,percentagePoints:secondPercent-firstPercent};
}
function leader(data) {
  const sorted=[...data.candidates].sort((a,b)=>b.votes-a.votes);
  return !sorted[0]?.votes || sorted[0].votes===sorted[1]?.votes ? null : sorted[0].number;
}
function compare(first,second) {
  const candidateChanges=finalists.map(c=>candidateChange(first,second,c));
  const metrics=Object.fromEntries(['valid','blank','nullVotes','turnout','abstention'].map(k=>[k,change(first[k],second[k])]));
  for(const [key,denominator] of [['valid','turnout'],['blank','turnout'],['nullVotes','turnout'],['turnout','electorate'],['abstention','electorate']]) {
    const denominator1=denominator==='electorate'?first.turnout+first.abstention:first[denominator];
    const denominator2=denominator==='electorate'?second.turnout+second.abstention:second[denominator];
    metrics[key].firstPercent=percentage(first[key],denominator1);
    metrics[key].secondPercent=percentage(second[key],denominator2);
    metrics[key].percentagePoints=metrics[key].secondPercent-metrics[key].firstPercent;
  }
  const marginFirst=votesFor(first,'13')-votesFor(first,'22'),marginSecond=votesFor(second,'13')-votesFor(second,'22');
  return {candidates:candidateChanges,metrics,margin:{first:marginFirst,second:marginSecond,delta:marginSecond-marginFirst},leaderFirst:leader(first),leaderSecond:leader(second)};
}
function aggregate(list) {
  const result={valid:0,blank:0,nullVotes:0,turnout:0,abstention:0,candidates:[]};
  const counts=new Map();
  for(const item of list) {
    for(const k of ['valid','blank','nullVotes','turnout','abstention']) result[k]+=item[k];
    for(const c of item.candidates) counts.set(c.number,(counts.get(c.number)??0)+c.votes);
  }
  result.candidates=[...counts].map(([number,votes])=>({number,votes}));
  return result;
}
export function reconcileRound(round) {
  const national=round.br;
  for(const field of ['valid','blank','nullVotes','turnout','abstention','processed','total']) {
    const sum=territories.reduce((total,{uf})=>total+round[uf][field],0);
    if(sum!==national[field]) throw new Error(`Soma das 27 UFs + exterior em ${field}: ${sum}; Brasil: ${national[field]}. Aguardar arquivos oficiais consistentes.`);
  }
  const numbers=new Set(scopes.flatMap(scope=>round[scope].candidates.map(c=>c.number)));
  for(const number of numbers) {
    const sum=territories.reduce((total,{uf})=>total+votesFor(round[uf],number),0);
    if(sum!==votesFor(national,number)) throw new Error(`Votos do candidato ${number} não fecham com a soma territorial.`);
  }
}

export function makeStudy(raw,{capturedAt=new Date().toISOString(),sources=[]}={}) {
  const rounds={1:{},2:{}};
  for(const turn of ['1','2']) for(const scope of scopes) {
    if(!raw[turn]?.[scope]) throw new Error(`Falta a fonte do turno ${turn}: ${scope}.`);
    const result=inspectOfficial(raw[turn][scope],scope,turn);
    if(!complete(result)) throw new Error(`Relatório final bloqueado: turno ${turn}, ${scope}, ${result.processed}/${result.total}, final=${result.final}.`);
    rounds[turn][scope]=result;
  }
  reconcileRound(rounds[1]);reconcileRound(rounds[2]);
  for(const {number} of finalists) for(const turn of ['1','2']) {
    if(!rounds[turn].br.candidates.some(c=>c.number===number)) throw new Error(`Finalista ${number} ausente do turno ${turn}.`);
  }
  if(rounds[2].br.candidates.some(c=>!finalists.some(f=>f.number===c.number))) throw new Error('O segundo turno contém candidatos além dos dois finalistas esperados.');
  const national=compare(rounds[1].br,rounds[2].br);
  const rows=territories.map(meta=>({...meta,...compare(rounds[1][meta.uf],rounds[2][meta.uf])}));
  const macroregions=['Norte','Nordeste','Centro-Oeste','Sudeste','Sul','Exterior'].map(region=>{
    const members=territories.filter(t=>t.region===region);
    return {name:region,...compare(aggregate(members.map(t=>rounds[1][t.uf])),aggregate(members.map(t=>rounds[2][t.uf])))};
  });
  const otherFirstVotes=rounds[1].br.candidates.filter(c=>!finalists.some(f=>f.number===c.number)).reduce((sum,c)=>sum+c.votes,0);
  const finalistGain=national.candidates.reduce((sum,c)=>sum+c.delta,0);
  if(finalistGain!==otherFirstVotes+national.metrics.valid.delta) throw new Error('A identidade dos ganhos líquidos dos finalistas não fecha.');
  if(national.metrics.valid.delta!==national.metrics.turnout.delta-national.metrics.blank.delta-national.metrics.nullVotes.delta) throw new Error('A decomposição da variação dos votos válidos não fecha.');
  for(const candidate of national.candidates) {
    if(rows.reduce((sum,row)=>sum+row.candidates.find(c=>c.number===candidate.number).delta,0)!==candidate.delta) throw new Error('Ganhos territoriais não fecham com o ganho nacional.');
  }
  const ufRows=rows.filter(r=>r.uf!=='zz');
  const leads=Object.fromEntries(['1','2'].map(turn=>[turn,Object.fromEntries(finalists.map(c=>[c.number,ufRows.filter(r=>(turn==='1'?r.leaderFirst:r.leaderSecond)===c.number).length]))]));
  return {schemaVersion:1,status:'final',capturedAt,sources,national,territories:rows,macroregions,leads,flips:ufRows.filter(r=>r.leaderFirst!==r.leaderSecond),accounting:{otherFirstVotes,finalistGain,validVoteChange:national.metrics.valid.delta},rounds:{1:{updated:rounds[1].br.updated,id:rounds[1].br.id,sections:rounds[1].br.total},2:{updated:rounds[2].br.updated,id:rounds[2].br.id,sections:rounds[2].br.total}}};
}
