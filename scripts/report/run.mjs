import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {inspectOfficial} from '../monitor/checks.mjs';
import {scopes,sourceUrl,complete,makeStudy} from './model.mjs';
import {html,markdown,csv} from './render.mjs';

const output=resolve(process.env.REPORT_OUTPUT_DIR || 'dist/relatorio');
const hash=body=>createHash('sha256').update(body).digest('hex');
const raw={1:{},2:{}}, files=new Map(), sources=[];
let capturedAt=new Date().toISOString(), frozen=false;
async function result(ready,message) {
  console.log(message);
  if(process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT,`ready=${ready}\n`);
  if(process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,`## Estudo final dos dois turnos\n\n${message}\n`);
}
async function collect(turn,scope) {
  const url=sourceUrl(turn,scope);
  let response;
  for(let attempt=0;attempt<2;attempt++) {
    try {
      response=await fetch(url,{cache:'no-cache',signal:AbortSignal.timeout(15000)});
      if(response.status===403 || response.status===429) throw new Error(`TSE limitou a coleta (${response.status}). A rotina tentará novamente em outra execução.`);
      if(response.status>=500 && attempt===0) {await pause(2000);continue;}
      if(!response.ok) throw new Error(`Falha na fonte ${turn}/${scope}: HTTP ${response.status}.`);
      break;
    } catch(error) {
      if(attempt===0 && !response) {await pause(2000);continue;}
      throw error;
    }
  }
  const body=await response.text(), data=JSON.parse(body), parsed=inspectOfficial(data,scope,turn);
  raw[turn][scope]=data;
  const path=`fontes/${turn}/${scope}.json`;
  files.set(path,body);
  sources.push({turn,scope,url,path,sha256:hash(body),retrievedAt:new Date().toISOString(),id:parsed.id,updated:parsed.updated});
  await pause(350);
  return parsed;
}
try {
  let manifest;
  try {manifest=JSON.parse(await readFile(resolve(output,'manifest.json'),'utf8'));} catch(error) {if(error.code!=='ENOENT') throw error;}
  if(manifest) {
    if(manifest.status!=='final' || manifest.schemaVersion!==1 || manifest.sources?.length!==58) throw new Error('Manifesto final existente inválido. Não será sobrescrito automaticamente.');
    capturedAt=manifest.capturedAt;frozen=true;
    for(const turn of ['1','2']) for(const scope of scopes) {
      const path=`fontes/${turn}/${scope}.json`,entry=manifest.sources.find(s=>s.turn===turn && s.scope===scope);
      if(!entry || entry.path!==path || entry.url!==sourceUrl(turn,scope)) throw new Error('Manifesto com fonte ausente ou incompatível.');
      const body=await readFile(resolve(output,path),'utf8');
      if(hash(body)!==entry.sha256) throw new Error(`Arquivo preservado ${path} não corresponde ao hash registrado.`);
      raw[turn][scope]=JSON.parse(body);files.set(path,body);sources.push(entry);
    }
  } else {
    const first=await collect('1','br'),second=await collect('2','br');
    if(!complete(first) || !complete(second)) {
      await result(false,`Aguardando conclusão oficial: 1º turno ${first.processed}/${first.total}, final=${first.final}; 2º turno ${second.processed}/${second.total}, final=${second.final}. Nenhuma conclusão parcial foi publicada.`);
      process.exit(0);
    }
    for(const turn of ['1','2']) for(const scope of scopes.filter(s=>s!=='br')) await collect(turn,scope);
    const pending=[];
    for(const turn of ['1','2']) for(const scope of scopes) if(!complete(inspectOfficial(raw[turn][scope],scope,turn))) pending.push(`${turn}/${scope}`);
    if(pending.length) {await result(false,`Aguardando fontes finais: ${pending.join(', ')}. O monitor continua ativo.`);process.exit(0);}
    capturedAt=new Date().toISOString();
  }
  sources.sort((a,b)=>Number(a.turn)-Number(b.turn) || scopes.indexOf(a.scope)-scopes.indexOf(b.scope));
  const study=makeStudy(raw,{capturedAt,sources});
  // Os arquivos públicos só são escritos depois de todos os cálculos e conciliações passarem.
  await mkdir(output,{recursive:true});
  for(const [path,body] of files) {await mkdir(dirname(resolve(output,path)),{recursive:true});await writeFile(resolve(output,path),body);}
  await writeFile(resolve(output,'estudo.json'),JSON.stringify(study,null,2)+'\n');
  await writeFile(resolve(output,'territorios.csv'),csv(study));
  await writeFile(resolve(output,'relatorio.md'),markdown(study));
  await writeFile(resolve(output,'index.html'),html(study));
  await writeFile(resolve(output,'report.css'),await readFile(new URL('../../dist/relatorio/report.css',import.meta.url)));
  await writeFile(resolve(output,'manifest.json'),JSON.stringify({schemaVersion:1,status:'final',capturedAt,sources},null,2)+'\n');
  await result(true,`${frozen?'Edição final preservada e novamente validada':'Estudo final gerado'}: 58 fontes concluídas, totais conciliados, relatório HTML e Markdown, dados JSON e CSV. Captura: ${capturedAt}.`);
} catch(error) {
  await result(false,`Relatório não publicado: ${error.message}`);
  process.exitCode=1;
}
