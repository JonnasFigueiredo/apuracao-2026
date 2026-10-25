import test from 'node:test';
import assert from 'node:assert/strict';
import { createTseClient } from '../dist/tse-client.js';
const ok=data=>({ok:true,status:200,json:async()=>data});

test('monta URLs oficiais por turno e reutiliza consultas recentes da mesma UF',async()=>{
  const urls=[];const client=createTseClient({interval:0,fetchImpl:async url=>{urls.push(url);return ok({url});}});
  await client.get('2','sp');await client.get('2','sp');await client.get('1','sp');
  assert.equal(urls.length,2);
  assert.match(urls[0],/6258\/dados\/sp\/sp-c0001-e006258-u\.json$/);
  assert.match(urls[1],/6257\/dados\/sp\/sp-c0001-e006257-u\.json$/);
  await assert.rejects(client.get('2','xyz'),/inválida/);
});
test('as consultas de mapa e placar passam pela mesma fila',async()=>{
  let active=0,max=0;
  const client=createTseClient({interval:0,fetchImpl:async()=>{active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,5));active--;return ok({});}});
  await Promise.all(['br','sp','rj','ba'].map(uf=>client.get('2',uf)));
  assert.equal(max,1);
});
test('limitação do TSE pausa o tráfego por dez minutos mesmo com Retry-After inválido',async()=>{
  let calls=0,clock=1000000;
  const client=createTseClient({interval:0,now:()=>clock,fetchImpl:async()=>{calls++;return calls===1?{ok:false,status:429,headers:{get:()=> 'invalid'}}:ok({});}});
  await assert.rejects(client.get('2','br'),/429/);assert.equal(client.retryAfter(),600);
  await assert.rejects(client.get('2','sp'),/limitou/);assert.equal(calls,1);
  clock+=600001;await client.get('2','sp');assert.equal(calls,2);
});
test('consulta cancelada antes de entrar na fila não acessa a rede',async()=>{
  let calls=0;const client=createTseClient({interval:0,fetchImpl:async()=>{calls++;return ok({});}});
  const controller=new AbortController();controller.abort();
  await assert.rejects(client.get('2','br',{signal:controller.signal}),{name:'AbortError'});assert.equal(calls,0);
});
