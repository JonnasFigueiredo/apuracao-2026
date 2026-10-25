// Conferência independente: não reutiliza o parser da aplicação.
export const regionCodes = ['br','ro','ac','am','rr','pa','ap','to','ma','pi','ce','rn','pb','pe','al','se','ba','mg','es','rj','sp','pr','sc','rs','ms','mt','go','df'];
const integer = (value, label) => {
  if (value === undefined || value === null || value === '' || !/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error(`${label}: inteiro inválido.`);
  return Number(value);
};
const decimal = (value, label) => {
  if (value === undefined || value === null || value === '' || !/^\d+(?:[.,]\d+)?$/.test(String(value))) throw new Error(`${label}: percentual inválido.`);
  const result = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(result) || result > 100) throw new Error(`${label}: percentual fora de 0 a 100.`);
  return result;
};
const requireEqual = (actual, expected, label) => { if (actual !== expected) throw new Error(`${label}: recebido ${actual}; esperado ${expected}.`); };
export const formatInteger = value => value.toLocaleString('pt-BR');
export const formatPercent = value => `${value.toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 })}%`;
const ratio = (part, total) => total ? part / total * 100 : 0;
function checkPercent(value, numerator, denominator, label) {
  const result = decimal(value, label);
  if (Math.abs(result - ratio(numerator, denominator)) > 0.005001) throw new Error(`${label}: não corresponde aos totais oficiais.`);
  return result;
}

export function inspectOfficial(data, region, turn = '2') {
  const election = String(turn) === '1' ? '6257' : '6258';
  requireEqual(String(data?.ele), election, 'Eleição');
  requireEqual(String(data?.t), String(turn), 'Turno');
  requireEqual(data?.cdabr, region, 'Abrangência do arquivo');
  requireEqual(data?.tpabr, region === 'br' ? 'br' : 'uf', 'Tipo de abrangência');
  const cargo = data?.carg?.find(item => String(item.cd) === '1');
  if (!cargo || !data.s || !data.v || !data.e) throw new Error('Formato oficial incompleto: cargo, seções, votos ou eleitorado ausentes.');
  const processed = integer(data.s.st, 'Seções apuradas'), total = integer(data.s.ts, 'Total de seções'), pending = integer(data.s.snt, 'Seções pendentes');
  requireEqual(processed + pending, total, 'Soma das seções');
  const progress = ratio(processed, total);
  checkPercent(data.s.pstn ?? data.s.pst, processed, total, 'Percentual apurado');
  const valid = integer(data.v.vv, 'Votos válidos'), blank = integer(data.v.vb, 'Brancos');
  const nullVotes = data.v.tvn === undefined ? integer(data.v.vn, 'Nulos') + integer(data.v.vnt ?? 0, 'Nulos técnicos') : integer(data.v.tvn, 'Total de nulos');
  const turnout = integer(data.e.c, 'Comparecimento'), voteTotal = integer(data.v.tv, 'Total de votos');
  requireEqual(valid + blank + nullVotes, voteTotal, 'Válidos, brancos e nulos');
  requireEqual(turnout, voteTotal, 'Comparecimento e total de votos');
  // est também inclui eleitores de seções não instaladas; c e a usam esa.
  const abstention = integer(data.e.a, 'Abstenção'), electorate = integer(data.e.esa, 'Eleitorado das seções apuradas e instaladas');
  requireEqual(turnout + abstention, electorate, 'Comparecimento e abstenção');
  const blankPercent = checkPercent(data.v.pvbn ?? data.v.pvb, blank, voteTotal, 'Percentual de brancos');
  const nullPercent = checkPercent(data.v.ptvnn ?? data.v.ptvn, nullVotes, voteTotal, 'Percentual de nulos');
  const turnoutPercent = checkPercent(data.e.pcn ?? data.e.pc, turnout, electorate, 'Percentual de comparecimento');
  const abstentionPercent = checkPercent(data.e.pan ?? data.e.pa, abstention, electorate, 'Percentual de abstenção');
  const candidates = (cargo.agr ?? []).flatMap(group => (group.par ?? []).flatMap(party => (party.cand ?? []).map(candidate => {
    const votes = integer(candidate.vap, `Votos do candidato ${candidate.n}`);
    return { number:String(candidate.n), votes, percent:checkPercent(candidate.pvapn ?? candidate.pvap, votes, valid, `Percentual do candidato ${candidate.n}`) };
  }))).sort((a,b) => b.votes - a.votes);
  if (!candidates.length || new Set(candidates.map(c => c.number)).size !== candidates.length) throw new Error('Candidatos ausentes ou duplicados.');
  requireEqual(candidates.reduce((sum,c) => sum+c.votes, 0), valid, 'Soma dos votos dos candidatos');
  let kind = 'waiting';
  if (processed && candidates[0].votes) kind = candidates[0].votes === candidates[1]?.votes ? 'tie' : candidates[0].number === '13' ? 'lula' : candidates[0].number === '22' ? 'flavio' : 'other';
  return { region, id:data.idg, generated:`${data.dg || ''} ${data.hg || ''}`.trim(), updated:`${data.dt || data.dg || '—'} · ${data.ht || data.hg || '—'}`, final:data.and === 'f', processed, total, pending, progress, valid, blank, nullVotes, turnout, abstention, blankPercent, nullPercent, turnoutPercent, abstentionPercent, candidates, kind, leader:kind === 'waiting' || kind === 'tie' ? null : candidates[0] };
}

