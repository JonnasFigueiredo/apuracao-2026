export function toNumber(value) {
  const parsed = Number(String(value ?? 0).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatProgress(result) {
  if ((result.pending > 0 || result.processed < result.total) && result.progress >= 99.995) return '<100%';
  return `${result.progress.toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 })}%`;
}

export function parseResult(data) {
  const cargo = data?.carg?.find(item => String(item.cd) === '1');
  if (!cargo || !data.s || !data.v) throw new Error('O arquivo do TSE veio sem os campos esperados.');
  for (const value of [data.s.st, data.s.ts, data.s.snt, data.v.vv, data.v.vb]) {
    if (value === undefined || value === null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) {
      throw new Error('O arquivo do TSE contém totais inválidos.');
    }
  }
  const candidates = (cargo.agr ?? []).flatMap(group => (group.par ?? []).flatMap(party => (party.cand ?? []).map(candidate => ({
    name: candidate.nmu || candidate.nm || 'Candidato',
    party: party.sg || group.com || '',
    number: String(candidate.n || ''),
    votes: toNumber(candidate.vap),
    percent: toNumber(candidate.pvapn ?? candidate.pvap)
  })))).sort((a, b) => b.votes - a.votes);
  if (!candidates.length) throw new Error('O arquivo do TSE veio sem candidatos.');
  const processed = toNumber(data.s.st), total = toNumber(data.s.ts);
  if (processed > total) throw new Error('O total de seções do TSE está inconsistente.');
  return {
    candidates,
    processed,
    total,
    pending: toNumber(data.s.snt),
    progress: total ? processed / total * 100 : 0,
    validVotes: toNumber(data.v.vv),
    blankVotes: toNumber(data.v.vb),
    blankPercent: toNumber(data.v.pvbn ?? data.v.pvb),
    // EA20: tvn soma votos nulos (vn) e nulos técnicos (vnt).
    nullVotes: data.v.tvn === undefined ? toNumber(data.v.vn) + toNumber(data.v.vnt) : toNumber(data.v.tvn),
    nullPercent: toNumber(data.v.ptvnn ?? data.v.ptvn),
    turnout: toNumber(data.e?.c ?? data.v.tv),
    turnoutPercent: data.e?.pc === undefined ? null : toNumber(data.e.pcn ?? data.e.pc),
    abstention: toNumber(data.e?.a),
    abstentionPercent: data.e?.pa === undefined ? null : toNumber(data.e.pan ?? data.e.pa),
    date: data.dt || data.dg || '—',
    time: data.ht || data.hg || '—',
    final: data.and === 'f',
    id: data.idg
  };
}
