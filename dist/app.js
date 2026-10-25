import { parseResult, toNumber as number } from './data.js';
import { initAnalytics, trackEvent } from './analytics.js';

const $ = id => document.getElementById(id);
const SOURCE = 'https://resultados.tse.jus.br/oficial/ele2026';
const states = [
  ['RO','Rondônia','Norte','11'],['AC','Acre','Norte','12'],['AM','Amazonas','Norte','13'],['RR','Roraima','Norte','14'],['PA','Pará','Norte','15'],['AP','Amapá','Norte','16'],['TO','Tocantins','Norte','17'],
  ['MA','Maranhão','Nordeste','21'],['PI','Piauí','Nordeste','22'],['CE','Ceará','Nordeste','23'],['RN','Rio Grande do Norte','Nordeste','24'],['PB','Paraíba','Nordeste','25'],['PE','Pernambuco','Nordeste','26'],['AL','Alagoas','Nordeste','27'],['SE','Sergipe','Nordeste','28'],['BA','Bahia','Nordeste','29'],
  ['MG','Minas Gerais','Sudeste','31'],['ES','Espírito Santo','Sudeste','32'],['RJ','Rio de Janeiro','Sudeste','33'],['SP','São Paulo','Sudeste','35'],
  ['PR','Paraná','Sul','41'],['SC','Santa Catarina','Sul','42'],['RS','Rio Grande do Sul','Sul','43'],
  ['MS','Mato Grosso do Sul','Centro-Oeste','50'],['MT','Mato Grosso','Centro-Oeste','51'],['GO','Goiás','Centro-Oeste','52'],['DF','Distrito Federal','Centro-Oeste','53']
].map(([uf,name,region,code]) => ({ uf: uf.toLowerCase(), name, region, code }));
const byCode = Object.fromEntries(states.map(state => [state.code, state]));
const formats = { integer: new Intl.NumberFormat('pt-BR'), clock: new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' }) };
const fmt = value => formats.integer.format(number(value));
const pct = value => `${number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`;
let seconds = 15;
let busy = false;
let lastId = null;
let requestVersion = 0;
let activeController = null;
let hasResult = false;
let selectedRegion = 'br';
const fanModes = {
  neutral: { label: 'Visual neutro · acompanhe todos os candidatos.', color: '#101922' },
  lula: { label: 'Torcida Lula · vermelho, estrela e energia na tela.', name: 'Lula', number: '13', color: '#1b1018' },
  flavio: { label: 'Torcida Flávio Bolsonaro · verde, amarelo e azul.', name: 'Flávio Bolsonaro', number: '22', color: '#0d201e' }
};

function setFanMode(mode) {
  if (!Object.hasOwn(fanModes, mode)) mode = 'neutral';
  const theme = fanModes[mode];
  document.documentElement.dataset.fan = mode;
  document.querySelector('meta[name="theme-color"]').content = theme.color;
  document.querySelectorAll('[data-fan-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.fanMode === mode)));
  $('themeStatus').textContent = theme.label;
  $('fanBanner').hidden = mode === 'neutral';
  $('fanName').textContent = theme.name || '';
  $('fanNumber').textContent = theme.number || '';
  try { localStorage.setItem('voto2026.fanMode', mode); } catch {}
}

function urlForSelection(turn, region) {
  const id = turn === '1' ? '6257' : '6258';
  return `${SOURCE}/${id}/dados/${region}/${region}-c0001-e${id.padStart(6, '0')}-u.json`;
}

function setRegion(region) {
  if (region !== 'br' && !states.some(state => state.uf === region)) return;
  if (region !== selectedRegion) trackEvent(`uf-${region}`, 'Seleção de abrangência');
  selectedRegion = region;
  $('region').value = region;
  const state = states.find(item => item.uf === region);
  $('mapSelection').textContent = state?.name || 'Brasil';
  $('mapSelectionHint').textContent = state ? `${state.region} · ${state.uf.toUpperCase()}` : 'Resultado nacional';
  $('resultPlace').textContent = `· ${state?.name.toUpperCase() || 'BRASIL'}`;
  document.querySelectorAll('.map-state, .state-row').forEach(control => { const selected = control.dataset.uf === region; control.classList.toggle('selected', selected); control.setAttribute('aria-pressed', String(selected)); });
  $('resetRegion').hidden = region === 'br';
  lastId = null;
  hasResult = false;
  $('candidates').replaceChildren();
  $('resultState').textContent = 'CARREGANDO';
  $('validVotesNote').textContent = 'aguardando dados';
  for (const id of ['progressValue','sectionsCount','pendingSections','totalSections','validVotes','blankVotes','blankPercent','nullVotes','nullPercent','turnout','turnoutPercent']) $(id).textContent = '—';
  $('ring').style.setProperty('--progress', '0%');
  $('updated').textContent = '';
  refresh(true);
}

function buildStateList(query = '') {
  const search = query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtered = states.filter(state => `${state.name} ${state.uf}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(search));
  $('stateCount').textContent = filtered.length;
  const list = $('stateList'); list.replaceChildren();
  for (const region of ['Norte','Nordeste','Centro-Oeste','Sudeste','Sul']) {
    const group = filtered.filter(state => state.region === region);
    if (!group.length) continue;
    const heading = document.createElement('div'); heading.className = 'state-group'; heading.textContent = region; list.append(heading);
    for (const state of group) {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'state-row'; row.dataset.uf = state.uf; row.setAttribute('aria-pressed', String($('region').value === state.uf));
      if ($('region').value === state.uf) row.classList.add('selected');
      const label = document.createElement('span'); label.textContent = state.name;
      const sigla = document.createElement('strong'); sigla.textContent = state.uf.toUpperCase();
      row.append(label, sigla); row.addEventListener('click', () => setRegion(state.uf)); list.append(row);
    }
  }
  if (!filtered.length) { const empty = document.createElement('p'); empty.className = 'no-states'; empty.textContent = 'Nenhum estado encontrado.'; list.append(empty); }
}

async function buildMap() {
  try {
    const response = await fetch('br-ufs.geojson');
    if (!response.ok) throw new Error('Mapa indisponível');
    const geo = await response.json();
    const svg = $('brazilMap');
    const project = ([lon,lat]) => [35 + (lon + 74) * 14.1, 20 + (6 - lat) * 13.5];
    const ringPath = ring => ring.map((point,index) => { const [x,y] = project(point); return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`; }).join('') + 'Z';
    for (const feature of geo.features) {
      const state = byCode[feature.properties.codarea]; if (!state) continue;
      const geometry = feature.geometry;
      const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d', polygons.flatMap(polygon => polygon.map(ringPath)).join(''));
      path.setAttribute('class','map-state'); path.dataset.uf = state.uf;
      path.setAttribute('role','button'); path.setAttribute('tabindex','0'); path.setAttribute('aria-label',`Ver resultado de ${state.name}`); path.setAttribute('aria-pressed', String(state.uf === $('region').value));
      const title = document.createElementNS('http://www.w3.org/2000/svg','title'); title.textContent = state.name; path.append(title);
      path.addEventListener('click', () => setRegion(state.uf));
      path.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setRegion(state.uf); } });
      svg.append(path);
    }
    document.querySelectorAll('.map-state').forEach(path => path.classList.toggle('selected', path.dataset.uf === $('region').value));
  } catch {
    const msg = document.createElementNS('http://www.w3.org/2000/svg','text'); msg.setAttribute('x','325'); msg.setAttribute('y','290'); msg.setAttribute('text-anchor','middle'); msg.setAttribute('fill','#aab8c0'); msg.textContent = 'Mapa indisponível. Use a lista de estados.'; $('brazilMap').append(msg);
  }
}