export function compareDisplay(view, official) {
  const differences = [];
  const same = (actual, expected, label) => { if (actual !== expected) differences.push(`${label}: tela ${JSON.stringify(actual)}; TSE ${JSON.stringify(expected)}.`); };
  const main = official.get('br');
  if (!main) return ['Resultado nacional não recebido.'];
  for (const [key, value] of Object.entries({ sectionsCount:main.processed, totalSections:main.total, pendingSections:main.pending, validVotes:main.valid, blankVotes:main.blank, nullVotes:main.nullVotes, turnout:main.turnout, abstention:main.abstention })) same(view.metrics[key], formatInteger(value), key);
  same(view.metrics.apurationPercent, formatPercent(main.progress), 'Apuração');
  same(view.metrics.progressValue, formatPercent(main.progress), 'Barra de apuração');
  same(view.metrics.blankPercent, formatPercent(main.blankPercent), 'Percentual de brancos');
  same(view.metrics.nullPercent, formatPercent(main.nullPercent), 'Percentual de nulos');
  same(view.metrics.turnoutPercent, `${formatPercent(main.turnoutPercent)} do eleitorado apurado`, 'Percentual de comparecimento');
  same(view.metrics.abstentionPercent, `${formatPercent(main.abstentionPercent)} do eleitorado apurado`, 'Percentual de abstenção');
  same(view.updated, `TSE ${main.updated}`, 'Horário da parcial');
  same(view.candidates.length, main.candidates.length, 'Quantidade de candidatos');
  main.candidates.forEach((candidate, index) => {
    const card = view.candidates[index];
    same(card?.number, candidate.number, `Ordem do candidato ${index+1}`);
    same(card?.votes, `${formatInteger(candidate.votes)} votos`, `Votos ${candidate.number}`);
    same(card?.percent, formatPercent(candidate.percent), `Percentual ${candidate.number}`);
  });
  same(view.states.length, 27, 'Quantidade de UFs na lista');
  same(new Set(view.states.map(s => s.uf)).size, 27, 'UFs únicas na lista');
  same(view.map.length, 27, 'Quantidade de UFs no mapa');
  const counts = { lula:0, flavio:0, other:0, tie:0, waiting:0 };
  for (const uf of regionCodes.filter(uf => uf !== 'br')) {
    const result = official.get(uf), row = view.states.find(s => s.uf === uf), path = view.map.find(s => s.uf === uf);
    if (!result) { differences.push(`${uf.toUpperCase()}: resposta oficial não recebida.`); continue; }
    counts[result.kind]++;
    same(row?.leader, result.kind, `Liderança da lista ${uf}`);
    same(path?.leader, result.kind, `Liderança do mapa ${uf}`);
    same(row?.percent, result.leader ? formatPercent(result.leader.percent) : result.kind === 'tie' ? 'Empate' : '—', `Percentual do líder ${uf}`);
    same(row?.progress, `${formatPercent(result.progress)} apurado`, `Apuração ${uf}`);
    if (row?.stale || path?.stale) differences.push(`${uf.toUpperCase()}: painel manteve uma parcial anterior por falha na consulta.`);
  }
  same(view.counts.lula, String(counts.lula), 'Contagem de UFs Lula');
  same(view.counts.flavio, String(counts.flavio), 'Contagem de UFs Flávio');
  return differences;
}

export function freshnessProblem(result, { now = Date.now(), from, until, maxAgeMinutes = 45 } = {}) {
  if (!from || now < Date.parse(from) || (until && now > Date.parse(until)) || result.final) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})$/.exec(result.generated);
  if (!match) return 'Arquivo nacional sem data e hora de geração válidas durante o período de apuração.';
  const generated = Date.parse(`${match[3]}-${match[2]}-${match[1]}T${match[4]}-03:00`);
  if (!Number.isFinite(generated)) return 'Data de geração nacional inválida.';
  if (generated - now > 5 * 60000) return 'Horário de geração do TSE está mais de cinco minutos no futuro.';
  const age = (now-generated)/60000;
  return age > maxAgeMinutes ? `TSE sem arquivo nacional novo há ${Math.floor(age)} min durante a apuração (limite: ${maxAgeMinutes} min). A fonte oficial pode estar atrasada; isso não significa alteração dos votos pelo painel.` : null;
}

export function isComplete(official) {
  const main=official.get('br');
  return Boolean(main?.total > 0 && regionCodes.every(uf => {
    const result=official.get(uf);
    return result?.final === true && result.processed === result.total;
  }));
}
