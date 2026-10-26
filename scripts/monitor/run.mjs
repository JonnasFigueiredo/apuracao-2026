import { chromium } from 'playwright';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { setTimeout as pause } from 'node:timers/promises';
import { resolve } from 'node:path';
import { inspectOfficial, compareDisplay, freshnessProblem, regionCodes, isComplete } from './checks.mjs';

const site = process.env.MONITOR_SITE_URL || 'https://jonnasfigueiredo.github.io/apuracao-2026/';
const turn = process.env.MONITOR_TURN || '2';
const election = turn === '1' ? '6257' : '6258';
const output = resolve('monitor-results');
const report = { startedAt:new Date().toISOString(), site, turn, status:'running', requests:[], errors:[], results:{}, display:null, automaticRefresh:false };
const official = new Map(), pending = new Set(), nationalRequests = [];
let browser, page, observing = true;
await mkdir(output, { recursive:true });
try {
  if (!['1','2'].includes(turn)) throw new Error('MONITOR_TURN deve ser 1 ou 2.');
  browser = await chromium.launch({ headless:true });
  const context = await browser.newContext({ viewport:{ width:1440, height:1000 }, locale:'pt-BR', timezoneId:'America/Sao_Paulo', serviceWorkers:'block' });
  // O monitor não deve gerar visitas nem eventos no GoatCounter.
  await context.route('**/*', route => {
    const host = new URL(route.request().url()).hostname;
    return host === 'gc.zgo.at' || host.endsWith('.goatcounter.com') ? route.abort() : route.continue();
  });
  page = await context.newPage();
  page.on('pageerror', error => report.errors.push(`APP: ${error.message}`));
  const regionOf = url => {
    const parsed = new URL(url);
    if (parsed.hostname !== 'resultados.tse.jus.br') return null;
    const match = new RegExp(`^/oficial/ele2026/${election}/dados/([a-z]{2})/\\1-c0001-e${election.padStart(6,'0')}-u\\.json$`).exec(parsed.pathname);
    return match && regionCodes.includes(match[1]) ? match[1] : null;
  };
  page.on('request', request => {
    if (request.method() === 'GET' && regionOf(request.url()) === 'br') nationalRequests.push(Date.now());
  });
  page.on('requestfailed', request => {
    const region = regionOf(request.url());
    if (observing && region) report.errors.push(`TSE ${region.toUpperCase()}: consulta falhou a partir do navegador do monitor (${request.failure()?.errorText || 'erro de rede'}).`);
  });
  page.on('response', response => {
    const region = response.request().method() === 'GET' ? regionOf(response.url()) : null;
    if (!observing || !region) return;
    const requestRecord = { region, status:response.status(), at:new Date().toISOString() };
    report.requests.push(requestRecord);
    const task = (async () => {
      if (!response.ok()) throw new Error(`TSE ${region.toUpperCase()}: HTTP ${response.status()} a partir do monitor.`);
      const raw = await response.json();
      const result = inspectOfficial(raw, region, turn);
      official.set(region, result);
      requestRecord.id = result.id;
    })().catch(error => { if (observing) report.errors.push(error.message); });
    pending.add(task);
    void task.finally(() => pending.delete(task));
  });
  const navigation = await page.goto(site, { waitUntil:'domcontentloaded', timeout:45000 });
  if (!navigation?.ok()) throw new Error(`SITE: HTTP ${navigation?.status() ?? 'sem resposta'}.`);
  const displayedTurn = await page.locator('#turn').inputValue();
  if (displayedTurn !== turn) await page.locator('#turn').selectOption(turn);
  const deadline = Date.now()+120000;
  let ready = false;
  while (Date.now() < deadline) {
    if (report.errors.length) throw new Error('A consulta encontrou falha no site ou na fonte oficial.');
    if (official.size === 28 && nationalRequests.length >= 2) {
      ready = await page.evaluate(() => !document.querySelector('#refresh').disabled && document.querySelector('#stateMeta').textContent.startsWith('Consulta ') && !document.querySelector('#stateMeta').textContent.includes('anteriores'));
      if (ready) break;
    }
    await pause(500);
  }
  await Promise.all([...pending]);
  if (!ready) throw new Error(`CICLO: prazo esgotado. Recebidos ${official.size}/28 arquivos e ${nationalRequests.length} consultas nacionais; o mapa ou a atualização automática pode ter parado.`);
  report.automaticRefresh = nationalRequests.length >= 2 && nationalRequests[1]-nationalRequests[0] >= 10000;
  if (!report.automaticRefresh) throw new Error('AUTO: não foi observada uma nova consulta nacional automática após o carregamento.');
  let differences = [];
  for (let attempt=0; attempt<3; attempt++) {
    await page.waitForFunction(() => !document.querySelector('#refresh').disabled && document.querySelector('#stateMeta').textContent.startsWith('Consulta '), undefined, { timeout:30000 });
    await Promise.all([...pending]);
    report.display = await page.evaluate(() => {
      const text = selector => document.querySelector(selector)?.textContent.trim();
      const ids = ['sectionsCount','totalSections','pendingSections','validVotes','blankVotes','nullVotes','turnout','abstention','apurationPercent','progressValue','blankPercent','nullPercent','turnoutPercent','abstentionPercent'];
      return {
        metrics:Object.fromEntries(ids.map(id => [id,text(`#${id}`)])), updated:text('#updated'),
        candidates:[...document.querySelectorAll('#candidates article')].map(card => ({ number:card.dataset.number, votes:card.querySelector('.candidate-numbers span')?.textContent.trim(), percent:card.querySelector('.candidate-numbers strong')?.textContent.trim() })),
        states:[...document.querySelectorAll('.state-row')].map(row => ({ uf:row.dataset.uf, leader:row.dataset.leader, percent:row.querySelector('.state-values strong')?.textContent.trim(), progress:row.querySelector('.state-values small')?.textContent.trim(), stale:row.classList.contains('stale') })),
        map:[...document.querySelectorAll('.map-state')].map(path => ({ uf:path.dataset.uf, leader:path.dataset.leader, stale:path.classList.contains('stale') })),
        counts:{ lula:text('#lulaCount'), flavio:text('#flavioCount') }, status:text('#status'), mapStatus:text('#stateMeta')
      };
    });
    differences = compareDisplay(report.display, official);
    if (!differences.length) break;
    // Uma resposta pode chegar entre a leitura do DOM e a captura do JSON.
    await pause(500);
  }
  report.errors.push(...differences);
  const freshness = freshnessProblem(official.get('br'), { from:process.env.MONITOR_FRESH_FROM, until:process.env.MONITOR_FRESH_UNTIL });
  if (freshness) report.errors.push(`FONTE: ${freshness}`);
  if (report.errors.length) throw new Error('A conferência encontrou divergências.');
  report.status = 'ok';
} catch (error) {
  if (!report.errors.includes(error.message)) report.errors.push(error.message);
  report.status = 'failure';
  if (page) await page.screenshot({ path:resolve(output,'failure.png'), fullPage:true, timeout:15000 }).catch(() => {});
} finally {
  observing = false;
  await browser?.close().catch(() => {});
  report.finishedAt = new Date().toISOString();
  report.results = Object.fromEntries(official);
  report.complete = report.status === 'ok' && isComplete(official);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT,`complete=${report.complete}\n`);
  await writeFile(resolve(output,'report.json'), JSON.stringify(report,null,2));
  const main = official.get('br');
  const summary = [
    `## Monitor da apuração: ${report.status === 'ok' ? 'OK' : 'FALHA'}`,
    `Site: ${site}`, `Arquivos oficiais conferidos: ${official.size}/28.`,
    `Nova consulta automática observada: ${report.automaticRefresh ? 'sim' : 'não'}.`,
    `Apuração oficialmente concluída e conferida: ${report.complete ? 'sim; o estudo final será validado e publicado antes do encerramento automático' : 'não; monitoramento continua'}.`,
    main ? `Parcial nacional: ${main.updated}. Seções: ${main.processed}/${main.total}.` : 'Parcial nacional indisponível.',
    'Conferência inclui votos, percentuais, urnas, comparecimento, abstenção e lideranças de todas as UFs.',
    ...report.errors.map(error => `\nErro: ${error.replaceAll('\n',' ')}`),
    '\nEste monitor compara o painel com os arquivos publicados pelo TSE; não realiza auditoria das urnas.',
    '\nDetalhes no arquivo report.json, anexado à execução.'
  ].join('\n\n');
  await writeFile(resolve(output,'summary.md'),summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,summary+'\n');
  console.log(summary);
  process.exitCode = report.status === 'ok' ? 0 : 1;
}