function render(data) {
  const result = parseResult(data);
  $('candidates').replaceChildren(...result.candidates.map((candidate, index) => {
    const card = document.createElement('article');
    const leads = index === 0 && candidate.votes > 0 && candidate.votes > (result.candidates[1]?.votes ?? -1);
    card.className = `candidate${leads ? ' top' : ''}`;
    card.dataset.number = candidate.number;
    const head = document.createElement('div'); head.className = 'candidate-head';
    const nameWrap = document.createElement('div');
    const name = document.createElement('div'); name.className = 'candidate-name'; name.textContent = candidate.name;
    const party = document.createElement('div'); party.className = 'candidate-party'; party.textContent = candidate.party;
    const fanTag = document.createElement('span'); fanTag.className = 'fan-card-tag'; fanTag.textContent = 'Sua torcida';
    nameWrap.append(name, party, fanTag);
    const num = document.createElement('span'); num.className = 'candidate-number'; num.textContent = candidate.number;
    head.append(nameWrap, num);
    const numbers = document.createElement('div'); numbers.className = 'candidate-numbers';
    const value = document.createElement('strong'); value.textContent = pct(candidate.percent);
    const votes = document.createElement('span'); votes.textContent = `${fmt(candidate.votes)} votos`;
    numbers.append(value, votes);
    const bar = document.createElement('div'); bar.className = 'bar';
    const fill = document.createElement('div'); fill.style.width = `${Math.max(0, Math.min(100, candidate.percent))}%`; bar.append(fill);
    card.append(head, numbers, bar); return card;
  }));
  $('progressValue').textContent = pct(result.progress);
  $('ring').style.setProperty('--progress', `${result.progress}%`);
  $('sectionsCount').textContent = fmt(result.processed);
  $('pendingSections').textContent = fmt(result.pending);
  $('totalSections').textContent = fmt(result.total);
  $('validVotes').textContent = fmt(result.validVotes);
  $('validVotesNote').textContent = result.final ? 'totalização final' : result.processed ? 'apuração parcial' : 'aguardando apuração';
  $('blankVotes').textContent = fmt(result.blankVotes);
  $('blankPercent').textContent = pct(result.blankPercent);
  $('nullVotes').textContent = fmt(result.nullVotes);
  $('nullPercent').textContent = pct(result.nullPercent);
  $('turnout').textContent = fmt(result.turnout);
  $('turnoutPercent').textContent = result.turnoutPercent === null ? 'eleitores' : `${pct(result.turnoutPercent)} do eleitorado apurado`;
  $('updated').textContent = `· Parcial do TSE: ${result.date} às ${result.time} (Brasília)`;
  $('resultState').textContent = result.processed === 0 ? 'AGUARDANDO APURAÇÃO' : result.final ? 'TOTALIZAÇÃO FINAL' : 'RESULTADO PARCIAL';
  $('resultNote').textContent = result.final ? 'Totalização final desta abrangência. Percentuais sobre os votos válidos, conforme divulgados pelo TSE.' : 'Percentuais calculados sobre votos válidos, conforme divulgados pelo TSE. A parcial pode mudar até o fim da totalização.';
  lastId = result.id;
  hasResult = true;
  return result;
}

