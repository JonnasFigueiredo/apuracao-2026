import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,dirname,basename,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {makeStudy,change,territories,scopes,sourceUrl} from '../scripts/report/model.mjs';
import {html,markdown,csv} from '../scripts/report/render.mjs';

function file(scope,turn,{votes,blank=2,nullVotes=3,abstention=45,sections=10}) {
  const valid=Object.values(votes).reduce((s,n)=>s+n,0),turnout=valid+blank+nullVotes,electorate=turnout+abstention;
  const percent=(a,b)=>String(b?a/b*100:0);
  return {ele:turn==='1'?'6257':'6258',t:turn,tpabr:scope==='br'?'br':'uf',cdabr:scope,and:'f',idg:`${turn}/${scope}`,dg:'25/10/2026',hg:'22:00:00',dt:'25/10/2026',ht:'21:59:00',s:{ts:String(sections),st:String(sections),snt:'0',pstn:'100'},e:{esa:String(electorate),c:String(turnout),a:String(abstention),pcn:percent(turnout,electorate),pan:percent(abstention,electorate)},v:{vv:String(valid),vb:String(blank),tvn:String(nullVotes),tv:String(turnout),pvbn:percent(blank,turnout),ptvnn:percent(nullVotes,turnout)},carg:[{cd:'1',agr:[{par:[{cand:Object.entries(votes).reverse().map(([n,vap])=>({n,vap:String(vap),pvapn:percent(vap,valid)}))}]}]}]};
}
function fixture(overrides={}) {
  const raw={1:{},2:{}};
  for(const turn of ['1','2']) {
    const totals={votes:{},blank:0,nullVotes:0,abstention:0,sections:0};
    for(const {uf} of territories) {
      const values={votes:turn==='1'?{'13':40,'22':45,'99':15}:{'13':60,'22':50},blank:turn==='1'?2:1,nullVotes:turn==='1'?3:2,abstention:turn==='1'?45:37,sections:10,...overrides[`${turn}/${uf}`]};
      raw[turn][uf]=file(uf,turn,values);
      for(const key of ['blank','nullVotes','abstention','sections']) totals[key]+=values[key];
      for(const [number,votes] of Object.entries(values.votes)) totals.votes[number]=(totals.votes[number]??0)+votes;
    }
    raw[turn].br=file('br',turn,totals);
  }
  return raw;
}

test('estudo final calcula ganho, crescimento, pontos percentuais e inversão de liderança por número',()=>{
  const study=makeStudy(fixture());
  const lula=study.national.candidates.find(c=>c.number==='13');
  assert.equal(lula.first,1120);assert.equal(lula.second,1680);assert.equal(lula.delta,560);assert.equal(lula.growthPercent,50);
  assert.ok(Math.abs(lula.percentagePoints-(60/110*100-40))<1e-10);
  assert.equal(study.national.leaderFirst,'22');assert.equal(study.national.leaderSecond,'13');
  assert.equal(study.national.margin.delta,420);
  assert.equal(study.accounting.finalistGain,study.accounting.otherFirstVotes+study.accounting.validVoteChange);
  assert.equal(study.flips.length,27);assert.equal(study.territories.length,28);
});

test('relatório bloqueia parcial, dado ausente e 100% apenas por arredondamento',()=>{
  const partial=fixture();partial[2].br.and='p';assert.throws(()=>makeStudy(partial),/bloqueado/);
  const missing=fixture();delete missing[1].zz;assert.throws(()=>makeStudy(missing),/Falta a fonte/);
  const rounded=fixture();rounded[2].br.s={ts:'100000',st:'99999',snt:'1',pstn:'99.999'};
  assert.throws(()=>makeStudy(rounded),/bloqueado/);
});

test('relatório rejeita discrepância entre o Brasil e a soma territorial final',()=>{
  const raw=fixture();
  raw[1].zz=file('zz','1',{votes:{'13':41,'22':44,'99':15}});
  assert.throws(()=>makeStudy(raw),/Votos do candidato/);
});

