export const states = [
  ['RO','Rondônia','Norte','11',-63,-10.8],['AC','Acre','Norte','12',-70,-9],['AM','Amazonas','Norte','13',-64,-4.5],['RR','Roraima','Norte','14',-61.2,2],['PA','Pará','Norte','15',-52.8,-3.8],['AP','Amapá','Norte','16',-51.6,1.3],['TO','Tocantins','Norte','17',-48.4,-10.3],
  ['MA','Maranhão','Nordeste','21',-45,-5],['PI','Piauí','Nordeste','22',-42.8,-7.4],['CE','Ceará','Nordeste','23',-39.5,-5],['RN','Rio Grande do Norte','Nordeste','24',-33.7,-4.5],['PB','Paraíba','Nordeste','25',-33.7,-6.6],['PE','Pernambuco','Nordeste','26',-33.7,-8.7],['AL','Alagoas','Nordeste','27',-34,-10.7],['SE','Sergipe','Nordeste','28',-35,-12.5],['BA','Bahia','Nordeste','29',-41.7,-12.5],
  ['MG','Minas Gerais','Sudeste','31',-44.5,-18],['ES','Espírito Santo','Sudeste','32',-39.6,-19.6],['RJ','Rio de Janeiro','Sudeste','33',-41.7,-22.7],['SP','São Paulo','Sudeste','35',-48.5,-22.3],
  ['PR','Paraná','Sul','41',-51,-24.8],['SC','Santa Catarina','Sul','42',-50.5,-27.3],['RS','Rio Grande do Sul','Sul','43',-53.2,-30],
  ['MS','Mato Grosso do Sul','Centro-Oeste','50',-54.5,-20.3],['MT','Mato Grosso','Centro-Oeste','51',-56,-13],['GO','Goiás','Centro-Oeste','52',-49.5,-16.2],['DF','Distrito Federal','Centro-Oeste','53',-45.8,-15.1]
].map(([uf,name,region,code,lon,lat]) => ({ uf:uf.toLowerCase(), name, region, code, label:[lon,lat] }));

export function leadership(result) {
  if (!result || result.processed === 0 || !result.candidates[0]?.votes) return { kind:'waiting', leader:null };
  const [first, second] = result.candidates;
  if (second && first.votes === second.votes) return { kind:'tie', leader:null };
  return { kind:first.number === '13' ? 'lula' : first.number === '22' ? 'flavio' : 'other', leader:first };
}

export function summarizeStates(entries) {
  const summary = { lula:0, flavio:0, other:0, tie:0, waiting:0, available:0, stale:0 };
  for (const entry of entries.values()) {
    if (!entry.result) continue;
    summary.available++;
    summary[leadership(entry.result).kind]++;
    if (entry.stale) summary.stale++;
  }
  return summary;
}