async function refresh(force = false) {
  if (busy && !force) return;
  const thisRequest = ++requestVersion;
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  const timeout = setTimeout(() => controller.abort(), 12000);
  busy = true; $('refresh').disabled = true;
  const url = urlForSelection($('turn').value, $('region').value);
  $('rawLink').href = url;
  $('statusDot').className = 'status-dot loading';
  $('status').textContent = 'Consultando TSE…';
  try {
    const response = await fetch(url, { cache: 'no-cache', signal: controller.signal });
    if (!response.ok) throw new Error(`Resposta HTTP ${response.status} do TSE.`);
    const data = await response.json();
    if (thisRequest !== requestVersion) return;
    const changed = data.idg !== lastId;
    const result = render(data);
    $('statusDot').className = 'status-dot';
    $('status').textContent = result.processed === 0 ? 'Aguardando primeira parcial nesta região' : changed ? 'Dados oficiais atualizados' : 'Conectado · sem nova parcial';
  } catch (error) {
    if (thisRequest !== requestVersion) return;
    $('statusDot').className = 'status-dot error';
    $('status').textContent = 'Falha na consulta · nova tentativa em 15 s';
    if (!hasResult) {
      $('updated').textContent = '';
      const message = document.createElement('p'); message.className = 'result-error'; message.textContent = 'Não foi possível obter a parcial desta abrangência. Tentaremos novamente automaticamente. Você também pode selecionar Brasil.'; $('candidates').replaceChildren(message);
    }
    $('resultState').textContent = hasResult ? 'ÚLTIMA PARCIAL DISPONÍVEL' : 'DADOS INDISPONÍVEIS';
  } finally {
    clearTimeout(timeout);
    if (thisRequest === requestVersion) { busy = false; activeController = null; $('refresh').disabled = false; seconds = 15; }
  }
}

$('turn').addEventListener('change', () => {
  const first = $('turn').value === '1';
  $('turnLabel').textContent = first ? '1º TURNO' : '2º TURNO';
  document.querySelector('.edition small').textContent = first ? '04 OUT 2026' : '25 OUT 2026';
  setRegion($('region').value);
  trackEvent(`turno-${$('turn').value}`, 'Seleção de turno');
});
$('region').addEventListener('change', () => setRegion($('region').value));
$('resetRegion').addEventListener('click', () => setRegion('br'));
$('stateSearch').addEventListener('input', event => buildStateList(event.target.value));
$('refresh').addEventListener('click', () => { trackEvent('atualizacao-manual', 'Atualização manual'); refresh(); });
$('rawLink').addEventListener('click', () => trackEvent('abrir-fonte', 'Consulta ao arquivo oficial'));
document.querySelectorAll('[data-fan-mode]').forEach(button => button.addEventListener('click', () => setFanMode(button.dataset.fanMode)));
setFanMode(document.documentElement.dataset.fan || 'neutral');
initAnalytics();
setInterval(() => { $('clock').textContent = formats.clock.format(new Date()) + ' · BRT'; }, 1000);
setInterval(() => { if (seconds > 0) seconds--; $('countdown').textContent = `Próxima consulta em ${seconds} s`; if (seconds === 0 && !busy && !document.hidden) refresh(); }, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
$('clock').textContent = formats.clock.format(new Date()) + ' · BRT';
$('resetRegion').hidden = true;
for (const state of states) { const option = document.createElement('option'); option.value = state.uf; option.textContent = `${state.name} (${state.uf.toUpperCase()})`; $('region').append(option); }
buildStateList();
buildMap();
refresh();
