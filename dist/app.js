import { parseResult, toNumber as number } from './data.js';
import { states, leadership, summarizeStates } from './states.js';
import { tseClient } from './tse-client.js';
import { initAnalytics, trackEvent } from './analytics.js';

const $ = id => document.getElementById(id);
const fmt = value => number(value).toLocaleString('pt-BR');
const decimal = value => number(value).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
const pct = value => `${decimal(value)}%`;
const nameOf = candidate => candidate.number === '13' ? 'Lula' : candidate.number === '22' ? 'Flávio Bolsonaro' : candidate.name;
const shortName = candidate => candidate.number === '22' ? 'Flávio' : nameOf(candidate);
const timeFormat = new Intl.DateTimeFormat('pt-BR', { timeZone:'America/Sao_Paulo', hour:'2-digit', minute:'2-digit' });
const fanModes = { neutral:{ color:'#101922' }, lula:{ name:'Lula', number:'13', color:'#21121a' }, flavio:{ name:'Flávio Bolsonaro', number:'22', color:'#0e211d' } };
let seconds = 15, busy = false, hasResult = false, requestVersion = 0, activeController = null, lastId = null, selectedRegion = 'br';
let entries = new Map(), mapFilter = 'all', roundVersion = 0, roundController = null, roundBusy = false, roundDone = 0, lastMapCheck = 0, tooltipState = null;
const stateRows = new Map();

function setFanMode(mode) {
  if (!Object.hasOwn(fanModes, mode)) mode = 'neutral';
  const theme = fanModes[mode];
  document.documentElement.dataset.fan = mode;
  document.querySelector('meta[name="theme-color"]').content = theme.color;
  document.querySelectorAll('[data-fan-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.fanMode === mode)));
  $('themeStatus').textContent = theme.name ? `Torcida ${theme.name}` : 'Modo neutro';
  $('fanBanner').hidden = mode === 'neutral';
  $('fanName').textContent = theme.name || '';
  $('fanNumber').textContent = theme.number || '';
  try { localStorage.setItem('voto2026.fanMode', mode); } catch {}
  setMapFilter(theme.number || 'all');
}

function setMapFilter(value) {
  if (!['all','13','22'].includes(value)) return;
  mapFilter = value;
  document.querySelectorAll('[data-map-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mapFilter === value)));
  updateStateViews();
}

function setRegion(region) {
  if (region !== 'br' && !states.some(state => state.uf === region)) return;
  if (selectedRegion !== region) trackEvent(`uf-${region}`, 'Seleção de abrangência');
  selectedRegion = region;
  $('region').value = region;
  const place = states.find(state => state.uf === region)?.name || 'Brasil';
  $('placeTitle').textContent = place;
  $('resultPlace').textContent = place;
  $('resetRegion').hidden = region === 'br';
  hasResult = false; lastId = null;
  $('candidates').classList.remove('expanded');$('showAllCandidates').hidden=true;$('showAllCandidates').setAttribute('aria-expanded','false');
  $('candidates').replaceChildren();
  for (let index=0; index<2; index++) { const placeholder=document.createElement('div'); placeholder.className='skeleton-card'; $('candidates').append(placeholder); }
  $('resultState').textContent = 'Carregando';
  $('margin').textContent = '';
  $('validVotesNote').textContent = '';
  for (const id of ['apurationPercent','progressValue','sectionsCount','pendingSections','totalSections','validVotes','blankVotes','blankPercent','nullVotes','nullPercent','turnout','turnoutPercent']) $(id).textContent = '—';
  $('ring').style.setProperty('--progress','0%');
  $('ring').setAttribute('aria-valuenow','0');
  $('updated').textContent = '';
  $('mapTooltip').hidden = true;
  updateStateViews();
  refresh(true);
}

function buildStateList() {
  for (const region of ['Norte','Nordeste','Centro-Oeste','Sudeste','Sul']) {
    const group = document.createElement('div'); group.className='state-group';
    const heading = document.createElement('p'); heading.className='state-group-name'; heading.textContent=region; group.append(heading);
    for (const state of states.filter(item => item.region===region).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))) {
      const row=document.createElement('button'); row.type='button'; row.className='state-row'; row.dataset.uf=state.uf;
      const badge=document.createElement('span'); badge.className='state-uf'; badge.textContent=state.uf.toUpperCase();
      const info=document.createElement('span'); info.className='state-info';
      const name=document.createElement('strong'); name.textContent=state.name;
      const detail=document.createElement('small'); info.append(name,detail);
      const values=document.createElement('span'); values.className='state-values';
      const score=document.createElement('strong'), progress=document.createElement('small'); values.append(score,progress);
      row.append(badge,info,values); row.addEventListener('click',()=>setRegion(state.uf)); group.append(row);
      stateRows.set(state.uf,{ row,group,detail,score,progress });
    }
    $('stateList').append(group);
  }
  const empty=document.createElement('p'); empty.id='noStates'; empty.className='no-states'; empty.hidden=true; $('stateList').append(empty);
}

