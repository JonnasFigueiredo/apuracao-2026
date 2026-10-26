# Estudo final dos dois turnos

O [relatório público](https://jonnasfigueiredo.github.io/apuracao-2026/relatorio/) encerra o projeto com uma análise descritiva, calculada automaticamente a partir de dados finais do TSE. A página mostra uma mensagem de preparação até que todas as condições de publicação sejam satisfeitas.

## Conteúdo

- Votos de Lula e Flávio Bolsonaro em cada turno, ganho líquido, crescimento relativo e variação em pontos percentuais.
- Mudança da diferença entre os candidatos e eventual inversão de liderança nacional.
- Comparecimento, abstenção, votos válidos, brancos e nulos, com denominadores explícitos.
- Comparação ponderada por região, detalhes das 27 UFs e do exterior, maiores variações estaduais e mudanças de liderança.
- Reconciliação dos ganhos líquidos dos finalistas e limites de interpretação. Resultados agregados não identificam transferências individuais de votos.
- Síntese de encerramento do projeto, metodologia e fontes reproduzíveis.

## Condições e automação

O workflow de monitoramento ganha três etapas antes de encerrar: gerar o estudo, preservar os arquivos no repositório e publicar o site com o relatório. Só depois da publicação bem-sucedida ele se desativa.

A coleta exige 58 arquivos: Brasil, 27 UFs e exterior (`zz`) em cada turno. Todos precisam ter `and=f`, `s.st=s.ts` e `s.snt=0`. Um percentual arredondado para 100% não basta. O coletor confere a eleição e a abrangência, valida os totais, reconcilia a soma territorial com o Brasil e valida as identidades de variação dos votos. Inconsistência, arquivo ausente ou indisponibilidade impedem a publicação e deixam o monitor ativo para outra tentativa.

O estudo usa os números dos candidatos para relacionar os turnos, não suas posições na lista nem a ordem em que chegam. Percentuais de regiões vêm de somas de votos, sem média simples dos percentuais das UFs. O exterior faz parte da conciliação nacional e não é contado como uma UF.

## Arquivos preservados

Após a primeira geração válida, `dist/relatorio/` contém:

- `index.html` e `report.css`: relatório responsivo e imprimível; o navegador pode salvá-lo como PDF.
- `relatorio.md`: versão textual para leitura no GitHub.
- `estudo.json`: resultados e variações com precisão completa.
- `territorios.csv`: tabela territorial em UTF-8, com separador `;`.
- `manifest.json`: URLs oficiais, horários de coleta e hashes SHA-256 dos 58 arquivos.
- `fontes/1/` e `fontes/2/`: cópias dos arquivos oficiais utilizados.

Uma execução posterior valida os hashes e reutiliza a edição final preservada. Ela não substitui silenciosamente a análise histórica por uma retotalização. Uma nova edição requer uma decisão explícita sobre quais fontes e data de referência adotar.

## Reproduzir

```bash
npm test
npm run report
npm run build
```

O gerador usa somente Node.js 20+ e não chama serviços de IA. Sem edição preservada, consulta o TSE em sequência, espaçando os pedidos e respeitando falhas de acesso. Se os resultados ainda forem parciais, termina sem publicar a conclusão. Com edição preservada, a reprodução utiliza as fontes locais e verifica seus hashes.

`REPORT_OUTPUT_DIR` permite gerar em outro diretório. O workflow automatizado publica apenas em `dist/relatorio/`. A captura registra o horário da fonte e o da coleta; os horários visíveis no relatório usam Brasília.
