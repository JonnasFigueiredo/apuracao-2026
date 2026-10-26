# Monitor automático

O workflow [Conferir painel e dados do TSE](https://github.com/JonnasFigueiredo/apuracao-2026/actions/workflows/monitor.yml) roda no GitHub Actions, aproximadamente a cada 15 minutos e após uma publicação bem-sucedida. Não usa IA, Codex ou API da OpenAI e não depende do computador do autor estar ligado.

## O que é conferido

Um Chromium abre o endereço público do painel e observa as próprias consultas da aplicação ao TSE. O monitor espera os 28 arquivos do 2º turno (Brasil e 27 UFs) e uma nova consulta nacional automática. Não clica em Atualizar para produzir essa evidência.

A verificação independente compara votos e percentuais de cada candidato, somas de votos válidos/brancos/nulos, seções apuradas e pendentes, comparecimento, abstenção, liderança e percentual de cada UF na lista e no mapa, e contadores de UFs por candidato. Ela também identifica falha de rede, HTTP inesperado, mudança incompatível de formato, erro de JavaScript e uso de parcial anterior por erro de consulta. Seções não instaladas são excluídas do denominador de comparecimento e abstenção, conforme o campo `e.esa` do TSE.

Os dados comparados são as respostas realmente usadas pela página. Isso evita apontar uma divergência só porque uma segunda consulta independente já recebeu uma parcial mais recente. As UFs têm horários de totalização diferentes; a rotina não exige que a soma de arquivos estaduais de instantes diferentes seja igual ao arquivo nacional.

A partir de 25/10/2026 às 17h, em Brasília, um arquivo nacional parcial sem nova geração há mais de 45 minutos também produz falha, identificada como possível atraso da fonte. O início está em `MONITOR_FRESH_FROM`, em `.github/workflows/monitor.yml`. O prazo não é uma promessa de frequência de publicação do TSE. Para uma conferência histórica, deixe essa variável desativada; `MONITOR_FRESH_UNTIL` também permite limitar manualmente a janela.

Quando o Brasil e as 27 UFs estiverem com andamento final (`and=f`) e todas as seções totalizadas, e a conferência tiver passado sem divergências, a rotina gera o [estudo final dos dois turnos](estudo-final.md), incluindo o exterior. O workflow só é desativado depois da validação das 58 fontes, da preservação do relatório no repositório e da publicação bem-sucedida no site. Ele não encerra por um percentual arredondado para 100%, nem em caso de dados faltantes ou erro. A permissão `actions: write` fica restrita ao job de encerramento; a conferência usa somente leitura. O job do estudo pode gravar os arquivos finais no repositório e o job de publicação pode atualizar o GitHub Pages. O site e o relatório continuam funcionando depois que o monitor termina. Para retomá-lo, use **Actions → Conferir painel e dados do TSE → Enable workflow**.

O monitor bloqueia o GoatCounter no navegador de teste para não inflar visitas ou eventos. Não altera votos, não substitui os dados oficiais e não é uma auditoria das urnas.

## Resultados e alertas

Abra **Actions → Conferir painel e dados do TSE**. Cada execução mostra o resumo e oferece um artefato com `report.json`, horário, respostas conferidas e divergências. Quando possível, falhas também incluem `failure.png`. Os artefatos são mantidos por sete dias para limitar armazenamento.

Para receber aviso pelo GitHub, abra [Settings → Notifications](https://github.com/settings/notifications), habilite notificações de **Actions** por e-mail ou web e selecione apenas falhas. A entrega depende das preferências da sua conta; a rotina não cadastra e-mails nem cria serviços externos. Consulte a [documentação de notificações](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs).

É possível executar a qualquer momento em **Run workflow**. Uma falha de acesso ao TSE a partir do datacenter do GitHub não prova que todos os visitantes estão sem acesso; o relatório informa a origem da consulta. O monitor detecta e registra o problema, mas não controla a disponibilidade do TSE.

## Custo e limites

O repositório é público e o job usa um runner Linux padrão, cujo uso é [gratuito no GitHub Actions](https://docs.github.com/en/actions/concepts/billing-and-usage). Não há chamadas de modelos de IA nem consumo de tokens neste chat. Armazenamento de artefatos tem quota própria, por isso a retenção é curta.

O agendamento pode atrasar em períodos de carga do GitHub. Em repositórios públicos, ele pode ser desativado após 60 dias sem atividade. Esses são [limites do agendador do GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), não uma dependência do computador local. O workflow pode ser reativado na aba Actions.

## Execução manual fora do GitHub

O site continua sem dependências de produção. Somente o monitor tem Playwright, isolado em `scripts/monitor/` e fixado pelo arquivo de lock.

```bash
npm ci --prefix scripts/monitor --ignore-scripts
npx --prefix scripts/monitor playwright install chromium
npm run monitor
```

Os resultados são salvos em `monitor-results/`, ignorado pelo Git. `MONITOR_SITE_URL` permite conferir outro endereço e `MONITOR_TURN` escolhe o turno. Ao conferir uma eleição arquivada, deixe a janela de atualização desativada. `npm test` valida as regras do monitor com dados de teste e não consulta a rede.