function stateDescription(state, entry) {
  if (!entry?.result) return entry?.error ? 'Dados indisponíveis' : roundBusy ? 'Consultando…' : 'Sem dados';
  const {kind,leader}=leadership(entry.result);
  return leader ? `${shortName(leader)} lidera${entry.stale ? ' · última parcial' : ''}` : kind==='tie' ? 'Empate na parcial' : 'Aguardando apuração';
}

function updateStateViews() {
  const summary=summarizeStates(entries);
  $('lulaCount').textContent=summary.available ? summary.lula : '—';
  $('flavioCount').textContent=summary.available ? summary.flavio : '—';
  const blocked=tseClient.retryAfter();
  $('stateMeta').textContent=blocked ? `TSE limitou consultas · retomada em ${Math.ceil(blocked/60)} min` : roundBusy ? `Consultando ${roundDone} de 27 UFs…` : summary.available===27 ? `Consulta ${timeFormat.format(lastMapCheck || new Date())} · atualização a cada 60 s${summary.stale ? ' · há parciais anteriores' : ''}` : `${summary.available}/27 UFs com dados · nova consulta em 60 s`;
  const query=$('stateSearch').value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  let visible=0;
  for (const state of states) {
    const entry=entries.get(state.uf), {kind,leader}=leadership(entry?.result);
    const matchFilter=mapFilter==='all' || leader?.number===mapFilter;
    const matchQuery=`${state.name} ${state.uf}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query);
    const row=stateRows.get(state.uf);
    if (row) {
      row.row.hidden=!(matchFilter&&matchQuery); if(!row.row.hidden) visible++;
      row.row.dataset.leader=kind; row.row.classList.toggle('selected',state.uf===selectedRegion);
      row.row.classList.toggle('stale',Boolean(entry?.stale)); row.row.setAttribute('aria-pressed',String(state.uf===selectedRegion));
      row.detail.textContent=stateDescription(state,entry);
      row.score.textContent=leader ? pct(leader.percent) : entry?.result && kind==='tie' ? 'Empate' : '—';
      row.progress.textContent=entry?.result ? `${pct(entry.result.progress)} apurado` : '';
    }
    const path=$('brazilMap').querySelector(`[data-uf="${state.uf}"]`);
    if (path) {
      path.dataset.leader=kind; path.classList.toggle('selected',state.uf===selectedRegion);
      path.classList.toggle('dimmed',!matchFilter); path.classList.toggle('stale',Boolean(entry?.stale));
      path.setAttribute('aria-pressed',String(state.uf===selectedRegion));
      const text=`${state.name}: ${stateDescription(state,entry)}${leader ? `, ${pct(leader.percent)}` : ''}`;
      path.setAttribute('aria-label',text); path.querySelector('title').textContent=text;
    }
    const label=$('brazilMap').querySelector(`[data-label="${state.uf}"]`); if(label) label.classList.toggle('dimmed',!matchFilter);
  }
  document.querySelectorAll('.state-group').forEach(group=>{group.hidden=![...group.querySelectorAll('.state-row')].some(row=>!row.hidden);});
  $('stateCount').textContent=`${visible} ${visible===1 ? 'UF' : 'UFs'}`;
  if($('noStates')) { $('noStates').hidden=visible>0; $('noStates').textContent=query ? 'Nenhum estado encontrado.' : roundBusy ? 'Consultando lideranças…' : !summary.available ? 'Dados estaduais indisponíveis.' : summary.available===summary.waiting ? 'Aguardando apuração nas UFs.' : 'Nenhuma UF com essa liderança na parcial.'; }
  const theme=fanModes[document.documentElement.dataset.fan];
  if(theme?.number) {
    const count=theme.number==='13' ? summary.lula : summary.flavio;
    $('fanLeads').textContent=!summary.available ? (roundBusy ? 'Consultando os estados…' : 'Dados estaduais indisponíveis') : summary.waiting===summary.available ? 'Aguardando apuração nas UFs' : `Lidera em ${count} ${count===1 ? 'UF' : 'UFs'}`;
  }
  if(tooltipState) fillTooltip(tooltipState);
}

function fillTooltip(state) {
  const entry=entries.get(state.uf), leader=leadership(entry?.result).leader;
  $('tooltipName').textContent=`${state.uf.toUpperCase()} · ${state.name}`;
  $('tooltipResult').textContent=leader ? `${nameOf(leader)} · ${pct(leader.percent)}${entry.stale ? ' · última parcial' : ''}` : stateDescription(state,entry);
  $('tooltipProgress').textContent=entry?.result ? `${pct(entry.result.progress)} apurado · TSE ${entry.result.time}` : '';
}

function showTooltip(state,event,path) {
  tooltipState=state; fillTooltip(state); $('mapTooltip').hidden=false;
  const frame=document.querySelector('.map-frame').getBoundingClientRect(), bounds=path.getBoundingClientRect();
  const x=event.clientX || bounds.left+bounds.width/2, y=event.clientY || bounds.top+bounds.height/2;
  $('mapTooltip').style.left=`${Math.max(8,Math.min(frame.width-236,x-frame.left+12))}px`;
  $('mapTooltip').style.top=`${Math.max(8,Math.min(frame.height-110,y-frame.top+12))}px`;
}

async function buildMap() {
  try {
    const response=await fetch('br-ufs.geojson'); if(!response.ok) throw new Error();
    const geo=await response.json(), byCode=Object.fromEntries(states.map(state=>[state.code,state]));
    const project=([lon,lat])=>[35+(lon+74)*14.1,20+(6-lat)*13.5];
    const ringPath=ring=>ring.map((point,index)=>{const [x,y]=project(point);return `${index?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`;}).join('')+'Z';
    for(const feature of geo.features) {
      const state=byCode[feature.properties.codarea]; if(!state) continue;
      const polygons=feature.geometry.type==='Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',polygons.flatMap(polygon=>polygon.map(ringPath)).join('')); path.setAttribute('class','map-state'); path.dataset.uf=state.uf;
      path.setAttribute('role','button');path.setAttribute('tabindex','0');
      path.append(document.createElementNS('http://www.w3.org/2000/svg','title'));
      path.addEventListener('click',()=>setRegion(state.uf));
      path.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();setRegion(state.uf);}});
      for(const type of ['pointerenter','pointermove','focus']) path.addEventListener(type,event=>showTooltip(state,event,path));
      for(const type of ['pointerleave','blur']) path.addEventListener(type,()=>{tooltipState=null;$('mapTooltip').hidden=true;});
      $('brazilMap').append(path);
    }
    const anchors={rn:[-36.4,-5.7],pb:[-36.7,-7.2],pe:[-37.5,-8.7],al:[-36.5,-9.8],se:[-37.2,-10.8],df:[-47.8,-15.8]};
    for(const state of states) {
      const [x,y]=project(state.label);
      if(anchors[state.uf]) {const [sx,sy]=project(anchors[state.uf]);const line=document.createElementNS('http://www.w3.org/2000/svg','line');for(const [key,value] of Object.entries({x1:sx,y1:sy,x2:x-12,y2:y-4}))line.setAttribute(key,value);line.setAttribute('class','map-callout');$('brazilMap').append(line);}
      const label=document.createElementNS('http://www.w3.org/2000/svg','text');label.setAttribute('x',x);label.setAttribute('y',y);label.setAttribute('class','map-label');label.setAttribute('aria-hidden','true');label.dataset.label=state.uf;label.textContent=state.uf.toUpperCase();$('brazilMap').append(label);
    }
    updateStateViews();
  } catch { const message=document.createElement('p');message.className='map-error';message.textContent='Mapa indisponível. Selecione uma UF na lista.';document.querySelector('.map-frame').append(message); }
}

async function loadStates(force=false) {
  if(roundBusy&&!force) return;
  const version=++roundVersion, turn=$('turn').value;
  roundController?.abort();const controller=new AbortController();roundController=controller;
  roundBusy=true;roundDone=0;updateStateViews();
  let consecutiveErrors=0;
  for(const state of states) {
    if(controller.signal.aborted || version!==roundVersion) return;
    try {
      const data=await tseClient.get(turn,state.uf,{signal:controller.signal});
      if(version!==roundVersion) return;
      entries.set(state.uf,{result:parseResult(data),stale:false});consecutiveErrors=0;
    } catch {
      if(controller.signal.aborted || version!==roundVersion) return;
      const previous=entries.get(state.uf);entries.set(state.uf,{...previous,error:true,stale:Boolean(previous?.result)});consecutiveErrors++;
    }
    roundDone++;updateStateViews();
    if(consecutiveErrors>=3 || tseClient.retryAfter()>0) break;
  }
  if(version===roundVersion) {roundBusy=false;roundController=null;lastMapCheck=Date.now();updateStateViews();}
}

function render(data) {
  const result=parseResult(data), first=result.candidates[0], second=result.candidates[1];
  $('candidates').replaceChildren(...result.candidates.map((candidate,index)=>{
    const card=document.createElement('article');card.className=`candidate${index>1?' extra':''}${index===0&&candidate.votes>0&&candidate.votes>(second?.votes??-1)?' top':''}`;card.dataset.number=candidate.number;
    const head=document.createElement('div');head.className='candidate-head';
    const badge=document.createElement('span');badge.className='candidate-number';badge.textContent=candidate.number;
    const info=document.createElement('div');info.className='candidate-info';
    const name=document.createElement('h3');name.textContent=nameOf(candidate);
    const party=document.createElement('span');party.className='candidate-party';party.textContent=candidate.party;
    const tag=document.createElement('span');tag.className='fan-card-tag';tag.textContent='Sua torcida';info.append(name,party,tag);head.append(badge,info);
    const score=document.createElement('div');score.className='candidate-numbers';
    const value=document.createElement('strong');value.textContent=pct(candidate.percent);
    const votes=document.createElement('span');votes.textContent=`${fmt(candidate.votes)} votos`;score.append(value,votes);
    const bar=document.createElement('div');bar.className='bar';const fill=document.createElement('span');fill.style.width=`${Math.max(0,Math.min(100,candidate.percent))}%`;bar.append(fill);card.append(head,score,bar);return card;
  }));
  $('showAllCandidates').hidden=result.candidates.length<=2;$('showAllCandidates').textContent=$('candidates').classList.contains('expanded')?'Mostrar só os dois primeiros':`Ver outros ${result.candidates.length-2} candidatos`;
  $('apurationPercent').textContent=pct(result.progress);$('progressValue').textContent=pct(result.progress);$('ring').style.setProperty('--progress',`${result.progress}%`);$('ring').setAttribute('aria-valuenow',result.progress.toFixed(2));
  for(const [id,value] of Object.entries({sectionsCount:result.processed,totalSections:result.total,pendingSections:result.pending,validVotes:result.validVotes,blankVotes:result.blankVotes,nullVotes:result.nullVotes,turnout:result.turnout})) $(id).textContent=fmt(value);
  $('validVotesNote').textContent=result.final?'Final':result.processed?'Parcial':'Aguardando';
  $('blankPercent').textContent=pct(result.blankPercent);$('nullPercent').textContent=pct(result.nullPercent);$('turnoutPercent').textContent=result.turnoutPercent===null?'':`${pct(result.turnoutPercent)} do eleitorado apurado`;
  $('updated').textContent=`TSE ${result.date} · ${result.time}`;
  $('resultState').textContent=result.processed===0?'Aguardando apuração':result.final?'Final':'Parcial';
  $('resultNote').textContent='Percentuais sobre os votos válidos.';
  $('margin').textContent=result.processed&&second ? first.votes===second.votes ? 'Empate na parcial' : `Diferença: ${fmt(first.votes-second.votes)} votos · ${decimal(first.percent-second.percent)} p.p.` : '';
  lastId=result.id;hasResult=true;
  if(selectedRegion!=='br'){entries.set(selectedRegion,{result,stale:false});updateStateViews();}
  return result;
}

async function refresh(force=false) {
  if(busy&&!force) return;
  const version=++requestVersion;activeController?.abort();const controller=new AbortController();activeController=controller;busy=true;$('refresh').disabled=true;
  const turn=$('turn').value,id=turn==='1'?'6257':'6258';$('rawLink').href=`https://resultados.tse.jus.br/oficial/ele2026/${id}/dados/${selectedRegion}/${selectedRegion}-c0001-e${id.padStart(6,'0')}-u.json`;
  $('statusDot').className='status-dot loading';$('status').textContent='Consultando…';
  try {
    const data=await tseClient.get(turn,selectedRegion,{signal:controller.signal,maxAge:0});if(version!==requestVersion)return;
    const changed=data.idg!==lastId,result=render(data);$('statusDot').className='status-dot';$('status').textContent=!result.processed?'Aguardando apuração':changed?'Atualizado':'Sem nova parcial';
  } catch {
    if(version!==requestVersion)return;$('statusDot').className='status-dot error';$('status').textContent=tseClient.retryAfter()?'Consultas limitadas pelo TSE':'Falha na consulta · reconectando';
    if(!hasResult){const message=document.createElement('p');message.className='result-error';message.textContent='Dados indisponíveis. Nova tentativa automática.';$('candidates').replaceChildren(message);$('updated').textContent='';}
    $('resultState').textContent=hasResult?'Última parcial disponível':'Indisponível';
  } finally {if(version===requestVersion){busy=false;activeController=null;$('refresh').disabled=false;seconds=Math.max(15,tseClient.retryAfter());}}
}

for(const state of [...states].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))) {const option=document.createElement('option');option.value=state.uf;option.textContent=`${state.name} · ${state.uf.toUpperCase()}`;$('region').append(option);}
buildStateList();
$('turn').addEventListener('change',()=>{entries=new Map();lastMapCheck=0;setRegion(selectedRegion);loadStates(true);trackEvent(`turno-${$('turn').value}`,'Seleção de turno');});
$('region').addEventListener('change',()=>setRegion($('region').value));
$('resetRegion').addEventListener('click',()=>setRegion('br'));
$('stateSearch').addEventListener('input',updateStateViews);
$('refresh').addEventListener('click',()=>{trackEvent('atualizacao-manual','Atualização manual');refresh();loadStates(true);});
$('rawLink').addEventListener('click',()=>trackEvent('abrir-fonte','Consulta ao arquivo oficial'));
document.querySelectorAll('[data-fan-mode]').forEach(button=>button.addEventListener('click',()=>setFanMode(button.dataset.fanMode)));
document.querySelectorAll('[data-map-filter]').forEach(button=>button.addEventListener('click',()=>setMapFilter(button.dataset.mapFilter)));
$('fanFilter').addEventListener('click',()=>{setMapFilter(fanModes[document.documentElement.dataset.fan]?.number||'all');$('territory').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});});
$('showAllCandidates').addEventListener('click',()=>{const expanded=$('candidates').classList.toggle('expanded');$('showAllCandidates').setAttribute('aria-expanded',String(expanded));$('showAllCandidates').textContent=expanded?'Mostrar só os dois primeiros':`Ver outros ${$('candidates').children.length-2} candidatos`;});
setFanMode(document.documentElement.dataset.fan||'neutral');initAnalytics();buildMap();refresh();loadStates();
setInterval(()=>{if(seconds>0)seconds--;$('countdown').textContent=seconds>60?`Consulta em ${Math.ceil(seconds/60)} min`:`Consulta em ${seconds} s`;if(!seconds&&!busy&&!document.hidden)refresh();},1000);
setInterval(()=>{if(!document.hidden&&!roundBusy)loadStates();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){refresh();if(Date.now()-lastMapCheck>=60000)loadStates();}});
