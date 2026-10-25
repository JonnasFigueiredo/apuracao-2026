import test from 'node:test';
import assert from 'node:assert/strict';
import { leadership, summarizeStates, states } from '../dist/states.js';
const result=(votesA,votesB,processed=1)=>({processed,candidates:[{number:'13',votes:votesA,percent:50},{number:'22',votes:votesB,percent:50}].sort((a,b)=>b.votes-a.votes)});

test('zerésima e ausência de dados não atribuem liderança',()=>{
  assert.equal(leadership(null).leader,null);
  assert.equal(leadership(result(0,0,0)).kind,'waiting');
  assert.equal(leadership(result(0,0)).kind,'waiting');
});
test('empate usa votos exatos e não o percentual arredondado',()=>{
  assert.equal(leadership(result(100,100)).kind,'tie');
  assert.equal(leadership(result(101,100)).kind,'lula');
  assert.equal(leadership(result(100,101)).kind,'flavio');
});
test('outros candidatos não recebem a cor de Lula ou Flávio',()=>{
  const other={processed:1,candidates:[{number:'99',votes:200,percent:60},{number:'13',votes:100,percent:30}]};
  assert.equal(leadership(other).kind,'other');
});
test('o resumo diferencia dados faltantes, zerésima, empate e parcial anterior',()=>{
  const summary=summarizeStates(new Map([['sp',{result:result(100,110)}],['ba',{result:result(200,100),stale:true}],['rj',{error:true}],['df',{result:result(0,0,0)}],['pe',{result:result(100,100)}]]));
  assert.deepEqual(summary,{lula:1,flavio:1,other:0,tie:1,waiting:1,available:4,stale:1});
  assert.equal(states.length,27);assert.equal(new Set(states.map(state=>state.uf)).size,27);
});