test('percentuais regionais usam votos ponderados e ganhos podem ser negativos',()=>{
  const study=makeStudy(fixture({'1/ro':{votes:{'13':800,'22':200,'99':0}}}));
  const north=study.macroregions.find(r=>r.name==='Norte').candidates.find(c=>c.number==='13');
  assert.equal(north.firstPercent,65);
  assert.notEqual(north.firstPercent,(80+6*40)/7);
  const ro=study.territories.find(r=>r.uf==='ro').candidates.find(c=>c.number==='13');
  assert.equal(ro.delta,-740);
});

test('crescimento relativo com base zero não vira infinito',()=>{
  assert.deepEqual(change(0,25),{first:0,second:25,delta:25,growthPercent:null});
  const study=makeStudy(fixture({'1/ac':{votes:{'13':0,'22':80,'99':20}}}));
  assert.equal(study.territories.find(r=>r.uf==='ac').candidates[0].growthPercent,null);
  assert.ok(!csv(study).includes('Infinity'));
});

test('empate não atribui vitória nem desloca as seções do relatório',()=>{
  const overrides=Object.fromEntries(territories.map(({uf})=>[`2/${uf}`,{votes:{'13':55,'22':55}}]));
  const study=makeStudy(fixture(overrides));
  assert.equal(study.national.leaderSecond,null);
  assert.match(html(study),/terminaram empatados/);
  assert.match(html(study),/O comparecimento variou/);
});

test('relatório exportado contém números, limites metodológicos e fontes de reprodução',()=>{
  const study=makeStudy(fixture(),{capturedAt:'2026-10-26T01:00:00Z'});
  const page=html(study),text=markdown(study),data=csv(study);
  assert.match(page,/<html lang="pt-BR">/);assert.match(page,/manifest.json/);
  assert.match(text,/transferência individual/);assert.match(text,/Exterior/);assert.match(text,/\+560/);
  assert.equal(data.trim().split('\r\n').length,57);
  assert.match(page,/2º turno/);assert.match(page,/Imprimir/);
});

test('edição preservada é reproduzível sem rede e uma fonte alterada bloqueia a geração',async()=>{
  const output=await mkdtemp(join(tmpdir(),'voto-report-test-')),raw=fixture(),sources=[];
  try {
    for(const turn of ['1','2']) for(const scope of scopes) {
      const path=`fontes/${turn}/${scope}.json`,body=JSON.stringify(raw[turn][scope]);
      await mkdir(dirname(join(output,path)),{recursive:true});await writeFile(join(output,path),body);
      sources.push({turn,scope,url:sourceUrl(turn,scope),path,sha256:createHash('sha256').update(body).digest('hex')});
    }
    await writeFile(join(output,'manifest.json'),JSON.stringify({schemaVersion:1,status:'final',capturedAt:'2026-10-26T01:00:00Z',sources}));
    const run=()=>spawnSync(process.execPath,['scripts/report/run.mjs'],{cwd:fileURLToPath(new URL('..',import.meta.url)),encoding:'utf8',env:{...process.env,REPORT_OUTPUT_DIR:output,GITHUB_OUTPUT:'',GITHUB_STEP_SUMMARY:''},timeout:10000});
    const first=run();assert.equal(first.status,0,first.stdout+first.stderr);
    const saved=await readFile(join(output,'estudo.json'),'utf8'),page=await readFile(join(output,'index.html'),'utf8');
    const second=run();assert.equal(second.status,0,second.stdout+second.stderr);
    assert.equal(await readFile(join(output,'estudo.json'),'utf8'),saved);
    assert.equal(await readFile(join(output,'index.html'),'utf8'),page);
    await writeFile(join(output,'fontes/1/br.json'),'{}');
    const invalid=run();assert.equal(invalid.status,1);assert.match(invalid.stdout,/hash registrado/);
    assert.equal(await readFile(join(output,'estudo.json'),'utf8'),saved);
  } finally {
    assert.equal(dirname(resolve(output)),resolve(tmpdir()));assert.ok(basename(output).startsWith('voto-report-test-'));
    await rm(output,{recursive:true,force:true});
  }
});
